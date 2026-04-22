import { POSITIONS_PATH, SELECTION_PATH, SETTINGS_PATH, TRADES_PATH } from "../config/paths";
import type { PositionRecord, PositionsDoc, SelectionDoc, SettingsDoc, TradeRecord, TradesDoc } from "../types";
import { readJsonFile, writeJsonFileAtomic } from "../utils/json-store";
import { tradingEnv } from "../config/env";

const DEFAULT_SETTINGS: SettingsDoc = {
  buyAmountUsd: tradingEnv.BUY_AMOUNT_USD,
  maxBuyPrice: tradingEnv.MAX_BUY_PRICE,
  maxSpread: tradingEnv.MAX_SPREAD,
  takeProfitDelta: tradingEnv.TAKE_PROFIT_DELTA,
  monitorPollMs: tradingEnv.MONITOR_POLL_MS,
};

export function readSettings(): SettingsDoc {
  return { ...DEFAULT_SETTINGS, ...readJsonFile<SettingsDoc>(SETTINGS_PATH, DEFAULT_SETTINGS) };
}

export function writeSettings(settings: SettingsDoc): void {
  writeJsonFileAtomic(SETTINGS_PATH, settings);
}

export function readSelection(): SelectionDoc {
  return readJsonFile<SelectionDoc>(SELECTION_PATH, { league: "", eventSlugs: [], markets: [], updatedAt: "" });
}

export function writeSelection(selection: SelectionDoc): void {
  writeJsonFileAtomic(SELECTION_PATH, selection);
}

function parseSlugDateUtcMs(slug: string): number | null {
  const m = /-(\d{4})-(\d{2})-(\d{2})$/.exec(slug);
  if (!m) return null;
  const y = Number(m[1]);
  const mon = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mon) || !Number.isFinite(d)) return null;
  return Date.UTC(y, mon - 1, d, 0, 0, 0, 0);
}

function isPastMatchSlug(slug: string, now = new Date()): boolean {
  const slugDateMs = parseSlugDateUtcMs(slug);
  if (slugDateMs == null) return false;
  const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0);
  return slugDateMs < todayUtcMs;
}

/**
 * Remove past matches from selected-markets.json automatically (UTC by slug date).
 * Returns how many were removed.
 */
export function prunePastSelectedMatches(): { removed: number; remaining: number } {
  const current = readSelection();
  const nextSlugs = current.eventSlugs.filter((s) => !isPastMatchSlug(s));
  const nextMarkets = current.markets.filter((m) => !isPastMatchSlug(m.eventSlug));
  const removed = current.markets.length - nextMarkets.length;
  if (removed > 0) {
    writeSelection({
      ...current,
      eventSlugs: nextSlugs,
      markets: nextMarkets,
      updatedAt: new Date().toISOString(),
    });
  }
  return { removed, remaining: nextMarkets.length };
}

export function readPositions(): PositionsDoc {
  return readJsonFile<PositionsDoc>(POSITIONS_PATH, { positions: [] });
}

export function writePositions(doc: PositionsDoc): void {
  writeJsonFileAtomic(POSITIONS_PATH, doc);
}

export function upsertPosition(position: PositionRecord): void {
  const doc = readPositions();
  const idx = doc.positions.findIndex((p) => p.id === position.id);
  if (idx >= 0) doc.positions[idx] = position;
  else doc.positions.push(position);
  writePositions(doc);
}

export function readTrades(): TradesDoc {
  return readJsonFile<TradesDoc>(TRADES_PATH, { trades: [] });
}

export function appendTrade(trade: TradeRecord): void {
  const doc = readTrades();
  doc.trades.push(trade);
  writeJsonFileAtomic(TRADES_PATH, doc);
}
