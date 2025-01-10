import { Telegraf, Context } from "telegraf";
import { WalletManager } from "../wallet/WalletManager";
import { TokenMonitor } from "../trading/TokenMonitor";
import { TradingModel } from "../../models/Trading";
import { Logger } from "../../utils/logger";
import { shortenAddress } from "../../utils/helpers";

export class TelegramBot {
  private bot: Telegraf;
  private walletManager: WalletManager;
  private tokenMonitors: Map<string, TokenMonitor> = new Map();
  private currentContext: Map<
    string,
    { step: number; walletAddress?: string; tokenAddress?: string }
  > = new Map();

  constructor(private readonly botToken: string) {
    this.bot = new Telegraf(botToken);
    this.walletManager = new WalletManager();
    this.setupCommands();
  }

  private setupCommands(): void {
    this.bot.command("start", this.handleStart.bind(this));

    this.bot.action("create_wallet", this.handleCreateWalletOptions.bind(this));
    this.bot.action("create_wallet_evm", this.handleCreateWalletEVM.bind(this));
    this.bot.action(
      "create_wallet_solana",
      this.handleCreateWalletSolana.bind(this)
    );

    this.bot.action("setup_trading", this.handleSetupTrading.bind(this));
    this.bot.action(/setup_trading_(.+)/, async (ctx) => {
      const walletAddress = ctx.match[1]; // Extract wallet address from callback data
      this.currentContext.set(ctx.from.id.toString(), {
        step: 1,
        walletAddress,
      }); // Initialize context

      await ctx.reply(
        `You selected wallet: ${walletAddress}\nPlease send the token address:`
      );
    });
    this.bot.on("text", async (msgCtx) => {
      const userId = msgCtx.from.id.toString();
      const context = this.currentContext.get(userId);

      if (!context) return; // No active context

      if (context.step === 1) {
        // Handle token address input
        context.tokenAddress = msgCtx.message.text;
        context.step = 2; // Move to the next step

        await msgCtx.reply(
          `You entered token address: ${context.tokenAddress}\nPlease send the percentage:`
        );
      } else if (context.step === 2) {
        // Handle percentage input
        const percentage = parseFloat(msgCtx.message.text);
        if (isNaN(percentage) || percentage < 0 || percentage > 100) {
          await msgCtx.reply(
            "Invalid percentage. Please enter a number between 0 and 100."
          );
          return;
        }

        // Ensure walletAddress is defined
        const walletAddress = context.walletAddress;
        if (!walletAddress) {
          await msgCtx.reply("Wallet address is not defined.");
          return;
        }

        // Setup trading strategy for this wallet
        const wallet = await this.walletManager.getWallet(walletAddress);
        if (!wallet) {
          await msgCtx.reply("Wallet not found.");
          return;
        }

        // Ensure tokenAddress is defined
        const tokenAddress = context.tokenAddress;
        if (!tokenAddress) {
          await msgCtx.reply("Token address is not defined.");
          return;
        }

        let monitor = this.tokenMonitors.get(tokenAddress);
        if (!monitor) {
          monitor = new TokenMonitor(
            tokenAddress,
            wallet.chain as "EVM" | "SOLANA"
          );
          this.tokenMonitors.set(tokenAddress, monitor);
          await monitor.startMonitoring();
        }

        monitor.addTradeStrategy({
          tokenAddress,
          percentage,
          walletAddress: wallet.address,
          calculateTradeAmount: (amount: number) => amount * (percentage / 100),
          shouldTrade: (tx: any) => true, // Implement proper logic
          executeTrade: async (amount: number, isBuy: boolean) => {
            let tokenOut: string;

            if (wallet.chain === "SOLANA") {
              tokenOut = "So11111111111111111111111111111111111111112";
            } else if (wallet.chain === "EVM") {
              tokenOut = "0x4200000000000000000000000000000000000006";
            } else {
              throw new Error("Unsupported wallet type");
            }

            return wallet.executeSwap({
              tokenIn: tokenAddress,
              tokenOut: tokenOut,
              amount,
              isBuy,
            });
          },
        });

        await TradingModel.create({
          walletAddress: wallet.address,
          tokenAddress,
          percentage,
          chain: wallet.chain,
        });

        await msgCtx.reply(
          `✅ Trading setup complete for token ${tokenAddress} with percentage ${percentage}%`
        );

        // Clear the context after completion
        this.currentContext.delete(userId);
      }
    });

    this.bot.action("manage_trading", this.handleManageTrading.bind(this));
    this.bot.action(/manage_trading_(.+)_(.+)/, async (ctx) => {
      const [walletAddress, tokenAddress] = ctx.match[1].split("_");
      const trading = await TradingModel.findOne({
        walletAddress,
        tokenAddress,
      });

      if (!trading) {
        await ctx.reply("Trading strategy not found.");
        return;
      }

      await ctx.reply(
        `Managing trading for:\nWallet: ${walletAddress}\nToken: ${tokenAddress}\nPercentage: ${trading.percentage}%\n\nChoose an action:`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Stop Trading",
                  callback_data: `stop_trading_${walletAddress}_${tokenAddress}`,
                },
                {
                  text: "Change Percentage",
                  callback_data: `change_percentage_${walletAddress}_${tokenAddress}`,
                },
              ],
              [
                {
                  text: "Back to Manage Trading",
                  callback_data: "manage_trading",
                },
              ],
            ],
          },
        }
      );
    });
    this.bot.action(/stop_trading_(.+)_(.+)/, async (ctx) => {
      const [walletAddress, tokenAddress] = ctx.match[1].split("_");
      const monitor = this.tokenMonitors.get(tokenAddress);

      if (monitor) {
        monitor.stopMonitoring();
        this.tokenMonitors.delete(tokenAddress);
        await TradingModel.deleteOne({ walletAddress, tokenAddress }); // Remove from database
        await ctx.reply(`✅ Trading stopped for token ${tokenAddress}`);
      } else {
        await ctx.reply("No active trading found for this token.");
      }
    });
    this.bot.action(/change_percentage_(.+)_(.+)/, async (ctx) => {
      const [walletAddress, tokenAddress] = ctx.match[1].split("_");
      await ctx.reply(`Please send the new percentage for ${tokenAddress}:`);

      // Listen for the next message to get the new percentage
      this.bot.on("text", async (msgCtx) => {
        const newPercentage = parseFloat(msgCtx.message.text);
        if (isNaN(newPercentage) || newPercentage < 0 || newPercentage > 100) {
          await msgCtx.reply(
            "Invalid percentage. Please enter a number between 0 and 100."
          );
          return;
        }

        // Update the percentage in the database
        await TradingModel.updateOne(
          { walletAddress, tokenAddress },
          { percentage: newPercentage }
        );
        await ctx.reply(
          `✅ Trading percentage updated to ${newPercentage}% for token ${tokenAddress}`
        );
      });
    });

    this.bot.action("list_wallets", this.handleListWallets.bind(this));
    this.bot.action(/wallet_(.+)/, async (ctx) => {
      const walletAddress = ctx.match[1]; // Extract wallet address from callback data
      Logger.info(`Selected wallet: ${walletAddress}`); // Log the selected wallet
      await ctx.reply(`You selected wallet: ${walletAddress}`); // Notify the user
    });
  }

  private async handleStart(ctx: Context): Promise<void> {
    try {
      await ctx.reply(
        "Welcome to the Trading Mirror Bot! 🤖\n\n" +
          "Please choose an option below:",
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "Create Wallet", callback_data: "create_wallet" },
                { text: "Setup Trading", callback_data: "setup_trading" },
              ],
              [
                { text: "List Wallets", callback_data: "list_wallets" },
                { text: "Manage Trading", callback_data: "manage_trading" },
              ],
            ],
          },
        }
      );
    } catch (error) {
      Logger.error(`Start command failed: ${error}`);
      await ctx.reply("An error occurred. Please try again.");
    }
  }

  private async handleCreateWalletOptions(ctx: Context): Promise<void> {
    try {
      await ctx.reply("Choose a wallet type to create:", {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "EVM Wallet", callback_data: "create_wallet_evm" },
              { text: "SOLANA Wallet", callback_data: "create_wallet_solana" },
            ],
          ],
        },
      });
    } catch (error) {
      Logger.error(`Failed to show wallet options: ${error}`);
      await ctx.reply("An error occurred. Please try again.");
    }
  }

  private async handleCreateWalletEVM(ctx: Context): Promise<void> {
    try {
      const wallet = await this.walletManager.createWallet("EVM");
      await ctx.reply(
        `✅ EVM Wallet created successfully!\n\nAddress: ${wallet.address}`
      );
    } catch (error) {
      Logger.error(`Failed to create EVM wallet: ${error}`);
      await ctx.reply("Failed to create EVM wallet. Please try again.");
    }
  }

  private async handleCreateWalletSolana(ctx: Context): Promise<void> {
    try {
      const wallet = await this.walletManager.createWallet("SOLANA");
      await ctx.reply(
        `✅ SOLANA Wallet created successfully!\n\nAddress: ${wallet.address}\n\nUse /deposit to fund your wallet.`
      );
    } catch (error) {
      Logger.error(`Failed to create SOLANA wallet: ${error}`);
      await ctx.reply("Failed to create SOLANA wallet. Please try again.");
    }
  }

  private async handleSetupTrading(ctx: Context): Promise<void> {
    try {
      // Fetch all wallets
      const wallets = await this.walletManager.getAllWallets();
      const savedTradings = await TradingModel.find({}); // Fetch all trading strategies

      // Filter wallets that do not have any associated trading strategies
      const walletsWithoutActiveTradings = wallets.filter((wallet) => {
        return !savedTradings.some(
          (trading) => trading.walletAddress === wallet.address
        );
      });

      if (walletsWithoutActiveTradings.length === 0) {
        await ctx.reply("All your wallets have active trading strategies.");
        return;
      }

      // Separate wallets into EVM and SOLANA
      const evmWallets = walletsWithoutActiveTradings.filter(
        (wallet) => wallet.chain === "EVM"
      );
      const solanaWallets = walletsWithoutActiveTradings.filter(
        (wallet) => wallet.chain === "SOLANA"
      );

      // Create buttons for EVM wallets first, then SOLANA wallets
      const walletButtons = [
        ...evmWallets.map((wallet) => ({
          text: `${wallet.chain} - ${shortenAddress(wallet.address)}`,
          callback_data: `setup_trading_${wallet.address}`, // Unique callback data for each wallet
        })),
        ...solanaWallets.map((wallet) => ({
          text: `${wallet.chain} - ${shortenAddress(wallet.address)}`,
          callback_data: `setup_trading_${wallet.address}`, // Unique callback data for each wallet
        })),
      ];

      await ctx.reply("Choose a wallet to set up trading:", {
        reply_markup: {
          inline_keyboard: walletButtons.map((button) => [button]), // Create a button for each wallet
        },
      });
    } catch (error) {
      Logger.error(`Setup trading failed: ${error}`);
      await ctx.reply("Failed to setup trading. Please try again.");
    }
  }

  private async handleManageTrading(ctx: Context): Promise<void> {
    try {
      const savedTradings = await TradingModel.find({}); // Fetch all trading strategies
      console.log("savedTradings: ", savedTradings);

      if (savedTradings.length === 0) {
        await ctx.reply("You don't have any active trading strategies.");
        return;
      }

      // Create buttons for each trading strategy
      const tradingButtons = savedTradings.map((trading) => {
        const isActive = trading.active; // Assuming you have an `isActive` field in your TradingModel
        const statusIcon = isActive ? "✅" : "❌"; // Use icons based on the active status

        return {
          text: `${statusIcon} ${shortenAddress(trading.walletAddress)} - ${shortenAddress(trading.tokenAddress)} (${trading.percentage}%)`,
          callback_data: `manage_trading_${trading.walletAddress}`, // Unique callback data
        };
      });

      console.log("tradingButtons: ", tradingButtons);

      await ctx.reply("Choose a trading strategy to manage:", {
        reply_markup: {
          inline_keyboard: tradingButtons.map((button) => [button]), // Create a button for each strategy
        },
      });
    } catch (error) {
      Logger.error(`Failed to manage trading: ${error}`);
      await ctx.reply("Failed to fetch trading strategies. Please try again.");
    }
  }

  private async handleListWallets(ctx: Context): Promise<void> {
    try {
      const wallets = await this.walletManager.getAllWallets();

      if (wallets.length === 0) {
        await ctx.reply("You don't have any wallets.");
        return;
      }

      // Separate wallets into EVM and SOLANA
      const evmWallets = wallets.filter((wallet) => wallet.chain === "EVM");
      const solanaWallets = wallets.filter(
        (wallet) => wallet.chain === "SOLANA"
      );

      // Create buttons for EVM wallets first, then SOLANA wallets
      const walletButtons = [
        ...evmWallets.map((wallet) => ({
          text: `${wallet.chain} - ${shortenAddress(wallet.address)}`,
          callback_data: `wallet_${wallet.address}`, // Unique callback data for each wallet
        })),
        ...solanaWallets.map((wallet) => ({
          text: `${wallet.chain} - ${shortenAddress(wallet.address)}`,
          callback_data: `wallet_${wallet.address}`, // Unique callback data for each wallet
        })),
      ];

      await ctx.reply("🏦 Your Wallets:", {
        reply_markup: {
          inline_keyboard: walletButtons.map((button) => [button]), // Create a button for each wallet
        },
      });
    } catch (error) {
      Logger.error(`Failed to list wallets: ${error}`);
      await ctx.reply("Failed to fetch wallet list. Please try again.");
    }
  }

  private async initializeStoredTradingMonitors(): Promise<void> {
    try {
      // Get all saved trading configurations from database
      const savedTradings = await TradingModel.find({});

      // Group by token address to avoid duplicate monitors
      const tokenGroups = savedTradings.reduce(
        (acc, trading) => {
          if (!acc[trading.tokenAddress]) {
            acc[trading.tokenAddress] = [];
          }
          acc[trading.tokenAddress].push(trading);
          return acc;
        },
        {} as Record<string, typeof savedTradings>
      );

      // Initialize monitors for each token
      for (const [tokenAddress, tradings] of Object.entries(tokenGroups)) {
        const chain = tradings[0].chain; // All trades for same token should have same chain

        // Create and start token monitor
        const monitor = new TokenMonitor(tokenAddress, chain);
        this.tokenMonitors.set(tokenAddress, monitor);
        await monitor.startMonitoring();

        // Setup trading strategies for each wallet
        for (const trading of tradings) {
          const wallet = await this.walletManager.getWallet(
            trading.walletAddress
          );
          if (wallet) {
            monitor.addTradeStrategy({
              tokenAddress: trading.tokenAddress,
              percentage: trading.percentage,
              walletAddress: trading.walletAddress,
              calculateTradeAmount: (amount: number) =>
                amount * (trading.percentage / 100),
              shouldTrade: (tx: any) => true, // Implement proper logic
              executeTrade: async (amount: number, isBuy: boolean) => {
                let tokenOut: string;

                if (wallet.chain === "SOLANA") {
                  tokenOut = "So11111111111111111111111111111111111111112";
                } else if (wallet.chain === "EVM") {
                  tokenOut = "0x4200000000000000000000000000000000000006";
                } else {
                  throw new Error("Unsupported wallet type");
                }

                return wallet.executeSwap({
                  tokenIn: tokenAddress,
                  tokenOut: tokenOut,
                  amount,
                  isBuy,
                });
              },
            });
            Logger.info(
              `Restored trading strategy for token ${tokenAddress} and wallet ${trading.walletAddress}`
            );
          }
        }
      }

      Logger.info(`Initialized ${this.tokenMonitors.size} token monitors`);
    } catch (error) {
      Logger.error(`Failed to initialize stored trading monitors: ${error}`);
    }
  }

  async start(): Promise<void> {
    // Initialize stored trading monitors before launching the bot
    await this.initializeStoredTradingMonitors();

    this.bot.launch();
    Logger.info("Telegram bot started");

    // Enable graceful stop
    process.once("SIGINT", () => {
      // Stop all monitors before shutting down
      Array.from(this.tokenMonitors.values()).forEach((monitor) =>
        monitor.stopMonitoring()
      );
      this.bot.stop("SIGINT");
    });

    process.once("SIGTERM", () => {
      // Stop all monitors before shutting down
      Array.from(this.tokenMonitors.values()).forEach((monitor) =>
        monitor.stopMonitoring()
      );
      this.bot.stop("SIGTERM");
    });
  }
}
