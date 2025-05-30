 AccountInfo<'info>import { describe, test, expect, beforeAll } from "bun:test";
import * as anchor from "@coral-xyz/anchor";
import { Program, translateAddress } from "@coral-xyz/anchor";
import { DelegateVault } from "../target/types/delegate_vault";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, SystemProgram } from "@solana/web3.js";
import {
  USDC_MINT,
  SOL_MINT,
  ASSOCIATED_TOKEN_PROGRAM,
} from "../utils/solana/constants";
import {
  getManagerAddress,
  getAtaAddress,
  getProjectAddress,
} from "../utils/solana/pda";
import {
  address,
  Address,
  createKeyPairFromBytes,
  getAddressFromPublicKey,
  getBase64Encoder,
  getBase64Decoder,
  getBase58Decoder,
  getTransactionDecoder,
  getCompiledTransactionMessageDecoder,
  getTransactionEncoder,
  partiallySignTransaction,
  getBase64EncodedWireTransaction,
} from "@solana/kit";
import * as fs from "fs";
import * as path from "path";
import bs58 from "bs58";
import { prepareTransaction } from "../utils/solana/transaction/prepare";
import { confirmTransaction } from "../utils/solana/transaction/confirm";
import { toInstruction } from "../utils/solana/transaction/instructions/toInstruction";

// Initialize encoders/decoders
export const base64Encoder = getBase64Encoder();
export const base64Decoder = getBase64Decoder();
export const base58Decoder = getBase58Decoder();
export const transactionDecoder = getTransactionDecoder();
export const transactionEncoder = getTransactionEncoder();
export const compiledTransactionMessageDecoder =
  getCompiledTransactionMessageDecoder();

describe("delegate-vault setup", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.DelegateVault as Program<DelegateVault>;

  // These will be set by the setup
  let projectOwner: CryptoKeyPair;
  let user: CryptoKeyPair;
  let delegate: CryptoKeyPair;
  let projectOwnerAddress: Address;
  let userAddress: Address;
  let delegateAddress: Address;
  let project: Address;
  let usdcMint: Address;
  let solMint: Address;
  let usdcVault: Address;
  let solVault: Address;
  let userUsdcAta: Address;
  let userSolAta: Address;
  let feeVault: Address;
  let manager: Address;

  beforeAll(async () => {
    // Load keypairs from file
    const keysPath = path.join(
      __dirname,
      "..",
      "tests",
      "keys",
      "test-keys.json"
    );
    const keys = JSON.parse(fs.readFileSync(keysPath, "utf8"));

    const projectOwnerKeyPair = Keypair.fromSecretKey(
      bs58.decode(keys.projectOwner.secretKey)
    );
    projectOwner = await createKeyPairFromBytes(projectOwnerKeyPair.secretKey);
    const userKeyPair = Keypair.fromSecretKey(bs58.decode(keys.user.secretKey));
    user = await createKeyPairFromBytes(userKeyPair.secretKey);
    const delegateKeyPair = Keypair.fromSecretKey(
      bs58.decode(keys.delegate.secretKey)
    );
    delegate = await createKeyPairFromBytes(delegateKeyPair.secretKey);

    // Use mainnet mints
    usdcMint = address(USDC_MINT);
    solMint = address(SOL_MINT);

    projectOwnerAddress = await getAddressFromPublicKey(projectOwner.publicKey);
    userAddress = await getAddressFromPublicKey(user.publicKey);
    delegateAddress = await getAddressFromPublicKey(delegate.publicKey);

    // Derive PDAs
    project = await getProjectAddress(projectOwnerAddress);
    manager = await getManagerAddress(project, userAddress);
    usdcVault = await getAtaAddress(project, usdcMint);
    solVault = await getAtaAddress(project, solMint);
    feeVault = await getAtaAddress(project, usdcMint);
  });

  describe("Project Setup", () => {
    test("Initializes project with correct fee", async () => {
      console.log("projectOwnerAddress", projectOwnerAddress);
      console.log("project", project);
      console.log("solMint", solMint);
      console.log("usdcMint", usdcMint);
      console.log("usdcVault", usdcVault);
      console.log("solVault", solVault);

      const initProjectInstruction = await program.methods
        .initProject(150) // 1.5% fee
        .accountsPartial({
          signer: translateAddress(projectOwnerAddress),
          project: translateAddress(project),
          solMint: translateAddress(solMint),
          usdcMint: translateAddress(usdcMint),
          usdcVault: translateAddress(usdcVault),
          solVault: translateAddress(solVault),
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
          tokenProgram: translateAddress(TOKEN_PROGRAM_ID),
          associatedTokenProgram: translateAddress(ASSOCIATED_TOKEN_PROGRAM),
        })
        .instruction();

      // Convert to IInstruction format
      const instructions = [toInstruction(initProjectInstruction)];

      // Prepare transaction
      const transaction = await prepareTransaction(
        instructions,
        projectOwnerAddress,
        {} // No lookup tables needed for this transaction
      );

      // Sign transaction
      const transactionBytes = base64Encoder.encode(transaction);
      const decodedTx = transactionDecoder.decode(transactionBytes);
      const signedTransaction = await partiallySignTransaction(
        [projectOwner],
        decodedTx
      );
      const wireTransaction =
        getBase64EncodedWireTransaction(signedTransaction);

      // Sign and confirm transaction
      const signature = await confirmTransaction(wireTransaction);
      console.log("Transaction signature (init project):", signature);
      await delay(1000);

      const projectAccount = await program.account.config.fetch(
        anchor.translateAddress(project)
      );
      expect(projectAccount.authority.toString()).toBe(projectOwnerAddress);
      expect(projectAccount.performanceFee).toBe(150);
    });

    test("Edits project fee", async () => {
      const editFeeInstruction = await program.methods
        .editProjectFee(200) // 2% fee
        .accountsPartial({
          signer: translateAddress(projectOwnerAddress),
          project: translateAddress(project),
        })
        .instruction();

      // Convert to IInstruction format
      const instructions = [toInstruction(editFeeInstruction)];

      // Prepare transaction
      const transaction = await prepareTransaction(
        instructions,
        projectOwnerAddress,
        {} // No lookup tables needed for this transaction
      );

      // Sign transaction
      const transactionBytes = base64Encoder.encode(transaction);
      const decodedTx = transactionDecoder.decode(transactionBytes);
      const signedTransaction = await partiallySignTransaction(
        [projectOwner],
        decodedTx
      );
      const wireTransaction =
        getBase64EncodedWireTransaction(signedTransaction);

      // Sign and confirm transaction
      const signature = await confirmTransaction(wireTransaction);
      console.log("Transaction signature (edit fee):", signature);
      await delay(1000);

      const projectAccount = await program.account.config.fetch(
        anchor.translateAddress(project)
      );
      expect(projectAccount.performanceFee).toBe(200);
    });
  });
});

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
