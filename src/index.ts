import * as dotenv from "dotenv";
dotenv.config();

import { TelegramBot } from "./services/telegram/TelegramBot";
import { Database } from "./services/database/Database";
import { config } from "./config/config";
import { Logger } from "./utils/logger";

async function main() {
  try {
    // Connect to database
    await Database.getInstance().connect(config.database.url);

    const bot = new TelegramBot(config.telegramToken);
    bot.start();

    // Handle shutdown gracefully
    process.on("SIGINT", () => {
      Logger.info("Shutting down bot...");
      process.exit(0);
    });
  } catch (error) {
    Logger.error(`Bot initialization failed: ${error}`);
    process.exit(1);
  }
}

main();
