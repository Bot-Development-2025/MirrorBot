import Bottleneck from "bottleneck";
import { Listener, ethers, WebSocketProvider } from "ethers";
import { config } from "../../config/config";
import { Logger } from "../../utils/logger";
import { UniswapV3Provider } from "../dex/UniswapV3Provider";

export class EVMService {
  private provider: WebSocketProvider;
  private subscriptions: Map<string, Listener> = new Map();
  private readonly tradeLimiter;

  constructor() {
    this.provider = new WebSocketProvider(config.networks.evm.rpcUrl);
    this.tradeLimiter = new Bottleneck({
      maxConcurrent: 1,
      minTime: 0,
    });
  }

  async subscribeToTokenTransfers(
    tokenAddress: string,
    callback: (transaction: any) => Promise<void>
  ): Promise<void> {
    const erc20Interface = new ethers.Interface([
      "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
    ]);

    const poolAddress = await UniswapV3Provider.getPoolAddress(
      tokenAddress,
      500
    );
    const { token0, token1 } =
      await UniswapV3Provider.getTokensFromPool(poolAddress);
    const filter = {
      address: poolAddress.toLowerCase(),
      topics: [
        ethers.id("Swap(address,address,int256,int256,uint160,uint128,int24)"),
      ],
    };

    const listener = async (log: ethers.Log) => {
      try {
        if (log.address !== poolAddress) {
          return;
        }
        const parsedLog = erc20Interface.parseLog(log);
        if (!parsedLog) return;

        const { sender, recipient, amount0, amount1 } = parsedLog.args;

        const transaction = {
          from: sender,
          to: recipient,
          amount: (amount0 > 0n ? amount1 : amount0) * -1n,
          tokenIn: amount0 > 0n ? token1 : token0,
          tokenOut: amount0 > 0n ? token0 : token1,
        };
        await this.tradeLimiter.schedule(() => callback(transaction));
      } catch (error) {
        Logger.error(`Failed to parse EVM transfer event: ${error}`);
      }
    };

    this.provider.on(filter, listener);
    this.subscriptions.set(tokenAddress, listener);
  }

  unsubscribe(tokenAddress: string): void {
    const listener = this.subscriptions.get(tokenAddress);
    if (listener) {
      this.provider.off("Transfer", listener);
      this.subscriptions.delete(tokenAddress);
    }
  }
}
