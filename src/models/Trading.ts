import mongoose, { Document, Schema } from "mongoose";

export interface ITradingDocument extends Document {
  walletAddress: string;
  tokenAddress: string;
  maxCap: number;
  percentage: number;
  tradingStrategy: "buy_only" | "sell_only" | "both";
  chain: "EVM" | "SOLANA";
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TradingSchema = new Schema({
  walletAddress: { type: String, required: true },
  tokenAddress: { type: String, required: true },
  percentage: { type: Number, required: true },
  maxCap: { type: Number, required: true },
  tradingStrategy: { type: String, required: true },
  chain: { type: String, required: true, enum: ["EVM", "SOLANA"] },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const TradingModel = mongoose.model<ITradingDocument>(
  "Trading",
  TradingSchema
);
