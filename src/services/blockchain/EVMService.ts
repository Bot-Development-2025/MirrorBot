import {
  JsonRpcApiProvider,
  Provider,
  Listener,
  ethers,
  JsonRpcProvider,
} from "ethers";
import { config } from "../../config/config";
import { Logger } from "../../utils/logger";

export class EVMService {
  private provider: JsonRpcProvider;
  private subscriptions: Map<string, Listener> = new Map();

  constructor() {
    this.provider = new JsonRpcProvider(config.networks.evm.rpcUrl);
  }

  async subscribeToTokenTransfers(
    tokenAddress: string,
    callback: (transaction: any) => void
  ): Promise<void> {
    const erc20Interface = new ethers.Interface([
      "event Transfer(address indexed from, address indexed to, uint256 value)",
    ]);

    const filter = {
      address: tokenAddress,
      topics: [ethers.id("Transfer(address,address,uint256)")],
    };

    const listener = (log: ethers.Log) => {
      try {
        const parsedLog = erc20Interface.parseLog(log);
        if (!parsedLog) return;

        const transaction = {
          from: parsedLog.args.from,
          to: parsedLog.args.to,
          amount: parsedLog.args.value,
          type: this.determineTransactionType(parsedLog.args),
        };
        callback(transaction);
      } catch (error) {
        Logger.error(`Failed to parse EVM transfer event: ${error}`);
      }
    };

    this.provider.on(filter, listener);
    this.subscriptions.set(tokenAddress, listener);
  }

  private determineTransactionType(args: any): "BUY" | "SELL" {
    // Implement logic to determine if it's a buy or sell
    // This would involve checking if the transfer is to/from a DEX
    return "BUY"; // Placeholder
  }

  unsubscribe(tokenAddress: string): void {
    const listener = this.subscriptions.get(tokenAddress);
    if (listener) {
      this.provider.off("Transfer", listener);
      this.subscriptions.delete(tokenAddress);
    }
  }
}
