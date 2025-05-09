import { Address } from "@solana/kit";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { rpc } from "../rpc";
import { address } from "@solana/addresses";

export async function checkAtasExistence(
  owner: Address,
  outputMints: Address[]
): Promise<boolean[]> {
  try {
    // Get all ATAs in parallel
    const atas = await Promise.all(
      outputMints.map((mint) =>
        findAssociatedTokenPda({
          mint: address(mint),
          owner: address(owner),
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
        })
      )
    );

    // Check existence of all ATAs in parallel
    const existenceChecks = await Promise.all(
      atas.map(([ata]) =>
        rpc
          .getTokenAccountBalance(address(ata))
          .send()
          .then((response) => response.value !== null)
          .catch(() => false)
      )
    );

    return existenceChecks;
  } catch (error) {
    console.error("Error checking ATAs existence:", error);
    return outputMints.map(() => false);
  }
}
