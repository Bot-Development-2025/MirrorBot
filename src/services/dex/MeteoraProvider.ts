import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import DLMM from "@meteora-ag/dlmm";
import { ISolanaDEXProvider } from "@/core/interfaces/IDEXProvider";
import { SwapParams } from "@/core/interfaces/IWallet";
import BN from "bn.js";

export class MeteoraProvider implements ISolanaDEXProvider {
  private readonly POOL_ADDRESS =
    "3eEguQuKiFcYX7yL8A68HZbMdVtSjRRWVoHyXmDWLuQd";

  constructor(
    private connection: Connection,
    private keypair: Keypair
  ) {}

  async createSwapTransaction({
    tokenIn,
    tokenOut,
    amount,
  }: SwapParams): Promise<string> {
    const isBuy = false;
    const dlmmPool = await DLMM.create(
      this.connection,
      new PublicKey(this.POOL_ADDRESS)
    );
    const swapAmount = new BN(Number(amount) * 10 ** (isBuy ? 9 : 6));

    const binArrays = await dlmmPool.getBinArrayForSwap(isBuy);
    const swapQuote = await dlmmPool.swapQuote(
      swapAmount,
      isBuy,
      new BN(10),
      binArrays
    );

    await dlmmPool.swap({
      inToken: new PublicKey(tokenIn),
      outToken: new PublicKey(tokenOut),
      binArraysPubkey: swapQuote.binArraysPubkey,
      inAmount: swapAmount,
      lbPair: dlmmPool.pubkey,
      user: this.keypair.publicKey,
      minOutAmount: swapQuote.minOutAmount,
    });

    return "11111111111111111";
  }
}
