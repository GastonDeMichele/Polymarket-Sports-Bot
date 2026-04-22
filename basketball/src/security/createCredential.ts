import { ApiKeyCreds, Chain, ClobClient } from "@polymarket/clob-client";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { Wallet } from "@ethersproject/wallet";
import { CREDENTIAL_PATH } from "../config/paths";
import { maskAddress, tradingEnv } from "../config/env";
import { logger } from "../utils/logger";

function loadFromFile(): ApiKeyCreds | null {
  if (!existsSync(CREDENTIAL_PATH)) return null;
  try {
    const cred = JSON.parse(readFileSync(CREDENTIAL_PATH, "utf-8")) as ApiKeyCreds;
    return cred?.key ? cred : null;
  } catch {
    return null;
  }
}

export async function createCredential(forceRefresh = false): Promise<ApiKeyCreds | null> {
  const privateKey = tradingEnv.PRIVATE_KEY;
  if (!privateKey) {
    logger.warn("AUTH", "PRIVATE_KEY not set");
    return null;
  }

  const existing = loadFromFile();
  if (existing && !forceRefresh) {
    logger.info("AUTH", "Using saved credential");
    return existing;
  }

  try {
    const wallet = new Wallet(privateKey);
    const chainId = tradingEnv.CHAIN_ID as Chain;
    const clobClient = new ClobClient(tradingEnv.CLOB_API_URL, chainId, wallet);
    const credential = await clobClient.createOrDeriveApiKey();
    const dir = dirname(CREDENTIAL_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(CREDENTIAL_PATH, JSON.stringify(credential, null, 2));
    logger.success("AUTH", forceRefresh ? "Credential refreshed" : "Credential saved", maskAddress(wallet.address));
    return credential;
  } catch (error) {
    logger.error("AUTH", "Credential setup failed", error);
    return null;
  }
}
