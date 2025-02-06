export interface ITradeStrategy {
  tokenAddress: string;
  percentage: number;
  maxCap: number;
  tradingStrategy: "buy_only" | "sell_only" | "both";
  walletAddress: string;

  calculateTradeAmount(detectedAmount: bigint): bigint;
  shouldTrade(transaction: any): boolean;
  executeTrade(
    amount: bigint,
    tokenIn: string,
    tokenOut: string
  ): Promise<boolean>;
}
