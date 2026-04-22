import type { GammaEvent, GammaMarketEntry, GammaTeam, LeagueDefinition, SelectedMarket, SportsScoreUpdate } from "../types";
import { LEAGUE_BY_ALIAS } from "../config/league-catalog";

const GAMMA_EVENTS_URL = "https://gamma-api.polymarket.com/events";
const GAMMA_TEAMS_URL = "https://gamma-api.polymarket.com/teams";
const CLOB_BOOK_URL = "https://clob.polymarket.com/book";

export interface OrderBook {
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
}

function parseClobTokenIds(m: GammaMarketEntry): [string | null, string | null] {
  const idsRaw = m.clobTokenIds;
  if (!idsRaw) return [null, null];
  const ids =
    typeof idsRaw === "string"
      ? (() => {
          try {
            return JSON.parse(idsRaw) as string[];
          } catch {
            return idsRaw.split(",").map((s) => s.trim());
          }
        })()
      : idsRaw.map((x) => String(x));
  return [ids[0] ?? null, ids[1] ?? null];
}

/** Parsed outcome labels from Gamma (e.g. "[\"Rockets\", \"Lakers\"]"). */
function parseMarketOutcomes(m: GammaMarketEntry): string[] {
  const raw = m.outcomes;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.map((x) => String(x));
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) return raw.map((x) => String(x));
  return [];
}

/**
 * Single-event moneyline: one market, two outcomes, two YES token ids.
 * Team/player order matches slug segments after the league prefix (e.g. atp-nava-navone -> [nava, navone]).
 */
function resolveCombinedMoneyline(
  event: GammaEvent,
  codes: { home: string; away: string },
  m: GammaMarketEntry,
  teamLogoMap?: Record<string, string>
): SelectedMarket | null {
  const [t0, t1] = parseClobTokenIds(m);
  if (!t0 || !t1 || !m.conditionId) return null;
  const outcomes = parseMarketOutcomes(m);
  const homeTeam = outcomes[0]?.trim() || codes.home.toUpperCase();
  const awayTeam = outcomes[1]?.trim() || codes.away.toUpperCase();
  if (!homeTeam || !awayTeam) return null;

  return {
    eventSlug: event.slug,
    eventTitle: event.title || event.slug,
    marketSlug: String(m.slug || ""),
    conditionId: String(m.conditionId),
    homeCode: codes.home,
    awayCode: codes.away,
    homeTeam,
    awayTeam,
    homeTokenId: t0,
    awayTokenId: t1,
    homeLogoUrl: teamLogoMap?.[codes.home.toUpperCase()],
    awayLogoUrl: teamLogoMap?.[codes.away.toUpperCase()],
  };
}

function parseGameStartUnix(gameStartTime?: string): number | null {
  if (!gameStartTime?.trim()) return null;
  const s = gameStartTime.trim();
  const iso = /^\d{4}-\d{2}-\d{2}\s/.test(s) ? s.replace(" ", "T") : s;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function parseSlugDateMs(slug?: string): number | null {
  if (!slug) return null;
  const m = /-(\d{4})-(\d{2})-(\d{2})$/.exec(slug);
  if (!m) return null;
  const y = Number(m[1]);
  const mon = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mon) || !Number.isFinite(d)) return null;
  return Date.UTC(y, mon - 1, d, 0, 0, 0, 0);
}

