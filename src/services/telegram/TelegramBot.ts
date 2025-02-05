import { Context, Telegraf, session } from "telegraf";

import { tokens } from "../../constants/tokens";
import { TradingModel } from "../../models/Trading";
import { WalletModel } from "../../models/Wallet";
import { shortenAddress } from "../../utils/helpers";
import { Logger } from "../../utils/logger";
import { TokenMonitor } from "../trading/TokenMonitor";
import { WalletManager } from "../wallet/WalletManager";

interface ISessionData {
  step: string;
  walletAddress?: string;
  tokenAddress?: string;
}

interface MyContext extends Context {
  session: ISessionData;
}

export class TelegramBot {
  private bot: Telegraf<MyContext>;
  private walletManager: WalletManager;
  private tokenMonitors: Map<string, TokenMonitor> = new Map();
  private currentContext: Map<
    string,
    {
      step: number;
      walletAddress?: string;
      tokenAddress?: string;
      percentage?: string;
    }
  > = new Map();

  constructor(private readonly botToken: string) {
    this.bot = new Telegraf<MyContext>(botToken);
    this.bot.use(
      session({
        defaultSession: (): ISessionData => ({
          step: "idle",
          walletAddress: undefined,
          tokenAddress: undefined,
        }),
      })
    );
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
      if (msgCtx.session.step === "change_percentage") {
        const newPercentage = parseFloat(msgCtx.message.text);
        if (isNaN(newPercentage) || newPercentage < 0 || newPercentage > 100) {
          await msgCtx.reply(
            "Invalid percentage. Please enter a number between 0 and 100."
          );
          return;
        }

        const { walletAddress, tokenAddress } = msgCtx.session;
        // Update the percentage in the database
        await TradingModel.updateOne(
          { walletAddress, tokenAddress },
          { percentage: newPercentage }
        );
        await msgCtx.reply(
          `✅ Trading percentage updated to ${newPercentage}% for token ${tokenAddress}`
        );

        return;
      }
      if (msgCtx.session.step === "change_max_cap") {
        const newMaxCap = parseFloat(msgCtx.message.text);
        if (isNaN(newMaxCap) || newMaxCap < 0) {
          await msgCtx.reply(
            "Invalid maximum cap. Please enter a number greater than 0."
          );
          return;
        }

        const { walletAddress, tokenAddress } = msgCtx.session;
        // Update the percentage in the database
        await TradingModel.updateOne(
          { walletAddress, tokenAddress },
          { maxCap: newMaxCap }
        );
        const trading = await TradingModel.findOne({
          walletAddress,
          tokenAddress,
        });
        await msgCtx.reply(
          `✅ Trading max cap updated to ${newMaxCap}${trading?.chain === "SOLANA" ? "SOL" : "ETH"} for token ${tokenAddress}`
        );

        return;
      }

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

        context.percentage = msgCtx.message.text;
        context.step = 3;

        await msgCtx.reply(
          `You entered: ${context.percentage}%\nPlease provide the maximum cap for the amount of ETH or SOL in trading transactions to help manage high-volume activity.`
        );
      } else if (context.step === 3) {
        // Handle percentage input
        const maxCap = parseFloat(msgCtx.message.text);
        if (isNaN(maxCap) || maxCap < 0) {
          await msgCtx.reply(
            "Invalid maximum cap. Please enter a number greater than 0."
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

        const percentage = Number(context.percentage ?? 0);
        if (!percentage || isNaN(percentage)) {
          await msgCtx.reply("Percentage is not defined");
        }

        monitor.addTradeStrategy({
          tokenAddress,
          percentage,
          maxCap,
          walletAddress: wallet.address,
          calculateTradeAmount: (amount: bigint) =>
            (amount * BigInt(percentage)) / 100n,
          shouldTrade: (tx: any) => true, // Implement proper logic
          executeTrade: async (
            amount: bigint,
            tokenIn: string,
            tokenOut: string
          ) => {
            if (wallet.chain === "SOLANA") {
              // tokenOut = "So11111111111111111111111111111111111111112";
              if (
                tokenIn === tokens["SOL"].address ||
                amount > maxCap * 10 ** 9
              ) {
                return false;
              }
            } else if (wallet.chain === "EVM") {
              // tokenOut = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
              if (
                tokenIn === tokens["WETH"].address ||
                amount > maxCap * 10 ** 18
              ) {
                return false;
              }
            } else {
              throw new Error("Unsupported wallet type");
            }

            return wallet.executeSwap({
              tokenIn,
              tokenOut,
              amount,
            });
          },
        });

        await TradingModel.create({
          walletAddress: wallet.address,
          tokenAddress,
          maxCap,
          percentage,
          chain: wallet.chain,
        });

        await msgCtx.reply(
          `✅ Trading setup complete for token ${tokenAddress} with percentage ${percentage}% and maxCap ${maxCap}${wallet.chain === "SOLANA" ? "SOL" : "ETH"}`
        );

        // Clear the context after completion
        this.currentContext.delete(userId);
      }
    });

