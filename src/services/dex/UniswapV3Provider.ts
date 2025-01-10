import { ethers } from "ethers";
import { ChainId, SWAP_ROUTER_02_ADDRESSES } from "@uniswap/sdk-core";
import { SwapParams } from "@/core/interfaces/IWallet";
import { IEVMDEXProvider } from "@/core/interfaces/IDEXProvider";
import { SWAP_ROUTER_ABI } from "../../constants/abis/UniswapV3Router";
import { QUOTER_CONTRACT } from "../../constants/uniswap";
import { Quoter_ABI } from "../../constants/abis/Quoter";
import { Logger } from "../../utils/logger";

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

  async createSwapTransaction({
    tokenIn,
    tokenOut,
    amount,
    isBuy,
  }: SwapParams): Promise<ethers.Transaction> {
    try {
      // Get quote first
      const quotedAmountOut =
        await this.quoterContract.quoteExactInputSingle.staticCall({
          tokenIn,
          tokenOut,
          fee: 3000, // 0.3% fee tier
          recipient: this.wallet.address,
          deadline: Math.floor(Date.now() / 1000 + 600), // 10 minutes
          amountIn: ethers.parseEther(amount.toString()),
          sqrtPriceLimitX96: 0,
        });

      Logger.info(
        `Quoted amount out: ${ethers.formatEther(quotedAmountOut[0])} ${tokenOut}`
      );

      // Create swap parameters
      const params = {
        tokenIn,
        tokenOut,
        fee: 3000,
        recipient: this.wallet.address,
        deadline: Math.floor(Date.now() / 1000 + 600),
        amountIn: ethers.parseEther(amount.toString()),
        amountOutMinimum: quotedAmountOut[0],
        sqrtPriceLimitX96: 0,
      };

      // Create swap transaction
      const tx =
        await this.swapRouter.exactInputSingle.populateTransaction(params);
      return tx as ethers.Transaction;
    } catch (error) {
      Logger.error(`Failed to create Uniswap swap: ${error}`);
      throw error;
    }
  }

  async approveToken(
    tokenAddress: string,
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
        SWAP_ROUTER_02_ADDRESSES(this.chainId),
        ethers.parseEther(amount)
      );
      return tx as ethers.Transaction;
    } catch (error) {
      Logger.error(`Failed to approve token: ${error}`);
      throw error;
    }
  }
}
