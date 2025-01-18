import { ethers } from "ethers";
import { ChainId, SWAP_ROUTER_02_ADDRESSES } from "@uniswap/sdk-core";
import { SwapParams } from "@/core/interfaces/IWallet";
import { IEVMDEXProvider } from "@/core/interfaces/IDEXProvider";
import { SWAP_ROUTER_ABI } from "../../constants/abis/UniswapV3Router";
import { QUOTER_CONTRACT } from "../../constants/uniswap";
import { Quoter_ABI } from "../../constants/abis/Quoter";
import { Logger } from "../../utils/logger";
import { tokens } from "../../constants/tokens";
import { config } from "../../config/config";

const uniswapV3FactoryAddress = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const uniswapV3FactoryABI = [
  {
    inputs: [
      { internalType: "address", name: "tokenA", type: "address" },
      { internalType: "address", name: "tokenB", type: "address" },
      { internalType: "uint24", name: "fee", type: "uint24" },
    ],
    name: "getPool",
    outputs: [{ internalType: "address", name: "pool", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
];

const poolABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

export class UniswapV3Provider implements IEVMDEXProvider {
  private readonly swapRouter: ethers.Contract;
  private readonly quoterContract: ethers.Contract;

  constructor(
    private provider: ethers.Provider,
    private wallet: ethers.Wallet,
    private chainId: ChainId = ChainId.MAINNET
  ) {
    this.swapRouter = new ethers.Contract(
      SWAP_ROUTER_02_ADDRESSES(this.chainId),
      SWAP_ROUTER_ABI,
      this.wallet
    );

    this.quoterContract = new ethers.Contract(
      QUOTER_CONTRACT,
      Quoter_ABI,
      this.provider
    );
  }

  public static async getTokensFromPool(poolAddress: string) {
    const poolContract = new ethers.Contract(
      poolAddress,
      poolABI,
      new ethers.JsonRpcProvider(config.networks.evm.rpcUrl)
    );

    const token0 = await poolContract.token0();
    const token1 = await poolContract.token1();

    return { token0, token1 };
  }

  public static async getPoolAddress(tokenAddress: string, feeTier: number) {
    const factoryContract = new ethers.Contract(
      uniswapV3FactoryAddress,
      uniswapV3FactoryABI,
      new ethers.JsonRpcProvider(config.networks.evm.rpcUrl)
    );

    const poolAddress = await factoryContract.getPool(
      tokens["WETH"].address,
      tokenAddress,
      feeTier
    );

    if (poolAddress === ethers.ZeroAddress) {
      console.log("No pool exists for the specified token pair and fee tier.");
      return null;
    }

    console.log("Pool Address:", poolAddress);
    return poolAddress;
  }

  async createSwapTransaction({
    tokenIn,
    tokenOut,
    amount,
  }: SwapParams): Promise<ethers.Transaction> {
    try {
      // Get quote first
      const quotedAmountOut =
        await this.quoterContract.quoteExactInputSingle.staticCall(
          tokenIn,
          tokenOut,
          500, // 0.05% fee tier
          // recipient: this.wallet.address,
          // deadline: Math.floor(Date.now() / 1000 + 600), // 10 minutes
          amount.toString(),
          0
        );

      Logger.info(
        `Quoted amount out: ${ethers.formatEther(quotedAmountOut)} ${tokenOut}`
      );

      // Create swap transaction

      const tx = await this.swapRouter.exactInputSingle.populateTransaction({
        tokenIn,
        tokenOut,
        fee: 500,
        recipient: this.wallet.address,
        amountIn: amount.toString(),
        amountOutMinimum: quotedAmountOut,
        sqrtPriceLimitX96: 0,
      });
      return tx as ethers.Transaction;
    } catch (error) {
      Logger.error(`Failed to create Uniswap swap: ${error}`);
      throw error;
    }
  }

  async approveToken(
    tokenAddress: string,
    poolAddress: string,
    amount: string
  ): Promise<ethers.Transaction> {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          "function approve(address spender, uint256 amount) external returns (bool)",
        ],
        this.wallet
      );

      const tx = await tokenContract.approve.populateTransaction(
        poolAddress,
        amount
      );
      return tx as ethers.Transaction;
    } catch (error) {
      Logger.error(`Failed to approve token: ${error}`);
      throw error;
    }
  }
}
