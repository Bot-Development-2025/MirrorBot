import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  Liquidity,
  LiquidityPoolKeys,
  jsonInfo2PoolKeys,
  TOKEN_PROGRAM_ID,
  Percent,
  SPL_ACCOUNT_LAYOUT,
  Token,
  TokenAmount,
} from "@raydium-io/raydium-sdk";
import { ISolanaDEXProvider } from "@/core/interfaces/IDEXProvider";
import { SwapParams } from "@/core/interfaces/IWallet";
import { Logger } from "../../utils/logger";

export class RaydiumProvider implements ISolanaDEXProvider {
  private poolKeys: Map<string, LiquidityPoolKeys> = new Map();

  constructor(
    private connection: Connection,
    private keypair: Keypair,
    private liquidityJsonUrl: string
  ) {
    this.loadPoolKeys();
  }

  private async loadPoolKeys() {
    try {
      const response = await fetch(this.liquidityJsonUrl);
      const liquidityJson = await response.json();

      const allPoolKeys = [
        ...(liquidityJson?.official ?? []),
        ...(liquidityJson?.unOfficial ?? []),
      ];

      // Index pools by token pairs for quick lookup
      allPoolKeys.forEach((pool) => {
        const key = `${pool.baseMint}_${pool.quoteMint}`;
        this.poolKeys.set(key, jsonInfo2PoolKeys(pool) as LiquidityPoolKeys);
      });
    } catch (error) {
      Logger.error(`Failed to load Raydium pool keys: ${error}`);
    }
  }

  private findPool(
    tokenIn: string,
    tokenOut: string
  ): LiquidityPoolKeys | null {
    const key1 = `${tokenIn}_${tokenOut}`;
    const key2 = `${tokenOut}_${tokenIn}`;

    return this.poolKeys.get(key1) || this.poolKeys.get(key2) || null;
  }

  async createSwapTransaction({
    tokenIn,
    tokenOut,
    amount,
    isBuy,
  }: SwapParams): Promise<string> {
    try {
      const poolKeys = this.findPool(tokenIn, tokenOut);
      if (!poolKeys) {
        throw new Error("Pool not found for token pair");
      }

      const userTokenAccounts = await this.connection.getTokenAccountsByOwner(
        this.keypair.publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      // Calculate amounts with slippage
      const poolInfo = await Liquidity.fetchInfo({
        connection: this.connection,
        poolKeys,
      });

      const { minAmountOut, amountIn } = await this.calculateAmounts(
        poolKeys,
        poolInfo,
        amount,
        isBuy
      );

      // Create swap instruction
      const swapTransaction = await Liquidity.makeSwapInstructionSimple({
        connection: this.connection,
        poolKeys,
        userKeys: {
          tokenAccounts: userTokenAccounts.value.map((ta) => ({
            pubkey: ta.pubkey,
            programId: ta.account.owner,
            accountInfo: SPL_ACCOUNT_LAYOUT.decode(ta.account.data),
          })),
          owner: this.keypair.publicKey,
        },
        amountIn: new TokenAmount(
          new Token(TOKEN_PROGRAM_ID, poolKeys.baseMint, 9),
          amount,
          false
        ),
        amountOut: minAmountOut,
        fixedSide: "in",
        makeTxVersion: 0,
      });

      return "111111111111111";
    } catch (error) {
      Logger.error(`Failed to create Raydium swap: ${error}`);
      throw error;
    }
  }

  private async calculateAmounts(
    poolKeys: LiquidityPoolKeys,
    poolInfo: any,
    amount: number,
    isBuy: boolean
  ) {
    const slippage = new Percent(5, 100); // 5% slippage

    const { amountOut, minAmountOut } = Liquidity.computeAmountOut({
      poolKeys,
      poolInfo,
      amountIn: new TokenAmount(
        new Token(TOKEN_PROGRAM_ID, poolKeys.baseMint, 9),
        amount,
        false
      ),
      currencyOut: new Token(
        TOKEN_PROGRAM_ID,
        isBuy ? poolKeys.quoteMint : poolKeys.baseMint,
        9
      ),
      slippage,
    });

    return { minAmountOut, amountIn: amount };
  }
}
