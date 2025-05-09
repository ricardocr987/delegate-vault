import { pipe } from "@solana/functional";
import {
  createTransactionMessage,
  setTransactionMessageFeePayer,
  appendTransactionMessageInstructions,
  setTransactionMessageLifetimeUsingBlockhash,
  compileTransaction,
  getBase64EncodedWireTransaction,
  type IInstruction,
  AddressesByLookupTableAddress,
  compressTransactionMessageUsingAddressLookupTables,
  address,
} from "@solana/kit";
import { getComputeBudget } from "./computeBudget";
import { rpc } from "../rpc";

export async function prepareTransaction(
  instructions: IInstruction<string>[],
  feePayer: string,
  lookupTableAccounts: AddressesByLookupTableAddress
): Promise<string> {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const finalInstructions = await getComputeBudget(
    instructions,
    feePayer,
    lookupTableAccounts,
    latestBlockhash
  );
  const payer = address(feePayer);
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(payer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions(finalInstructions, tx)
  );

  const messageWithLookupTables =
    compressTransactionMessageUsingAddressLookupTables(
      message,
      lookupTableAccounts
    );
  const compiledMessage = compileTransaction({
    ...messageWithLookupTables,
    lifetimeConstraint: latestBlockhash,
  });

  return getBase64EncodedWireTransaction(compiledMessage).toString();
}
