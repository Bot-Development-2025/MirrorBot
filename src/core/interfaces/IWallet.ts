export type DEXProvider = "RAYDIUM" | "ORCA" | "JUPITER" | "UNISWAP";

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amount: number;
  isBuy: boolean;
}

export interface IWallet {
  address: string;
  privateKey: string;
  chain: "EVM" | "SOLANA";
  balance: number;

  updateWallet(_address: string, _privateKey: string): boolean;
  getBalance(): Promise<number>;
  withdraw(amount: number, toAddress: string): Promise<boolean>;
  executeSwap(params: SwapParams): Promise<boolean>;
}
