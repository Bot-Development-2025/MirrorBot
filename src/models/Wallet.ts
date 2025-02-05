import mongoose, { Document, Schema } from "mongoose";

export interface IWalletDocument extends Document {
  address: string;
  chain: "EVM" | "SOLANA";
  privateKey: string;
  createdAt: Date;
}

const WalletSchema = new Schema({
  userId: { type: String, required: true },
  address: { type: String, required: true, unique: true },
  chain: { type: String, required: true, enum: ["EVM", "SOLANA"] },
  privateKey: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const WalletModel = mongoose.model<IWalletDocument>(
  "Wallet",
  WalletSchema
);
