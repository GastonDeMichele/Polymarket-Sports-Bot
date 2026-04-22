import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { MaxUint256 } from "@ethersproject/constants";
import { JsonRpcProvider } from "@ethersproject/providers";
import { parseUnits } from "@ethersproject/units";
import { Wallet } from "@ethersproject/wallet";
import { AssetType, ClobClient, getContractConfig } from "@polymarket/clob-client";
import Safe from "@safe-global/protocol-kit";
import { OperationType } from "@safe-global/types-kit";
import { getRpcUrl, tradingEnv } from "../config/env";
import { getClobApiError } from "../utils/clob-response";
import { logger } from "../utils/logger";

const USDC_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

async function approveUsdcOnChainFromSafe(
  chainId: number,
  exchangeAddress: string,
  collateralAddress: string,
  privateKey: string,
  proxyAddress: string
): Promise<boolean> {
  try {
    const rpcUrl = getRpcUrl(chainId);
    const provider = new JsonRpcProvider(rpcUrl);
    const usdc = new Contract(collateralAddress, USDC_ABI, provider);
    const current = await usdc.allowance(proxyAddress, exchangeAddress);
    if (current.gte(MaxUint256)) {
      logger.success("ALLOW", "Safe proxy allowance already max");
      return true;
    }

    const data = usdc.interface.encodeFunctionData("approve", [exchangeAddress, MaxUint256]);
    const safeSdk = await Safe.init({
      provider: rpcUrl,
      signer: privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`,
      safeAddress: proxyAddress,
    });
    const safeTx = await safeSdk.createTransaction({
      transactions: [{ to: collateralAddress, value: "0", data, operation: OperationType.Call }],
    });
    const signed = await safeSdk.signTransaction(safeTx);
    const result = await safeSdk.executeTransaction(signed);
    logger.success("ALLOW", "Safe proxy approve tx sent", result.hash);
    await provider.waitForTransaction(result.hash, 1, 90_000).catch(() => {});
    return true;
  } catch (e) {
    logger.error("ALLOW", "Safe proxy approve failed", e);
    return false;
  }
}

async function approveUsdcOnChain(
  chainId: number,
  exchangeAddress: string,
  collateralAddress: string,
  privateKey: string
): Promise<boolean> {
  try {
    const rpcUrl = getRpcUrl(chainId);
    const provider = new JsonRpcProvider(rpcUrl);
    const wallet = new Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`, provider);

    let gasPrice: BigNumber;
    try {
      const networkGas = await provider.getGasPrice();
      gasPrice = networkGas.mul(120).div(100);
      if (gasPrice.lt(parseUnits("30", "gwei"))) gasPrice = parseUnits("30", "gwei");
    } catch {
      gasPrice = parseUnits("30", "gwei");
    }

    const usdc = new Contract(collateralAddress, USDC_ABI, wallet);
    const tx = await usdc.approve(exchangeAddress, MaxUint256, { gasLimit: 100_000, gasPrice });
    logger.success("ALLOW", "EOA approve tx sent", tx.hash);
    await tx.wait(1);
    logger.success("ALLOW", "EOA approve confirmed");
    return true;
  } catch (e) {
    logger.error("ALLOW", "EOA approve failed", e);
    return false;
  }
}

export async function runApprove(client: ClobClient | null): Promise<boolean> {
  if (!client) return false;
  let key = (tradingEnv.PRIVATE_KEY || "").trim();
  if (!key) return false;
  if (!key.startsWith("0x")) key = `0x${key}`;

  const chainId = tradingEnv.CHAIN_ID;
  const proxyAddress = (tradingEnv.PROXY_WALLET_ADDRESS || "").trim();
  const contractConfig = getContractConfig(chainId);

  if (proxyAddress) {
    logger.info("ALLOW", "Safe proxy detected, checking allowance");
    await approveUsdcOnChainFromSafe(chainId, contractConfig.exchange, contractConfig.collateral, key, proxyAddress);
  }
  await approveUsdcOnChain(chainId, contractConfig.exchange, contractConfig.collateral, key);

  if (typeof client.updateBalanceAllowance !== "function") return true;

  try {
    const firstResponse = await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
    const firstError = getClobApiError(firstResponse);
    if (firstError) throw new Error(firstError.message);
    logger.success("ALLOW", "CLOB allowance synced");
    await new Promise((r) => setTimeout(r, 2000));
    const secondResponse = await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
    const secondError = getClobApiError(secondResponse);
    if (secondError) throw new Error(secondError.message);
  } catch (e) {
    logger.error("ALLOW", "API allowance sync failed", e);
  }

  return true;
}
