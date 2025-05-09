import { describe, test, expect, beforeAll } from "bun:test";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { DelegateVault } from "../target/types/delegate_vault";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  JUPITER_PROGRAM,
  base64Encoder,
  transactionDecoder,
  ASSOCIATED_TOKEN_PROGRAM,
} from "../utils/solana/constants";
import ky from "ky";
import {
  getOrderAddress,
  getOrderVaultAddress,
  getTokenVaultAddress,
  getProjectAddress,
  getManagerAddress,
} from "../utils/solana/pda";
import {
  generateKeyPair,
  address,
  Address,
  getAddressFromPublicKey,
  signTransaction,
} from "@solana/kit";
import { JupiterSwapData } from "../utils/solana/transaction/instructions/swap";
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
import { getAtaAddress } from "../utils/solana/pda";
import { createKeyPairFromBytes } from "@solana/kit";
import { translateAddress } from "@coral-xyz/anchor";
import { getLookupTables } from "../utils/solana/fetcher/getLookupTables";

interface JupiterQuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: number;
  marketInfos: Array<{
    id: string;
    label: string;
    inputMint: string;
    outputMint: string;
    notEnoughLiquidity: boolean;
    inAmount: string;
    outAmount: string;
    minInAmount?: string;
    minOutAmount?: string;
    priceImpactPct: number;
    lpFee: {
      amount: string;
      mint: string;
      pct: number;
    };
    platformFee: {
      amount: string;
      mint: string;
      pct: number;
    };
  }>;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot: number;
  timeTaken: number;
}

