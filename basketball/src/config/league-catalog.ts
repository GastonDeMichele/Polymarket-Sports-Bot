import type { LeagueAlias, LeagueDefinition } from "../types";

export const LEAGUE_BY_ALIAS: Record<LeagueAlias, LeagueDefinition> = {
  nba: { alias: "nba", label: "NBA", tagId: 745, slugPrefix: "nba-" },
  bkcba: { alias: "bkcba", label: "Chinese Basketball Association (CBA)", tagId: 103097, slugPrefix: "bkcba-" },
};

const EXTRA_ALIAS: Record<string, LeagueAlias> = {
  cba: "bkcba",
};

export function normalizeLeagueAlias(v: string): LeagueAlias | null {
  const t = v.trim().toLowerCase();
  if (t in LEAGUE_BY_ALIAS) return t as LeagueAlias;
  if (t in EXTRA_ALIAS) return EXTRA_ALIAS[t];
  return null;
}
