import ky from "ky";
import { config } from "../../../config";

export type TokenMetadata = {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
  tags?: string[];
  daily_volume?: number;
};

// Add metadata cache
const metadataCache: Record<string, TokenMetadata & { timestamp: number }> = {};
const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function getTokenMetadata(
  mint: string
): Promise<TokenMetadata | null> {
  try {
    // Check cache first
    const cached = metadataCache[mint];
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached;
    }

    const jupiterMetadata = await ky
      .get(`https://tokens.jup.ag/token/${mint}`, {
        timeout: 5000,
        retry: {
          limit: 2,
          methods: ["get"],
          statusCodes: [408, 413, 429, 500, 502, 503, 504],
        },
        throwHttpErrors: false,
        headers: {
          "x-api-key": config.JUPITER_API_KEY,
        },
      })
      .json<TokenMetadata>();

    if (
      typeof jupiterMetadata === "string" &&
      // @ts-ignore
      jupiterMetadata.includes("not found")
    ) {
      console.warn(`No metadata found for ${mint}`);
      return null;
    }

    const metadata = {
      ...jupiterMetadata,
      address: mint,
      timestamp: Date.now(),
    };

    // Cache the result
    metadataCache[mint] = metadata;
    return metadata;
  } catch (error) {
    console.warn(`Failed to fetch metadata for ${mint}:`, error);
    return null;
  }
}

export async function getTokenMetadatas(
  mints: string[]
): Promise<TokenMetadata[]> {
  const metadata = await Promise.all(mints.map(getTokenMetadata));
  return metadata.filter((metadata) => metadata !== null);
}
