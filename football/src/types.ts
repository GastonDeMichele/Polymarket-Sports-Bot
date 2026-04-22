export type LeagueAlias = "elc" | "epl" | "laliga" | "ligue-1" | "bundesliga" | "ucl";

export interface LeagueDefinition {
  alias: LeagueAlias;
  label: string;
  tagId: number;
  slugPrefix: string;
}

export interface SettingsDoc {
  buyAmountUsd: number;
  maxBuyPrice: number;
  maxSpread: number;
  takeProfitDelta: number;
  monitorPollMs: number;
}

export interface SelectedMarket {
  eventSlug: string;
  eventTitle: string;
  marketSlug: string;
  conditionId: string;
  homeCode: string;
  awayCode: string;
  homeTeam: string;
  awayTeam: string;
  homeTokenId: string;
  awayTokenId: string;
  homeLogoUrl?: string;
  awayLogoUrl?: string;
}

export interface SelectionDoc {
  league: string;
  eventSlugs: string[];
  markets: SelectedMarket[];
  updatedAt: string;
}

export interface PositionRecord {
  id: string;
  eventSlug: string;
  marketSlug: string;
  conditionId: string;
  side: "home" | "away";
  teamCode: string;
  teamName: string;
  teamLogoUrl?: string;
  tokenId: string;
  buyPrice: number;
  shares: number;
  spentUsd: number;
  status: "open" | "closed";
  boughtAt: string;
  soldAt?: string;
  sellPrice?: number;
  orderStatus?: string;
}

export interface PositionsDoc {
  positions: PositionRecord[];
}

export interface TradeRecord {
  id: string;
  ts: string;
  action: "BUY" | "SELL";
  eventSlug: string;
  marketSlug: string;
  tokenId: string;
  side: "home" | "away";
  teamCode: string;
  teamName: string;
  price: number;
  shares: number;
  amountUsd: number;
  status: string;
  note?: string;
}

export interface TradesDoc {
  trades: TradeRecord[];
}

export interface GammaMarketEntry {
  slug?: string;
  conditionId?: string;
  groupItemTitle?: string;
  sportsMarketType?: string;
  clobTokenIds?: string | string[];
  gameStartTime?: string;
  volume?: string;
  volumeNum?: number;
  [key: string]: unknown;
}

export interface GammaEvent {
  slug: string;
  title: string;
  startDate?: string;
  endDate?: string;
  active?: boolean;
  closed?: boolean;
  markets?: GammaMarketEntry[];
  [key: string]: unknown;
}

export interface SportsScoreUpdate {
  slug: string;
  live?: boolean;
  ended?: boolean;
  score?: string;
  period?: string;
  elapsed?: string;
  last_update?: string;
}

export interface GammaTeam {
  name?: string;
  abbreviation?: string;
  logo?: string;
  league?: string;
  [key: string]: unknown;
}
