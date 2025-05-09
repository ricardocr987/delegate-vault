import { describe, test, expect, beforeAll } from "bun:test";
import * as anchor from "@coral-xyz/anchor";
import { Program, translateAddress } from "@coral-xyz/anchor";
import { DelegateVault } from "../target/types/delegate_vault";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import {
  USDC_MINT,
  ASSOCIATED_TOKEN_PROGRAM,
  DELEGATE_VAULT_PROGRAM,
  base64Encoder,
  transactionDecoder,
} from "../utils/solana/constants";
import {
  address,
  getProgramDerivedAddress,
  Address,
  generateKeyPair,
  getBase64Encoder,
  getBase64Decoder,
  getBase58Decoder,
  getTransactionDecoder,
  getCompiledTransactionMessageDecoder,
  getTransactionEncoder,
  partiallySignTransaction,
  getBase64EncodedWireTransaction,
  createKeyPairFromBytes,
  getAddressFromPublicKey,
} from "@solana/kit";
import {
  getProjectAddress,
  getManagerAddress,
  getAtaAddress,
} from "../utils/solana/pda";
import { Keypair } from "@solana/web3.js";
import { prepareTransaction } from "../utils/solana/transaction/prepare";
import { confirmTransaction } from "../utils/solana/transaction/confirm";
import { toInstruction } from "../utils/solana/transaction/instructions/toInstruction";
import * as fs from "fs";
import * as path from "path";
import bs58 from "bs58";

describe("fee operations", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.DelegateVault as Program<DelegateVault>;
  const connection = provider.connection;

  // These will be set by the setup in index.ts
  let projectOwner: CryptoKeyPair;
  let user: CryptoKeyPair;
  let usdcMint: Address;
  let projectOwnerAta: Address;
  let feeVault: Address;
  let project: Address;

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

    // Use mainnet mints
    usdcMint = address(USDC_MINT);

    const projectOwnerAddress = await getAddressFromPublicKey(
      projectOwner.publicKey
    );
    const userAddress = await getAddressFromPublicKey(user.publicKey);

    // Derive PDAs
    project = await getProjectAddress(projectOwnerAddress);
    feeVault = await getAtaAddress(project, usdcMint);
    projectOwnerAta = await getAtaAddress(projectOwnerAddress, usdcMint);
    console.log("projectOwnerAddress", projectOwnerAddress);
    console.log("project", project);
    console.log("feeVault", feeVault);
    console.log("projectOwnerAta", projectOwnerAta);
  });

  describe("Fee Operations", () => {
    test("Project owner can withdraw fees", async () => {
      const projectOwnerAddress = await getAddressFromPublicKey(
        projectOwner.publicKey
      );
      const withdrawFeesInstruction = await program.methods
        .withdrawFees()
        .accountsPartial({
          signer: translateAddress(projectOwnerAddress),
          project: translateAddress(project),
          projectOwnerAta: translateAddress(projectOwnerAta),
          feeVault: translateAddress(feeVault),
          mint: translateAddress(usdcMint),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      // Convert to IInstruction format
      const instructions = [toInstruction(withdrawFeesInstruction)];

      // Prepare transaction
      const transaction = await prepareTransaction(
        instructions,
        projectOwnerAddress,
        {} // No lookup tables needed for this transaction
      );

      // Remove local encoder/decoder initialization since we're using the ones from constants
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
      console.log("Transaction signature (withdraw fees):", signature);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify the fee withdrawal was successful
      const feeVaultBalance = await connection.getTokenAccountBalance(
        new anchor.web3.PublicKey(feeVault.toString())
      );
      expect(feeVaultBalance.value.uiAmount).toBe(0);
    });
  });
});
