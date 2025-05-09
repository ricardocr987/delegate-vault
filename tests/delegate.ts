import { describe, test, expect, beforeAll } from "bun:test";
import * as anchor from "@coral-xyz/anchor";
import { Program, translateAddress } from "@coral-xyz/anchor";
import { DelegateVault } from "../target/types/delegate_vault";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  PublicKey,
  Connection,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { assert } from "chai";
import { rpc } from "../utils/solana/rpc";
import { prepareTransaction } from "../utils/solana/transaction/prepare";
import {
  base64Encoder,
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
  transactionDecoder,
  USDC_MINT,
  SOL_MINT,
  ASSOCIATED_TOKEN_PROGRAM,
  JUPITER_PROGRAM,
} from "../utils/solana/constants";
import {
  getBase64EncodedWireTransaction,
  partiallySignTransaction,
  address,
  createKeyPairFromBytes,
  getAddressFromPublicKey,
  signTransaction,
} from "@solana/kit";
import { toInstruction } from "../utils/solana/transaction/instructions/toInstruction";
import { Decimal } from "decimal.js";
import { IInstruction } from "@solana/kit";
import {
  getOrderAddress,
  getOrderVaultAddress,
  getTokenVaultAddress,
  getProjectAddress,
  getTickArrayAddress,
  getWhirlpoolAddress,
  getPositionAddress,
  getAtaAddress,
  getManagerAddress,
} from "../utils/solana/pda";
import { generateKeyPair, Address } from "@solana/kit";
import { confirmTransaction } from "../utils/solana/transaction/confirm";
import * as fs from "fs";
import * as path from "path";
import bs58 from "bs58";
import ky from "ky";
import {
  JupiterQuoteResponse,
  JupiterSwapData,
} from "../utils/solana/transaction/instructions/swap";
import { getLookupTables } from "../utils/solana/fetcher/getLookupTables";

// --- Test Setup ---
let program: Program<DelegateVault>;
let connection: Connection;
let projectOwner: CryptoKeyPair;
let user: CryptoKeyPair;
let delegate: CryptoKeyPair;
let project: Address;
let manager: Address;
let usdcVault: Address;
let solVault: Address;
let feeVault: Address;
let userUsdcAta: Address;
let userSolAta: Address;
let usdcMint: Address;
let solMint: Address;
let userAddress: Address;
let ephemeralKey: CryptoKeyPair;
let ephemeralKeyAddress: Address;
let orderPda: Address;
let orderVaultPda: Address;
let tokenVaultPda: Address;
let delegateAddress: Address;
let depositAmount = 10_000; // 0.01 USDC
let swapData: JupiterSwapData;
let liquidationSwapData: JupiterSwapData;
let tokenVaultAmount: string;