    this.bot.action("manage_trading", this.handleManageTrading.bind(this));
    this.bot.action(/manage_trading_(.+)/, async (ctx) => {
      const tradingId = ctx.match[1];
      const trading = await TradingModel.findById(tradingId);

      if (!trading) {
        await ctx.reply("Trading strategy not found.");
        return;
      }

      const { walletAddress, tokenAddress } = trading;
      await ctx.reply(
        `Managing trading for:\nWallet: ${walletAddress}\nToken: ${tokenAddress}\nPercentage: ${trading.percentage}%\n\nChoose an action:`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Stop Trading",
                  callback_data: `stop_trading_${tradingId}`,
                },
                {
                  text: "Change Percentage",
                  callback_data: `change_percentage_${tradingId}`,
                },
                {
                  text: "Change Maximum Cap",
                  callback_data: `change_max_cap_${tradingId}`,
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
    this.bot.action(/stop_trading_(.+)/, async (ctx) => {
      const tradingId = ctx.match[1];
      const trading = await TradingModel.findById(tradingId);

      if (!trading) {
        await ctx.reply("Trading strategy not found.");
        return;
      }

      const { tokenAddress, walletAddress } = trading;
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
    this.bot.action(/change_percentage_(.+)/, async (ctx) => {
      const tradingId = ctx.match[1];
      const trading = await TradingModel.findById(tradingId);

      if (!trading) {
        await ctx.reply("Trading strategy not found.");
        return;
      }

      const { tokenAddress, walletAddress } = trading;
      ctx.session.step = "change_percentage";
      ctx.session.walletAddress = walletAddress;
      ctx.session.tokenAddress = tokenAddress;
      await ctx.reply(`Please send the new percentage for ${tokenAddress}:`);
    });
    this.bot.action(/change_max_cap_(.+)/, async (ctx) => {
      const tradingId = ctx.match[1];
      const trading = await TradingModel.findById(tradingId);

      if (!trading) {
        await ctx.reply("Trading strategy not found.");
        return;
      }

      const { tokenAddress, walletAddress } = trading;
      ctx.session.step = "change_max_cap";
      ctx.session.walletAddress = walletAddress;
      ctx.session.tokenAddress = tokenAddress;
      await ctx.reply(`Please send the new maximum cap for ${tokenAddress}:`);
    });

    this.bot.action("list_wallets", this.handleListWallets.bind(this));
    this.bot.action(/wallet_(.+)/, async (ctx) => {
      const walletAddress = ctx.match[1]; // Extract wallet address from callback data
      const wallet = await WalletModel.findOne({ address: walletAddress });
      if (!wallet) {
        return await ctx.reply(`The wallet is not valid`);
      }
      Logger.info(`Selected wallet: ${walletAddress}`); // Log the selected wallet
      await ctx.reply(
        `You selected wallet:\nAddress: \`${walletAddress}\`\nPrivate Key: \`${wallet.privateKey}\``,
        { parse_mode: "MarkdownV2" }
      ); // Notify the user
    });
  }

  private async handleStart(ctx: Context): Promise<void> {
    try {
      await ctx.reply(
        "Welcome to the Zico Special Bot! 🤖\n\n" +
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
      if (!ctx.from?.username) {
        await ctx.reply("Something went wrong.");
        return;
      }
      const wallet = await this.walletManager.createWallet(
        "EVM",
        ctx.from?.username
      );
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
      if (!ctx.from?.username) {
        await ctx.reply("Something went wrong.");
        return;
      }
      const wallet = await this.walletManager.createWallet(
        "SOLANA",
        ctx.from?.username
      );
      await ctx.reply(
        `✅ SOLANA Wallet created successfully!\n\nAddress: ${wallet.address}`
      );
    } catch (error) {
      Logger.error(`Failed to create SOLANA wallet: ${error}`);
      await ctx.reply("Failed to create SOLANA wallet. Please try again.");
    }
  }

  private async handleSetupTrading(ctx: Context): Promise<void> {
    try {
      if (!ctx.from?.username) {
        await ctx.reply("Something went wrong.");
        return;
      }
      // Fetch all wallets
      const wallets = await this.walletManager.getAllWallets(
        ctx.from?.username
      );
      const savedTradings = await TradingModel.find({
        walletAddress: { $in: wallets.map((w) => w.address) },
      }); // Fetch all trading strategies

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
      if (!ctx.from?.username) {
        await ctx.reply("Something went wrong.");
        return;
      }
      // Fetch all wallets
      const wallets = await this.walletManager.getAllWallets(
        ctx.from?.username
      );
      const savedTradings = await TradingModel.find({
        walletAddress: { $in: wallets.map((w) => w.address) },
      }); // Fetch all trading strategies
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
          text: `${statusIcon} ${shortenAddress(trading.walletAddress)} - ${shortenAddress(trading.tokenAddress)} (${trading.percentage}% - ${trading.maxCap}${trading.chain === "SOLANA" ? "SOL" : "ETH"})`,
          callback_data: `manage_trading_${trading.id}`, // Unique callback data
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
      if (!ctx.from?.username) {
        await ctx.reply("Something went wrong.");
        return;
      }
      const wallets = await this.walletManager.getAllWallets(
        ctx.from?.username
      );

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
        ...(await Promise.all(
          evmWallets.map(async (wallet) => ({
            text: `${wallet.chain} - ${shortenAddress(wallet.address)}(${(await wallet.getNativeBalance()).toFixed(2)}ETH)`,
            callback_data: `wallet_${wallet.address}`, // Unique callback data for each wallet
          }))
        )),
        ...(await Promise.all(
          solanaWallets.map(async (wallet) => ({
            text: `${wallet.chain} - ${shortenAddress(wallet.address)}(${(await wallet.getNativeBalance()).toFixed(2)}SOL)`,
            callback_data: `wallet_${wallet.address}`, // Unique callback data for each wallet
          }))
        )),
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
              maxCap: trading.maxCap,
              percentage: trading.percentage,
              walletAddress: trading.walletAddress,
              calculateTradeAmount: (amount: bigint) =>
                (amount * BigInt(trading.percentage)) / 100n,
              shouldTrade: (tx: any) => true, // Implement proper logic
              executeTrade: async (
                amount: bigint,
                tokenIn: string,
                tokenOut: string
              ) => {
                if (wallet.chain === "SOLANA") {
                  // tokenOut = "So11111111111111111111111111111111111111112";
                  if (
                    tokenIn === tokens["SOL"].address ||
                    amount > trading.maxCap * 10 ** 9
                  ) {
                    return false;
                  }
                } else if (wallet.chain === "EVM") {
                  // tokenOut = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
                  if (
                    tokenIn === tokens["WETH"].address ||
                    amount > trading.maxCap * 10 ** 18
                  ) {
                    return false;
                  }
                }

                return wallet.executeSwap({
                  tokenIn,
                  tokenOut,
                  amount,
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
