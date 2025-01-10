export function validateAddress(
  address: string,
  chain: "EVM" | "SOLANA"
): boolean {
  if (chain === "EVM") {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  } else {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }
}

export function formatAmount(amount: number, decimals: number = 18): string {
  return (amount / Math.pow(10, decimals)).toFixed(decimals);
}

export function parseAmount(amount: string, decimals: number = 18): number {
  return Math.floor(parseFloat(amount) * Math.pow(10, decimals));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function shortenAddress(address: string, chars: number = 4): string {
  if (!address || address.length <= 2 * chars) return address; // Return original if too short
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
