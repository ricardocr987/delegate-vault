import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import bs58 from "bs58";

// Test amounts in lamports and USDC decimals
const TEST_INITIAL_AMOUNTS = {
  USER: {
    SOL: 0.1, // 0.1 SOL
    USDC: 0.5, // 0.5 USDC
  },
  DELEGATE: {
    SOL: 0.05, // 0.05 SOL
  },
  HACKER: {
    SOL: 0.05, // 0.05 SOL
  },
};

async function main() {
  const keypairUser = Keypair.generate();
  const keypairDelegate = Keypair.generate();
  const keypairHacker = Keypair.generate();

  const publicKeyUser = keypairUser.publicKey.toBase58();
  const publicKeyDelegate = keypairDelegate.publicKey.toBase58();
  const publicKeyHacker = keypairHacker.publicKey.toBase58();

  const privateKeyUser = bs58.encode(keypairUser.secretKey);
  const privateKeyDelegate = bs58.encode(keypairDelegate.secretKey);
  const privateKeyHacker = bs58.encode(keypairHacker.secretKey);

  // Create keys directory if it doesn't exist
  const keysDir = path.join(__dirname, "..", "keys");
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir);
  }

  // Save keypairs with base58 encoded secret keys
  const keypairs = {
    user: {
      publicKey: publicKeyUser,
      secretKey: privateKeyUser,
    },
    delegate: {
      publicKey: publicKeyDelegate,
      secretKey: privateKeyDelegate,
    },
    hacker: {
      publicKey: publicKeyHacker,
      secretKey: privateKeyHacker,
    },
  };

  // create folder if not exists
  const testDir = path.join(__dirname, "..", "tests/keys");
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir);
  }

  // Write to file
  fs.writeFileSync(
    path.join(testDir, "test-keys.json"),
    JSON.stringify(keypairs, null, 2)
  );

  // Print detailed information
  console.log("\n=== Test Wallet Setup ===\n");

  console.log("1. User Wallet:");
  console.log("   Address:", publicKeyUser);
  console.log("   Required SOL:", TEST_INITIAL_AMOUNTS.USER.SOL, "SOL");
  console.log("   Required USDC:", TEST_INITIAL_AMOUNTS.USER.USDC, "USDC");
  console.log("   Private Key (base58):", privateKeyUser);
  console.log(
    "\n   Send funds to this wallet first as it will be the main test user."
  );

  console.log("\n2. Delegate Wallet:");
  console.log("   Address:", publicKeyDelegate);
  console.log("   Required SOL:", TEST_INITIAL_AMOUNTS.DELEGATE.SOL, "SOL");
  console.log("   Private Key (base58):", privateKeyDelegate);

  console.log("\n3. Hacker Wallet:");
  console.log("   Address:", publicKeyHacker);
  console.log("   Required SOL:", TEST_INITIAL_AMOUNTS.HACKER.SOL, "SOL");
  console.log("   Private Key (base58):", privateKeyHacker);

  console.log("\n=== Instructions ===");
  console.log(
    "1. Fund the User wallet with",
    TEST_INITIAL_AMOUNTS.USER.SOL,
    "SOL and",
    TEST_INITIAL_AMOUNTS.USER.USDC,
    "USDC"
  );
  console.log(
    "2. Fund the Delegate wallet with",
    TEST_INITIAL_AMOUNTS.DELEGATE.SOL,
    "SOL"
  );
  console.log(
    "3. Fund the Hacker wallet with",
    TEST_INITIAL_AMOUNTS.HACKER.SOL,
    "SOL"
  );

  console.log(
    "\nAll keypairs have been saved to:",
    path.join(keysDir, "test-keys.json")
  );
  console.log("\nTo load these keypairs in your tests, use:");
  console.log(
    "const keypair = await createKeyPairFromBytes(bs58.decode(secretKey));"
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
