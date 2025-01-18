export interface ITradeStrategy {
  tokenAddress: string;
  percentage: number;
  walletAddress: string;

  calculateTradeAmount(detectedAmount: bigint): bigint;
  shouldTrade(transaction: any): boolean;
  executeTrade(
    amount: bigint,
    tokenIn: string,
    tokenOut: string
  ): Promise<boolean>;
}
