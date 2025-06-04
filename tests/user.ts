import { describe, test, expect, beforeAll } from "bun:test";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { DelegateVault } from "../target/types/delegate_vault";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { SystemProgram, PublicKey, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM,
  base64Encoder,
  SQUADS_PERFORMANCE_ADDRESS,
  transactionDecoder,
} from "../utils/solana/constants";
import {
  getOrderAddress,
  getOrderVaultAddress,
  getTokenVaultAddress,
  getManagerAddress,
  getAtaAddress,
  getConfigAddress,
} from "../utils/solana/pda";
import {
  generateKeyPair,
  address,
  Address,
  createKeyPairFromBytes,
  getAddressFromPublicKey,
  signTransaction,
} from "@solana/kit";
import { prepareTransaction } from "../utils/solana/transaction/prepare";
import { confirmTransaction } from "../utils/solana/transaction/confirm";
import { toInstruction } from "../utils/solana/transaction/instructions/toInstruction";
import {
  getBase64EncodedWireTransaction,
  partiallySignTransaction,
} from "@solana/kit";
import * as fs from "fs";
import * as path from "path";
import bs58 from "bs58";
import { USDC_MINT, SOL_MINT } from "../utils/solana/constants";
import { translateAddress } from "@coral-xyz/anchor";

