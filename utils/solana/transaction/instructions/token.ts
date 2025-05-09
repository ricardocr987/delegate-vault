import { getTransferInstruction } from "@solana-program/token";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { getTransferSolInstruction } from "@solana-program/system";
import { findAssociatedTokenPda } from "@solana-program/token";
import { TransactionSigner, Address, address } from "@solana/kit";
import { SOL_MINT } from "../../constants";
import { IInstruction } from "@solana/kit";

export async function transferInstruction(
  signer: TransactionSigner,
  amount: bigint,
  mint: Address,
  destination: Address
): Promise<IInstruction<string>> {
  if (mint === SOL_MINT) {
    return getTransferSolInstruction({
      source: signer,
      destination: destination,
      amount,
    });
  } else {
    const [tokenAccount] = await findAssociatedTokenPda({
      mint,
      owner: address(signer.address),
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

    const [destinationTokenAccount] = await findAssociatedTokenPda({
      mint,
      owner: destination,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

    return getTransferInstruction({
      source: tokenAccount,
      destination: destinationTokenAccount,
      authority: signer,
      amount,
    });
  }
}
