import { IWallet } from "../../core/interfaces/IWallet";
import { WalletModel, IWalletDocument } from "../../models/Wallet";
import { Logger } from "../../utils/logger";
import { WalletFactory } from "./WalletFactory";

export class WalletManager {
  async createWallet(chain: "EVM" | "SOLANA"): Promise<IWallet> {
    const wallet = WalletFactory.createWallet(chain);

    // Save to database
    await WalletModel.create({
      address: wallet.address,
      chain,
      privateKey: wallet.privateKey,
    });

    Logger.info(`Created new ${chain} wallet`);
    return wallet;
  }

  async getWallet(address: string): Promise<IWallet | null> {
    const walletDoc = await WalletModel.findOne({ address });
    if (!walletDoc) return null;

    // Create wallet instance with stored properties
    const wallet = WalletFactory.createWallet(walletDoc.chain);
    wallet.updateWallet(walletDoc.address, walletDoc.privateKey);

    return wallet;
  }

  async getAllWallets(): Promise<IWallet[]> {
    const walletDocs = await WalletModel.find();

    return walletDocs.map((doc) => {
      const wallet = WalletFactory.createWallet(doc.chain);
      wallet.updateWallet(doc.address, doc.privateKey);

      return wallet;
    });
  }
}
