export type DEXProvider = "RAYDIUM" | "ORCA" | "JUPITER" | "UNISWAP";

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amount: bigint;
}

export interface IWallet {
  address: string;
  privateKey: string;
  chain: "EVM" | "SOLANA";
  balance: number;

  updateWallet(_address: string, _privateKey: string): boolean;
  getBalance(): Promise<bigint>;
  getNativeBalance(): Promise<number>;
  withdraw(amount: bigint, toAddress: string): Promise<boolean>;
  executeSwap(params: SwapParams): Promise<boolean>;
}