describe("user operations", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.DelegateVault as Program<DelegateVault>;
  const connection = provider.connection;

  // These will be set by the setup
  let user: CryptoKeyPair;
  let delegate: CryptoKeyPair;
  let usdcMint: Address;
  let solMint: Address;
  let userUsdcAta: Address;
  let userSolAta: Address;
  let feeVault: Address;
  let manager: Address;
  let config: Address;
  let userAddress: Address;
  let ephemeralKey: CryptoKeyPair;
  let ephemeralKeyAddress: Address;
  let orderPda: Address;
  let orderVaultPda: Address;
  let delegateAddress: Address;

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

    const userKeyPair = Keypair.fromSecretKey(bs58.decode(keys.user.secretKey));
    user = await createKeyPairFromBytes(userKeyPair.secretKey);
    userAddress = await getAddressFromPublicKey(user.publicKey);
    const delegateKeyPair = Keypair.fromSecretKey(
      bs58.decode(keys.delegate.secretKey)
    );
    delegate = await createKeyPairFromBytes(delegateKeyPair.secretKey);

    // Use mainnet mints
    usdcMint = address(USDC_MINT);
    solMint = address(SOL_MINT);

    delegateAddress = await getAddressFromPublicKey(delegate.publicKey);

    // Derive PDAs
    config = await getConfigAddress();
    manager = await getManagerAddress(userAddress);
    feeVault = await getAtaAddress(SQUADS_PERFORMANCE_ADDRESS, usdcMint);
    userUsdcAta = await getAtaAddress(userAddress, usdcMint);
    userSolAta = await getAtaAddress(userAddress, solMint);

    ephemeralKey = await generateKeyPair();
    ephemeralKeyAddress = await getAddressFromPublicKey(ephemeralKey.publicKey);
    console.log("orderId", ephemeralKeyAddress);
    orderPda = await getOrderAddress(manager, address(ephemeralKeyAddress));
    orderVaultPda = await getOrderVaultAddress(
      userAddress,
      manager,
      orderPda,
      usdcMint
    );
  });

  describe("User Operations", () => {
    test("Initializes manager for user", async () => {
      const initManagerInstruction = await program.methods
        .initManager()
        .accountsPartial({
          signer: translateAddress(userAddress),
          delegate: translateAddress(delegateAddress),
          manager: translateAddress(manager.toString()),
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Convert to IInstruction format
      const instructions = [toInstruction(initManagerInstruction)];

      // Prepare transaction
      const transaction = await prepareTransaction(
        instructions,
        userAddress,
        {} // No lookup tables needed for this transaction
      );
      const transactionBytes = base64Encoder.encode(transaction);
      const decodedTx = transactionDecoder.decode(transactionBytes);
      const signedTransaction = await partiallySignTransaction(
        [user],
        decodedTx
      );
      const wireTransaction =
        getBase64EncodedWireTransaction(signedTransaction);

      // Sign and confirm transaction
      const signature = await confirmTransaction(wireTransaction);
      console.log("Transaction signature (init manager):", signature);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const managerAccount = await program.account.manager.fetch(
        translateAddress(manager.toString())
      );
      expect(managerAccount.authority.toString()).toBe(userAddress);
      expect(managerAccount.delegate.toString()).toBe(delegateAddress);
    });

    test("Deposits funds into the vault", async () => {
      const orderPda = await getOrderAddress(
        manager,
        address(ephemeralKeyAddress)
      );
      const orderVaultPda = await getOrderVaultAddress(
        userAddress,
        manager,
        orderPda,
        usdcMint
      );

      const depositInstruction = await program.methods
        .deposit(new BN(10000)) // 0.01 USDC
        .accountsPartial({
          signer: translateAddress(userAddress),
          id: translateAddress(ephemeralKeyAddress),
          order: orderPda,
          manager: translateAddress(manager.toString()),
          depositMint: usdcMint,
          userAta: userUsdcAta,
          orderVault: orderVaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Convert to IInstruction format
      const instructions = [toInstruction(depositInstruction)];

      // Prepare transaction
      const transaction = await prepareTransaction(
        instructions,
        userAddress,
        {} // No lookup tables needed for this transaction
      );
      const transactionBytes = base64Encoder.encode(transaction);
      const decodedTx = transactionDecoder.decode(transactionBytes);
      const signedTransaction = await signTransaction([user], decodedTx);
      const wireTransaction =
        getBase64EncodedWireTransaction(signedTransaction);

      // Sign and confirm transaction
      const signature = await confirmTransaction(wireTransaction);
      console.log("Transaction signature (deposit):", signature);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const orderAccount = await program.account.order.fetch(
        translateAddress(orderPda.toString())
      );
      expect(orderAccount.id.toString()).toBe(ephemeralKeyAddress);
      expect(orderAccount.manager.toString()).toBe(manager.toString());
      expect(orderAccount.depositMint.toString()).toBe(usdcMint.toString());
      expect(orderAccount.depositAmount.toString()).toBe("10000");
    });

    test("Initializes token vault", async () => {
      const orderPda = await getOrderAddress(
        manager,
        address(ephemeralKeyAddress)
      );
      const tokenVaultPda = await getTokenVaultAddress(
        userAddress,
        manager,
        orderPda,
        solMint
      );

      const initTokenVaultInstruction = await program.methods
        .initTokenVault()
        .accountsPartial({
          signer: translateAddress(userAddress),
          id: translateAddress(ephemeralKeyAddress),
          order: orderPda,
          manager: translateAddress(manager),
          mint: solMint,
          tokenVault: tokenVaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Convert to IInstruction format
      const instructions = [toInstruction(initTokenVaultInstruction)];

      // Prepare transaction
      const transaction = await prepareTransaction(
        instructions,
        userAddress,
        {} // No lookup tables needed for this transaction
      );
      const transactionBytes = base64Encoder.encode(transaction);
      const decodedTx = transactionDecoder.decode(transactionBytes);
      const signedTransaction = await partiallySignTransaction(
        [user],
        decodedTx
      );
      const wireTransaction =
        getBase64EncodedWireTransaction(signedTransaction);

      // Sign and confirm transaction
      const signature = await confirmTransaction(wireTransaction);
      console.log("Transaction signature (init token vault):", signature);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // check account exists
      const tokenVaultBalance = await connection.getTokenAccountBalance(
        translateAddress(tokenVaultPda.toString())
      );
      expect(tokenVaultBalance).toBeDefined();
    });

    test("Withdraws funds from the vault", async () => {
      const performanceReceiver = address(SQUADS_PERFORMANCE_ADDRESS);
      const feeVault = await getAtaAddress(performanceReceiver, usdcMint);

      const withdrawInstruction = await program.methods
        .withdraw()
        .accountsPartial({
          signer: translateAddress(userAddress),
          id: translateAddress(ephemeralKeyAddress),
          order: translateAddress(orderPda),
          manager: translateAddress(manager),
          config: translateAddress(config),
          depositMint: translateAddress(usdcMint),
          userAta: translateAddress(userUsdcAta),
          orderVault: translateAddress(orderVaultPda),
          performanceReceiver: translateAddress(performanceReceiver),
          feeVault: translateAddress(feeVault),
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM,
        })
        .instruction();

      // Convert to IInstruction format
      const instructions = [toInstruction(withdrawInstruction)];

      // Prepare transaction
      const transaction = await prepareTransaction(
        instructions,
        userAddress,
        {} // No lookup tables needed for this transaction
      );
      const transactionBytes = base64Encoder.encode(transaction);
      const decodedTx = transactionDecoder.decode(transactionBytes);
      const signedTransaction = await partiallySignTransaction(
        [user],
        decodedTx
      );
      const wireTransaction =
        getBase64EncodedWireTransaction(signedTransaction);

      // Sign and confirm transaction
      const signature = await confirmTransaction(wireTransaction);
      console.log("Transaction signature (withdraw):", signature);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });
  });
});
