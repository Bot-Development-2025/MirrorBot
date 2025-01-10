export interface ITradeStrategy {
  tokenAddress: string;
  percentage: number;
  walletAddress: string;

  calculateTradeAmount(detectedAmount: number): number;
  shouldTrade(transaction: any): boolean;
  executeTrade(amount: number, isBuy: boolean): Promise<boolean>;
}