export function getEventKickoffMs(event: GammaEvent): number {
  let best: number | null = null;
  for (const m of event.markets || []) {
    const ts = parseGameStartUnix(m.gameStartTime);
    if (ts != null && (best == null || ts < best)) best = ts;
  }
  if (best != null) return best * 1000;
  const slugDateMs = parseSlugDateMs(event.slug);
  if (slugDateMs != null) return slugDateMs;
  if (event.startDate) {
    const ms = new Date(event.startDate).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

function hasPastKickoff(kickoffMs: number, nowMs: number): boolean {
  if (!Number.isFinite(kickoffMs) || kickoffMs <= 0) return false;
  // Keep currently-live windows but hide stale historical fixtures.
  return kickoffMs < nowMs - 6 * 60 * 60 * 1000;
}

function isEventPast(e: GammaEvent, nowMs: number): boolean {
  const endMs = e.endDate ? new Date(e.endDate).getTime() : NaN;
  if (Number.isFinite(endMs)) return nowMs >= endMs;

  let start: number | null = null;
  for (const m of e.markets || []) {
    const t = parseGameStartUnix(m.gameStartTime);
    if (t != null && (start == null || t < start)) start = t;
  }
  if (start == null && e.startDate) {
    const s = new Date(e.startDate).getTime();
    if (Number.isFinite(s)) start = Math.floor(s / 1000);
  }
  if (start == null) {
    const slugDateMs = parseSlugDateMs(e.slug);
    if (slugDateMs != null) start = Math.floor(slugDateMs / 1000);
  }
  if (start == null) return false;

  // Fallback when endDate is missing: game markets should be done well before +6h.
  const fallbackEndMs = (start + 6 * 60 * 60) * 1000;
  return nowMs >= fallbackEndMs;
}

function parseCodesFromEventSlug(slug: string): { home: string; away: string } | null {
  const p = slug.split("-");
  if (p.length < 5) return null;
  return { home: p[1] || "", away: p[2] || "" };
}

function isExcludedSlug(slug: string): boolean {
  return (
    slug.includes("-more-markets") ||
    slug.includes("-halftime") ||
    slug.includes("-exact-score") ||
    slug.includes("-first-half") ||
    slug.includes("-anytime")
  );
}

function marketVolume(m: GammaMarketEntry): number {
  if (typeof m.volumeNum === "number") return m.volumeNum;
  const v = parseFloat(String(m.volume ?? "0"));
  return Number.isFinite(v) ? v : 0;
}

export class PolymarketClient {
  async getLeagueTeamLogoMap(leagueAlias: string): Promise<Record<string, string>> {
    try {
      const params = new URLSearchParams({
        league: leagueAlias,
        limit: "2000",
      });
      const res = await fetch(`${GAMMA_TEAMS_URL}?${params}`);
      if (!res.ok) return {};
      const rows = (await res.json()) as GammaTeam[];
      if (!Array.isArray(rows)) return {};
      const out: Record<string, string> = {};
      for (const row of rows) {
        const abbr = String(row.abbreviation || "").trim().toUpperCase();
        const logo = String(row.logo || "").trim();
        if (!abbr || !logo) continue;
        out[abbr] = logo;
      }
      return out;
    } catch {
      return {};
    }
  }

  async listLiveMatchEvents(league: LeagueDefinition, limit = 200): Promise<GammaEvent[]> {
    const out: GammaEvent[] = [];
    const seen = new Set<string>();
    for (let offset = 0; offset < 500; offset += 100) {
      const params = new URLSearchParams({
        tag_id: String(league.tagId),
        active: "true",
        closed: "false",
        limit: String(Math.min(100, limit)),
        offset: String(offset),
        order: "start_date",
        ascending: "true",
      });
      const res = await fetch(`${GAMMA_EVENTS_URL}?${params}`);
      if (!res.ok) break;
      const batch = (await res.json()) as GammaEvent[];
      if (!Array.isArray(batch) || batch.length === 0) break;

      for (const event of batch) {
        const slug = event.slug || "";
        if (!slug.startsWith(league.slugPrefix)) continue;
        if (!/-\d{4}-\d{2}-\d{2}$/.test(slug)) continue;
        if (isExcludedSlug(slug)) continue;
        if (seen.has(slug)) continue;
        seen.add(slug);
        out.push(event);
      }
    }

    const nowMs = Date.now();
    const filtered = out.filter((e) => {
      if (isEventPast(e, nowMs)) return false;
      const kickoffMs = getEventKickoffMs(e);
      if (hasPastKickoff(kickoffMs, nowMs)) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      const ka = getEventKickoffMs(a);
      const kb = getEventKickoffMs(b);
      const aValid = Number.isFinite(ka) && ka > 0;
      const bValid = Number.isFinite(kb) && kb > 0;
      if (aValid && bValid) return ka - kb;
      if (aValid) return -1;
      if (bValid) return 1;
      return a.slug.localeCompare(b.slug);
    });
  }

  async getEventBySlug(slug: string): Promise<GammaEvent | null> {
    const res = await fetch(`${GAMMA_EVENTS_URL}/slug/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as GammaEvent;
    return data?.slug ? data : null;
  }

  resolveSelectedMarket(event: GammaEvent, teamLogoMap?: Record<string, string>): SelectedMarket | null {
    const codes = parseCodesFromEventSlug(event.slug);
    if (!codes) return null;
    const moneyline = (event.markets || []).filter((m) => m.sportsMarketType === "moneyline" && m.slug && !m.slug.includes("-draw"));

    if (moneyline.length >= 2) {
      let home = moneyline.find((m) => m.slug?.endsWith(`-${codes.home}`));
      let away = moneyline.find((m) => m.slug?.endsWith(`-${codes.away}`));
      if (!home || !away) {
        const sorted = [...moneyline].sort((a, b) => marketVolume(b) - marketVolume(a));
        home = sorted[0];
        away = sorted[1];
        if (!home || !away) return null;
      }

      const [homeYes] = parseClobTokenIds(home);
      const [awayYes] = parseClobTokenIds(away);
      if (!homeYes || !awayYes || !home.conditionId || !away.conditionId) return null;

      return {
        eventSlug: event.slug,
        eventTitle: event.title || event.slug,
        marketSlug: String(home.slug || ""),
        conditionId: String(home.conditionId),
        homeCode: codes.home,
        awayCode: codes.away,
        homeTeam: String(home.groupItemTitle || codes.home.toUpperCase()),
        awayTeam: String(away.groupItemTitle || codes.away.toUpperCase()),
        homeTokenId: homeYes,
        awayTokenId: awayYes,
        homeLogoUrl: teamLogoMap?.[codes.home.toUpperCase()],
        awayLogoUrl: teamLogoMap?.[codes.away.toUpperCase()],
      };
    }

    // One combined moneyline market (two outcomes, two token ids on the same condition).
    if (moneyline.length === 1) {
      const combined = resolveCombinedMoneyline(event, codes, moneyline[0]!, teamLogoMap);
      if (combined) return combined;
    }

    return null;
  }

  async getOrderBook(tokenId: string): Promise<OrderBook | null> {
    const res = await fetch(`${CLOB_BOOK_URL}?token_id=${encodeURIComponent(tokenId)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { bids?: Array<{ price: string; size: string }>; asks?: Array<{ price: string; size: string }> };
    return { bids: data.bids || [], asks: data.asks || [] };
  }
}

export const SPORTS_WS_URL = "wss://sports-api.polymarket.com/ws";
export function parseSportsUpdate(data: unknown): SportsScoreUpdate | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.slug === "string") return d as unknown as SportsScoreUpdate;
  if (d.data && typeof d.data === "object" && typeof (d.data as Record<string, unknown>).slug === "string") {
    return d.data as SportsScoreUpdate;
  }
  if (d.payload && typeof d.payload === "object" && typeof (d.payload as Record<string, unknown>).slug === "string") {
    return d.payload as SportsScoreUpdate;
  }
  return null;
}

export function getLeagueDefinition(alias: string): LeagueDefinition | null {
  return (LEAGUE_BY_ALIAS as Record<string, LeagueDefinition>)[alias] ?? null;
}
