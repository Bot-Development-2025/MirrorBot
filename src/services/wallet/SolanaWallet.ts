import bs58 from "bs58";

import { ISolanaDEXProvider } from "@/core/interfaces/IDEXProvider";
import { DEXProvider, IWallet, SwapParams } from "@/core/interfaces/IWallet";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import { config } from "../../config/config";
import { Logger } from "../../utils/logger";
import { OrcaProvider } from "../dex/OrcaProvider";

// import { JupiterProvider } from "../dex/JupiterProvider";

// import { RaydiumProvider } from "../dex/RaydiumProvider";

export class SolanaWallet implements IWallet {
  public address: string;
  public privateKey: string;
  public chain: "SOLANA" = "SOLANA";
  public balance: number = 0;
  private keypair: Keypair;
  private connection: Connection;
  private dexProviders: Map<DEXProvider, ISolanaDEXProvider>;
  private readonly DEX_ORDER: DEXProvider[] = ["ORCA"];

  constructor(public tokenAddress: string) {
    // Initialize connection (replace with your RPC URL)
    this.connection = new Connection(
      config.networks.solana.rpcUrl!,
      "confirmed"
    );

    // Create random wallet
    this.keypair = Keypair.generate();
    this.address = this.keypair.publicKey.toString();
    this.privateKey = bs58.encode(this.keypair.secretKey);

    // Initialize DEX providers
    this.dexProviders = new Map<DEXProvider, ISolanaDEXProvider>([
      ["ORCA", new OrcaProvider(this.connection, this.keypair)],
      // [
      //   "RAYDIUM",
      //   new RaydiumProvider(
      //     this.connection,
      //     this.keypair,
      //     "https://api.raydium.io/v2/sdk/liquidity/mainnet.json"
      //   ),
      // ],
      // ["JUPITER", new JupiterProvider(this.connection, this.keypair)],
    ]);
  }

  public updateWallet(_address: string, _privateKey: string) {
    this.address = _address;
    this.privateKey = _privateKey;
    const secretKey = Uint8Array.from(bs58.decode(_privateKey));
    const _keypair = Keypair.fromSecretKey(secretKey);
    this.keypair = _keypair;

    this.dexProviders = new Map<DEXProvider, ISolanaDEXProvider>([
      ["ORCA", new OrcaProvider(this.connection, this.keypair)],
      // [
      //   "RAYDIUM",
      //   new RaydiumProvider(
      //     this.connection,
      //     this.keypair,
      //     "https://api.raydium.io/v2/sdk/liquidity/mainnet.json"
      //   ),
      // ],
      // ["JUPITER", new JupiterProvider(this.connection, this.keypair)],
    ]);

    return true;
  }

  async getBalance(): Promise<bigint> {
    try {
      if (this.tokenAddress) {
        // Get SPL token balance
        const tokenPublicKey = new PublicKey(this.tokenAddress);
        const accountInfo = await this.connection.getParsedTokenAccountsByOwner(
          this.keypair.publicKey,
          { mint: tokenPublicKey }
        );

        if (accountInfo.value[0]) {
          const balance =
            accountInfo.value[0].account.data.parsed.info.tokenAmount.uiAmount;
          this.balance = balance;
          return balance;
        }
        return 0n;
      } else {
        // Get SOL balance
        const balance = await this.connection.getBalance(
          this.keypair.publicKey
        );
        this.balance = balance / LAMPORTS_PER_SOL;
        return BigInt(this.balance);
      }
    } catch (error) {
      Logger.error(`Failed to get balance: ${error}`);
      return 0n;
    }
  }

  async getTokenBalance(tokenAddress: string): Promise<bigint> {
    try {
      const tokenPublicKey = new PublicKey(tokenAddress);
      const accountInfo = await this.connection.getParsedTokenAccountsByOwner(
        this.keypair.publicKey,
        { mint: tokenPublicKey }
      );

      if (accountInfo.value[0]) {
        const balance =
          accountInfo.value[0].account.data.parsed.info.tokenAmount.amount;
        this.balance = balance;
        return balance;
      }
      return 0n;
    } catch (error) {
      Logger.error(`Failed to get balance: ${error}`);
      return 0n;
    }
  }

  async getNativeBalance(): Promise<number> {
    try {
      // Get SOL balance
      const balance = await this.connection.getBalance(this.keypair.publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      Logger.error(`Failed to get balance: ${error}`);
      return 0;
    }
  }

  async deposit(amount: bigint, fromAddress: string): Promise<boolean> {
    // For SolanaWallet, deposit is passive - just return true as deposits don't need wallet action
    return true;
  }

  async withdraw(amount: bigint, toAddress: string): Promise<boolean> {
    try {
      if (this.tokenAddress) {
        // Transfer SPL token
        // Note: This is a simplified version. You'll need to handle ATA creation
        const tokenPublicKey = new PublicKey(this.tokenAddress);
        const destinationPublicKey = new PublicKey(toAddress);

        const transaction = new Transaction()
          .add
          // Add SPL transfer instruction here
          // You'll need to import @solana/spl-token for this
          ();

        await sendAndConfirmTransaction(this.connection, transaction, [
          this.keypair,
        ]);
      } else {
        // Transfer SOL
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: this.keypair.publicKey,
            toPubkey: new PublicKey(toAddress),
            lamports: amount * BigInt(LAMPORTS_PER_SOL),
          })
        );

        await sendAndConfirmTransaction(this.connection, transaction, [
          this.keypair,
        ]);
      }

      return true;
    } catch (error) {
      Logger.error(`Withdrawal failed: ${error}`);
      return false;
    }
  }

  async executeSwap(params: SwapParams): Promise<boolean> {
    if (params.amount === 0n) {
      return false;
    }
    // Try each DEX in order until one succeeds
    for (const dex of this.DEX_ORDER) {
      try {
        const provider = this.dexProviders.get(dex);
        if (!provider) continue;

        Logger.info(`Attempting swap on ${dex}...`);

        const walletBalance = await this.getTokenBalance(params.tokenIn);
        if (walletBalance > params.amount) {
          break;
        }
        const signature = await provider.createSwapTransaction({
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
          amount: params.amount,
        });

        Logger.info(`Swap succeeded on ${dex}: ${signature}`);
        return true;
      } catch (error) {
        Logger.error(`Swap failed on ${dex}: ${error}`);
        continue; // Try next DEX
      }
    }

    Logger.error("Swap failed on all DEXes");
    return false;
  }
}
