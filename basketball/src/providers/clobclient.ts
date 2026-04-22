import { Chain, ClobClient } from "@polymarket/clob-client";
import type { ApiKeyCreds } from "@polymarket/clob-client";
import { existsSync, readFileSync } from "fs";
import { Wallet } from "@ethersproject/wallet";
import { CREDENTIAL_PATH } from "../config/paths";
import { tradingEnv } from "../config/env";
import { createCredential } from "../security/createCredential";
import { getClobApiError } from "../utils/clob-response";

let cachedClient: ClobClient | null = null;
let cachedConfig: { chainId: number; host: string } | null = null;

async function ensureCredential(): Promise<void> {
  if (existsSync(CREDENTIAL_PATH)) return;
  if (tradingEnv.PRIVATE_KEY) await createCredential();
}

function isUnauthorizedApiKeyError(error: unknown): boolean {
  const apiError = getClobApiError(error);
  const status =
    apiError?.status ??
    (typeof error === "object" && error !== null
      ? (error as { status?: number; response?: { status?: number } }).status ??
        (error as { status?: number; response?: { status?: number } }).response?.status
      : undefined);
  const message = apiError?.message ?? (error instanceof Error ? error.message : String(error));
  return status === 401 || /unauthorized\/invalid api key/i.test(message);
}

function buildClient(chainId: Chain, host: string, privateKey: string, creds: ApiKeyCreds): ClobClient {
  const wallet = new Wallet(privateKey);
  const secretBase64 = creds.secret.replace(/-/g, "+").replace(/_/g, "/");
  const apiKeyCreds: ApiKeyCreds = { key: creds.key, secret: secretBase64, passphrase: creds.passphrase };
  const proxyWalletAddress = tradingEnv.PROXY_WALLET_ADDRESS || undefined;
  return new ClobClient(host, chainId, wallet, apiKeyCreds, 2, proxyWalletAddress);
}

async function validateClient(client: ClobClient): Promise<void> {
  if (typeof client.getApiKeys === "function") {
    const response = await client.getApiKeys();
    const apiError = getClobApiError(response);
    if (apiError) throw Object.assign(new Error(apiError.message), { status: apiError.status });
  }
}

export async function getClobClient(): Promise<ClobClient> {
  await ensureCredential();
  if (!existsSync(CREDENTIAL_PATH)) {
    throw new Error("Credential file not found. Set PRIVATE_KEY in .env to generate Polymarket API credentials.");
  }

  const creds: ApiKeyCreds = JSON.parse(readFileSync(CREDENTIAL_PATH, "utf-8"));
  const chainId = tradingEnv.CHAIN_ID as Chain;
  const host = tradingEnv.CLOB_API_URL;

  if (cachedClient && cachedConfig?.chainId === chainId && cachedConfig.host === host) return cachedClient;

  const privateKey = tradingEnv.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY not found in .env");

  let client = buildClient(chainId, host, privateKey, creds);
  try {
    await validateClient(client);
  } catch (error) {
    if (!isUnauthorizedApiKeyError(error)) throw error;
    const refreshedCreds = await createCredential(true);
    if (!refreshedCreds) throw new Error("Failed to refresh credential after API key rejection");
    client = buildClient(chainId, host, privateKey, refreshedCreds);
    await validateClient(client);
  }

  cachedClient = client;
  cachedConfig = { chainId, host };
  return client;
}
