import { decodeMint } from "@solana-program/token";
import { rpc } from "../rpc";
import type { EncodedAccount } from "@solana/accounts";
import { ReadonlyUint8Array, address, Lamports } from "@solana/kit";

export type DecodedMint = {
  mintAuthorityOption: number;
  mintAuthority: string;
  supply: string;
  decimals: number;
  isInitialized: boolean;
  freezeAuthorityOption: number;
  freezeAuthority: string;
};

export async function getMints(
  mints: string[]
): Promise<Record<string, DecodedMint>> {
  if (mints.length === 0) return {};

  try {
    const BATCH_SIZE = 100;
    const results: Record<string, DecodedMint> = {};

    // Process mints in batches
    for (let i = 0; i < mints.length; i += BATCH_SIZE) {
      const batchMints = mints.slice(i, i + BATCH_SIZE);
      const mintAddresses = batchMints.map((mint) => address(mint));

      const { value: mintsResponse } = await rpc
        .getMultipleAccounts(mintAddresses, { encoding: "base64" })
        .send();

      if (!mintsResponse) {
        console.warn(
          `No response from getMultipleAccounts for batch starting at index ${i}`
        );
        continue;
      }

      mintsResponse.forEach((mint, index) => {
        try {
          if (!mint?.data) {
            console.warn(`No data for mint at batch index ${index}`);
            return;
          }

          const [base64Data] = mint.data;
          if (!base64Data) {
            console.warn(
              `Invalid base64 data for mint at batch index ${index}`
            );
            return;
          }

          const rawData = Buffer.from(base64Data, "base64");
          const mintAddress = mintAddresses[index];

          const encodedAccount: EncodedAccount<string> = {
            address: mintAddress,
            data: new Uint8Array(rawData) as ReadonlyUint8Array,
            executable: mint.executable,
            lamports: mint.lamports,
            programAddress: mint.owner,
          };

          const decodedMintData = decodeMint(encodedAccount);

          results[mintAddress.toString()] = {
            mintAuthorityOption: decodedMintData.data.mintAuthority ? 1 : 0,
            mintAuthority: decodedMintData.data.mintAuthority?.toString() || "",
            supply: decodedMintData.data.supply.toString(),
            decimals: decodedMintData.data.decimals,
            isInitialized: decodedMintData.data.isInitialized,
            freezeAuthorityOption: decodedMintData.data.freezeAuthority ? 1 : 0,
            freezeAuthority:
              decodedMintData.data.freezeAuthority?.toString() || "",
          };
        } catch (error) {
          console.error(
            `Error processing mint at batch index ${index}:`,
            error
          );
        }
      });
    }

    return results;
  } catch (error) {
    console.error("Error in getMints:", error);
    return {};
  }
}

export async function getMint(mint: string): Promise<DecodedMint | null> {
  try {
    const mintAddress = address(mint);
    const { value: mintResponse } = await rpc
      .getAccountInfo(mintAddress, { encoding: "base64" })
      .send();

    if (!mintResponse?.data) {
      console.warn("No data for mint");
      return null;
    }

    const [base64Data] = mintResponse.data;
    if (!base64Data) {
      console.warn("Invalid base64 data for mint");
      return null;
    }

    const rawData = Buffer.from(base64Data, "base64");
    const encodedAccount: EncodedAccount<string> = {
      address: mintAddress,
      data: new Uint8Array(rawData) as ReadonlyUint8Array,
      executable: mintResponse.executable,
      lamports: mintResponse.lamports,
      programAddress: mintResponse.owner,
    };

    const decodedMintData = decodeMint(encodedAccount);

    return {
      mintAuthorityOption: decodedMintData.data.mintAuthority ? 1 : 0,
      mintAuthority: decodedMintData.data.mintAuthority?.toString() || "",
      supply: decodedMintData.data.supply.toString(),
      decimals: decodedMintData.data.decimals,
      isInitialized: decodedMintData.data.isInitialized,
      freezeAuthorityOption: decodedMintData.data.freezeAuthority ? 1 : 0,
      freezeAuthority: decodedMintData.data.freezeAuthority?.toString() || "",
    };
  } catch (error) {
    console.error("Error in getMint:", error);
    return null;
  }
}

export type MintInfo = {
  address: string;
  executable: boolean;
  lamports: Lamports;
  programAddress: string;
  data: DecodedMint;
};

export async function getMintInfo(mint: string): Promise<MintInfo | null> {
  try {
    const mintAddress = address(mint);
    const { value: mintResponse } = await rpc
      .getAccountInfo(mintAddress, { encoding: "base64" })
      .send();

    if (!mintResponse?.data) {
      console.warn("No data for mint");
      return null;
    }

    const [base64Data] = mintResponse.data;
    if (!base64Data) {
      console.warn("Invalid base64 data for mint");
      return null;
    }

    const rawData = Buffer.from(base64Data, "base64");
    const encodedAccount: EncodedAccount<string> = {
      address: mintAddress,
      data: new Uint8Array(rawData) as ReadonlyUint8Array,
      executable: mintResponse.executable,
      lamports: mintResponse.lamports,
      programAddress: mintResponse.owner,
    };

    const decodedMintData = decodeMint(encodedAccount);

    return {
      address: mintAddress.toString(),
      executable: mintResponse.executable,
      lamports: mintResponse.lamports,
      programAddress: mintResponse.owner,
      data: {
        mintAuthorityOption: decodedMintData.data.mintAuthority ? 1 : 0,
        mintAuthority: decodedMintData.data.mintAuthority?.toString() || "",
        supply: decodedMintData.data.supply.toString(),
        decimals: decodedMintData.data.decimals,
        isInitialized: decodedMintData.data.isInitialized,
        freezeAuthorityOption: decodedMintData.data.freezeAuthority ? 1 : 0,
        freezeAuthority: decodedMintData.data.freezeAuthority?.toString() || "",
      },
    };
  } catch (error) {
    console.error("Error in getMint:", error);
    return null;
  }
}
