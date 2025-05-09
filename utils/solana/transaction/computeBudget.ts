import { pipe } from "@solana/functional";
import {
  createTransactionMessage,
  setTransactionMessageFeePayer,
  appendTransactionMessageInstructions,
  setTransactionMessageLifetimeUsingBlockhash,
  compileTransaction,
  getBase64EncodedWireTransaction,
  type IInstruction,
  Base64EncodedWireTransaction,
  AddressesByLookupTableAddress,
  compressTransactionMessageUsingAddressLookupTables,
  Blockhash,
  address,
} from "@solana/kit";
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";
import { rpc } from "../rpc";
import ky from "ky";

export const PRIORITY_LEVELS = {
  MIN: "Min",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  VERY_HIGH: "VeryHigh",
  UNSAFE_MAX: "UnsafeMax",
} as const;

export type PriorityLevel = keyof typeof PRIORITY_LEVELS;

interface PriorityFeeOptions {
  priorityLevel?: PriorityLevel;
  lookbackSlots?: number;
  includeVote?: boolean;
  recommended?: boolean;
  evaluateEmptySlotAsZero?: boolean;
}

interface PriorityFeeResponse {
  jsonrpc: string;
  result: {
    priorityFeeEstimate: number;
    priorityFeeLevels?: {
      min: number;
      low: number;
      medium: number;
      high: number;
      veryHigh: number;
      unsafeMax: number;
    };
  };
  id: string;
}

const DEFAULT_COMPUTE_UNITS = 1_400_000;
const DEFAULT_PRIORITY_FEE = 50000;

async function getComputeUnits(
  wireTransaction: Base64EncodedWireTransaction
): Promise<number> {
  const simulation = await rpc
    .simulateTransaction(wireTransaction, {
      sigVerify: false,
      encoding: "base64",
    })
    .send();

  if (simulation.value.err && simulation.value.logs) {
    if ((simulation.value.err as any).InsufficientFundsForRent) {
      throw new Error("You need more SOL to pay for transaction fees");
    }

    if (simulation.value.logs.length === 0) {
      throw new Error("You need more SOL to pay for transaction fees");
    }

    const numLogs = simulation.value.logs.length;
    const lastLogs = simulation.value.logs.slice(Math.max(numLogs - 100, 0));
    console.log(`Last ${lastLogs.length} Solana simulation logs:`, lastLogs);
    console.log("base64 encoded transaction:", wireTransaction);

    for (const log of simulation.value.logs) {
      if (
        log.includes(
          "Program log: AnchorError caused by account: manager. Error Code: ConstraintSeeds. Error Number: 2006. Error Message: A seeds constraint was violated."
        ) ||
        log.includes("IncorrectSigner")
      ) {
        throw new Error("IncorrectSigner");
      }
      if (log.includes("InvalidLockupAmount")) {
        throw new Error("Invalid staked amount: Should be > 1");
      }
      if (log.includes("0x1771") || log.includes("0x178c")) {
        throw new Error("Maximum slippage reached");
      }
      if (
        log.includes(
          "Program 11111111111111111111111111111111 failed: custom program error: 0x1"
        ) ||
        log.includes("insufficient lamports")
      ) {
        throw new Error("You need more SOL to pay for transaction fees");
      }
    }

    throw new Error("Transaction simulation error");
  }

  return Number(simulation.value.unitsConsumed) || DEFAULT_COMPUTE_UNITS;
}

async function getPriorityFeeEstimate(
  wireTransaction: string,
  options: PriorityFeeOptions = {}
): Promise<number> {
  try {
    const data = await ky
      .post(
        `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
        {
          json: {
            jsonrpc: "2.0",
            id: "1",
            method: "getPriorityFeeEstimate",
            params: [
              {
                transaction: wireTransaction,
                options: {
                  recommended: true,
                  transactionEncoding: "base64",
                },
              },
            ],
          },
        }
      )
      .json<PriorityFeeResponse>();

    if (!data.result?.priorityFeeEstimate) {
      return DEFAULT_PRIORITY_FEE;
    }

    return Math.max(data.result.priorityFeeEstimate, DEFAULT_PRIORITY_FEE);
  } catch (error) {
    console.error("Error getting priority fee estimate:", error);
    return DEFAULT_PRIORITY_FEE;
  }
}

async function simulateAndGetBudget(
  instructions: IInstruction<string>[],
  feePayer: string,
  lookupTableAccounts: AddressesByLookupTableAddress,
  latestBlockhash: Readonly<{
    blockhash: Blockhash;
    lastValidBlockHeight: bigint;
  }>,
  priorityLevel: PriorityLevel
): Promise<[IInstruction<string>, IInstruction<string>]> {
  const payer = address(feePayer);
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(payer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx)
  );

  const messageWithLookupTables =
    compressTransactionMessageUsingAddressLookupTables(
      message,
      lookupTableAccounts
    );
  const compiledMessage = compileTransaction(messageWithLookupTables);
  const wireTransaction = getBase64EncodedWireTransaction(compiledMessage);

  const [computeUnits, priorityFee] = await Promise.all([
    getComputeUnits(wireTransaction),
    getPriorityFeeEstimate(wireTransaction, {
      priorityLevel,
      lookbackSlots: 150,
      includeVote: false,
      evaluateEmptySlotAsZero: true,
    }),
  ]);

  const computeBudgetIx = getSetComputeUnitLimitInstruction({
    units: computeUnits * 1.1,
  });

  const priorityFeeIx = getSetComputeUnitPriceInstruction({
    microLamports: priorityFee,
  });

  return [computeBudgetIx, priorityFeeIx];
}

export async function getComputeBudget(
  instructions: IInstruction<string>[],
  feePayer: string,
  lookupTableAccounts: AddressesByLookupTableAddress,
  latestBlockhash: Readonly<{
    blockhash: Blockhash;
    lastValidBlockHeight: bigint;
  }>,
  priorityLevel: PriorityLevel = "MEDIUM"
): Promise<IInstruction<string>[]> {
  try {
    const [computeBudgetIx, priorityFeeIx] = await simulateAndGetBudget(
      instructions,
      feePayer,
      lookupTableAccounts,
      latestBlockhash,
      priorityLevel
    );
    return [computeBudgetIx, priorityFeeIx, ...instructions];
  } catch (error) {
    throw error;
  }
}
