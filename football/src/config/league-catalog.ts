import type { LeagueAlias, LeagueDefinition } from "../types";

export const LEAGUE_BY_ALIAS: Record<LeagueAlias, LeagueDefinition> = {
  elc: { alias: "elc", label: "EFL Championship", tagId: 102643, slugPrefix: "elc-" },
  epl: { alias: "epl", label: "Premier League", tagId: 82, slugPrefix: "epl-" },
  laliga: { alias: "laliga", label: "La Liga", tagId: 780, slugPrefix: "lal-" },
  "ligue-1": { alias: "ligue-1", label: "Ligue 1", tagId: 102070, slugPrefix: "fl1-" },
  bundesliga: { alias: "bundesliga", label: "Bundesliga", tagId: 1494, slugPrefix: "bun-" },
  ucl: { alias: "ucl", label: "UEFA Champions League", tagId: 100977, slugPrefix: "ucl-" },
};

const EXTRA_ALIAS: Record<string, LeagueAlias> = {
  lal: "laliga",
  "la-liga": "laliga",
  fl1: "ligue-1",
  bun: "bundesliga",
};

export function normalizeLeagueAlias(v: string): LeagueAlias | null {
  const t = v.trim().toLowerCase();
  if (t in LEAGUE_BY_ALIAS) return t as LeagueAlias;
  if (t in EXTRA_ALIAS) return EXTRA_ALIAS[t];
  return null;
}
