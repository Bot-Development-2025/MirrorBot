import Bottleneck from "bottleneck";

import { ITokenMonitor } from "@/core/interfaces/ITokenMonitor";
import { ITradeStrategy } from "@/core/interfaces/ITradeStrategy";

import { tokens } from "../../constants/tokens";
import { Logger } from "../../utils/logger";
import { EVMService } from "../blockchain/EVMService";
import { SolanaService } from "../blockchain/SolanaService";

export class TokenMonitor implements ITokenMonitor {
  public strategies: Map<string, ITradeStrategy> = new Map();
  private isMonitoring: boolean = false;
  private blockchainService: EVMService | SolanaService;
  public tradeLimiter;

  constructor(
    public readonly tokenAddress: string,
    public readonly chain: "EVM" | "SOLANA"
  ) {
    this.blockchainService =
      chain === "EVM" ? new EVMService() : new SolanaService();
    this.tradeLimiter = new Bottleneck({
      maxConcurrent: 1,
      minTime: 1000,
    });
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    try {
      await this.subscribeToTransactions();
    } catch (error) {
      Logger.error(`Failed to start monitoring: ${error}`);
      this.isMonitoring = false;
    }
  }

  private async subscribeToTransactions(): Promise<void> {
    if (this.chain === "EVM") {
      await this.blockchainService.subscribeToTokenTransfers(
        this.tokenAddress,
        this.handleTransaction.bind(this)
      );
    } else {
      // Subscribe to token transfers
      await this.blockchainService.subscribeToTokenTransfers(
        this.tokenAddress,
        this.handleTransaction.bind(this)
      );
    }
  }

  private async handleTransaction(transaction: any): Promise<void> {
    // console.log(`Token In: ${transaction.tokenIn}`);
    // console.log(`Token Out: ${transaction.tokenOut}`);
    // console.log(`Amount: ${transaction.amount}`);
    // console.log(`From: ${transaction.from}`);
    // console.log(`To: ${transaction.to}`);
    // console.log(`Time: ${new Date().toISOString()}`);

    for (const strategy of this.strategies.values()) {
      if (strategy.shouldTrade(transaction)) {
        if (
          (strategy.tradingStrategy === "buy_only" &&
            transaction.type === "BUY") ||
          (strategy.tradingStrategy === "sell_only" &&
            transaction.type === "SELL") ||
          strategy.tradingStrategy === "both"
        ) {
          const amount = strategy.calculateTradeAmount(transaction.amount);
          let tokenIn = transaction.tokenIn;
          let tokenOut = transaction.tokenOut;
          if (this.chain === "SOLANA") {
            if (transaction.type === "SELL") {
              tokenIn = this.tokenAddress;
              tokenOut = tokens["SOL"].address;
            } else {
              tokenIn = tokens["SOL"].address;
              tokenOut = this.tokenAddress;
            }
          }
          await this.tradeLimiter.schedule(async () => {
            try {
              await strategy.executeTrade(amount, tokenIn, tokenOut);
            } catch (error) {
              Logger.error(`Trade execution failed: ${error}`);
            }
          });
        }
      }
    }
  }

  addTradeStrategy(strategy: ITradeStrategy): void {
    this.strategies.set(strategy.walletAddress, strategy);
  }

  removeTradeStrategy(walletAddress: string): void {
    this.strategies.delete(walletAddress);
  }

  stopMonitoring(): void {
    this.isMonitoring = false;
    this.blockchainService.unsubscribe(this.tokenAddress);
  }
}
