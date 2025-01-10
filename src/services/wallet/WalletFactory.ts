import { EVMWallet } from "./EVMWallet";
import { SolanaWallet } from "./SolanaWallet";
import { IWallet } from "@/core/interfaces/IWallet";
import { Logger } from "../../utils/logger";

export type ChainType = "EVM" | "SOLANA";

export class WalletFactory {
  /**
   * Creates a new wallet for the specified chain
   * @param chain The blockchain type ("EVM" or "SOLANA")
   * @param tokenAddress Optional token address for token-specific wallets
   * @returns IWallet instance
   */
  public static createWallet(
    chain: string,
    tokenAddress: string = ""
  ): IWallet {
    try {
      const normalizedChain = chain.toUpperCase() as ChainType;

      switch (normalizedChain) {
        case "EVM":
          return new EVMWallet(tokenAddress);
        case "SOLANA":
          return new SolanaWallet(tokenAddress);
        default:
          throw new Error(`Unsupported chain: ${chain}`);
      }
    } catch (error) {
      Logger.error(`Failed to create wallet for chain ${chain}: ${error}`);
      throw new Error(`Wallet creation failed: ${error}`);
    }
  }

  /**
   * Validates if a chain is supported
   * @param chain The blockchain type to validate
   * @returns boolean indicating if chain is supported
   */
  public static isSupportedChain(chain: string): boolean {
    const normalizedChain = chain.toUpperCase();
    return ["EVM", "SOLANA"].includes(normalizedChain);
  }

  /**
   * Gets the list of supported chains
   * @returns Array of supported chain types
   */
  public static getSupportedChains(): ChainType[] {
    return ["EVM", "SOLANA"];
  }
}
