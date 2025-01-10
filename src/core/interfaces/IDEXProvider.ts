import { Transaction as SolanaTransaction } from "@solana/web3.js";
import { Transaction as EVMTransaction } from "ethers";
import { SwapParams } from "./IWallet";

export interface ISolanaDEXProvider {
  createSwapTransaction(params: SwapParams): Promise<string>;
}

export interface IEVMDEXProvider {
  createSwapTransaction(params: SwapParams): Promise<EVMTransaction>;
}
