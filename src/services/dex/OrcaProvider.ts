import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  WhirlpoolContext,
  buildWhirlpoolClient,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil,
  swapQuoteByInputToken,
} from "@orca-so/whirlpools-sdk";
import { AnchorProvider } from "@coral-xyz/anchor";
import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
import Decimal from "decimal.js";
import { ISolanaDEXProvider } from "@/core/interfaces/IDEXProvider";
import { SwapParams } from "@/core/interfaces/IWallet";

const fs = require("fs");
const wallet_json = "wallet.json";

export class OrcaProvider implements ISolanaDEXProvider {
  private readonly MAINNET_WHIRLPOOLS_CONFIG = new PublicKey(
    "2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ"
  );
  private readonly DEVNET_WHIRLPOOLS_CONFIG = new PublicKey(
    "FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR"
  );
  private readonly TICK_SPACING = 128;

  constructor(
    private connection: Connection,
    private keypair: Keypair
  ) {}

  async createSwapTransaction({
    tokenIn,
    tokenOut,
    amount,
  }: SwapParams): Promise<string> {
    console.log("Orca Swap Started");
    console.log("TokenIn: ", tokenIn);
    console.log("TokenOut: ", tokenOut);
    console.log("Amount: ", amount);
    console.log("publicKey: ", this.keypair.publicKey);

    fs.writeFileSync(wallet_json, `[${this.keypair.secretKey}]`);

    const provider = AnchorProvider.env();

    const ctx = WhirlpoolContext.withProvider(
      provider,
      ORCA_WHIRLPOOL_PROGRAM_ID
    );
    const client = buildWhirlpoolClient(ctx);
    console.log("Wallet Address:", ctx.wallet.publicKey.toBase58());

    const whirlpool_pubkey = PDAUtil.getWhirlpool(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      process.env.NODE_ENV === "production"
        ? this.MAINNET_WHIRLPOOLS_CONFIG
        : this.DEVNET_WHIRLPOOLS_CONFIG,
      new PublicKey(tokenIn),
      new PublicKey(tokenOut),
      // this.TICK_SPACING
      1
    ).publicKey;
    console.log("whirlpool_pubkey: ", whirlpool_pubkey);

    const whirlpool = await client.getPool(whirlpool_pubkey);

    const quote = await swapQuoteByInputToken(
      whirlpool,
      new PublicKey(tokenIn),
      DecimalUtil.toBN(new Decimal(amount.toString()), 6),
      Percentage.fromFraction(50, 1000),
      ctx.program.programId,
      ctx.fetcher
    );
    console.log("quote: ", quote);

    const tx = await whirlpool.swap(quote);
    const signature = await tx.buildAndExecute();

    // Wait for the transaction to complete
    const latest_blockhash = await ctx.connection.getLatestBlockhash();
    await ctx.connection.confirmTransaction(
      { signature, ...latest_blockhash },
      "confirmed"
    );
    console.log("Transaction Confirmed!");
    return signature;
  }
}
