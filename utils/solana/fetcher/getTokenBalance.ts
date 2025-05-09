import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
  decodeToken,
} from "@solana-program/token";
import { rpc } from "../rpc";
import { SOL_MINT } from "../constants";
import type { EncodedAccount } from "@solana/accounts";
import { Address, ReadonlyUint8Array, address } from "@solana/kit";
import type { Base64EncodedDataResponse } from "@solana/rpc-types";
import { getMintInfo } from "./getMint";

export async function getTokenBalance(
  userKey: string,
  tokenMint: string
): Promise<string | null> {
  try {
    // Handle SOL token
    if (tokenMint === SOL_MINT) {
      const { value: solBalance } = await rpc
        .getBalance(address(userKey))
        .send();

      const solUiAmount = Number(solBalance.toString()) / Math.pow(10, 9);
      return solUiAmount.toString();
    }

    // Get token decimals from mint
    const mintInfo = await getMintInfo(tokenMint);
    if (!mintInfo) {
      console.warn("No mint info found for token:", tokenMint);
      return null;
    }

    // Handle other tokens
    const [tokenAta] = await findAssociatedTokenPda({
      mint: address(tokenMint),
      owner: address(userKey),
      tokenProgram: address(mintInfo.programAddress),
    });

    const { value: tokenAccountResponse } = await rpc
      .getAccountInfo(tokenAta, { encoding: "base64" })
      .send();

    if (!tokenAccountResponse?.data) {
      return null;
    }

    const [base64Data] = tokenAccountResponse.data;
    if (!base64Data) {
      return null;
    }

    const rawData = Buffer.from(base64Data, "base64");
    const encodedAccount: EncodedAccount<string> = {
      address: tokenAta,
      data: new Uint8Array(rawData) as ReadonlyUint8Array,
      executable: tokenAccountResponse.executable,
      lamports: tokenAccountResponse.lamports,
      programAddress: tokenAccountResponse.owner,
    };

    const decodedTokenAccount = decodeToken(encodedAccount);
    if (!decodedTokenAccount) {
      return null;
    }

    const amount = decodedTokenAccount.data.amount.toString();
    const uiAmount = Number(amount) / Math.pow(10, mintInfo.data.decimals);

    return uiAmount.toString();
  } catch (error) {
    console.error("Error fetching token balance:", error);
    return null;
  }
}
