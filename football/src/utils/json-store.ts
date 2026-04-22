import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "fs";
import { dirname } from "path";

export function ensureDirFor(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function readJsonFile<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback;
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as T;
    return parsed;
  } catch {
    return fallback;
  }
}

export function writeJsonFileAtomic(path: string, value: unknown): void {
  ensureDirFor(path);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}

export function appendLogWithRotate(path: string, line: string, maxBytes = 5 * 1024 * 1024): void {
  ensureDirFor(path);
  try {
    if (existsSync(path) && statSync(path).size > maxBytes) {
      const backup = `${path}.1`;
      if (existsSync(backup)) {
        copyFileSync(path, backup);
      } else {
        renameSync(path, backup);
      }
      if (existsSync(path)) writeFileSync(path, "");
    }
  } catch {
    // ignore rotate errors, continue append
  }

  try {
    appendFileSync(path, `${line}\n`);
  } catch {
    // ignore logging errors
  }
}
