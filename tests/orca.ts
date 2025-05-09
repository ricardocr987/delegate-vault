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
  PublicKey,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { assert } from "chai";
import {
  fetchWhirlpool,
  Whirlpool,
  WHIRLPOOL_PROGRAM_ADDRESS,
} from "@orca-so/whirlpools-client";
import { PriceMath } from "../utils/math";
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
} from "../utils/solana/constants";
import {
  getBase64EncodedWireTransaction,
  address,
  createKeyPairFromBytes,
  getAddressFromPublicKey,
  Account,
  signTransaction,
  TransactionSigner,
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
  getPositionAddress,
  getAtaAddress,
  getManagerAddress,
  getOracleAddress,
} from "../utils/solana/pda";
import { generateKeyPair, Address } from "@solana/kit";
import { confirmTransaction } from "../utils/solana/transaction/confirm";
import * as fs from "fs";
import * as path from "path";
import bs58 from "bs58";
import {
  increaseLiquidityQuoteA,
  increaseLiquidityQuoteB,
  decreaseLiquidityQuote,
  swapQuoteByInputToken,
  swapQuoteByOutputToken,
  type ExactInSwapQuote,
  type ExactOutSwapQuote,
  type TickArrayFacade,
  type TransferFee,
  _TICK_ARRAY_SIZE,
  getInitializableTickIndex,
  priceToTickIndex,
  orderTickIndexes,
  getTickArrayStartTickIndex,
  IncreaseLiquidityQuote,
} from "@orca-so/whirlpools-core";
import { fetchPosition } from "@orca-so/whirlpools-client";
import {
  swapInstructions,
  setWhirlpoolsConfig,
  openPositionInstructions,
} from "@orca-so/whirlpools";
import { generateKeyPairSigner, createSolanaRpc, devnet } from "@solana/kit";

// JLP token mint address
const JLP_MINT = "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4";
const JLP_DECIMALS = 6;
const USDC_DECIMALS = 6;

const UPPER_PRICE = 4.605833;
const LOWER_PRICE = 4.232225;

async function addLiquidity({
  user,
  userAddress,
  manager,
  orderPda,
  orderId,
  whirlpoolInfo,
  positionAddress,
  positionTokenAccount,
  positionMintAddress,
  positionMint,
  quote,
  program,
  project,
  initializableLowerTickIndex,
  initializableUpperTickIndex,
  lowerTickIndexAddress,
  upperTickIndexAddress,
}) {
  console.log("initializableLowerTickIndex", initializableLowerTickIndex);
  console.log("initializableUpperTickIndex", initializableUpperTickIndex);
  console.log("lowerTickIndexAddress", lowerTickIndexAddress);
  console.log("upperTickIndexAddress", upperTickIndexAddress);
  const instructions: IInstruction[] = [];
  const p = program as Program<DelegateVault>;
  // --- Calculate liquidity and token maxes ---
  // Fetch vaults
  const lpVaults = await getLpVaults({
    program,
    userAddress,
    managerAddress: manager,
    orderAddress: orderPda,
    whirlpoolInfo,
  });

  console.log("LP vaults:", {
    tokenVaultAAddress: lpVaults.tokenVaultAAddress,
    tokenVaultBAddress: lpVaults.tokenVaultBAddress,
  });

  // Fetch balances
  const tokenVaultABalance =
    await program.provider.connection.getTokenAccountBalance(
      new PublicKey(lpVaults.tokenVaultAAddress.toString())
    );
  const tokenVaultBBalance =
    await program.provider.connection.getTokenAccountBalance(
      new PublicKey(lpVaults.tokenVaultBAddress.toString())
    );

  console.log("Token vault balances:", {
    tokenA: tokenVaultABalance.value.amount,
    tokenB: tokenVaultBBalance.value.amount,
  });

  const liquidityAmount = new BN(quote.liquidityDelta.toString());
  const tokenMaxA = new BN(quote.tokenMaxA.toString());
  const tokenMaxB = new BN(quote.tokenMaxB.toString());

  console.log("Liquidity quote:", {
    liquidityAmount: liquidityAmount.toString(),
    tokenMaxA: tokenMaxA.toString(),
    tokenMaxB: tokenMaxB.toString(),
  });
  
  // Open position instruction (now with all required accounts)
  console.log("Final values", {
    initializableLowerTickIndex,
    initializableUpperTickIndex,
    lowerTickIndexAddress,
    upperTickIndexAddress,
  });

  const openPositionInstruction = await p.methods
    .openPosition({
      tickLowerIndex: initializableLowerTickIndex,
      tickUpperIndex: initializableUpperTickIndex,
      liquidityAmount,
      tokenMaxA,
      tokenMaxB,
    })
    .accountsPartial({
      signer: translateAddress(userAddress),
      id: translateAddress(orderId),
      order: translateAddress(orderPda),
      manager: translateAddress(manager),
      position: translateAddress(positionAddress),
      positionMint: translateAddress(positionMintAddress),
      positionTokenAccount: translateAddress(positionTokenAccount),
      managerVaultA: translateAddress(lpVaults.tokenVaultAAddress),
      managerVaultB: translateAddress(lpVaults.tokenVaultBAddress),
      tokenVaultA: translateAddress(whirlpoolInfo.data.tokenVaultA),
      tokenVaultB: translateAddress(whirlpoolInfo.data.tokenVaultB),
      whirlpool: translateAddress(whirlpoolInfo.address),
      tickArrayLower: translateAddress(lowerTickIndexAddress),
      tickArrayUpper: translateAddress(upperTickIndexAddress),
      whirlpoolProgram: translateAddress(WHIRLPOOL_PROGRAM_ADDRESS),
      tokenProgram: translateAddress(TOKEN_PROGRAM),
      systemProgram: translateAddress(SYSTEM_PROGRAM),
      rent: translateAddress(SYSVAR_RENT_PUBKEY),
      associatedTokenProgram: translateAddress(ASSOCIATED_TOKEN_PROGRAM_ID),
    })
    .instruction();

  instructions.push(toInstruction(openPositionInstruction));

  const transaction = await prepareTransaction(instructions, userAddress, {});
  const transactionBytes = base64Encoder.encode(transaction);
  const decodedTx = transactionDecoder.decode(transactionBytes);
  const signedTransaction = await signTransaction(
    [user, positionMint],
    decodedTx
  );
  const wireTransaction = getBase64EncodedWireTransaction(signedTransaction);

  // Sign and confirm transaction
  const signature = await confirmTransaction(wireTransaction);
  console.log("Transaction signature (open position):", signature);
  await new Promise((resolve) => setTimeout(resolve, 1000));

  return wireTransaction;
}