describe("delegate-vault", () => {
  beforeAll(async () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    program = anchor.workspace.DelegateVault as Program<DelegateVault>;
    connection = provider.connection;

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
    userAddress = await getAddressFromPublicKey(user.publicKey);
    const delegateKeyPair = Keypair.fromSecretKey(
      bs58.decode(keys.delegate.secretKey)
    );
    delegate = await createKeyPairFromBytes(delegateKeyPair.secretKey);

    // Use mainnet mints
    usdcMint = address(USDC_MINT);
    solMint = address(SOL_MINT);

    const projectOwnerAddress = await getAddressFromPublicKey(
      projectOwner.publicKey
    );
    delegateAddress = await getAddressFromPublicKey(delegate.publicKey);

    // Derive PDAs
    project = await getProjectAddress(projectOwnerAddress);
    manager = await getManagerAddress(userAddress, project);
    usdcVault = await getOrderVaultAddress(
      userAddress,
      manager,
      project,
      usdcMint
    );
    solVault = await getTokenVaultAddress(
      userAddress,
      manager,
      project,
      solMint
    );
    feeVault = await getAtaAddress(project, usdcMint);
    userUsdcAta = await getAtaAddress(userAddress, usdcMint);
    userSolAta = await getAtaAddress(userAddress, solMint);

    // Generate ephemeral key for the order
    ephemeralKey = await generateKeyPair();
    ephemeralKeyAddress = await getAddressFromPublicKey(ephemeralKey.publicKey);
    ephemeralKeyAddress = address(
      "8HxoazEDiq6Pd2G7v88wmCdv7kDb6QCauP5FqwXXh9QY"
    );
    console.log("ephemeralKeyAddress", ephemeralKeyAddress.toString());
    orderPda = await getOrderAddress(manager, address(ephemeralKeyAddress));
    orderVaultPda = await getOrderVaultAddress(
      address(userAddress),
      manager,
      orderPda,
      usdcMint
    );
    tokenVaultPda = await getTokenVaultAddress(
      address(userAddress),
      manager,
      orderPda,
      solMint
    );
  });

  describe("Stepwise Delegate Flow", () => {
    test("Deposit funds", async () => {
      const depositInstruction = await program.methods
        .deposit(new BN(depositAmount))
        .accountsPartial({
          signer: translateAddress(userAddress),
          id: translateAddress(ephemeralKeyAddress),
          order: translateAddress(orderPda),
          manager: translateAddress(manager),
          depositMint: translateAddress(usdcMint),
          userAta: translateAddress(userUsdcAta),
          orderVault: translateAddress(orderVaultPda),
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .instruction();
      const instructions = [toInstruction(depositInstruction)];
      const transaction = await prepareTransaction(
        instructions,
        userAddress,
        {}
      );
      const transactionBytes = base64Encoder.encode(transaction);
      const decodedTx = transactionDecoder.decode(transactionBytes);
      const signedTransaction = await partiallySignTransaction(
        [user],
        decodedTx
      );
      const wireTransaction =
        getBase64EncodedWireTransaction(signedTransaction);
      const signature = await confirmTransaction(wireTransaction);
      console.log("Transaction signature (deposit):", signature);
      await new Promise((res) => setTimeout(res, 2000));
    });

    test("Initialize token vault", async () => {
      const initTokenVaultInstruction = await program.methods
        .initTokenVault()
        .accountsPartial({
          signer: translateAddress(userAddress),
          id: translateAddress(ephemeralKeyAddress),
          order: translateAddress(orderPda),
          manager: translateAddress(manager),
          mint: translateAddress(solMint),
          tokenVault: translateAddress(tokenVaultPda),
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .instruction();
      const tx = await prepareTransaction(
        [toInstruction(initTokenVaultInstruction)],
        userAddress,
        {}
      );
      const txBytes = base64Encoder.encode(tx);
      const decoded = transactionDecoder.decode(txBytes);
      const signed = await signTransaction([user], decoded);
      const wire = getBase64EncodedWireTransaction(signed);
      const sig = await confirmTransaction(wire);
      console.log("Transaction signature (init token vault):", sig);
      await new Promise((res) => setTimeout(res, 2000));
    });

    test("Jupiter swap", async () => {
      const quoteResponse = await ky
        .get("https://api.jup.ag/swap/v1/quote", {
          searchParams: {
            inputMint: usdcMint.toString(),
            outputMint: solMint.toString(),
            amount: depositAmount.toString(),
            slippageBps: 50,
          },
        })
        .json<JupiterQuoteResponse>();
      swapData = await ky
        .post("https://api.jup.ag/swap/v1/swap-instructions", {
          json: {
            quoteResponse,
            userPublicKey: manager,
            skipUserAccountsRpcCalls: true,
            wrapAndUnwrapSol: false,
            dynamicComputeUnitLimit: true,
            dynamicSlippage: true,
            destinationTokenAccount: tokenVaultPda.toString(),
            restrictDestinationTokenAccount: true,
            onlyDirectRoutes: true,
          },
          headers: { "x-api-key": process.env.JUPITER_API_KEY },
        })
        .json<JupiterSwapData>();
      const decodedData = Buffer.from(swapData.swapInstruction.data, "base64");
      const serializedData = Buffer.from(Array.from(decodedData));
      const possibleInputAta = await getAtaAddress(manager, usdcMint);
      const possibleOutputAta = await getAtaAddress(manager, solMint);
      const swapRemainingAccounts = (
        swapData.swapInstruction.accounts || []
      ).map((account) => ({
        pubkey: translateAddress(
          account.pubkey == possibleInputAta
            ? orderVaultPda
            : account.pubkey == possibleOutputAta
            ? tokenVaultPda
            : account.pubkey == userAddress
            ? manager
            : account.pubkey
        ),
        isSigner: false,
        isWritable: account.isWritable,
      }));
      const swapInstruction = await program.methods
        .jupSwap(serializedData)
        .accountsPartial({
          signer: translateAddress(userAddress),
          id: translateAddress(ephemeralKeyAddress),
          order: translateAddress(orderPda),
          manager: translateAddress(manager),
          managerVaultA: translateAddress(orderVaultPda),
          managerVaultB: translateAddress(tokenVaultPda),
          jupiterProgram: translateAddress(JUPITER_PROGRAM),
        })
        .remainingAccounts(swapRemainingAccounts)
        .instruction();
      const swapInstructions = [toInstruction(swapInstruction)];
      const lookupTableAddresses = swapData.addressLookupTableAddresses;
      const lookupTableAccounts = await getLookupTables(lookupTableAddresses);
      const swapTransaction = await prepareTransaction(
        swapInstructions,
        userAddress,
        lookupTableAccounts
      );
      const swapTransactionBytes = base64Encoder.encode(swapTransaction);
      const swapDecodedTx = transactionDecoder.decode(swapTransactionBytes);
      const swapSignedTransaction = await signTransaction(
        [user],
        swapDecodedTx
      );
      const swapWireTransaction = getBase64EncodedWireTransaction(
        swapSignedTransaction
      );
      const swapSignature = await confirmTransaction(swapWireTransaction);
      console.log("Transaction signature (swap):", swapSignature);
      await new Promise((res) => setTimeout(res, 2000));
    });

    test("Delegate liquidate", async () => {
      // Get token vault balance
      const tokenVaultAccount = await connection.getTokenAccountBalance(
        new anchor.web3.PublicKey(tokenVaultPda.toString())
      );
      tokenVaultAmount = tokenVaultAccount.value.amount;
      // Get Jupiter swap instructions for liquidation
      const params = new URLSearchParams({
        inputMint: solMint.toString(),
        outputMint: usdcMint.toString(),
        amount: tokenVaultAmount,
        onlyDirectRoutes: "true",
      });
      const liquidationQuoteResponse = await ky
        .get(`https://api.jup.ag/swap/v1/quote?${params}`, {
          headers: { "x-api-key": process.env.JUPITER_API_KEY },
        })
        .json<JupiterQuoteResponse>();
      liquidationSwapData = await ky
        .post("https://api.jup.ag/swap/v1/swap-instructions", {
          json: {
            quoteResponse: liquidationQuoteResponse,
            userPublicKey: manager,
            skipUserAccountsRpcCalls: true,
            wrapAndUnwrapSol: false,
            dynamicComputeUnitLimit: true,
            dynamicSlippage: true,
            destinationTokenAccount: orderVaultPda.toString(),
            restrictDestinationTokenAccount: true,
            onlyDirectRoutes: true,
          },
          headers: { "x-api-key": process.env.JUPITER_API_KEY },
        })
        .json<JupiterSwapData>();
      const liquidationDecodedData = Buffer.from(
        liquidationSwapData.swapInstruction.data,
        "base64"
      );
      const liquidationSerializedData = Buffer.from(
        Array.from(liquidationDecodedData)
      );
      const liquidationPossibleInputAta = await getAtaAddress(manager, solMint);
      const liquidationPossibleOutputAta = await getAtaAddress(
        manager,
        usdcMint
      );
      const liquidationRemainingAccounts = (
        liquidationSwapData.swapInstruction.accounts || []
      ).map((account) => ({
        pubkey: translateAddress(
          account.pubkey == liquidationPossibleOutputAta
            ? orderVaultPda
            : account.pubkey == liquidationPossibleInputAta
            ? tokenVaultPda
            : account.pubkey == userAddress
            ? manager
            : account.pubkey
        ),
        isSigner: false,
        isWritable: account.isWritable,
      }));
      const liquidateInstruction = await program.methods
        .jupLiquidate(liquidationSerializedData)
        .accountsPartial({
          signer: translateAddress(delegateAddress),
          user: translateAddress(userAddress),
          id: translateAddress(ephemeralKeyAddress),
          order: translateAddress(orderPda),
          manager: translateAddress(manager),
          managerVaultA: translateAddress(tokenVaultPda),
          managerVaultB: translateAddress(orderVaultPda),
          jupiterProgram: translateAddress(JUPITER_PROGRAM),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(liquidationRemainingAccounts)
        .instruction();
      const liquidateInstructions = [toInstruction(liquidateInstruction)];
      const lookupTableAddresses =
        liquidationSwapData.addressLookupTableAddresses;
      const lookupTableAccounts = await getLookupTables(lookupTableAddresses);
      const liquidateTransaction = await prepareTransaction(
        liquidateInstructions,
        userAddress,
        lookupTableAccounts
      );
      const liquidateTransactionBytes =
        base64Encoder.encode(liquidateTransaction);
      const liquidateDecodedTx = transactionDecoder.decode(
        liquidateTransactionBytes
      );
      const liquidateSignedTransaction = await signTransaction(
        [delegate],
        liquidateDecodedTx
      );
      const liquidateWireTransaction = getBase64EncodedWireTransaction(
        liquidateSignedTransaction
      );
      const liquidateSignature = await confirmTransaction(
        liquidateWireTransaction
      );
      console.log("Transaction signature (liquidate):", liquidateSignature);
      await new Promise((res) => setTimeout(res, 2000));
    });

    test("Withdraw funds (should fail for delegate)", async () => {
      try {
        const withdrawInstruction = await program.methods
          .withdraw()
          .accountsPartial({
            signer: translateAddress(delegateAddress),
            id: translateAddress(ephemeralKeyAddress),
            order: translateAddress(orderPda),
            manager: translateAddress(manager),
            project: translateAddress(project),
            depositMint: translateAddress(usdcMint),
            userAta: translateAddress(userUsdcAta),
            orderVault: translateAddress(orderVaultPda),
            feeVault: translateAddress(feeVault),
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .instruction();
        const withdrawInstructions = [toInstruction(withdrawInstruction)];
        const withdrawTransaction = await prepareTransaction(
          withdrawInstructions,
          delegateAddress,
          {}
        );
        const withdrawSignature = await confirmTransaction(withdrawTransaction);
        console.log(
          "Transaction signature (withdraw attempt):",
          withdrawSignature
        );
        throw new Error("Delegate should not be able to withdraw funds");
      } catch (error) {
        expect(error.message).toContain("IncorrectSigner");
      }
    });
  });
  test("Withdraw funds", async () => {
    const withdrawInstruction = await program.methods
      .withdraw()
      .accountsPartial({
        signer: translateAddress(userAddress),
        id: translateAddress(ephemeralKeyAddress),
        order: translateAddress(orderPda),
        manager: translateAddress(manager),
        project: translateAddress(project),
        depositMint: translateAddress(usdcMint),
        userAta: translateAddress(userUsdcAta),
        orderVault: translateAddress(orderVaultPda),
        feeVault: translateAddress(feeVault),
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM,
      })
      .instruction();
    const withdrawInstructions = [toInstruction(withdrawInstruction)];
    const withdrawTransaction = await prepareTransaction(
      withdrawInstructions,
      userAddress,
      {}
    );
    const withdrawTransactionBytes = base64Encoder.encode(withdrawTransaction);
    const withdrawDecodedTx = transactionDecoder.decode(
      withdrawTransactionBytes
    );
    const withdrawSignedTransaction = await signTransaction(
      [user],
      withdrawDecodedTx
    );
    const withdrawWireTransaction = getBase64EncodedWireTransaction(
      withdrawSignedTransaction
    );
    const withdrawSignature = await confirmTransaction(withdrawWireTransaction);
    console.log("Transaction signature (withdraw):", withdrawSignature);
    await new Promise((res) => setTimeout(res, 2000));
  });
});
