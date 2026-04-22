import type { LeagueAlias, LeagueDefinition } from "../types";

export const LEAGUE_BY_ALIAS: Record<LeagueAlias, LeagueDefinition> = {
  atp: { alias: "atp", label: "ATP Tour", tagId: 864, slugPrefix: "atp-" },
  wta: { alias: "wta", label: "WTA Tour", tagId: 864, slugPrefix: "wta-" },
};

const EXTRA_ALIAS: Record<string, LeagueAlias> = {
  tennis: "atp",
};

export function normalizeLeagueAlias(v: string): LeagueAlias | null {
  const t = v.trim().toLowerCase();
  if (t in LEAGUE_BY_ALIAS) return t as LeagueAlias;
  if (t in EXTRA_ALIAS) return EXTRA_ALIAS[t];
  return null;
}