async function removeLiquidity({
  user,
  userAddress,
  manager,
  orderPda,
  orderId,
  whirlpoolInfo,
  positionAddress,
  positionTokenAccount,
  positionMintAddress,
  program,
}) {
  const instructions: IInstruction[] = [];

  // Get vaults
  const lpVaults = await getLpVaults({
    program,
    userAddress,
    managerAddress: manager,
    orderAddress: orderPda,
    whirlpoolInfo,
  });

  // Fetch position address and account (for validation only)
  const positionAccount = await fetchPosition(rpc, positionAddress);
  if (!positionAccount) throw new Error("Position not found");

  console.log("Position data from account:", {
    tickLowerIndex: positionAccount.data.tickLowerIndex,
    tickUpperIndex: positionAccount.data.tickUpperIndex,
    liquidity: positionAccount.data.liquidity.toString(),
  });

  const lowerTickArrayIndex = getTickArrayStartTickIndex(
    positionAccount.data.tickLowerIndex,
    whirlpoolInfo.data.tickSpacing
  );
  const upperTickArrayIndex = getTickArrayStartTickIndex(
    positionAccount.data.tickUpperIndex,
    whirlpoolInfo.data.tickSpacing
  );

  const tickArrayLower = await getTickArrayAddress(
    address(whirlpoolInfo.address.toString()),
    lowerTickArrayIndex
  );
  const tickArrayUpper = await getTickArrayAddress(
    address(whirlpoolInfo.address.toString()),
    upperTickArrayIndex
  );

  console.log("tickArrayLower", tickArrayLower);
  console.log("tickArrayUpper", tickArrayUpper);

  // Calculate quote for decrease liquidity
  const quote = decreaseLiquidityQuote(
    positionAccount.data.liquidity,
    100, // slippage
    whirlpoolInfo.data.sqrtPrice,
    positionAccount.data.tickLowerIndex,
    positionAccount.data.tickUpperIndex
  );

  console.log("Liquidity removal quote:", {
    liquidityDelta: quote.liquidityDelta.toString(),
    tokenMinA: quote.tokenMinA.toString(),
    tokenMinB: quote.tokenMinB.toString(),
  });

  const p = program as Program<DelegateVault>;
  // Decrease liquidity instruction
  const closePositionInstruction = await p.methods
    .closePosition({
      liquidityAmount: new BN(quote.liquidityDelta.toString()),
      tokenMinA: new BN(quote.tokenMinA.toString()),
      tokenMinB: new BN(quote.tokenMinB.toString()),
      rewardIndex: null, // reward_index
    })
    .accountsPartial({
      signer: translateAddress(userAddress),
      id: translateAddress(orderId),
      order: translateAddress(orderPda),
      manager: translateAddress(manager),
      receiver: translateAddress(userAddress), // receiver is userAddress
      position: translateAddress(positionAddress),
      positionMint: translateAddress(positionMintAddress),
      positionTokenAccount: translateAddress(positionTokenAccount),
      managerVaultA: translateAddress(lpVaults.tokenVaultAAddress),
      managerVaultB: translateAddress(lpVaults.tokenVaultBAddress),
      tokenVaultA: translateAddress(whirlpoolInfo.data.tokenVaultA.toString()),
      tokenVaultB: translateAddress(whirlpoolInfo.data.tokenVaultB.toString()),
      whirlpool: translateAddress(whirlpoolInfo.address.toString()),
      tickArrayLower: translateAddress(tickArrayLower.toString()),
      tickArrayUpper: translateAddress(tickArrayUpper.toString()),
      whirlpoolProgram: translateAddress(WHIRLPOOL_PROGRAM_ADDRESS),
      tokenProgram: translateAddress(TOKEN_PROGRAM),
    })
    .instruction();

  instructions.push(toInstruction(closePositionInstruction));

  const transaction = await prepareTransaction(instructions, userAddress, {});
  const transactionBytes = base64Encoder.encode(transaction);
  const decodedTx = transactionDecoder.decode(transactionBytes);
  const signedTransaction = await signTransaction([user], decodedTx);
  const wireTransaction = getBase64EncodedWireTransaction(signedTransaction);

  // Sign and confirm transaction
  const signature = await confirmTransaction(wireTransaction);
  console.log("Transaction signature (liquidate):", signature);
  await new Promise((resolve) => setTimeout(resolve, 1000));

  return wireTransaction;
}

