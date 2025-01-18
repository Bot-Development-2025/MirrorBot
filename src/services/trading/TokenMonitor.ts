import { ITokenMonitor } from "@/core/interfaces/ITokenMonitor";
import { ITradeStrategy } from "@/core/interfaces/ITradeStrategy";
import { EVMService } from "../blockchain/EVMService";
import { SolanaService } from "../blockchain/SolanaService";
import { Logger } from "../../utils/logger";

export class TokenMonitor implements ITokenMonitor {
  public strategies: Map<string, ITradeStrategy> = new Map();
  private isMonitoring: boolean = false;
  private blockchainService: EVMService | SolanaService;

  constructor(
    public readonly tokenAddress: string,
    public readonly chain: "EVM" | "SOLANA"
  ) {
    this.blockchainService =
      chain === "EVM" ? new EVMService() : new SolanaService();
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
    console.log(`Token In: ${transaction.tokenIn}`);
    console.log(`Token Out: ${transaction.tokenOut}`);
    console.log(`Amount: ${transaction.amount}`);
    console.log(`From: ${transaction.from}`);
    console.log(`To: ${transaction.to}`);
    console.log(`Time: ${new Date().toISOString()}`);

    for (const strategy of this.strategies.values()) {
      if (strategy.shouldTrade(transaction)) {
        const amount = strategy.calculateTradeAmount(transaction.amount);

        try {
          await strategy.executeTrade(
            amount,
            transaction.tokenIn,
            transaction.tokenOut
          );
        } catch (error) {
          Logger.error(`Trade execution failed: ${error}`);
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
