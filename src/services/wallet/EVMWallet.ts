import { BaseWallet, JsonRpcProvider, ethers } from "ethers";

import { IWallet, SwapParams } from "@/core/interfaces/IWallet";
import { ChainId } from "@uniswap/sdk-core";

import { config } from "../../config/config";
import { tokens } from "../../constants/tokens";
import { Logger } from "../../utils/logger";
import { UniswapV3Provider } from "../dex/UniswapV3Provider";

export class EVMWallet implements IWallet {
  public address: string;
  public privateKey: string;
  public chain: "EVM" = "EVM";
  public balance: number = 0;
  private wallet: BaseWallet;
  private provider: JsonRpcProvider;
  private uniswapProvider: UniswapV3Provider;

  constructor(public tokenAddress: string) {
    // Initialize provider (replace with your RPC URL)
    this.provider = new ethers.JsonRpcProvider(config.networks.evm.rpcUrl);

    // Create random wallet
    const randomWallet = ethers.Wallet.createRandom();
    this.privateKey = randomWallet.privateKey;
    this.wallet = new ethers.Wallet(this.privateKey, this.provider);
    this.address = this.wallet.address;

    this.uniswapProvider = new UniswapV3Provider(
      this.provider,
      this.wallet as ethers.Wallet,
      ChainId.MAINNET
    );
  }

  public updateWallet(_address: string, _privateKey: string) {
    this.privateKey = _privateKey;
    this.wallet = new ethers.Wallet(this.privateKey, this.provider);
    this.address = _address;

    this.uniswapProvider = new UniswapV3Provider(
      this.provider,
      this.wallet as ethers.Wallet,
      ChainId.MAINNET
    );

    return true;
  }

  async getBalance(): Promise<bigint> {
    try {
      if (this.tokenAddress) {
        // Get ERC20 token balance
        const tokenContract = new ethers.Contract(
          this.tokenAddress,
          ["function balanceOf(address) view returns (uint256)"],
          this.provider
        );
        const balance = await tokenContract.balanceOf(this.address);
        this.balance = Number(ethers.formatEther(balance));
      } else {
        // Get ETH balance
        const balance = await this.provider.getBalance(this.address);
        this.balance = Number(ethers.formatEther(balance));
      }
      return BigInt(this.balance);
    } catch (error) {
      Logger.error(`Failed to get balance: ${error}`);
      return 0n;
    }
  }

  async getNativeBalance(): Promise<number> {
    try {
      const balance = await this.provider.getBalance(this.address);
      return Number(ethers.formatEther(balance));
    } catch (error) {
      Logger.error(`Failed to get balance: ${error}`);
      return 0;
    }
  }

  async getTokenBalance(tokenAddress: string): Promise<bigint> {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ["function balanceOf(address) view returns (uint256)"],
        this.provider
      );
      const balance = await tokenContract.balanceOf(this.address);
      return BigInt(balance);
    } catch (error) {
      Logger.error(`Failed to get balance: ${error}`);
      return 0n;
    }
  }

  async deposit(amount: bigint, fromAddress: string): Promise<boolean> {
    // For EVMWallet, deposit is passive - just return true as deposits don't need wallet action
    return true;
  }

  async withdraw(amount: bigint, toAddress: string): Promise<boolean> {
    try {
      const value = ethers.parseEther(amount.toString());

      if (this.tokenAddress) {
        // Transfer ERC20 token
        const tokenContract = new ethers.Contract(
          this.tokenAddress,
          ["function transfer(address,uint256) returns (bool)"],
          this.wallet
        );
        const tx = await tokenContract.transfer(toAddress, value);
        await tx.wait();
      } else {
        // Transfer ETH
        const tx = await this.wallet.sendTransaction({
          to: toAddress,
          value: value,
        });
        await tx.wait();
      }

      return true;
    } catch (error) {
      Logger.error(`Withdrawal failed: ${error}`);
      return false;
    }
  }

  async executeSwap(params: SwapParams): Promise<boolean> {
    try {
      // Approve token first if selling
      const tokenToApprove = params.tokenIn;

      // Skip approval for native tokens (e.g., ETH)
      if (tokenToApprove.toLowerCase() !== ethers.ZeroAddress) {
        const tokenBalance = await this.getTokenBalance(params.tokenIn);
        if (tokenBalance < params.amount) {
          console.log("insufficient balance.");
          return false;
        }
        const poolAddress = await UniswapV3Provider.getPoolAddress(
          params.tokenIn !== tokens["WETH"].address
            ? params.tokenIn
            : params.tokenOut,
          500
        );
        const approveTx = await this.uniswapProvider.approveToken(
          tokenToApprove,
          poolAddress,
          params.amount.toString()
        );
        const approveResponse = await this.wallet.sendTransaction(approveTx);
        await approveResponse.wait();
        Logger.info(`Token approved: ${approveResponse.hash}`);
      } else {
        const ethBalance = await this.provider.getBalance(this.wallet.address);
        if (ethBalance < params.amount) {
          console.log("insufficient balance.");
          return false;
        }
      }

      // Create and send swap transaction
      const swapTx = await this.uniswapProvider.createSwapTransaction(params);
      const swapResponse = await this.wallet.sendTransaction(swapTx);
      await swapResponse.wait();

      Logger.info(`Swap executed: ${swapResponse.hash}`);
      return true;
    } catch (error) {
      Logger.error(`Swap failed: ${error}`);
      return false;
    }
  }
}
