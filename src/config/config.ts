interface Config {
  telegramToken: string;
  networks: {
    evm: {
      rpcUrl: string;
    };
    solana: {
      rpcUrl: string;
    };
  };
  database: {
    url: string;
  };
}

export const config: Config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || "",
  networks: {
    evm: {
      rpcUrl: process.env.EVM_RPC_URL || "https://eth.llamarpc.com",
    },
    solana: {
      rpcUrl:
        process.env.SOLANA_RPC_URL ||
        "https://boldest-palpable-pallet.solana-mainnet.quiknode.pro/e0a358167e7dfda9c51aec059814b4606f444852",
    },
  },
  database: {
    url: process.env.DATABASE_URL || "mongodb://localhost:27017/trading-bot",
  },
};