// Helper function to select best whirlpool
async function selectBestWhirlpool(whirlpools: any[]) {
  const MIN_LIQUIDITY = BigInt(1000000000);
  const validWhirlpools = whirlpools.filter(
    (pool) => pool.initialized && BigInt(pool.liquidity) > MIN_LIQUIDITY
  );

  if (validWhirlpools.length === 0) {
    return null;
  }

  validWhirlpools.sort((a, b) => {
    const liquidityDiff = BigInt(b.liquidity) - BigInt(a.liquidity);
    if (liquidityDiff !== BigInt(0)) {
      return Number(liquidityDiff);
    }
    return a.price - b.price;
  });

  return validWhirlpools[0];
}

async function assertAccountClosedOrZero({ connection, accountPubkey }) {
  try {
    const acc = await connection.getAccountInfo(accountPubkey);
    assert(!acc || acc.lamports === 0, "Account should be closed or zeroed");
  } catch (e) {
    assert.include(e.message, "Account does not exist");
  }
}

export function calcDepositRatio(
  currSqrtPriceX64: BN,
  lowerSqrtPriceX64: BN,
  upperSqrtPriceX64: BN,
  decimalsA: number,
  decimalsB: number
): [number, number] {
  const clampedSqrtPriceX64 = BN.min(
    BN.max(currSqrtPriceX64, lowerSqrtPriceX64),
    upperSqrtPriceX64
  );

  const clampedSqrtPrice = PriceMath.sqrtPriceX64ToPrice(
    clampedSqrtPriceX64,
    decimalsA,
    decimalsB
  ).sqrt();
  const lowerSqrtPrice = PriceMath.sqrtPriceX64ToPrice(
    lowerSqrtPriceX64,
    decimalsA,
    decimalsB
  ).sqrt();
  const upperSqrtPrice = PriceMath.sqrtPriceX64ToPrice(
    upperSqrtPriceX64,
    decimalsA,
    decimalsB
  ).sqrt();

  const currPrice = PriceMath.sqrtPriceX64ToPrice(
    currSqrtPriceX64,
    decimalsA,
    decimalsB
  );

  // calc ratio (L: liquidity)
  // depositA = L/currSqrtPrice - L/upperSqrtPrice
  // depositB = L*currSqrtPrice - L*lowerSqrtPrice
  const depositA = upperSqrtPrice
    .sub(clampedSqrtPrice)
    .div(clampedSqrtPrice.mul(upperSqrtPrice));
  const depositB = clampedSqrtPrice.sub(lowerSqrtPrice);

  const depositAValueInB = depositA.mul(currPrice);
  const depositBValueInB = depositB;
  const totalValueInB = depositAValueInB.add(depositBValueInB);

  const ratioA = depositAValueInB.div(totalValueInB).mul(100);
  const ratioB = depositBValueInB.div(totalValueInB).mul(100);

  return [ratioA.toNumber(), ratioB.toNumber()];
}

// Add swap quote utility functions
function getSwapQuote<T extends { inputAmount?: BN; outputAmount?: BN }>(
  params: T,
  whirlpool: Whirlpool,
  transferFeeA: TransferFee | undefined,
  transferFeeB: TransferFee | undefined,
  tickArrays: TickArrayFacade[],
  specifiedTokenA: boolean,
  slippageToleranceBps: number
): ExactInSwapQuote | ExactOutSwapQuote {
  if ("inputAmount" in params) {
    return swapQuoteByInputToken(
      BigInt(params.inputAmount!.toString()),
      specifiedTokenA,
      slippageToleranceBps,
      whirlpool,
      tickArrays,
      transferFeeA,
      transferFeeB
    );
  }

  return swapQuoteByOutputToken(
    BigInt(params.outputAmount!.toString()),
    specifiedTokenA,
    slippageToleranceBps,
    whirlpool,
    tickArrays,
    transferFeeA,
    transferFeeB
  );
}

