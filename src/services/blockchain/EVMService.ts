import Bottleneck from "bottleneck";
import { Listener, WebSocketProvider, ethers } from "ethers";

import { config } from "../../config/config";
import { tokens } from "../../constants/tokens";
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
        const amount = (amount0 > 0n ? amount1 : amount0) * -1n;

        const tokenIn = amount0 > 0n ? token1 : token0;
        const tokenOut = amount0 > 0n ? token0 : token1;

        if (
          (token0 === tokens["WETH"].address &&
            (amount0 > 0n ? amount0 : amount0 * -1n) <
              BigInt(0.03 * 10 ** 18)) ||
          (token1 === tokens["WETH"].address &&
            (amount1 > 0n ? amount1 : amount1 * -1n) < BigInt(0.03 * 10 ** 18))
        ) {
          return;
        }

        const transaction = {
          from: sender,
          to: recipient,
          amount,
          tokenIn,
          tokenOut,
          type: tokenIn === tokens["WETH"] ? "BUY" : "SELL",
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
