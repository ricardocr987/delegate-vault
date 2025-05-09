import BigNumber from "bignumber.js";
import { getTokenMetadata, TokenMetadata } from "./getTokenMetadata";
import { getTokenAccounts } from "./getTokenAccounts";
import { getMints } from "./getMint";
import { getPrices } from "./getPrices";
import { TokenAmount } from "@solana/rpc-types";
import { Address } from "@solana/addresses";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
  decodeToken,
} from "@solana-program/token";
import type { EncodedAccount } from "@solana/accounts";
import { address, ReadonlyUint8Array } from "@solana/kit";
import type {
  Base64EncodedDataResponse,
  StringifiedBigInt,
  StringifiedNumber,
} from "@solana/rpc-types";
import { rpc } from "../rpc";
import { SOL_MINT, USDC_MINT } from "../constants";
import { getMint } from "./getMint";

export type TokenInfo = {
  mint: string;
  address: string;
  amount: string;
  value: string;
  decimals: number;
  metadata: TokenMetadata;
};

const THRESHOLD_VALUE_USD = new BigNumber(0.1);

function calculateValue(
  tokenAmount: TokenAmount,
  decimals: number,
  price: number
): BigNumber {
  try {
    if (!tokenAmount?.amount || tokenAmount.amount === "0") {
      return new BigNumber(0);
    }

    if (typeof decimals !== "number" || decimals < 0) {
      console.warn("Invalid decimals:", decimals);
      return new BigNumber(0);
    }

    if (typeof price !== "number" || isNaN(price)) {
      console.warn("Invalid price:", price);
      return new BigNumber(0);
    }

    const amount = new BigNumber(tokenAmount.amount);
    const decimalAdjustment = new BigNumber(10).pow(decimals);
    const adjustedAmount = amount.dividedBy(decimalAdjustment);
    const value = adjustedAmount.multipliedBy(price);

    return value;
  } catch (error) {
    console.error("Error calculating value:", error);
    return new BigNumber(0);
  }
}

export async function getTokens(userKey: string): Promise<TokenInfo[]> {
  try {
    const { value: solBalance } = await rpc.getBalance(address(userKey)).send();
    const solPrice = (await getPrices([SOL_MINT]))[SOL_MINT];
    const tokenAccounts = await getTokenAccounts(address(userKey));

    const nonZeroAccounts = tokenAccounts.filter(
      (account) => account.account.tokenAmount.amount !== "0"
    );

    const solValue = new BigNumber(solBalance.toString())
      .dividedBy(10 ** 9)
      .multipliedBy(solPrice);

    let tokens: (TokenInfo | null)[] = [];
    if (solValue.isGreaterThan(THRESHOLD_VALUE_USD)) {
      tokens.push({
        mint: SOL_MINT,
        address: userKey,
        amount: new BigNumber(solBalance.toString())
          .dividedBy(10 ** 9)
          .toString(),
        value: solValue.toFixed(2),
        decimals: 9,
        metadata: {
          name: "Solana",
          symbol: "SOL",
          logoURI:
            "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
          address: SOL_MINT,
          decimals: 9,
        },
      });
    }

    if (nonZeroAccounts.length > 0) {
      const [mints, prices] = await Promise.all([
        getMints(
          nonZeroAccounts.map((account) => account.account.mint.toString())
        ),
        getPrices(
          nonZeroAccounts.map((account) => account.account.mint.toString())
        ),
      ]);

      const otherTokens = await Promise.all(
        nonZeroAccounts.map(async ({ pubkey, account }) => {
          try {
            const mint = account.mint.toString();
            const mintData = mints[mint];

            if (!mintData) {
              console.warn(`No mint data found for ${mint}`);
              return null;
            }

            const price = prices[mint] ?? 0;
            const value = calculateValue(
              account.tokenAmount,
              mintData.decimals,
              price
            );
            if (value.isLessThan(THRESHOLD_VALUE_USD)) {
              return null;
            }

            let metadata: TokenMetadata | null = null;
            let retries = 3;

            while (retries > 0 && !metadata) {
              try {
                metadata = await getTokenMetadata(mint);
                break;
              } catch (error) {
                console.warn(
                  `Failed to fetch metadata for ${mint}, retries left: ${
                    retries - 1
                  }`
                );
                retries--;
                if (retries === 0) throw error;
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }
            }

            if (!metadata) {
              console.warn(`No metadata found for ${mint}`);
              return null;
            }

            const tokenInfo: TokenInfo = {
              mint,
              address: pubkey.toString(),
              amount: account.tokenAmount.uiAmountString || "0",
              value: value.toFixed(2),
              decimals: mintData.decimals,
              metadata,
            };

            return tokenInfo;
          } catch (error) {
            console.warn(`Error processing token account ${pubkey}:`, error);
            return null;
          }
        })
      );

      tokens = [...tokens, ...otherTokens];
    }

    return tokens.filter((token): token is TokenInfo => token !== null);
  } catch (error) {
    console.error("Error fetching tokens:", error);
    throw error;
  }
}

