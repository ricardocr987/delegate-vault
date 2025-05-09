import ky from "ky";
import { toInstruction } from "./toInstruction";
import {
  address,
  AddressesByLookupTableAddress,
  getProgramDerivedAddress,
  IInstruction,
  TransactionSigner,
} from "@solana/kit";
import { InstructionBatch } from "../jito/prepare";
import { getLookupTables } from "../../fetcher/getLookupTables";
import { canFitInTransaction } from "../size";
import {
  getTokenMetadata,
  TokenMetadata,
} from "../../fetcher/getTokenMetadata";
import { BigNumber, config } from "bignumber.js";
import { getCloseAccountInstruction } from "@solana-program/token";
import { ASSOCIATED_TOKEN_PROGRAM } from "../../constants";
import { TOKEN_PROGRAM } from "../../constants";
import { translateAddress } from "@coral-xyz/anchor";
import { getMintInfo } from "../../fetcher/getMint";

export interface RoutePlanStep {
  swapInfo: {
    ammKey: string;
    label?: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
    percent: number;
  };
}

export interface PlatformFee {
  amount?: string;
  feeBps?: number;
}

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: "ExactIn" | "ExactOut";
  slippageBps: number;
  platformFee?: PlatformFee;
  priceImpactPct: string;
  routePlan: RoutePlanStep[];
  contextSlot?: number;
  timeTaken?: number;
}

export type JupiterSwapData = {
  tokenLedgerInstruction: any;
  computeBudgetInstructions: any[];
  setupInstructions: any[];
  swapInstruction: any;
  cleanupInstruction?: any;
  addressLookupTableAddresses: string[];
};

export type JupiterSwapInstructions = {
  swapInstructions: IInstruction<string>[];
  lookupTableAddresses: string[];
  quoteResponse: JupiterQuoteResponse;
};

export type PortfolioSwapInfo = {
  inputTokenMint: string;
  inputTokenSymbol: string;
  inputTokenLogo: string;
  inputAmount: string;
  uiInputAmount: string;
  outputTokenMints: string[];
  outputTokenSymbols: string[];
  outputTokenLogos: string[];
  outputAmounts: string[];
  uiOutputAmounts: string[];
};

export type SimpleTokenInfo = {
  token: string;
  amount: number;
};

export async function jupiterSwapInstructions(
  inputToken: string,
  outputToken: string,
  amount: number,
  slippageBps: string,
  userPublicKey: string
): Promise<JupiterSwapInstructions> {
  const headers = {
    "x-api-key": process.env.JUPITER_API_KEY,
  };

  try {
    const params = new URLSearchParams({
      inputMint: inputToken,
      outputMint: outputToken,
      amount: amount.toString(),
      slippageBps: slippageBps,
      onlyDirectRoutes: "true",
      // excluded because cant parse the events
      excludeDexes:
        "Perena,Stabble+Stable+Swap,1DEX,Stabble+Weighted+Swap,Saros,Penguin,DexLab,Token+Mill,Bonkswap,Oasis",
    });
    const quoteResponse = await ky
      .get(`https://api.jup.ag/swap/v1/quote?${params}`, { headers })
      .json<JupiterQuoteResponse>();

    return await getSwapInstructions(quoteResponse, userPublicKey);
  } catch (error: any) {
    if (
      error.message?.includes("Request failed with status code 400 Bad Request")
    ) {
      console.log("No routes found, trying again with all routes");

      const params = new URLSearchParams({
        inputMint: inputToken,
        outputMint: outputToken,
        amount: amount.toString(),
        slippageBps: slippageBps,
        onlyDirectRoutes: "false",
        excludeDexes:
          "Perena,Stabble+Stable+Swap,1DEX,Stabble+Weighted+Swap,Saros,Penguin,DexLab,Token+Mill,Bonkswap,Oasis",
      });

      const quoteResponse = await ky
        .get(`https://api.jup.ag/swap/v1/quote?${params}`, { headers })
        .json<JupiterQuoteResponse>();

      return await getSwapInstructions(quoteResponse, userPublicKey);
    }

    throw Error("Error finding routes");
  }
}

// Helper function to get swap instructions from quote response
async function getSwapInstructions(
  quoteResponse: JupiterQuoteResponse,
  userPublicKey: string
): Promise<JupiterSwapInstructions> {
  const swapData = await ky
    .post("https://api.jup.ag/swap/v1/swap-instructions", {
      json: {
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
      },
      headers: {
        "x-api-key": process.env.JUPITER_API_KEY,
      },
    })
    .json<JupiterSwapData>();

  const {
    tokenLedgerInstruction,
    computeBudgetInstructions,
    setupInstructions,
    swapInstruction,
    cleanupInstruction,
    addressLookupTableAddresses,
  } = swapData;

  const instructions = [
    ...setupInstructions,
    swapInstruction,
    cleanupInstruction,
  ].filter(Boolean);

  return {
    swapInstructions: instructions.map((ix) => toInstruction(ix)),
    lookupTableAddresses: addressLookupTableAddresses || [],
    quoteResponse,
  };
}

