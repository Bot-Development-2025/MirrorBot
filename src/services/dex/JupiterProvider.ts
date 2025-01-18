import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { ISolanaDEXProvider } from "@/core/interfaces/IDEXProvider";
import { SwapParams } from "@/core/interfaces/IWallet";
import fetch from "cross-fetch";

export class JupiterProvider implements ISolanaDEXProvider {
  constructor(
    private connection: Connection,
    private keypair: Keypair
  ) {}

  async createSwapTransaction({
    tokenIn,
    tokenOut,
    amount,
  }: SwapParams): Promise<string> {
    const quoteResponse = await (
      await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${tokenIn}&outputMint=${tokenOut}&amount=${amount}&slippageBps=50`
      )
    ).json();

    const { swapTransaction } = await (
      await fetch("https://quote-api.jup.ag/v6/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: this.keypair.publicKey.toString(),
          wrapAndUnwrapSol: true,
        }),
      })
    ).json();

    const versionedTx = VersionedTransaction.deserialize(
      Buffer.from(swapTransaction, "base64")
    );
    return "11111111111111111111";
  }
}