export async function getMainTokens(userKey: string): Promise<TokenInfo[]> {
  try {
    const prices = await getPrices([SOL_MINT, USDC_MINT]);
    const [usdcAta] = await findAssociatedTokenPda({
      mint: address(USDC_MINT),
      owner: address(userKey),
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

    const tokens: TokenInfo[] = [];

    try {
      const { value: tokenAccountResponse } = await rpc
        .getAccountInfo(usdcAta, { encoding: "base64" })
        .send();

      if (tokenAccountResponse?.data) {
        const [base64Data] = tokenAccountResponse.data;
        if (base64Data) {
          const rawData = Buffer.from(base64Data, "base64");

          const encodedAccount: EncodedAccount<string> = {
            address: usdcAta,
            data: new Uint8Array(rawData) as ReadonlyUint8Array,
            executable: tokenAccountResponse.executable,
            lamports: tokenAccountResponse.lamports,
            programAddress: tokenAccountResponse.owner,
          };

          const decodedTokenAccount = decodeToken(encodedAccount);

          if (decodedTokenAccount) {
            const amount = decodedTokenAccount.data.amount.toString();
            const uiAmount = Number(amount) / Math.pow(10, 6);

            const tokenAmount: TokenAmount = {
              amount: amount as StringifiedBigInt,
              decimals: 6,
              uiAmount,
              uiAmountString: uiAmount.toString() as StringifiedNumber,
            } as const;

            const price = prices[USDC_MINT] ?? 0;
            const value = calculateValue(tokenAmount, 6, price);

            if (value.isGreaterThan(THRESHOLD_VALUE_USD)) {
              const metadata = await getTokenMetadata(USDC_MINT);
              if (!metadata) {
                console.warn(`No metadata found for ${USDC_MINT}`);
                throw new Error("No metadata found for USDC");
              }

              tokens.push({
                mint: USDC_MINT,
                address: usdcAta,
                amount: tokenAmount.uiAmountString,
                value: value.toFixed(2),
                decimals: 6,
                metadata,
              });
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Error processing USDC token account:`, error);
    }

    // Check native SOL balance
    const { value: solBalance } = await rpc.getBalance(address(userKey)).send();
    const solPrice = prices[SOL_MINT];
    const solValue = new BigNumber(solBalance.toString())
      .dividedBy(10 ** 9)
      .multipliedBy(solPrice);

    if (solValue.isGreaterThan(THRESHOLD_VALUE_USD)) {
      const solAmount = solBalance.toString();
      const solUiAmount = Number(solAmount) / Math.pow(10, 9);

      const solTokenAmount: TokenAmount = {
        amount: solAmount as StringifiedBigInt,
        decimals: 9,
        uiAmount: solUiAmount,
        uiAmountString: solUiAmount.toString() as StringifiedNumber,
      } as const;

      tokens.push({
        mint: SOL_MINT,
        address: userKey,
        amount: solTokenAmount.uiAmountString,
        value: solValue.toFixed(2),
        decimals: 9,
        metadata: {
          name: "Solana",
          symbol: "SOL",
          logoURI:
            "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
          address: SOL_MINT,
          decimals: 9,
        },
      });
    }

    return tokens;
  } catch (error) {
    console.error("Error fetching basic tokens:", error);
    return [];
  }
}

export async function getTokenInfo(
  userKey: string,
  tokenMint: string
): Promise<SimpleTokenInfo | null> {
  try {
    if (tokenMint === SOL_MINT) {
      const { value: solBalance } = await rpc
        .getBalance(address(userKey))
        .send();

      const solAmount = solBalance.toString();
      const solUiAmount = Number(solAmount) / Math.pow(10, 9);

      return {
        address: SOL_MINT,
        balance: solUiAmount.toString(),
        symbol: "SOL",
        logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
      };
    }

    // Get mint info for decimals
    const mintInfo = await getMint(tokenMint);
    if (!mintInfo) {
      console.warn("No mint info found for token:", tokenMint);
      return null;
    }

    // Handle other tokens
    const [tokenAta] = await findAssociatedTokenPda({
      mint: address(tokenMint),
      owner: address(userKey),
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

    const { value: tokenAccountResponse } = await rpc
      .getAccountInfo(tokenAta, { encoding: "base64" })
      .send();

    if (!tokenAccountResponse?.data) {
      return null;
    }

    const [base64Data] = tokenAccountResponse.data;
    if (!base64Data) {
      return null;
    }

    const rawData = Buffer.from(base64Data, "base64");
    const encodedAccount: EncodedAccount<string> = {
      address: tokenAta,
      data: new Uint8Array(rawData) as ReadonlyUint8Array,
      executable: tokenAccountResponse.executable,
      lamports: tokenAccountResponse.lamports,
      programAddress: tokenAccountResponse.owner,
    };

    const decodedTokenAccount = decodeToken(encodedAccount);
    if (!decodedTokenAccount) {
      return null;
    }

    const amount = decodedTokenAccount.data.amount.toString();
    const decimals = mintInfo.decimals;
    const uiAmount = Number(amount) / Math.pow(10, decimals);

    const tokenAmount: TokenAmount = {
      amount: amount as StringifiedBigInt,
      decimals,
      uiAmount,
      uiAmountString: uiAmount.toString() as StringifiedNumber,
    } as const;

    const metadata = await getTokenMetadata(tokenMint);
    if (!metadata) {
      console.warn(`No metadata found for ${tokenMint}`);
      throw new Error("No metadata found for token");
    }

    return {
      address: tokenMint,
      balance: tokenAmount.uiAmountString,
      symbol: metadata.symbol,
      logo: metadata.logoURI,
    };
  } catch (error) {
    console.error("Error fetching token info:", error);
    return null;
  }
}

export type SimpleTokenInfo = {
  address: string;
  balance: string;
  symbol: string;
  logo: string;
};

export async function getTokensInfo(
  userKey: string
): Promise<SimpleTokenInfo[]> {
  try {
    // Get SOL balance first
    const { value: solBalance } = await rpc.getBalance(address(userKey)).send();

    const tokens: SimpleTokenInfo[] = [
      {
        address: SOL_MINT,
        balance: (Number(solBalance.toString()) / Math.pow(10, 9)).toString(),
        symbol: "SOL",
        logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
      },
    ];

    // Get all token accounts
    const tokenAccounts = await getTokenAccounts(address(userKey));

    // Filter out zero balance accounts
    const nonZeroAccounts = tokenAccounts.filter(
      (account) => account.account.tokenAmount.amount !== "0"
    );

    if (nonZeroAccounts.length === 0) {
      return tokens;
    }

    // Get mint info for all tokens to get decimals
    const mints = await getMints(
      nonZeroAccounts.map((account) => account.account.mint.toString())
    );

    // Get metadata for all tokens in parallel
    const tokenInfoPromises = nonZeroAccounts.map(async ({ account }) => {
      try {
        const mint = account.mint.toString();
        const mintInfo = mints[mint];

        if (!mintInfo) {
          console.warn(`No mint info found for ${mint}`);
          return null;
        }

        const metadata = await getTokenMetadata(mint);
        const balance =
          Number(account.tokenAmount.amount) / Math.pow(10, mintInfo.decimals);

        if (!metadata) {
          console.warn(`No metadata found for ${mint}`);
          throw new Error("No metadata found for token");
        }

        return {
          address: mint,
          balance: balance.toString(),
          symbol: metadata.symbol,
          logo: metadata.logoURI,
        };
      } catch (error) {
        console.warn(`Error processing token ${account.mint}:`, error);
        return null;
      }
    });

    const tokenInfos = await Promise.all(tokenInfoPromises);

    // Filter out null values and combine with SOL
    return [
      ...tokens,
      ...tokenInfos.filter((info): info is SimpleTokenInfo => info !== null),
    ];
  } catch (error) {
    console.error("Error fetching tokens info:", error);
    return [];
  }
}