type PrepareSwapsResult = {
  swapInfos: PortfolioSwapInfo[];
  instructionBatches: InstructionBatch[];
};

export async function preparePortfolioSwaps(
  outputTokenInfos: SimpleTokenInfo[],
  inputToken: string,
  signer: TransactionSigner,
  slippageBps: string
): Promise<PrepareSwapsResult> {
  try {
    let instructionBatches: InstructionBatch[] = [];
    let currentInstructions: IInstruction<string>[] = [];
    let currentLookupTables: AddressesByLookupTableAddress = {};
    let currentOutputTokenInfo: SimpleTokenInfo[] = [];
    let outputBatchTokenInfo: SimpleTokenInfo[][] = [];

    // Get all Jupiter instructions first to minimize API calls
    const swapResults = await Promise.all(
      outputTokenInfos.map((outputTokenInfo) =>
        jupiterSwapInstructions(
          inputToken,
          outputTokenInfo.token,
          outputTokenInfo.amount,
          slippageBps,
          signer.address
        )
      )
    );

    for (let i = 0; i < swapResults.length; i++) {
      const swapResult = swapResults[i];
      const currentSwap = outputTokenInfos[i];

      // Test adding this swap to current batch
      const testInstructions = [
        ...currentInstructions,
        ...swapResult.swapInstructions,
      ];

      // Merge lookup tables
      const testLookupTables = await getLookupTables(
        [
          ...new Set([
            ...Object.keys(currentLookupTables),
            ...swapResult.lookupTableAddresses,
          ]),
        ].map((addr) => address(addr))
      );

      // Check if we can fit this swap in current batch
      const canFit = await canFitInTransaction(
        signer,
        testInstructions,
        testLookupTables,
        {
          isFirstTransaction: i === 0,
          isSolInput:
            inputToken === "So11111111111111111111111111111111111111112",
          isLastTransaction: i === swapResults.length - 1,
        }
      );

      if (!canFit) {
        // Save current batch if it's not empty
        if (currentOutputTokenInfo.length > 0) {
          instructionBatches.push({
            instructions: currentInstructions,
            lookupTable: currentLookupTables,
          });
          outputBatchTokenInfo.push(currentOutputTokenInfo);
        }

        // Get lookup tables for new batch
        const newBatchLookupTables = await getLookupTables(
          swapResult.lookupTableAddresses.map((addr) => address(addr))
        );

        // Start new batch with this swap
        currentInstructions = [...swapResult.swapInstructions];
        currentLookupTables = newBatchLookupTables;
        currentOutputTokenInfo = [currentSwap];
      } else {
        // Add to current batch
        currentInstructions = testInstructions;
        currentLookupTables = testLookupTables;
        currentOutputTokenInfo.push(currentSwap);
      }
    }

    // Add final batch if not empty
    if (currentOutputTokenInfo.length > 0) {
      instructionBatches.push({
        instructions: currentInstructions,
        lookupTable: currentLookupTables,
      });
      outputBatchTokenInfo.push(currentOutputTokenInfo);
    }

    const inputTokenMetadata = await getTokenMetadata(inputToken);
    if (!inputTokenMetadata) {
      throw new Error("Input token metadata not found");
    }
    const outputTokenMetadata = (
      await Promise.all(
        outputTokenInfos.map(
          async (outputTokenInfo) =>
            await getTokenMetadata(outputTokenInfo.token)
        )
      )
    ).filter((metadata): metadata is TokenMetadata => metadata !== null);

    const swapInfos = outputBatchTokenInfo.map((outputTokenInfos) => {
      // Get quote responses for tokens in this batch by matching output mints
      const batchQuoteResponses = swapResults
        .map((result) => result.quoteResponse)
        .filter((quoteResponse) =>
          outputTokenInfos
            .map((info) => info.token)
            .includes(quoteResponse.outputMint)
        );

      const inputAmounts = batchQuoteResponses.reduce(
        (acc, quoteResponse) => acc + Number(quoteResponse.inAmount),
        0
      );

      // Convert raw input amount to UI amount using token decimals
      const uiInputAmount = new BigNumber(inputAmounts.toString())
        .dividedBy(new BigNumber(10).pow(inputTokenMetadata.decimals))
        .toString();

      const outputMetadatas = outputTokenInfos
        .map((y) =>
          outputTokenMetadata.find((metadata) => metadata.address === y.token)
        )
        .filter((metadata): metadata is TokenMetadata => metadata !== null);

      // Map output amounts from quote responses instead of outputTokenInfos
      const outputAmounts = outputTokenInfos.map((outputInfo) => {
        const quoteResponse = batchQuoteResponses.find(
          (quote) => quote.outputMint === outputInfo.token
        );
        return quoteResponse ? quoteResponse.outAmount : "0";
      });

      // Calculate UI output amounts using quote response outAmount
      const uiOutputAmounts = outputTokenInfos.map((outputInfo, index) => {
        const metadata = outputMetadatas[index];
        const quoteResponse = batchQuoteResponses.find(
          (quote) => quote.outputMint === outputInfo.token
        );

        if (!metadata || !quoteResponse) return "0";

        return new BigNumber(quoteResponse.outAmount)
          .dividedBy(new BigNumber(10).pow(metadata.decimals))
          .toString();
      });

      return {
        inputTokenMint: inputToken,
        inputTokenSymbol: inputTokenMetadata.symbol,
        inputTokenLogo: inputTokenMetadata.logoURI,
        inputAmount: inputAmounts.toString(),
        uiInputAmount: uiInputAmount,
        outputTokenMints: outputTokenInfos.map((y) => y.token),
        outputTokenSymbols: outputMetadatas.map((metadata) => metadata.symbol),
        outputTokenLogos: outputMetadatas.map((metadata) => metadata.logoURI),
        outputAmounts,
        uiOutputAmounts,
      };
    });

    return {
      swapInfos,
      instructionBatches,
    };
  } catch (error) {
    console.error("Error in prepareSwaps:", error);
    throw error;
  }
}