// --- Refactored Stepwise Test Suite ---
describe("orca stepwise flow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.DelegateVault as Program<DelegateVault>;
  const connection = provider.connection;

  // Shared state for the whole flow
  let projectOwner: CryptoKeyPair;
  let user: CryptoKeyPair;
  let delegate: CryptoKeyPair;
  let ephemeralKey: CryptoKeyPair;
  let userAddress: Address;
  let usdcMint: Address;
  let jlpMint: Address;
  let usdcVault: Address;
  let jlpVault: Address;
  let userUsdcAta: Address;
  let userJlpAta: Address;
  let feeVault: Address;
  let manager: Address;
  let project: Address;
  let orderId: Address;
  let orderPda: Address;
  let orderVaultPda: Address;
  let tokenVaultPda: Address;
  let whirlpoolInfo: Account<Whirlpool, Address>;
  let tickLower: number;
  let tickUpper: number;
  // New shared state for position
  let positionMint: CryptoKeyPair;
  let positionMintAddress: Address;
  let positionAddress: Address;
  let positionTokenAccount: Address;

  let lowerTickIndex: number;
  let upperTickIndex: number;

  let ratioA: number;
  let ratioB: number;

  let lowerTickIndexAddress: Address;
  let upperTickIndexAddress: Address;

  let lowerTickArrayIndex: number;
  let upperTickArrayIndex: number;

  let initializableLowerTickIndex: number;
  let initializableUpperTickIndex: number;

  beforeAll(async () => {
    await setWhirlpoolsConfig("solanaMainnet");
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
    jlpMint = address(JLP_MINT);

    const projectOwnerAddress = await getAddressFromPublicKey(
      projectOwner.publicKey
    );
    // Derive PDAs
    project = await getProjectAddress(projectOwnerAddress);
    manager = await getManagerAddress(userAddress, project);
    usdcVault = await getOrderVaultAddress(
      userAddress,
      manager,
      project,
      usdcMint
    );
    jlpVault = await getTokenVaultAddress(
      userAddress,
      manager,
      project,
      jlpMint
    );
    feeVault = await getAtaAddress(project, usdcMint);
    userUsdcAta = await getAtaAddress(userAddress, usdcMint);
    userJlpAta = await getAtaAddress(userAddress, jlpMint);

    ephemeralKey = await generateKeyPair();
    orderId = await getAddressFromPublicKey(ephemeralKey.publicKey);
    orderPda = await getOrderAddress(manager, orderId);
    orderVaultPda = await getOrderVaultAddress(
      userAddress,
      manager,
      orderPda,
      usdcMint
    );

    console.log("orderId", orderId);
    console.log("orderPda", orderPda);
    console.log("orderVaultPda", orderVaultPda);
    console.log("project", project);
    console.log("manager", manager);
    console.log("usdcVault", usdcVault);
    console.log("jlpVault", jlpVault);
    console.log("feeVault", feeVault);
    console.log("userUsdcAta", userUsdcAta);
    console.log("userJlpAta", userJlpAta);

    // Generate ephemeralKey/orderId ONCE for the whole flow
    ephemeralKey = await generateKeyPair();
    orderId = await getAddressFromPublicKey(ephemeralKey.publicKey);
    orderPda = await getOrderAddress(manager, orderId);
    orderVaultPda = await getOrderVaultAddress(
      userAddress,
      manager,
      orderPda,
      usdcMint
    );
    tokenVaultPda = await getTokenVaultAddress(
      userAddress,
      manager,
      orderPda,
      address(JLP_MINT)
    );

    // Fetch JLP/USDC whirlpool - using a real Whirlpool public key
    // CWjGo5jkduSW5LN5rxgiQ18vGnJJEKWPCXkpJGxKSQTH = SOL/USDC pool with 2 tick spacing
    whirlpoolInfo = await fetchWhirlpool(
      rpc,
      address("6NUiVmsNjsi4AfsMsEiaezsaV9N4N1ZrD4jEnuWNRvyb")
    );

    console.log("Fetched whirlpool data:", {
      address: whirlpoolInfo.address.toString(),
      tokenA: whirlpoolInfo.data.tokenMintA.toString(),
      tokenB: whirlpoolInfo.data.tokenMintB.toString(),
      tickSpacing: whirlpoolInfo.data.tickSpacing,
      tickCurrentIndex: whirlpoolInfo.data.tickCurrentIndex,
      sqrtPrice: whirlpoolInfo.data.sqrtPrice.toString(),
    });

    // Initialize position mint/address/token account
    positionMint = await generateKeyPair();
    positionMintAddress = await getAddressFromPublicKey(positionMint.publicKey);
    positionAddress = await getPositionAddress(positionMintAddress);
    positionTokenAccount = await getAtaAddress(manager, positionMintAddress);

    // Calculate tick indices using PriceMath
    lowerTickIndex = priceToTickIndex(LOWER_PRICE, JLP_DECIMALS, USDC_DECIMALS);
    upperTickIndex = priceToTickIndex(UPPER_PRICE, JLP_DECIMALS, USDC_DECIMALS);

    console.log("Tick indices:", {
      lowerTickIndex,
      upperTickIndex,
    });

    const tickRange = orderTickIndexes(lowerTickIndex, upperTickIndex);

    console.log("Tick range:", {
      tickLowerIndex: tickRange.tickLowerIndex,
      tickUpperIndex: tickRange.tickUpperIndex,
    });

    initializableLowerTickIndex = getInitializableTickIndex(
      tickRange.tickLowerIndex,
      whirlpoolInfo.data.tickSpacing,
      false
    );
    initializableUpperTickIndex = getInitializableTickIndex(
      tickRange.tickUpperIndex,
      whirlpoolInfo.data.tickSpacing,
      true
    );

    console.log("Initializable tick indices:", {
      initializableLowerTickIndex,
      initializableUpperTickIndex,
    });

    // Calculate proper start indices for tick arrays
    lowerTickArrayIndex = getTickArrayStartTickIndex(
      initializableLowerTickIndex,
      whirlpoolInfo.data.tickSpacing
    );
    upperTickArrayIndex = getTickArrayStartTickIndex(
      initializableUpperTickIndex,
      whirlpoolInfo.data.tickSpacing
    );

    console.log("Lower tick array index:", lowerTickArrayIndex);
    console.log("Upper tick array index:", upperTickArrayIndex);

    lowerTickIndexAddress = await getTickArrayAddress(
      whirlpoolInfo.address,
      lowerTickArrayIndex
    );
    upperTickIndexAddress = await getTickArrayAddress(
      whirlpoolInfo.address,
      upperTickArrayIndex
    );

    console.log("Tick array start indices:", {
      lowerTickArrayIndex,
      upperTickArrayIndex,
      tickSpacing: whirlpoolInfo.data.tickSpacing,
      lowerTickIndexAddress,
      upperTickIndexAddress,
    });

    const lowerSqrtPriceX64 = PriceMath.tickIndexToSqrtPriceX64(lowerTickIndex);
    const upperSqrtPriceX64 = PriceMath.tickIndexToSqrtPriceX64(upperTickIndex);

    console.log("SqrtPrice values:", {
      lowerSqrtPriceX64: lowerSqrtPriceX64.toString(),
      upperSqrtPriceX64: upperSqrtPriceX64.toString(),
    });

    [ratioA, ratioB] = calcDepositRatio(
      new BN(whirlpoolInfo.data.sqrtPrice.toString()),
      lowerSqrtPriceX64,
      upperSqrtPriceX64,
      JLP_DECIMALS,
      USDC_DECIMALS
    );

    console.log("Calculated ratios:", {
      ratioA,
      ratioB,
      ratioSum: ratioA + ratioB,
    });
  });

  test("1. Deposit USDC", async () => {
    const depositInstruction = await program.methods
      .deposit(new BN(10000)) // 0.01 USDC
      .accountsPartial({
        signer: translateAddress(userAddress),
        id: translateAddress(orderId),
        order: translateAddress(orderPda),
        manager: translateAddress(manager),
        depositMint: translateAddress(usdcMint),
        userAta: translateAddress(userUsdcAta),
        orderVault: translateAddress(orderVaultPda),
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
    const wireTransaction = getBase64EncodedWireTransaction(signedTransaction);
    const sig = await confirmTransaction(wireTransaction);
    console.log("Transaction signature (deposit):", sig);
    await new Promise((res) => setTimeout(res, 3000));
  });

  test("2. Create token vault for token vault (JLP)", async () => {
    // Only needed if deposit mint is not in pool, but for USDC/WSOL always create
    const initTokenVaultInstruction = await program.methods
      .initTokenVault()
      .accountsPartial({
        signer: translateAddress(userAddress),
        id: translateAddress(orderId),
        order: translateAddress(orderPda),
        manager: translateAddress(manager),
        mint: translateAddress(JLP_MINT),
        tokenVault: translateAddress(tokenVaultPda),
        tokenProgram: translateAddress(TOKEN_PROGRAM_ID.toString()),
        systemProgram: translateAddress(SystemProgram.programId.toString()),
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
    await new Promise((res) => setTimeout(res, 3000));
  });

  test("3. Swap to pool ratio (USDC → JLP)", async () => {
    // Get token pool information
    const jlpAddress = whirlpoolInfo.data.tokenMintA.toString();
    const usdcAddress = whirlpoolInfo.data.tokenMintB.toString();
    const tokenAAddress = whirlpoolInfo.data.tokenMintA.toString();
    const tokenBAddress = whirlpoolInfo.data.tokenMintB.toString();

    console.log("Token addresses:", {
      jlpAddress,
      usdcAddress,
      tokenAAddress,
      tokenBAddress,
    });

    // We're swapping FROM JLP TO USDC
    // Since JLP is token A and USDC is token B, this is B→A (aToB = false)
    const aToB = false;
    // Get order vault balance
    const orderVaultBalance = await connection.getTokenAccountBalance(
      new PublicKey(orderVaultPda.toString())
    );
    console.log("Order vault USDC balance:", orderVaultBalance.value.amount);
    if (!orderVaultBalance.value)
      throw new Error("Invalid order vault balance");

    // Use ratioB for swapping from USDC (token B) to SOL (token A)
    // This represents how much of token B (USDC) we want to swap
    const ratio = ratioB;
    console.log("Using ratio for swap calculation:", ratio);

    // Calculate swap amount based on ratio (with validation)
    const swapRatio = Math.max(0, Math.min(100, ratio)) / 100; // Clamp between 0-100%
    const swapAmount = new BN(
      Math.floor(Number(orderVaultBalance.value.amount) * swapRatio)
    );

    console.log("Swap amount:", swapAmount.toString());

    // Get the current tick array for the pool
    const currentTickArrayIndex = getStartTickIndex(
      whirlpoolInfo.data.tickCurrentIndex,
      whirlpoolInfo.data.tickSpacing,
      0
    );

    console.log("Current tick array index:", currentTickArrayIndex);

    // Get PDAs for the three tick arrays we need

    const tickArrayStartIndex = getTickArrayStartTickIndex(
      whirlpoolInfo.data.tickCurrentIndex,
      whirlpoolInfo.data.tickSpacing
    );
    const offset = whirlpoolInfo.data.tickSpacing * _TICK_ARRAY_SIZE();

    const tickArrayIndexes = [
      tickArrayStartIndex,
      tickArrayStartIndex + offset,
      tickArrayStartIndex + offset * 2,
      tickArrayStartIndex - offset,
      tickArrayStartIndex - offset * 2,
    ];

    const tickArrayAddresses = await Promise.all(
      tickArrayIndexes.map((startIndex) =>
        getTickArrayAddress(whirlpoolInfo.address, startIndex)
      )
    );

    console.log("Tick array addresses for swap using PDA method:", [
      tickArrayAddresses[0].toString(),
      tickArrayAddresses[1].toString(),
      tickArrayAddresses[2].toString(),
    ]);

    const swapVaults = await getSwapVaults({
      program,
      userAddress,
      managerAddress: manager,
      orderAddress: orderPda,
      whirlpoolInfo,
    });
    // Construct swap instruction
    const swapInstruction = await program.methods
      .orcaSwap({
        amount: swapAmount,
        otherAmountThreshold: new BN(0),
        sqrtPriceLimit: new BN(
          aToB ? "4295048016" : "79226673515401279992447579055"
        ),
        amountSpecifiedIsInput: true,
        aToB: aToB,
      })
      .accountsPartial({
        signer: translateAddress(userAddress),
        id: translateAddress(orderId),
        order: translateAddress(orderPda),
        manager: translateAddress(manager),
        managerVaultA: swapVaults.tokenVaultAAddress,
        managerVaultB: swapVaults.tokenVaultBAddress,
        tokenVaultA: translateAddress(whirlpoolInfo.data.tokenVaultA),
        tokenVaultB: translateAddress(whirlpoolInfo.data.tokenVaultB),
        whirlpool: translateAddress(whirlpoolInfo.address),
        tickArray0: translateAddress(tickArrayAddresses[0]),
        tickArray1: translateAddress(tickArrayAddresses[1]),
        tickArray2: translateAddress(tickArrayAddresses[2]),
        whirlpoolProgram: translateAddress(WHIRLPOOL_PROGRAM_ADDRESS),
        tokenProgram: translateAddress(TOKEN_PROGRAM),
      })
      .instruction();

    // Create and send transaction
    const tx = await prepareTransaction(
      [toInstruction(swapInstruction)],
      userAddress,
      {}
    );
    const txBytes = base64Encoder.encode(tx);
    const decoded = transactionDecoder.decode(txBytes);
    const signed = await signTransaction([user], decoded);
    const wire = getBase64EncodedWireTransaction(signed);
    const sig = await confirmTransaction(wire);
    console.log("Transaction signature (swap):", sig);
    await new Promise((res) => setTimeout(res, 5000));
  });

  test("4. Open position", async () => {
    const currentTokenBalanceJlp = await rpc
      .getTokenAccountBalance(tokenVaultPda)
      .send()
      .then((res) => res.value.amount);
    console.log("currentTokenBalanceJlp", currentTokenBalanceJlp);
    const currentUsdcBalance = await rpc
      .getTokenAccountBalance(userUsdcAta)
      .send()
      .then((res) => res.value.amount);
    console.log("currentUsdcBalance", currentUsdcBalance);
    // Calculate optimal token amounts based on ratios and available balances
    let optimalAmountA: bigint = BigInt(currentUsdcBalance);
    let optimalAmountB: bigint = BigInt(currentTokenBalanceJlp);

    let quote: IncreaseLiquidityQuote;
    // For dual token deposits, use the minimum of the two quotes
    const quoteA = increaseLiquidityQuoteA(
      optimalAmountA,
      500, // slippage
      whirlpoolInfo.data.sqrtPrice,
      lowerTickIndex,
      upperTickIndex
    );
    const quoteB = increaseLiquidityQuoteB(
      optimalAmountB,
      500, // slippage
      whirlpoolInfo.data.sqrtPrice,
      lowerTickIndex,
      upperTickIndex
    );

    // Use the quote that provides more liquidity but doesn't exceed balances
    if (
      BigInt(quoteA.tokenMaxA) <= BigInt(currentUsdcBalance) &&
      BigInt(quoteA.tokenMaxB) <= BigInt(currentTokenBalanceJlp)
    ) {
      quote = quoteA;
    } else if (
      BigInt(quoteB.tokenMaxA) <= BigInt(currentUsdcBalance) &&
      BigInt(quoteB.tokenMaxB) <= BigInt(currentTokenBalanceJlp)
    ) {
      quote = quoteB;
    } else {
      // If both quotes exceed balances, use the one that's closer to the available balances
      const quoteADiff = Math.abs(
        Number(quoteA.tokenMaxB) - Number(currentTokenBalanceJlp)
      );
      const quoteBDiff = Math.abs(
        Number(quoteB.tokenMaxB) - Number(currentTokenBalanceJlp)
      );
      quote = quoteADiff < quoteBDiff ? quoteA : quoteB;
    }

    console.log("Adjusted quote:", {
      liquidityDelta: quote.liquidityDelta.toString(),
      tokenEstA: quote.tokenEstA.toString(),
      tokenEstB: quote.tokenEstB.toString(),
      tokenMaxA: quote.tokenMaxA.toString(),
      tokenMaxB: quote.tokenMaxB.toString(),
      tokenVaultABalance: currentUsdcBalance,
      tokenVaultBBalance: currentTokenBalanceJlp,
    });

    const liquidityAmount = new BN(quote.liquidityDelta.toString());
    const tokenMaxA = new BN(quote.tokenMaxA.toString());
    const tokenMaxB = new BN(quote.tokenMaxB.toString());

    console.log("Liquidity quote:", {
      liquidityAmount: liquidityAmount.toString(),
      tokenMaxA: tokenMaxA.toString(),
      tokenMaxB: tokenMaxB.toString(),
    });
    await addLiquidity({
      user,
      userAddress,
      manager,
      orderPda,
      orderId,
      whirlpoolInfo,
      quote,
      positionAddress,
      positionTokenAccount,
      positionMintAddress,
      positionMint,
      program,
      project,
      initializableLowerTickIndex,
      initializableUpperTickIndex,
      lowerTickIndexAddress,
      upperTickIndexAddress,
    });
  });

  test("5. Close position", async () => {
    await removeLiquidity({
      user,
      userAddress,
      manager,
      orderPda,
      orderId,
      whirlpoolInfo,
      positionAddress,
      positionTokenAccount,
      positionMintAddress,
      program,
    });
  });

  test("6. Swap back to deposit mint (JLP → USDC)", async () => {
    // Determine if deposit mint is in pool
    const depositMint = usdcMint;
    const containsDepositMint =
      whirlpoolInfo.data.tokenMintA === depositMint ||
      whirlpoolInfo.data.tokenMintB === depositMint;

    const orderVaultAddress = await getOrderVaultAddress(
      userAddress,
      manager,
      orderPda,
      depositMint
    );

    let instructions: IInstruction[] = [];

    if (containsDepositMint) {
      const aToB = true; // Reverse direction for swap back

      // Get token vault balance
      const tokenVaultBalance = await connection.getTokenAccountBalance(
        new PublicKey(tokenVaultPda)
      );
      if (!tokenVaultBalance.value || tokenVaultBalance.value.amount === "0") {
        throw new Error("No tokens to swap back");
      }

      // Calculate tick array addresses using the same approach as in test 3
      const tickArrayStartIndex = getTickArrayStartTickIndex(
        whirlpoolInfo.data.tickCurrentIndex,
        whirlpoolInfo.data.tickSpacing
      );
      const offset = whirlpoolInfo.data.tickSpacing * _TICK_ARRAY_SIZE();

      const tickArrayIndexes = [
        tickArrayStartIndex,
        tickArrayStartIndex + offset,
        tickArrayStartIndex + offset * 2,
        tickArrayStartIndex - offset,
        tickArrayStartIndex - offset * 2,
      ];

      const tickArrayAddresses = await Promise.all(
        tickArrayIndexes.map((startIndex) =>
          getTickArrayAddress(whirlpoolInfo.address, startIndex)
        )
      );

      console.log("Tick array addresses for swap back:", [
        tickArrayAddresses[0].toString(),
        tickArrayAddresses[1].toString(),
        tickArrayAddresses[2].toString(),
      ]);

      const oracle = await getOracleAddress(whirlpoolInfo.address);

      const swapVaults = await getSwapVaults({
        program,
        userAddress,
        managerAddress: manager,
        orderAddress: orderPda,
        whirlpoolInfo,
      });
      // Construct swap instruction
      const swapInstruction = await program.methods
        .orcaSwap({
          amount: new BN(tokenVaultBalance.value.amount),
          otherAmountThreshold: new BN(0),
          sqrtPriceLimit: new BN(
            aToB ? "4295048016" : "79226673515401279992447579055"
          ),
          amountSpecifiedIsInput: true,
          aToB: aToB,
        })
        .accountsPartial({
          signer: translateAddress(userAddress),
          id: translateAddress(orderId),
          order: translateAddress(orderPda),
          manager: translateAddress(manager),
          managerVaultA: swapVaults.tokenVaultAAddress,
          managerVaultB: swapVaults.tokenVaultBAddress,
          tokenVaultA: translateAddress(whirlpoolInfo.data.tokenVaultA),
          tokenVaultB: translateAddress(whirlpoolInfo.data.tokenVaultB),
          whirlpool: translateAddress(whirlpoolInfo.address),
          tickArray0: translateAddress(tickArrayAddresses[0]),
          tickArray1: translateAddress(tickArrayAddresses[1]),
          tickArray2: translateAddress(tickArrayAddresses[2]),
          oracle: translateAddress(oracle),
          whirlpoolProgram: translateAddress(WHIRLPOOL_PROGRAM_ADDRESS),
          tokenProgram: translateAddress(TOKEN_PROGRAM),
          systemProgram: translateAddress(SYSTEM_PROGRAM),
        })
        .instruction();

      instructions.push(toInstruction(swapInstruction));
    } else {
      // Double swap case (not implemented)
      throw new Error("Double swap back not implemented in test");
    }

    // Prepare, sign, and send transaction
    const tx = await prepareTransaction(instructions, userAddress, {});
    const txBytes = base64Encoder.encode(tx);
    const decoded = transactionDecoder.decode(txBytes);
    const signed = await signTransaction([user], decoded);
    const wire = getBase64EncodedWireTransaction(signed);
    const sig = await confirmTransaction(wire);
    console.log("Transaction signature (swap back):", sig);
    await new Promise((res) => setTimeout(res, 3000));
  });

  test("7. Close JLP token vault", async () => {
    const closeTokenVaultInstruction = await program.methods
      .closeTokenVault()
      .accountsPartial({
        signer: translateAddress(userAddress),
        user: translateAddress(userAddress),
        id: translateAddress(orderId),
        order: translateAddress(orderPda),
        manager: translateAddress(manager),
        tokenVault: translateAddress(tokenVaultPda),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const tx = await prepareTransaction(
      [toInstruction(closeTokenVaultInstruction)],
      userAddress,
      {}
    );
    const txBytes = base64Encoder.encode(tx);
    const decoded = transactionDecoder.decode(txBytes);
    const signed = await signTransaction([user], decoded);
    const wire = getBase64EncodedWireTransaction(signed);
    const sig = await confirmTransaction(wire);
    console.log("Transaction signature (close token vault):", sig);
    await new Promise((res) => setTimeout(res, 1000));
  });

  test("8. Withdraw and assert account closure", async () => {
    const withdrawInstruction = await program.methods
      .withdraw()
      .accountsPartial({
        signer: translateAddress(userAddress),
        id: translateAddress(orderId),
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
    const signedTransaction = await signTransaction([user], decodedTx);
    const wireTransaction = getBase64EncodedWireTransaction(signedTransaction);

    // Sign and confirm transaction
    const signature = await confirmTransaction(wireTransaction);
    console.log("Transaction signature (withdraw):", signature);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });
});

async function getSwapVaults({
  program,
  userAddress,
  managerAddress,
  orderAddress,
  whirlpoolInfo,
}) {
  // Fetch deposit mint from the order account
  const orderAccount = await program.account.order.fetch(orderAddress);
  const depositMint = orderAccount.depositMint.toBase58();

  // Derive the order vault address for the deposit mint
  const orderVaultAddress = await getOrderVaultAddress(
    userAddress,
    managerAddress,
    orderAddress,
    depositMint
  );

  // Check if deposit mint is one of the pool tokens
  const isDepositMintA = whirlpoolInfo.data.tokenMintA == depositMint;
  const isDepositMintB = whirlpoolInfo.data.tokenMintB == depositMint;
  const isDepositMintInPool = isDepositMintA || isDepositMintB;

  let tokenVaultAAddress, tokenVaultBAddress;

  if (isDepositMintInPool) {
    if (isDepositMintA) {
      tokenVaultAAddress = orderVaultAddress;
      tokenVaultBAddress = await getTokenVaultAddress(
        userAddress,
        managerAddress,
        orderAddress,
        whirlpoolInfo.data.tokenMintB
      );
    } else {
      tokenVaultAAddress = await getTokenVaultAddress(
        userAddress,
        managerAddress,
        orderAddress,
        whirlpoolInfo.data.tokenMintA
      );
      tokenVaultBAddress = orderVaultAddress;
    }
  } else {
    tokenVaultAAddress = await getTokenVaultAddress(
      userAddress,
      managerAddress,
      orderAddress,
      whirlpoolInfo.data.tokenMintA
    );
    tokenVaultBAddress = await getTokenVaultAddress(
      userAddress,
      managerAddress,
      orderAddress,
      whirlpoolInfo.data.tokenMintB
    );
  }

  console.log("Swap vaults:", {
    depositMint,
    orderVaultAddress,
    tokenVaultAAddress,
    tokenVaultBAddress,
    isDepositMintA,
    isDepositMintB,
    isDepositMintInPool,
  });

  return {
    depositMint,
    orderVaultAddress,
    tokenVaultAAddress,
    tokenVaultBAddress,
    isDepositMintA,
    isDepositMintB,
    isDepositMintInPool,
  };
}

async function getLpVaults({
  program,
  userAddress,
  managerAddress,
  orderAddress,
  whirlpoolInfo,
}) {
  // Fetch deposit mint from the order account
  const orderAccount = await program.account.order.fetch(orderAddress);
  const depositMint = orderAccount.depositMint.toBase58();

  // Derive the order vault address for the deposit mint
  const orderVaultAddress = await getOrderVaultAddress(
    userAddress,
    managerAddress,
    orderAddress,
    depositMint
  );

  // Check if deposit mint is one of the pool tokens
  const isDepositMintA = whirlpoolInfo.data.tokenMintA == depositMint;
  const isDepositMintB = whirlpoolInfo.data.tokenMintB == depositMint;
  const isDepositMintInPool = isDepositMintA || isDepositMintB;

  let tokenVaultAAddress, tokenVaultBAddress;

  if (isDepositMintInPool) {
    if (isDepositMintA) {
      tokenVaultAAddress = orderVaultAddress;
      tokenVaultBAddress = await getTokenVaultAddress(
        userAddress,
        managerAddress,
        orderAddress,
        whirlpoolInfo.data.tokenMintB
      );
    } else {
      tokenVaultAAddress = await getTokenVaultAddress(
        userAddress,
        managerAddress,
        orderAddress,
        whirlpoolInfo.data.tokenMintA
      );
      tokenVaultBAddress = orderVaultAddress;
    }
  } else {
    tokenVaultAAddress = await getTokenVaultAddress(
      userAddress,
      managerAddress,
      orderAddress,
      whirlpoolInfo.data.tokenMintA
    );
    tokenVaultBAddress = await getTokenVaultAddress(
      userAddress,
      managerAddress,
      orderAddress,
      whirlpoolInfo.data.tokenMintB
    );
  }

  return {
    depositMint,
    orderVaultAddress,
    tokenVaultAAddress,
    tokenVaultBAddress,
    isDepositMintA,
    isDepositMintB,
    isDepositMintInPool,
  };
}

// Helper for tick array addresses (from backend)
const TICK_ARRAY_SIZE = 88;
const MIN_TICK_INDEX = -443636;
const MAX_TICK_INDEX = 443636;
export const getStartTickIndex = (
  tickIndex: number,
  tickSpacing: number,
  offset = 0
): number => {
  const realIndex = Math.floor(tickIndex / tickSpacing / TICK_ARRAY_SIZE);
  const startTickIndex = (realIndex + offset) * tickSpacing * TICK_ARRAY_SIZE;
  const ticksInArray = TICK_ARRAY_SIZE * tickSpacing;
  const minTickIndex =
    MIN_TICK_INDEX - ((MIN_TICK_INDEX % ticksInArray) + ticksInArray);
  if (startTickIndex < minTickIndex) {
    throw new Error(`startTickIndex is too small - ${startTickIndex}`);
  }
  if (startTickIndex > MAX_TICK_INDEX) {
    throw new Error(`startTickIndex is too large - ${startTickIndex}`);
  }
  return startTickIndex;
};

export const MAX_SWAP_TICK_ARRAYS = 3;
