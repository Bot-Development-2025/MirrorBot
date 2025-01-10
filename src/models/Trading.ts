import mongoose, { Schema, Document } from "mongoose";

export interface ITradingDocument extends Document {
  walletAddress: string;
  tokenAddress: string;
  percentage: number;
  chain: "EVM" | "SOLANA";
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TradingSchema = new Schema({
  walletAddress: { type: String, required: true },
  tokenAddress: { type: String, required: true },
  percentage: { type: Number, required: true },
  chain: { type: String, required: true, enum: ["EVM", "SOLANA"] },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const TradingModel = mongoose.model<ITradingDocument>(
  "Trading",
  TradingSchema
);
