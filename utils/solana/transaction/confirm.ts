import {
  decompileTransactionMessageFetchingLookupTables,
  getSignatureFromTransaction,
  FullySignedTransaction,
  TransactionWithBlockhashLifetime,
} from "@solana/kit";
import { rpc, sendAndConfirmTransaction } from "../rpc";
import {
  base64Encoder,
  transactionDecoder,
  compiledTransactionMessageDecoder,
} from "../constants";

export async function confirmTransaction(transaction: string): Promise<string> {
  const transactionBytes = base64Encoder.encode(transaction);
  const decodedTx = transactionDecoder.decode(transactionBytes);

  const compiledTransactionMessage = compiledTransactionMessageDecoder.decode(
    decodedTx.messageBytes
  );
  const decompiledTransactionMessage =
    await decompileTransactionMessageFetchingLookupTables(
      compiledTransactionMessage,
      rpc
    );
  const signedTransactionWithLifetime = {
    ...decodedTx,
    lifetimeConstraint: decompiledTransactionMessage.lifetimeConstraint,
  } as FullySignedTransaction & TransactionWithBlockhashLifetime;

  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    try {
      await sendAndConfirmTransaction(signedTransactionWithLifetime, {
        commitment: "confirmed",
        skipPreflight: true,
      });

      return getSignatureFromTransaction(signedTransactionWithLifetime);
    } catch (error) {
      retries++;
      console.error("Error sending transaction:", error);
    }
  }

  throw new Error("Failed to send transaction");
}
