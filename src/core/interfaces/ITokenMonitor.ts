import { ITradeStrategy } from "./ITradeStrategy";

export interface ITokenMonitor {
  tokenAddress: string;
  chain: "EVM" | "SOLANA";

  startMonitoring(): Promise<void>;
  stopMonitoring(): void;
  addTradeStrategy(strategy: ITradeStrategy): void;
  removeTradeStrategy(walletAddress: string): void;
}
