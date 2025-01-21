import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "../../config/config";
import { Logger } from "../../utils/logger";
import Bottleneck from "bottleneck";

export class SolanaService {
  private connection: Connection;
  private subscriptions: Map<string, number> = new Map();
  private readonly tradeLimiter;

  constructor() {
    this.connection = new Connection(config.networks.solana.rpcUrl);
    this.tradeLimiter = new Bottleneck({
      maxConcurrent: 1,
      minTime: 1000,
    });
    // this.connection = new Connection(config.networks.solana.rpcUrl);
  }

  // Alternative method using websocket for real-time monitoring
  async subscribeToTokenTransfers(
    tokenAddress: string,
    callback: (transaction: any) => void
  ): Promise<void> {
    console.log(`Token ${tokenAddress} WebSocket Subscribe Started`);

    try {
      const programId = new PublicKey(tokenAddress);

      // Subscribe to all signatures for this token
      const subscriptionId = this.connection.onLogs(
        programId,
        async (logs, context) => {
          if (logs.err) {
            // console.log("Log error:", logs.err);
            return;
          }

          try {
            await this.tradeLimiter.schedule(async () => {
              // console.log("Received signature:", logs.signature);

              // Wait for transaction finality with more detailed options
              const latestBlockhash =
                await this.connection.getLatestBlockhash("finalized");
              const confirmation = await this.connection.confirmTransaction(
                {
                  signature: logs.signature,
                  ...latestBlockhash,
                },
                "finalized"
              );

              if (confirmation.value.err) {
                // console.log("Confirmation error:", confirmation.value.err);
                return;
              }

              // Try getting transaction with different options
              const txInfo = await this.connection.getTransaction(
                logs.signature,
                {
                  maxSupportedTransactionVersion: 0,
                  commitment: "finalized",
                }
              );

              if (!txInfo) {
                // Logger.error(
                //   `Transaction info not found for signature: ${logs.signature}`
                // );
                return;
              }

              const transaction = this.parseTokenTransaction(txInfo);
              if (transaction) {
                callback(transaction);
              }
            });
          } catch (error) {
            // Logger.error(`Failed to parse Solana transfer: ${error}`);
          }
        },
        "confirmed"
      );

      this.subscriptions.set(tokenAddress, subscriptionId);
    } catch (error) {
      Logger.error(`Failed to subscribe to Solana token: ${error}`);
      throw error;
    }
  }

  private parseTokenTransaction(txInfo: any) {
    try {
      // Check for token transfer instruction
      const tokenTransfer = txInfo.meta?.logMessages?.find(
        (log: string) =>
          log.includes("Instruction: Transfer") ||
          log.includes("Instruction: TransferChecked")
      );

      if (!tokenTransfer) return null;

      // Get token balances
      const postBalance = txInfo.meta?.postTokenBalances?.[0];
      const preBalance = txInfo.meta?.preTokenBalances?.[0];

      if (!postBalance || !preBalance) return null;

      const isBuy =
        postBalance.uiTokenAmount.amount > preBalance.uiTokenAmount.amount;

      return {
        type: isBuy ? "BUY" : "SELL",
        amount: BigInt(
          Math.abs(
            Number(postBalance.uiTokenAmount.amount) -
              Number(preBalance.uiTokenAmount.amount)
          )
        ),
        timestamp: new Date(txInfo.blockTime! * 1000),
        signature: txInfo.transaction.signatures[0],
        from: "",
        to: "",
      };
    } catch (error) {
      Logger.error(`Error parsing token transaction: ${error}`);
      return null;
    }
  }

  unsubscribe(tokenAddress: string): void {
    const subscriptionId = this.subscriptions.get(tokenAddress);
    if (subscriptionId) {
      this.connection.removeAccountChangeListener(subscriptionId);
      this.subscriptions.delete(tokenAddress);
    }
  }
}
