import chalk from "chalk";
import { APP_LOG_PATH, SKIP_LOG_PATH } from "../config/paths";
import { tradingEnv } from "../config/env";
import { appendLogWithRotate } from "./json-store";

export type LogScope = "BOOT" | "MENU" | "MONITOR" | "CLOB" | "TRADE" | "AUTH" | "ALLOW" | "BAL" | "SYSTEM";
type LogLevel = "debug" | "info" | "warn" | "error" | "success";

const scopeColor: Record<LogScope, (s: string) => string> = {
  BOOT: chalk.blueBright,
  MENU: chalk.cyanBright,
  MONITOR: chalk.magentaBright,
  CLOB: chalk.blue,
  TRADE: chalk.greenBright,
  AUTH: chalk.yellowBright,
  ALLOW: chalk.yellow,
  BAL: chalk.green,
  SYSTEM: chalk.white,
};

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  success: 25,
  warn: 30,
  error: 40,
};

const levelColor: Record<LogLevel, (s: string) => string> = {
  debug: chalk.gray,
  info: chalk.cyan,
  success: chalk.green,
  warn: chalk.yellow,
  error: chalk.redBright,
};

const configured = levelWeight[tradingEnv.LOG_LEVEL];

function ts(): string {
  return new Date().toISOString();
}

function displayTs(): string {
  return new Date().toTimeString().slice(0, 8);
}

function write(level: LogLevel, scope: LogScope, message: string, detail?: unknown): void {
  if (levelWeight[level] < configured) return;

  const icon = level === "error" ? "✖" : level === "warn" ? "⚠" : level === "success" ? "✔" : level === "debug" ? "•" : "➜";
  const scopeIcon = getScopeIcon(scope);
  const scopeBadge = scopeColor[scope](`[${scope}]`);
  const levelBadge = levelColor[level](`[${level.toUpperCase()}]`);
  const pretty =
    `${chalk.dim(displayTs())} ` +
    `${levelBadge} ` +
    `${scopeBadge}${scopeIcon ? ` ${scopeIcon}` : ""} ` +
    `${chalk.bold(icon)} ` +
    `${message}` +
    (detail === undefined ? "" : chalk.gray(`\n   └─ ${format(detail)}`));

  process.stdout.write(`${pretty}\n`);
  appendLogWithRotate(APP_LOG_PATH, `[${ts()}] ${level.toUpperCase()} ${scope} ${message}${detail === undefined ? "" : ` :: ${format(detail)}`}`);
}

function format(v: unknown): string {
  if (v && typeof v === "object") {
    const anyObj = v as Record<string, unknown>;
    if (typeof anyObj.message === "string") {
      const status = typeof anyObj.status === "number" ? ` status=${anyObj.status}` : "";
      return `${anyObj.message}${status}`;
    }
    if (anyObj.response && typeof anyObj.response === "object") {
      const r = anyObj.response as Record<string, unknown>;
      const status = typeof r.status === "number" ? ` status=${r.status}` : "";
      const data = r.data && typeof r.data === "object" ? JSON.stringify(r.data) : "";
      return `response${status}${data ? ` data=${data}` : ""}`;
    }
  }
  if (v instanceof Error) return v.message;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function getScopeIcon(scope: LogScope): string {
  switch (scope) {
    case "BOOT":
      return "🚀";
    case "MENU":
      return "🧭";
    case "MONITOR":
      return "📡";
    case "CLOB":
      return "📘";
    case "TRADE":
      return "💸";
    case "AUTH":
      return "🔐";
    case "ALLOW":
      return "✅";
    case "BAL":
      return "💰";
    case "SYSTEM":
      return "🛠";
    default:
      return "";
  }
}

export const logger = {
  debug(scope: LogScope, message: string, detail?: unknown): void {
    write("debug", scope, message, detail);
  },
  info(scope: LogScope, message: string, detail?: unknown): void {
    write("info", scope, message, detail);
  },
  success(scope: LogScope, message: string, detail?: unknown): void {
    write("success", scope, message, detail);
  },
  warn(scope: LogScope, message: string, detail?: unknown): void {
    write("warn", scope, message, detail);
  },
  error(scope: LogScope, message: string, detail?: unknown): void {
    write("error", scope, message, detail);
  },
  skip(message: string, detail?: unknown): void {
    appendLogWithRotate(SKIP_LOG_PATH, `[${ts()}] ${message}${detail === undefined ? "" : ` :: ${format(detail)}`}`);
    write("warn", "TRADE", message, detail);
  },
};