describe("jupiter operations", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.DelegateVault as Program<DelegateVault>;
  const connection = provider.connection;

  // These will be set by the setup in index.ts
  let projectOwner: CryptoKeyPair;
  let user: CryptoKeyPair;
  let delegate: CryptoKeyPair;
  let usdcMint: Address = USDC_MINT;
  let solMint: Address = SOL_MINT;
  let usdcVault: Address;
  let solVault: Address;
  let userUsdcAta: Address;
  let userSolAta: Address;
  let feeVault: Address;
  let manager: Address;
  let project: Address;

  let orderIdKeypair: CryptoKeyPair;
  let orderId: Address;
  let orderAddress: Address;
  let orderVaultAddress: Address;
  let tokenVaultAddress: Address;
  let userAddress: Address;
  let depositAmount: number;
  let swapData: JupiterSwapData;
  let liquidationSwapData: JupiterSwapData;
  let tokenVaultAmount: string;

  describe("Jupiter Flow (stepwise)", () => {
    const DEPOSIT_AMOUNT = 10_000; // 0.01 USDC in base units
    const DEPOSIT_MINT = usdcMint;

    beforeAll(async () => {
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
      projectOwner = await createKeyPairFromBytes(
        projectOwnerKeyPair.secretKey
      );
      const userKeyPair = Keypair.fromSecretKey(
        bs58.decode(keys.user.secretKey)
      );
      user = await createKeyPairFromBytes(userKeyPair.secretKey);
      const delegateKeyPair = Keypair.fromSecretKey(
        bs58.decode(keys.delegate.secretKey)
      );
      userAddress = await getAddressFromPublicKey(user.publicKey);
      delegate = await createKeyPairFromBytes(delegateKeyPair.secretKey);

      // Use mainnet mints
      usdcMint = address(USDC_MINT);
      solMint = address(SOL_MINT);

      const projectOwnerAddress = await getAddressFromPublicKey(
        projectOwner.publicKey
      );

      // Derive PDAs
      project = await getProjectAddress(projectOwnerAddress);
      manager = await getManagerAddress(userAddress, project);
      feeVault = await getAtaAddress(project, usdcMint);
      userUsdcAta = await getAtaAddress(userAddress, usdcMint);
      userSolAta = await getAtaAddress(userAddress, solMint);
      orderIdKeypair = await generateKeyPair();
      orderId = await getAddressFromPublicKey(orderIdKeypair.publicKey);
      console.log("orderId", orderId.toString());
      orderAddress = await getOrderAddress(manager, orderId);
      orderVaultAddress = await getOrderVaultAddress(
        userAddress,
        manager,
        orderAddress,
        DEPOSIT_MINT
      );
      console.log("orderVaultAddress", orderVaultAddress.toString());
      tokenVaultAddress = await getTokenVaultAddress(
        userAddress,
        manager,
        orderAddress,
        SOL_MINT
      );
      console.log("tokenVaultAddress", tokenVaultAddress.toString());
      depositAmount = DEPOSIT_AMOUNT;
    });

    test("Deposit funds", async () => {
      console.log("depositAmount", depositAmount);
      console.log("userUsdcAta", userUsdcAta.toString());
      console.log("orderVaultAddress", orderVaultAddress.toString());
      console.log("userAddress", userAddress.toString());
      console.log("orderId", orderId.toString());
      console.log("orderAddress", orderAddress.toString());
      console.log("manager", manager.toString());
      console.log("DEPOSIT_MINT", DEPOSIT_MINT.toString());
      const depositInstruction = await program.methods
        .deposit(new BN(depositAmount))
        .accountsPartial({
          signer: address(userAddress),
          id: address(orderId),
          order: address(orderAddress),
          manager: address(manager),
          depositMint: address(DEPOSIT_MINT),
          userAta: address(userUsdcAta),
          orderVault: address(orderVaultAddress),
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
      const signedTransaction = await signTransaction([user], decodedTx);
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
          id: translateAddress(orderId),
          order: translateAddress(orderAddress),
          manager: translateAddress(manager),
          mint: translateAddress(solMint),
          tokenVault: translateAddress(tokenVaultAddress),
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
          },
          headers: { "x-api-key": process.env.JUPITER_API_KEY },
        })
        .json<JupiterQuoteResponse>();
      const possibleInputAta = await getAtaAddress(manager, DEPOSIT_MINT);
      const possibleOutputAta = await getAtaAddress(manager, solMint);
      swapData = await ky
        .post("https://api.jup.ag/swap/v1/swap-instructions", {
          json: {
            quoteResponse,
            userPublicKey: manager,
            skipUserAccountsRpcCalls: true,
            wrapAndUnwrapSol: false,
            dynamicComputeUnitLimit: true,
            dynamicSlippage: true,
            destinationTokenAccount: tokenVaultAddress,
            useSharedAccounts: false,
            restrictDestinationTokenAccount: true,
            onlyDirectRoutes: true,
          },
          headers: { "x-api-key": process.env.JUPITER_API_KEY },
        })
        .json<JupiterSwapData>();
      const decodedData = Buffer.from(swapData.swapInstruction.data, "base64");
      const serializedData = Buffer.from(Array.from(decodedData));
      const swapRemainingAccounts = (
        swapData.swapInstruction.accounts || []
      ).map((account) => ({
        pubkey: translateAddress(
          account.pubkey == possibleInputAta
            ? orderVaultAddress
            : account.pubkey == possibleOutputAta
            ? tokenVaultAddress
            : account.pubkey == userAddress
            ? manager
            : account.pubkey
        ),
        isSigner: false,
        isWritable: account.isWritable,
      }));
      const accounts = {
        signer: translateAddress(userAddress),
        id: translateAddress(orderId),
        order: translateAddress(orderAddress),
        manager: translateAddress(manager),
        managerVaultA: translateAddress(orderVaultAddress),
        managerVaultB: translateAddress(tokenVaultAddress),
        jupiterProgram: translateAddress(JUPITER_PROGRAM),
      };
      const swapInstruction = await program.methods
        .jupSwap(serializedData)
        .accountsPartial({ ...accounts })
        .remainingAccounts(swapRemainingAccounts)
        .instruction();
      const swapInstructions = [toInstruction(swapInstruction)];
      const lookupTableAccounts = await getLookupTables(
        swapData.addressLookupTableAddresses
      );
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

    test("Liquidate", async () => {
      const tokenVaultAccount = await connection.getTokenAccountBalance(
        new anchor.web3.PublicKey(tokenVaultAddress.toString())
      );
      tokenVaultAmount = tokenVaultAccount.value.amount;
      const params = new URLSearchParams({
        inputMint: solMint.toString(),
        outputMint: usdcMint.toString(),
        amount: tokenVaultAmount,
      });
      const liquidationQuoteResponse = await ky
        .get(`https://api.jup.ag/swap/v1/quote?${params}`, {
          headers: { "x-api-key": process.env.JUPITER_API_KEY },
        })
        .json<JupiterQuoteResponse>();
      const liquidationPossibleInputAta = await getAtaAddress(manager, solMint);
      const liquidationPossibleOutputAta = await getAtaAddress(
        manager,
        DEPOSIT_MINT
      );
      liquidationSwapData = await ky
        .post("https://api.jup.ag/swap/v1/swap-instructions", {
          json: {
            quoteResponse: liquidationQuoteResponse,
            userPublicKey: manager,
            skipUserAccountsRpcCalls: true,
            wrapAndUnwrapSol: false,
            dynamicComputeUnitLimit: true,
            dynamicSlippage: true,
            destinationTokenAccount: orderVaultAddress,
            useSharedAccounts: false,
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
      const liquidationRemainingAccounts = (
        liquidationSwapData.swapInstruction.accounts || []
      ).map((account) => ({
        pubkey: translateAddress(
          account.pubkey == liquidationPossibleOutputAta
            ? orderVaultAddress
            : account.pubkey == liquidationPossibleInputAta
            ? tokenVaultAddress
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
          signer: translateAddress(userAddress),
          user: translateAddress(userAddress),
          id: translateAddress(orderId),
          order: translateAddress(orderAddress),
          manager: translateAddress(manager),
          managerVaultA: translateAddress(tokenVaultAddress),
          managerVaultB: translateAddress(orderVaultAddress),
          jupiterProgram: translateAddress(JUPITER_PROGRAM),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(liquidationRemainingAccounts)
        .instruction();
      const liquidateInstructions = [toInstruction(liquidateInstruction)];
      const lookupTableAccountsLiquidate = await getLookupTables(
        liquidationSwapData.addressLookupTableAddresses
      );
      const liquidateTransaction = await prepareTransaction(
        liquidateInstructions,
        userAddress,
        lookupTableAccountsLiquidate
      );
      const liquidateTransactionBytes =
        base64Encoder.encode(liquidateTransaction);
      const liquidateDecodedTx = transactionDecoder.decode(
        liquidateTransactionBytes
      );
      const liquidateSignedTransaction = await signTransaction(
        [user],
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

    test("Withdraw funds", async () => {
      const withdrawInstruction = await program.methods
        .withdraw()
        .accountsPartial({
          signer: translateAddress(userAddress),
          id: translateAddress(orderId),
          order: translateAddress(orderAddress),
          manager: translateAddress(manager),
          project: translateAddress(project),
          depositMint: translateAddress(DEPOSIT_MINT),
          userAta: translateAddress(userUsdcAta),
          orderVault: translateAddress(orderVaultAddress),
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
      const withdrawTransactionBytes =
        base64Encoder.encode(withdrawTransaction);
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
      const withdrawSignature = await confirmTransaction(
        withdrawWireTransaction
      );
      console.log("Transaction signature (withdraw):", withdrawSignature);
      await new Promise((res) => setTimeout(res, 2000));
    });
  });
});
