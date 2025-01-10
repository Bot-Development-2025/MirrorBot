import mongoose from "mongoose";
import { Logger } from "../../utils/logger";

export class Database {
  private static instance: Database;

  private constructor() {}

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public async connect(url: string): Promise<void> {
    try {
      await mongoose.connect(url);
      Logger.info("Connected to database");
    } catch (error) {
      Logger.error(`Database connection failed: ${error}`);
      throw error;
    }
  }
}
