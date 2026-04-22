import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import type { LeagueAlias } from "../types";
import { normalizeLeagueAlias } from "./league-catalog";

dotenvConfig({ path: resolve(process.cwd(), ".env") });

function parseNum(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const tradingEnv = {
  get PRIVATE_KEY(): string | undefined {
    return process.env.PRIVATE_KEY;
  },
  get CHAIN_ID(): number {
    return parseNum(process.env.CHAIN_ID, 137);
  },
  get CLOB_API_URL(): string {
    return process.env.CLOB_API_URL || "https://clob.polymarket.com";
  },
  get PROXY_WALLET_ADDRESS(): string {
    return process.env.PROXY_WALLET_ADDRESS || "";
  },
  get RPC_URL(): string | undefined {
    return process.env.RPC_URL;
  },
  get RPC_TOKEN(): string | undefined {
    return process.env.RPC_TOKEN;
  },
  get NEG_RISK(): boolean {
    return process.env.NEG_RISK !== "false";
  },
  get TICK_SIZE(): "0.01" | "0.1" {
    return process.env.TICK_SIZE === "0.1" ? "0.1" : "0.01";
  },
  get BUY_AMOUNT_USD(): number {
    return parseNum(process.env.BUY_AMOUNT_USD, 10);
  },
  get MAX_BUY_PRICE(): number {
    return parseNum(process.env.MAX_BUY_PRICE, 0.85);
  },
  get MAX_SPREAD(): number {
    return parseNum(process.env.MAX_SPREAD, 0.1);
  },
  get TAKE_PROFIT_DELTA(): number {
    return parseNum(process.env.TAKE_PROFIT_DELTA, 0.15);
  },
  get MONITOR_POLL_MS(): number {
    return parseNum(process.env.MONITOR_POLL_MS, 1500);
  },
  get MATCH_REFRESH_SECONDS(): number {
    return parseNum(process.env.MATCH_REFRESH_SECONDS, 60);
  },
  get LEAGUES(): LeagueAlias[] {
    const raw = process.env.LEAGUES || "atp,wta";
    const out: LeagueAlias[] = [];
    for (const part of raw.split(",")) {
      const n = normalizeLeagueAlias(part);
      if (n && !out.includes(n)) out.push(n);
    }
    return out;
  },
  get LOG_LEVEL(): "debug" | "info" | "warn" | "error" {
    const v = (process.env.LOG_LEVEL || "info").toLowerCase();
    if (v === "debug" || v === "warn" || v === "error") return v;
    return "info";
  },
};

export function maskAddress(addr: string): string {
  if (!addr || addr.length < 10) return "***";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function buildRpcUrl(baseUrl: string, token?: string): string {
  const trimmed = baseUrl.trim();
  if (!token) return trimmed;
  if (trimmed.includes("{RPC_TOKEN}")) return trimmed.replace(/\{RPC_TOKEN\}/g, token);
  if (trimmed.includes("${RPC_TOKEN}")) return trimmed.replace(/\$\{RPC_TOKEN\}/g, token);
  const normalized = trimmed.replace(/\/+$/, "");
  if (/infura\.io\/v3$/i.test(normalized) || /alchemy\.com\/v2$/i.test(normalized)) return `${normalized}/${token}`;
  return trimmed;
}

function isValidRpcUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function getRpcUrl(chainId: number): string {
  if (tradingEnv.RPC_URL) {
    let url = buildRpcUrl(tradingEnv.RPC_URL, tradingEnv.RPC_TOKEN);
    if (url.startsWith("wss://")) url = url.replace(/^wss:\/\//, "https://");
    if (url.startsWith("ws://")) url = url.replace(/^ws:\/\//, "http://");
    if (isValidRpcUrl(url)) return url;
  }
  if (chainId === 137) {
    if (tradingEnv.RPC_TOKEN) return `https://polygon-mainnet.g.alchemy.com/v2/${tradingEnv.RPC_TOKEN}`;
    return "https://polygon-mainnet.g.alchemy.com/v2/Ag-cC4rPDzO7TbKw3Uaqj";
  }
  if (chainId === 80002) {
    if (tradingEnv.RPC_TOKEN) return `https://polygon-amoy.g.alchemy.com/v2/${tradingEnv.RPC_TOKEN}`;
    return "https://rpc-amoy.polygon.technology";
  }
  throw new Error(`Unsupported chain ID: ${chainId}`);
}
