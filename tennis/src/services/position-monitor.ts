import WebSocket from "ws";
import chokidar from "chokidar";
import type { FSWatcher } from "chokidar";
import type { SelectedMarket, SportsScoreUpdate } from "../types";
import { parseSportsUpdate, PolymarketClient, SPORTS_WS_URL } from "../clients/polymarket";
import { logger } from "../utils/logger";
import { appendTrade, prunePastSelectedMatches, readPositions, readSelection, readSettings, upsertPosition, writePositions } from "./store";
import { TraderService } from "./trader";

function nowIso(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function hyperlink(label: string, url?: string): string {
  if (!url) return label;
  return `\u001b]8;;${url}\u0007${label}\u001b]8;;\u0007`;
}

function teamBadge(teamCode: string, teamLogoUrl?: string): string {
  const label = `[${teamCode.toUpperCase()}]`;
  return teamLogoUrl ? `${hyperlink(label, teamLogoUrl)} 🖼` : label;
}

function parseScore(score?: string): [number, number] | null {
  if (!score) return null;
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(score.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

export class PositionMonitorService {
  private ws: WebSocket | null = null;
  private trader = new TraderService();
  private pm = new PolymarketClient();
  private selected: SelectedMarket[] = [];
  private lastScore = new Map<string, [number, number]>();
  private sellTimer: ReturnType<typeof setInterval> | null = null;
  private selectionWatcher: FSWatcher | null = null;
  private booted = false;

  async start(): Promise<void> {
    await this.reloadSelection();
    this.startSellLoop();
    this.startSportsSocket();
    this.watchSelection();
    this.booted = true;
    logger.success("MONITOR", "Position monitor started", `${this.selected.length} selected market(s)`);
  }

  stop(): void {
    if (this.sellTimer) clearInterval(this.sellTimer);
    this.sellTimer = null;
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }
    this.ws = null;
    if (this.selectionWatcher) this.selectionWatcher.close().catch(() => {});
    this.selectionWatcher = null;
  }

  async handleReloadSignal(): Promise<void> {
    await this.reloadSelection();
    logger.info("MONITOR", "Selection reloaded", `${this.selected.length} market(s)`);
  }

  private watchSelection(): void {
    if (this.selectionWatcher) return;
    this.selectionWatcher = chokidar.watch("data/selected-markets.json", { ignoreInitial: true });
    this.selectionWatcher.on("change", async () => {
      await this.reloadSelection();
      if (this.booted) logger.info("MONITOR", "Selection file changed", `${this.selected.length} market(s)`);
    });
  }

  private async reloadSelection(): Promise<void> {
    const pruned = prunePastSelectedMatches();
    if (pruned.removed > 0) {
      logger.info("MONITOR", "Auto-removed past matches from selection", `${pruned.removed} removed`);
    }
    const doc = readSelection();
    this.selected = doc.markets || [];
    const selectedSlugs = new Set(this.selected.map((m) => m.eventSlug));
    for (const slug of [...this.lastScore.keys()]) {
      if (!selectedSlugs.has(slug)) this.lastScore.delete(slug);
    }
  }

  private startSportsSocket(): void {
    this.ws = new WebSocket(SPORTS_WS_URL);

    this.ws.on("open", () => {
      logger.success("MONITOR", "Connected to sports websocket");
      this.ws?.send(JSON.stringify({ type: "ping" }));
    });

    this.ws.on("message", async (data: WebSocket.RawData) => {
      try {
        const payload = JSON.parse(data.toString());
        const update = parseSportsUpdate(payload);
        if (!update?.slug) return;
        await this.handleSportsUpdate(update);
      } catch {
        // ignore malformed payload
      }
    });

    this.ws.on("close", () => {
      logger.warn("MONITOR", "Sports websocket disconnected, reconnecting in 3s");
      setTimeout(() => this.startSportsSocket(), 3000);
    });

    this.ws.on("error", (err) => {
      logger.error("MONITOR", "Sports websocket error", err);
    });
  }

  private async handleSportsUpdate(update: SportsScoreUpdate): Promise<void> {
    const candidates = this.selected.filter((m) => m.eventSlug === update.slug);
    if (candidates.length === 0) return;
    const score = parseScore(update.score);
    if (!score) return;

    const prev = this.lastScore.get(update.slug);
    this.lastScore.set(update.slug, score);
    if (!prev) return;

    const homeDelta = score[0] - prev[0];
    const awayDelta = score[1] - prev[1];
    if (homeDelta <= 0 && awayDelta <= 0) return;

    const selectedMarket = candidates[0]!;
    const settings = readSettings();
    if (homeDelta > 0) {
      await this.tryGoalBuy(selectedMarket, "home", selectedMarket.homeTokenId, selectedMarket.homeTeam, selectedMarket.homeCode, settings.buyAmountUsd, settings.maxBuyPrice, settings.maxSpread);
    }
    if (awayDelta > 0) {
      await this.tryGoalBuy(selectedMarket, "away", selectedMarket.awayTokenId, selectedMarket.awayTeam, selectedMarket.awayCode, settings.buyAmountUsd, settings.maxBuyPrice, settings.maxSpread);
    }
  }

  private async tryGoalBuy(
    market: SelectedMarket,
    side: "home" | "away",
    tokenId: string,
    teamName: string,
    teamCode: string,
    buyAmountUsd: number,
    maxBuyPrice: number,
    maxSpread: number
  ): Promise<void> {
    const guard = await this.trader.checkBuyGuards(tokenId, maxBuyPrice, maxSpread);
    if (!guard.ok) {
      logger.skip("BUY skipped by guard", {
        event: market.eventSlug,
        side,
        team: teamCode,
        ask: guard.bestAsk,
        spread: guard.spread,
        reason: guard.reason,
      });
      return;
    }

    logger.info(
      "TRADE",
      "Goal detected, placing market BUY",
      `${teamBadge(teamCode, side === "home" ? market.homeLogoUrl : market.awayLogoUrl)} ${teamName} | ${market.homeCode.toUpperCase()} vs ${market.awayCode.toUpperCase()} | ${market.eventSlug}`
    );
    const buy = await this.trader.buyMarket(tokenId, buyAmountUsd);
    if (!buy.ok) {
      logger.warn("TRADE", "BUY not filled", buy.note || buy.status);
      return;
    }

    const posId = id("pos");
    upsertPosition({
      id: posId,
      eventSlug: market.eventSlug,
      marketSlug: market.marketSlug,
      conditionId: market.conditionId,
      side,
      teamCode,
      teamName,
      teamLogoUrl: side === "home" ? market.homeLogoUrl : market.awayLogoUrl,
      tokenId,
      buyPrice: buy.price,
      shares: buy.shares,
      spentUsd: buyAmountUsd,
      status: "open",
      boughtAt: nowIso(),
      orderStatus: buy.status,
    });
    appendTrade({
      id: id("trade"),
      ts: nowIso(),
      action: "BUY",
      eventSlug: market.eventSlug,
      marketSlug: market.marketSlug,
      tokenId,
      side,
      teamCode,
      teamName,
      price: buy.price,
      shares: buy.shares,
      amountUsd: buyAmountUsd,
      status: buy.status,
      note: "Goal-driven market buy",
    });
  }

  private startSellLoop(): void {
    const run = async () => {
      const settings = readSettings();
      const selectedSlugs = new Set(this.selected.map((m) => m.eventSlug));
      const doc = readPositions();
      let changed = false;

      for (const position of doc.positions) {
        if (position.status !== "open") continue;
        if (!selectedSlugs.has(position.eventSlug)) continue;

        const book = await this.pm.getOrderBook(position.tokenId);
        const bestBid = book?.bids?.length ? Number(book.bids[0].price) : 0;
        if (!Number.isFinite(bestBid) || bestBid <= 0) continue;

        const target = position.buyPrice + settings.takeProfitDelta;
        if (bestBid < target) continue;

        logger.info(
          "MONITOR",
          "Take-profit reached, placing SELL",
          `${teamBadge(position.teamCode, position.teamLogoUrl)} ${position.teamName} | ${bestBid.toFixed(3)} >= ${target.toFixed(3)}`
        );
        const sell = await this.trader.sellMarket(position.tokenId, position.shares);
        if (!sell.ok) continue;

        position.status = "closed";
        position.soldAt = nowIso();
        position.sellPrice = sell.price;
        position.orderStatus = sell.status;
        appendTrade({
          id: id("trade"),
          ts: nowIso(),
          action: "SELL",
          eventSlug: position.eventSlug,
          marketSlug: position.marketSlug,
          tokenId: position.tokenId,
          side: position.side,
          teamCode: position.teamCode,
          teamName: position.teamName,
          price: sell.price,
          shares: position.shares,
          amountUsd: sell.price * position.shares,
          status: sell.status,
          note: `Take profit +${settings.takeProfitDelta}`,
        });
        changed = true;
      }

      if (changed) writePositions(doc);
    };

    run().catch((e) => logger.error("MONITOR", "Initial sell pass failed", e));
    this.sellTimer = setInterval(() => {
      run().catch((e) => logger.error("MONITOR", "Sell loop error", e));
    }, Math.max(500, readSettings().monitorPollMs));
  }
}
