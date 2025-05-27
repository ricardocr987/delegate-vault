import {
  Address,
  getBase64Encoder,
  getBase64Decoder,
  getBase58Decoder,
  getTransactionDecoder,
  getCompiledTransactionMessageDecoder,
  getTransactionEncoder,
} from "@solana/kit";

export const SOL_MINT =
  "So11111111111111111111111111111111111111112" as Address;
export const USDC_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as Address;
export const FRNX_MINT =
  "2uJGDsUKq4T3AUn2UXrnzyKz644GxXy7z333WcXdvirt" as Address;
export const PYUSD_MINT =
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo" as Address;
export const VIRTUALS_MINT =
  "3iQL8BFS2vE7mww4ehAqQHAsbmRNCrPxizWAT2Zfyr9y" as Address;

export const FRNX_DECIMALS = 6;

export const base64Encoder = getBase64Encoder();
export const base64Decoder = getBase64Decoder();
export const base58Decoder = getBase58Decoder();
export const transactionDecoder = getTransactionDecoder();
export const transactionEncoder = getTransactionEncoder();
export const compiledTransactionMessageDecoder =
  getCompiledTransactionMessageDecoder();

export const jitoTipAccounts = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
];

export const TOKEN_PROGRAM =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;
export const TOKEN_PROGRAM_2022 =
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" as Address;
export const ASSOCIATED_TOKEN_PROGRAM =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;
export const SYSTEM_PROGRAM = "11111111111111111111111111111111" as Address;

export const STAKING_V2_PROGRAM =
  "veTbq5fF2HWYpgmkwjGKTYLVpY6miWYYmakML7R7LRf" as Address;
export const SQUADS_PROGRAM =
  "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf" as Address;
export const REFERRAL_PROGRAM =
  "REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3" as Address;

export const GOVERN_PROGRAM =
  "GovaE4iu227srtG2s3tZzB4RmWBzw8sTwrCLZz7kN7rY" as Address;
export const STAKING_PROGRAM =
  "voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj" as Address;
export const SMART_WALLET_PROGRAM =
  "smaK3fwkA7ubbxEhsimp1iqPTzfS4MBsNL77QLABZP6" as Address;

export const NAMESPACE_ADDRESS =
  "3mWJvwmm63wCHMC3NkiaMKWeDtBrjB2yEvwHmyL2qVr8" as Address;
export const DISTRIBUTION_ADDRESS =
  "8djcKVqNbkhanCgD2YyN1hSJJ1jpYgb8XPj6Ko25KxET" as Address;
export const DISTRIBUTION_V2_ADDRESS =
  "53CS1iTPWZBHU4TGg8xxB9odwdJjQp1yC3gYiE4LJuDa" as Address;
export const DISTRIBUTION_SEASON_1_ADDRESS =
  "489EeTrCup5soEcLWmcoXpqzCWQFY9x75adDAR8PZ4QS" as Address;
export const SQUADS_ADDRESS =
  "46ofQjpsVZBeVkiaouB3FYAtcZVov3ARPFtzCNVCBczd" as Address;
export const SQUADS_VAULT_ADDRESS =
  "Arpeu4FvHEA38rJCBP5jXCUFotQFJggv3ECweut2wrYp" as Address;
export const REFERRAL_PROJECT_ADDRESS =
  "AxpQz2ErEA14cTPNjV9w1RMXFxSaSPwoF6AKJLwKYYRC" as Address;
export const REFERRAL_ADMIN_ADDRESS =
  "rikiFB2VznT2izUT7UffzWCn1X4gNmGutX7XEqFdpRR" as Address;

export const JUPITER_PROGRAM =
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4" as Address;
export const DELEGATE_VAULT_PROGRAM =
  "frnxh6RXdbpvTbhQ8yRtEbLNnXKmbGEqwfwMpZaBRw9" as Address;
