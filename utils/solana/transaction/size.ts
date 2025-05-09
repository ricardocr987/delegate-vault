import { pipe } from "@solana/functional";
import {
  createTransactionMessage,
  setTransactionMessageFeePayer,
  appendTransactionMessageInstructions,
  setTransactionMessageLifetimeUsingBlockhash,
  compileTransaction,
  getBase64EncodedWireTransaction,
  IInstruction,
  AddressesByLookupTableAddress,
  compressTransactionMessageUsingAddressLookupTables,
  TransactionSigner,
  Blockhash,
  address,
} from "@solana/kit";
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";
import { getTransferSolInstruction } from "@solana-program/system";
import {
  getTransferInstruction,
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCloseAccountInstruction,
} from "@solana-program/token";

// Transaction size limits (based on Solana docs)
const RAW_TX_SIZE_LIMIT = 1232; // IPv6 MTU (1280) - headers (48)
const ENCODED_TX_SIZE_LIMIT = 1644 - 30; // Maximum base64 encoded size less 30 bytes as security margin

// Core transaction components
const VERSION_PREFIX_SIZE = 1; // Version prefix for v0 transaction
const SIGNATURE_SIZE = 64; // Each signature is 64 bytes
const PUBKEY_SIZE = 32; // Each public key is 32 bytes
const BLOCKHASH_SIZE = 32; // Recent blockhash size
const MESSAGE_HEADER_SIZE = 3; // num_required_signatures(1) + num_readonly_signed(1) + num_readonly_unsigned(1)

// Instruction sizes (verified from actual transactions)
const COMPUTE_BUDGET_IX_SIZE = 11; // Compute budget instruction size
const TOKEN_TRANSFER_SIZE = 40; // Token transfer instruction size
const SOL_TRANSFER_SIZE = 32; // SOL transfer instruction size

// Base64 encoding overhead (4 bytes for every 3 bytes of data)
const BASE64_OVERHEAD = 4 / 3;

// Dummy values for size calculation
const DUMMY_BLOCKHASH = {
  blockhash:
    "1111111111111111111111111111111111111111111111111111111111111111" as Blockhash,
  lastValidBlockHeight: 1n,
} as const;
const DUMMY_MINT = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const DUMMY_FEE = 5000;
const DUMMY_COMPUTE_UNITS = 200_000;

async function createDummyTransferInstruction(
  signer: TransactionSigner
): Promise<IInstruction<string>> {
  return getTransferSolInstruction({
    source: signer,
    destination: signer.address,
    amount: 1n,
  });
}

async function createDummySPLTransferInstruction(
  feePayer: string
): Promise<IInstruction<string>> {
  const [tokenAccount] = await findAssociatedTokenPda({
    mint: DUMMY_MINT,
    owner: address(feePayer),
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  return getTransferInstruction({
    source: tokenAccount,
    destination: tokenAccount,
    authority: address(feePayer),
    amount: 1n,
  });
}

async function createDummyCloseAccountInstruction(signer: TransactionSigner) {
  return getCloseAccountInstruction({
    account: signer.address,
    destination: signer.address,
    owner: signer.address,
  });
}

export async function getTransactionSize(
  signer: TransactionSigner,
  instructions: IInstruction<string>[],
  lookupTables: AddressesByLookupTableAddress,
  options: {
    isFirstTransaction?: boolean;
    isSolInput?: boolean;
    isLastTransaction?: boolean;
    isLiquidation?: {
      numCloseAccounts: number;
    };
  } = {}
): Promise<number> {
  try {
    // Build all instructions array
    const allInstructions = [
      ...instructions,
      getSetComputeUnitLimitInstruction({ units: DUMMY_COMPUTE_UNITS }),
      getSetComputeUnitPriceInstruction({ microLamports: DUMMY_FEE }),
    ];

    // Add special instructions for first/last transaction
    if (options.isFirstTransaction) {
      if (options.isSolInput) {
        const solTransfer = await createDummyTransferInstruction(signer);
        allInstructions.push(solTransfer);
      } else {
        const splTransfer = await createDummySPLTransferInstruction(
          signer.address
        );
        allInstructions.push(splTransfer);
      }
    }
    if (options.isLastTransaction) {
      const solTransfer = await createDummyTransferInstruction(signer);
      allInstructions.push(solTransfer);
    }
    if (options.isLiquidation) {
      for (let i = 0; i < options.isLiquidation.numCloseAccounts; i++) {
        const closeAccount = await createDummyCloseAccountInstruction(signer);
        allInstructions.push(closeAccount);
      }
    }

    // Build and compress transaction message
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayer(signer.address, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(DUMMY_BLOCKHASH, tx),
      (tx) => appendTransactionMessageInstructions(allInstructions, tx)
    );

    const messageWithLookupTables =
      compressTransactionMessageUsingAddressLookupTables(message, lookupTables);

    // Get encoded size
    const compiledMessage = compileTransaction(messageWithLookupTables);
    const wireTransaction = getBase64EncodedWireTransaction(compiledMessage);

    return wireTransaction.length;
  } catch (error) {
    console.error("Error calculating transaction size:", error);
    throw error;
  }
}

export async function canFitInTransaction(
  signer: TransactionSigner,
  instructions: IInstruction<string>[],
  lookupTables: AddressesByLookupTableAddress,
  options: {
    isFirstTransaction?: boolean;
    isSolInput?: boolean;
    isLastTransaction?: boolean;
    isLiquidation?: {
      numCloseAccounts: number;
    };
  } = {}
): Promise<boolean> {
  const encodedSize = await getTransactionSize(
    signer,
    instructions,
    lookupTables,
    options
  );

  return encodedSize <= ENCODED_TX_SIZE_LIMIT;
}
