import { Side } from "@polymarket/clob-client";
import { getClobClient } from "../providers/clobclient";
import { logger } from "../utils/logger";
import { validateBuyOrderBalance } from "../utils/balance";
import { tradingEnv } from "../config/env";
import { PolymarketClient } from "../clients/polymarket";

export interface BuyGuardResult {
  ok: boolean;
  bestAsk: number;
  bestBid: number;
  spread: number;
  reason?: string;
}

export class TraderService {
  private pmClient = new PolymarketClient();

  async checkBuyGuards(tokenId: string, maxPrice: number, maxSpread: number): Promise<BuyGuardResult> {
    const book = await this.pmClient.getOrderBook(tokenId);
    const bestAsk = book?.asks?.length ? Number(book.asks[0].price) : 0;
    const bestBid = book?.bids?.length ? Number(book.bids[0].price) : 0;
    const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 1;
    if (bestAsk <= 0 || bestBid <= 0) return { ok: false, bestAsk, bestBid, spread, reason: "Missing liquidity" };
    if (bestAsk > maxPrice) return { ok: false, bestAsk, bestBid, spread, reason: `Price ${bestAsk.toFixed(3)} > ${maxPrice.toFixed(3)}` };
    if (spread > maxSpread) return { ok: false, bestAsk, bestBid, spread, reason: `Spread ${spread.toFixed(3)} > ${maxSpread.toFixed(3)}` };
    return { ok: true, bestAsk, bestBid, spread };
  }

  async buyMarket(tokenId: string, amountUsd: number): Promise<{ ok: boolean; price: number; shares: number; status: string; note?: string }> {
    const clob = await getClobClient();
    const { valid } = await validateBuyOrderBalance(clob, amountUsd);
    if (!valid) return { ok: false, price: 0, shares: 0, status: "REJECTED", note: "Insufficient balance/allowance" };

    const priceResp = await clob.getPrice(tokenId, "BUY");
    const p =
      typeof priceResp === "number"
        ? priceResp
        : typeof priceResp === "string"
          ? Number(priceResp)
          : Number((priceResp as Record<string, unknown>)?.price ?? (priceResp as Record<string, unknown>)?.mid ?? 0.5);
    const price = Number.isFinite(p) && p > 0 ? p : 0.5;
    const orderPrice = Math.max(tradingEnv.TICK_SIZE === "0.1" ? 0.1 : 0.01, Math.min(0.99, price));
    const shares = amountUsd / price;

    const result = (await (clob.createAndPostMarketOrder as (o: unknown, opt: unknown, tif: string) => Promise<unknown>)(
      { tokenID: tokenId, side: Side.BUY, amount: amountUsd, price: orderPrice },
      { tickSize: tradingEnv.TICK_SIZE, negRisk: tradingEnv.NEG_RISK },
      "FAK"
    )) as { status?: string; takingAmount?: string };

    const status = result?.status || "MATCHED";
    const success = ["FILLED", "PARTIALLY_FILLED", "matched", "MATCHED"].includes(status) || !result?.status;
    if (!success) return { ok: false, price, shares, status };

    let filledShares = result?.takingAmount ? Number(result.takingAmount) : shares;
    if (filledShares >= 1e6) filledShares /= 1e6;
    logger.success("TRADE", "Market BUY filled", `${filledShares.toFixed(4)} @ ${price.toFixed(4)}`);
    return { ok: true, price, shares: filledShares, status };
  }

  async sellMarket(tokenId: string, shares: number): Promise<{ ok: boolean; price: number; status: string }> {
    const clob = await getClobClient();
    const priceResp = await clob.getPrice(tokenId, "SELL");
    const p =
      typeof priceResp === "number"
        ? priceResp
        : typeof priceResp === "string"
          ? Number(priceResp)
          : Number((priceResp as Record<string, unknown>)?.price ?? (priceResp as Record<string, unknown>)?.mid ?? 0.5);
    const price = Number.isFinite(p) && p > 0 ? p : 0.5;
    const orderPrice = Math.max(tradingEnv.TICK_SIZE === "0.1" ? 0.1 : 0.01, Math.min(0.99, price));

    const result = (await (clob.createAndPostMarketOrder as (o: unknown, opt: unknown, tif: string) => Promise<unknown>)(
      { tokenID: tokenId, side: Side.SELL, amount: shares, price: orderPrice },
      { tickSize: tradingEnv.TICK_SIZE, negRisk: tradingEnv.NEG_RISK },
      "FAK"
    )) as { status?: string };

    const status = result?.status || "MATCHED";
    const ok = ["FILLED", "PARTIALLY_FILLED", "matched", "MATCHED"].includes(status) || !result?.status;
    if (ok) logger.success("TRADE", "Market SELL filled", `${shares.toFixed(4)} @ ${price.toFixed(4)}`);
    return { ok, price, status };
  }
}
