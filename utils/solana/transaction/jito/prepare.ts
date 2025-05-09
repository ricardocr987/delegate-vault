import {
  AddressesByLookupTableAddress,
  appendTransactionMessageInstructions,
  compileTransaction,
  compressTransactionMessageUsingAddressLookupTables,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  IInstruction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  TransactionSigner,
  address,
} from "@solana/kit";
import { rpc } from "../../rpc";
import { getTransferSolInstruction } from "@solana-program/system";
import { getComputeBudget } from "../computeBudget";
import { jitoTipAccounts } from "../../constants";
import { jitoApi } from "./api";

export type InstructionBatch = {
  instructions: IInstruction<string>[];
  lookupTable: AddressesByLookupTableAddress;
};

const SOL_DECIMALS = 9;
const MINIMUM_TIP_LAMPORTS = 1000;

export async function prepareBundle(
  batches: InstructionBatch[],
  signer: TransactionSigner
): Promise<string[]> {
  try {
    // Get latest blockhash and tip floor stats
    const [{ value: latestBlockhash }, tipStats] = await Promise.all([
      rpc.getLatestBlockhash().send(),
      jitoApi.getTipFloorStats(),
    ]);

    const medianTipSol = tipStats[0].landed_tips_75th_percentile;
    const medianTipLamports = Math.floor(medianTipSol * 10 ** SOL_DECIMALS);
    const tipAmount = Math.max(MINIMUM_TIP_LAMPORTS, medianTipLamports);
    console.log("final jito tip amount:", tipAmount);

    const jitoTipAddress =
      jitoTipAccounts[Math.floor(Math.random() * jitoTipAccounts.length)];

    const encodedTransactions = await Promise.all(
      batches.map(async (batch, index) => {
        const isLastBatch = index === batches.length - 1;

        const finalInstructions = await getComputeBudget(
          batch.instructions,
          signer.address,
          batch.lookupTable,
          latestBlockhash
        );

        const instructionsWithTip = isLastBatch
          ? [
              ...finalInstructions,
              getTransferSolInstruction({
                source: signer,
                destination: address(jitoTipAddress),
                amount: tipAmount,
              }),
            ]
          : finalInstructions;

        const message = pipe(
          createTransactionMessage({ version: 0 }),
          (tx) => setTransactionMessageFeePayer(signer.address, tx),
          (tx) =>
            setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
          (tx) => appendTransactionMessageInstructions(instructionsWithTip, tx)
        );

        const messageWithLookupTables =
          compressTransactionMessageUsingAddressLookupTables(
            message,
            batch.lookupTable
          );

        const compiledMessage = compileTransaction({
          ...messageWithLookupTables,
          lifetimeConstraint: latestBlockhash,
        });

        return getBase64EncodedWireTransaction(compiledMessage).toString();
      })
    );

    return encodedTransactions;
  } catch (error) {
    console.error("Error building Jito bundle:", error);
    throw error;
  }
}
