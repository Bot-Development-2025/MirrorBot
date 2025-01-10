import { PairType, TokenType } from "./types";

export const tokens: TokenType = {
  AIA: {
    name: "AiAkita",
    symbol: "AIA",
    address: "0xb210d720da8bff877a60fbfd9990efc947c98fe5",
    decimals: 6,
  },
  WETH: {
    name: "Wrapped Ether",
    symbol: "WETH",
    address: "0x4200000000000000000000000000000000000006",
    decimals: 18,
  },
  AIX: {
    name: "AiAkitaX",
    symbol: "AIX",
    address: "A9zo6y9QFLaSrB9yWdr9WgK7oAbxvi8cFmzE1DAhyNBg",
    decimals: 8,
  },
  SOL: {
    name: "Solana Token",
    symbol: "SOL",
    address: "So11111111111111111111111111111111111111112",
    decimals: 9,
  },
  USDC: {
    name: "USD Coin",
    symbol: "USDC",
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
  },
};

export const pairs: PairType = {
  AIA_WETH: {
    name: "AiA/WETH",
    address: "0x3cdb0b95e02853f287d19118111281c38c78aa87",
  },
  AIX_SOL: {
    name: "AIX/SOL",
    address: "HMmbZ3XrYsz8qYDtobNxU2PsNoeuXZyLeUANSoT5YFCD",
  },
  WETH_USDC: {
    name: "WETH/USDC",
    address: "0xb4CB800910B228ED3d0834cF79D697127BBB00e5",
  },
};