export type LiquidationSwapInfo = {
  inputTokenMints: string[];
  inputTokenSymbols: string[];
  inputTokenLogos: string[];
  inputAmounts: string[];
  uiInputAmounts: string[];
  outputTokenMint: string;
  outputTokenSymbol: string;
  outputTokenLogo: string;
  outputAmount: string;
  uiOutputAmount: string;
};

export type PrepareLiquidationSwapsResult = {
  swapInfos: LiquidationSwapInfo[];
  instructionBatches: InstructionBatch[];
};

export async function prepareLiquidationSwaps(
  inputTokensInfo: SimpleTokenInfo[],
  outputToken: string,
  signer: TransactionSigner,
  slippageBps: string
): Promise<PrepareLiquidationSwapsResult> {
  try {
    let instructionBatches: InstructionBatch[] = [];
    let currentInstructions: IInstruction<string>[] = [];
    let currentLookupTables: AddressesByLookupTableAddress = {};
    let currentInputTokenInfo: SimpleTokenInfo[] = [];
    let inputBatchTokenInfo: SimpleTokenInfo[][] = [];

    // Get all Jupiter instructions first to minimize API calls
    const swapResults = await Promise.all(
      inputTokensInfo.map((inputTokenInfo) =>
        jupiterSwapInstructions(
          inputTokenInfo.token,
          outputToken,
          inputTokenInfo.amount,
          slippageBps,
          signer.address
        )
      )
    );

    for (let i = 0; i < swapResults.length; i++) {
      const swapResult = swapResults[i];
      const currentSwap = inputTokensInfo[i];

      // Test adding this swap to current batch
      const testInstructions = [
        ...currentInstructions,
        ...swapResult.swapInstructions,
      ];

      // Merge lookup tables
      const testLookupTables = await getLookupTables(
        [
          ...new Set([
            ...Object.keys(currentLookupTables),
            ...swapResult.lookupTableAddresses,
          ]),
        ].map((addr) => address(addr))
      );

      // Check if we can fit this swap in current batch
      const canFit = await canFitInTransaction(
        signer,
        testInstructions,
        testLookupTables,
        {
          isFirstTransaction: i === 0,
          isSolInput:
            currentSwap.token === "So11111111111111111111111111111111111111112",
          isLastTransaction: i === swapResults.length - 1,
          isLiquidation: {
            numCloseAccounts: currentInputTokenInfo.length,
          },
        }
      );

      if (!canFit) {
        // Save current batch if it's not empty
        if (currentInputTokenInfo.length > 0) {
          instructionBatches.push({
            instructions: currentInstructions,
            lookupTable: currentLookupTables,
          });
          inputBatchTokenInfo.push(currentInputTokenInfo);
        }

        // Get lookup tables for new batch
        const newBatchLookupTables = await getLookupTables(
          swapResult.lookupTableAddresses.map((addr) => address(addr))
        );

        // Start new batch with this swap
        currentInstructions = [...swapResult.swapInstructions];
        currentLookupTables = newBatchLookupTables;
        currentInputTokenInfo = [currentSwap];
      } else {
        // Add to current batch
        if (
          currentSwap.token !== "So11111111111111111111111111111111111111112"
        ) {
          const mintInfo = await getMintInfo(currentSwap.token);
          if (!mintInfo) {
            throw new Error("Mint info not found");
          }
          const [tokenAccount] = await getProgramDerivedAddress({
            programAddress: address(ASSOCIATED_TOKEN_PROGRAM),
            seeds: [
              translateAddress(address(signer.address)).toBytes(),
              translateAddress(mintInfo.programAddress).toBytes(),
              translateAddress(currentSwap.token).toBytes(),
            ],
          });
          if (mintInfo.programAddress === TOKEN_PROGRAM) {
            const closeAccountInstruction = getCloseAccountInstruction({
              account: tokenAccount,
              destination: signer.address,
              owner: signer.address,
            });
            currentInstructions = [
              ...testInstructions,
              closeAccountInstruction,
            ];
          } else {
            /*const closeAccountInstruction = getCloseAccountInstruction2022({
              account: tokenAccount,
              destination: signer.address,
              owner: signer.address,
            });
            currentInstructions = [
              ...testInstructions,
              closeAccountInstruction,
            ];*/
          }
        } else {
          currentInstructions = [...testInstructions];
        }

        currentLookupTables = testLookupTables;
        currentInputTokenInfo.push(currentSwap);
      }
    }

    // Add final batch if not empty
    if (currentInputTokenInfo.length > 0) {
      instructionBatches.push({
        instructions: currentInstructions,
        lookupTable: currentLookupTables,
      });
      inputBatchTokenInfo.push(currentInputTokenInfo);
    }

    const outputTokenMetadata = await getTokenMetadata(outputToken);
    if (!outputTokenMetadata) {
      throw new Error("Output token metadata not found");
    }

    const inputTokenMetadata = (
      await Promise.all(
        inputTokensInfo.map(
          async (inputTokenInfo) => await getTokenMetadata(inputTokenInfo.token)
        )
      )
    ).filter((metadata): metadata is TokenMetadata => metadata !== null);

    const swapInfos = inputBatchTokenInfo.map((inputTokenInfos) => {
      // Get quote responses for tokens in this batch by matching input mints
      const batchQuoteResponses = swapResults
        .map((result) => result.quoteResponse)
        .filter((quoteResponse) =>
          inputTokenInfos
            .map((info) => info.token)
            .includes(quoteResponse.inputMint)
        );

      // Calculate total output amount from quote responses
      const outputAmount = batchQuoteResponses.reduce(
        (acc, quoteResponse) => acc + Number(quoteResponse.outAmount),
        0
      );

      // Convert raw output amount to UI amount using token decimals
      const uiOutputAmount = new BigNumber(outputAmount.toString())
        .dividedBy(new BigNumber(10).pow(outputTokenMetadata.decimals))
        .toString();

      const inputMetadatas = inputTokenInfos
        .map((x) =>
          inputTokenMetadata.find((metadata) => metadata.address === x.token)
        )
        .filter((metadata): metadata is TokenMetadata => metadata !== null);

      // Map input amounts from quote responses instead of inputTokenInfos
      const inputAmounts = inputTokenInfos.map((inputInfo) => {
        const quoteResponse = batchQuoteResponses.find(
          (quote) => quote.inputMint === inputInfo.token
        );
        return quoteResponse ? quoteResponse.inAmount : "0";
      });

      // Calculate UI input amounts using quote response inAmount
      const uiInputAmounts = inputTokenInfos.map((inputInfo, index) => {
        const metadata = inputMetadatas[index];
        const quoteResponse = batchQuoteResponses.find(
          (quote) => quote.inputMint === inputInfo.token
        );

        if (!metadata || !quoteResponse) return "0";

        return new BigNumber(quoteResponse.inAmount)
          .dividedBy(new BigNumber(10).pow(metadata.decimals))
          .toString();
      });

      return {
        inputTokenMints: inputTokenInfos.map((x) => x.token),
        inputTokenSymbols: inputMetadatas.map((metadata) => metadata.symbol),
        inputTokenLogos: inputMetadatas.map((metadata) => metadata.logoURI),
        inputAmounts,
        uiInputAmounts,
        outputTokenMint: outputToken,
        outputTokenSymbol: outputTokenMetadata.symbol,
        outputTokenLogo: outputTokenMetadata.logoURI,
        outputAmount: outputAmount.toString(),
        uiOutputAmount,
      };
    });

    return {
      swapInfos,
      instructionBatches,
    };
  } catch (error) {
    console.error("Error in prepareLiquidationSwaps:", error);
    throw error;
  }
}
