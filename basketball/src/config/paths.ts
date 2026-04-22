import { resolve } from "path";

export const ROOT_DIR = process.cwd();
export const DATA_DIR = resolve(ROOT_DIR, "data");
export const LOG_DIR = resolve(ROOT_DIR, "logs");

export const CREDENTIAL_PATH = resolve(DATA_DIR, "credential.json");
export const SETTINGS_PATH = resolve(DATA_DIR, "settings.json");
export const SELECTION_PATH = resolve(DATA_DIR, "selected-markets.json");
export const POSITIONS_PATH = resolve(DATA_DIR, "positions.json");
export const TRADES_PATH = resolve(DATA_DIR, "trades.json");
export const APP_LOG_PATH = resolve(LOG_DIR, "app.log");
export const SKIP_LOG_PATH = resolve(LOG_DIR, "skip.log");
