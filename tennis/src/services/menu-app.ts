import { checkbox, number, select } from "@inquirer/prompts";
import boxen from "boxen";
import chalk from "chalk";
import ora from "ora";
import { LEAGUE_BY_ALIAS } from "../config/league-catalog";
import { maskAddress, tradingEnv } from "../config/env";
import type { LeagueAlias, SelectionDoc, SettingsDoc } from "../types";
import { logger } from "../utils/logger";
import { prunePastSelectedMatches, readPositions, readSettings, writeSelection, writeSettings } from "./store";
import { getEventKickoffMs, PolymarketClient } from "../clients/polymarket";
import { ChildProcess } from "child_process";
import { getClobClient } from "../providers/clobclient";
import { getProxyWalletBalanceUsd } from "../utils/balance";
import { readSelection } from "./store";

export class MenuApp {
  constructor(private monitorChild: ChildProcess | null) {}

  async run(): Promise<void> {
    const pruned = prunePastSelectedMatches();
    if (pruned.removed > 0) {
      logger.info("MENU", "Past matches removed automatically", `${pruned.removed} removed, ${pruned.remaining} remaining`);
    }
    await this.showTradingReady();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const action = await select({
        message: chalk.bold.cyan("Main menu"),
        choices: [
          { name: "1) 📦 Bought matches / open positions", value: "positions" },
          { name: "2) 🎾 Select league and live matches", value: "league" },
          { name: "3) 📡 Current monitoring matches", value: "monitoring" },
          { name: "4) ⚙ Settings", value: "settings" },
          { name: "5) 🚪 Exit", value: "exit" },
        ],
      });

      if (action === "positions") {
        await this.showPositionsMenu();
      } else if (action === "league") {
        await this.showLeagueMenu();
      } else if (action === "monitoring") {
        await this.showMonitoringMatchesMenu();
      } else if (action === "settings") {
        await this.showSettingsMenu();
      } else {
        logger.info("MENU", "Exiting menu");
        return;
      }
    }
  }

  private async showTradingReady(): Promise<void> {
    try {
      const clob = await getClobClient();
      const { balanceUsd, allowanceUsd } = await getProxyWalletBalanceUsd(clob);
      const wallet = tradingEnv.PROXY_WALLET_ADDRESS ? `proxy ${maskAddress(tradingEnv.PROXY_WALLET_ADDRESS)}` : "EOA";
      const allowanceStr = allowanceUsd >= 1e12 ? "max" : formatUsd(allowanceUsd);
      process.stdout.write("\x1Bc");
      process.stdout.write(
        `${boxen(
          `${chalk.bold.cyan("🎾 Polymarket sports-tennis trading bot")}\n` +
            `${chalk.gray("👛 Wallet   ")} ${chalk.white(wallet)}\n` +
            `${chalk.gray("💵 Balance  ")} ${chalk.green(formatUsd(balanceUsd))}\n` +
            `${chalk.gray("✅ Allowance")} ${chalk.yellow(allowanceStr)}\n` +
            `${chalk.gray("🎾 Leagues  ")} ${chalk.magenta(tradingEnv.LEAGUES.join(", "))}`,
          { padding: { top: 1, right: 2, bottom: 1, left: 2 }, borderColor: "cyan", borderStyle: "round", title: " ✨ Trading Ready " }
        )}\n`
      );
    } catch (e) {
      logger.warn("MENU", "Could not fetch balance panel", e);
    }
  }

  private async showPositionsMenu(): Promise<void> {
    const pos = readPositions().positions;
    const open = pos.filter((p) => p.status === "open");
    if (open.length === 0) {
      process.stdout.write(`${boxen(chalk.gray("📭 No open positions"), { padding: 1, borderColor: "gray" })}\n`);
      return;
    }
    const lines = open.map(
      (p, i) =>
        `${chalk.cyan(`${i + 1}.`)} ${chalk.bold(p.eventSlug)} ${chalk.magenta(`[${p.teamCode}]`)} ` +
        `buy ${p.buyPrice.toFixed(3)} | shares ${p.shares.toFixed(4)} | TP ${chalk.green((p.buyPrice + readSettings().takeProfitDelta).toFixed(3))}`
    );
    process.stdout.write(`${boxen(lines.join("\n"), { padding: 1, borderColor: "green", title: " 📦 Open positions " })}\n`);
  }

  private async showLeagueMenu(): Promise<void> {
    const league = (await select({
      message: "Select league",
      choices: tradingEnv.LEAGUES.map((alias) => ({
        name: `${getLeagueIcon(alias)} ${LEAGUE_BY_ALIAS[alias].label} (${alias})`,
        value: alias,
      })),
    })) as LeagueAlias;

    const spinner = ora(`🎾 Loading live matches for ${league}...`).start();
    const pm = new PolymarketClient();
    try {
      const events = await pm.listLiveMatchEvents(LEAGUE_BY_ALIAS[league]);
      const teamLogoMap = await pm.getLeagueTeamLogoMap(league);
      spinner.stop();
      if (events.length === 0) {
        logger.warn("MENU", "No live matches currently found", league);
        return;
      }

      const current = readSelection();
      const selectedSet = new Set(current.eventSlugs);
      logger.info("MENU", "Tip: press SPACE to select, ENTER to submit");

      const selected = await checkbox({
        message: "Select matches to trade 🎾",
        choices: events.map((e) => {
          const kickoffMs = getEventKickoffMs(e);
          const kickoffStr = kickoffMs > 0 ? formatPolymarketUtcDate(kickoffMs) : "unknown date";
          const marks = parseTeamMarksFromSlug(e.slug);
          const matchup = marks ? `${marks.home} vs ${marks.away}` : "unknown teams";
          const title = compactTitle(e.title || e.slug);
          return {
            name: `🗓 ${kickoffStr} | ⚔️ ${matchup} | 🏟 ${title} | 🔖 ${e.slug}`,
            value: e.slug,
            checked: selectedSet.has(e.slug),
          };
        }),
        pageSize: 15,
      });

      if (selected.length === 0) {
        logger.warn("MENU", "No matches selected (nothing changed). Use SPACE to mark matches.");
        return;
      }

      const markets = [];
      const eventSlugs: string[] = [];
      for (const slug of selected) {
        const event = events.find((e) => e.slug === slug);
        if (!event) continue;
        const resolved = pm.resolveSelectedMarket(event, teamLogoMap);
        if (!resolved) {
          logger.warn("MENU", "Could not resolve moneyline for event", slug);
          continue;
        }
        eventSlugs.push(slug);
        markets.push(resolved);
      }

      if (markets.length === 0) {
        logger.warn("MENU", "No tradable markets resolved from selection");
        return;
      }

      const doc: SelectionDoc = {
        league,
        eventSlugs,
        markets,
        updatedAt: new Date().toISOString(),
      };
      writeSelection(doc);
      logger.success("MENU", "Selection saved", `${markets.length} market(s)`);

      if (this.monitorChild && this.monitorChild.connected) {
        this.monitorChild.send({ type: "reload-selection" });
      }
    } catch (e) {
      spinner.fail("Failed to load live matches");
      logger.error("MENU", "League menu failed", e);
    }
  }

  private async showMonitoringMatchesMenu(): Promise<void> {
    const pruned = prunePastSelectedMatches();
    if (pruned.removed > 0) {
      logger.info("MENU", "Past monitoring matches removed", `${pruned.removed} removed`);
    }
    const selection = readSelection();
    if (!selection.markets.length) {
      process.stdout.write(`${boxen(chalk.gray("📡 No monitoring markets selected yet"), { padding: 1, borderColor: "gray" })}\n`);
      return;
    }

    const lines = selection.markets.map((m, idx) => {
      return (
        `${chalk.cyan(`${idx + 1}.`)} ${chalk.bold(m.eventSlug)}\n` +
        `   ${chalk.yellow("Home")} ${renderTeamMark(m.homeCode, m.homeLogoUrl)} ${m.homeTeam} token ${m.homeTokenId}\n` +
        `   ${chalk.yellow("Away")} ${renderTeamMark(m.awayCode, m.awayLogoUrl)} ${m.awayTeam} token ${m.awayTokenId}\n` +
        `   market: ${m.marketSlug}`
      );
    });

    process.stdout.write(
      `${boxen(lines.join("\n\n"), {
        padding: 1,
        borderColor: "magenta",
        title: ` 📡 Monitoring Matches (${selection.markets.length}) `,
      })}\n`
    );
  }

  private async showSettingsMenu(): Promise<void> {
    const s = readSettings();
    const updated: SettingsDoc = {
      buyAmountUsd: (await number({ message: "Buy amount USD", default: s.buyAmountUsd, min: 1 })) ?? s.buyAmountUsd,
      maxBuyPrice:
        (await number({ message: "Max buy price (skip above)", default: s.maxBuyPrice, min: 0.01, max: 0.99 })) ??
        s.maxBuyPrice,
      maxSpread:
        (await number({ message: "Max spread (skip above)", default: s.maxSpread, min: 0.001, max: 1 })) ??
        s.maxSpread,
      takeProfitDelta:
        (await number({ message: "Take-profit delta (absolute)", default: s.takeProfitDelta, min: 0.01, max: 1 })) ??
        s.takeProfitDelta,
      monitorPollMs:
        (await number({ message: "Monitor poll interval ms", default: s.monitorPollMs, min: 500, max: 60_000 })) ??
        s.monitorPollMs,
    };
    writeSettings(updated);
    logger.success("MENU", "Settings saved");
  }
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function formatPolymarketUtcDate(ms: number): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(ms)) + " UTC"
  );
}

function compactTitle(v: string): string {
  const t = v.replace(/\s+/g, " ").trim();
  if (t.length <= 62) return t;
  return `${t.slice(0, 59)}...`;
}

function parseTeamMarksFromSlug(slug: string): { home: string; away: string } | null {
  const p = slug.split("-");
  if (p.length < 5) return null;
  const home = p[1]?.toUpperCase();
  const away = p[2]?.toUpperCase();
  if (!home || !away) return null;
  return { home: `[${home}]`, away: `[${away}]` };
}

function hyperlink(label: string, url?: string): string {
  if (!url) return label;
  // OSC 8 hyperlink (works in many modern terminals).
  return `\u001b]8;;${url}\u0007${label}\u001b]8;;\u0007`;
}

function renderTeamMark(code: string, logoUrl?: string): string {
  const label = `[${code.toUpperCase()}]`;
  return logoUrl ? `${hyperlink(label, logoUrl)} 🖼` : label;
}

function getLeagueIcon(alias: LeagueAlias): string {
  switch (alias) {
    case "atp":
      return "🎾";
    case "wta":
      return "🏅";
    default:
      return "🎾";
  }
}
