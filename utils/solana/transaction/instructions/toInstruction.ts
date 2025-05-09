import { AccountRole, IInstruction } from "@solana/instructions";
import { address } from "@solana/kit";

export function toInstruction(legacyInstruction: any) {
  const data = Buffer.from(legacyInstruction.data, "base64");

  const keys = legacyInstruction.keys
    ? legacyInstruction.keys
    : legacyInstruction.accounts;
  const accounts = keys.map((accountMeta: any) =>
    Object.freeze({
      address:
        typeof accountMeta.pubkey === "string"
          ? accountMeta.pubkey
          : address(accountMeta.pubkey.toString()),
      role: determineRole(accountMeta.isSigner, accountMeta.isWritable),
    })
  );
  const programAddress =
    typeof legacyInstruction.programId === "string"
      ? legacyInstruction.programId
      : address(legacyInstruction.programId.toString());

  return Object.freeze({
    ...(accounts.length ? { accounts: Object.freeze(accounts) } : null),
    ...(data ? { data } : null),
    programAddress,
  });
}

function determineRole(isSigner: boolean, isWritable: boolean): AccountRole {
  if (isSigner && isWritable) return AccountRole.WRITABLE_SIGNER;
  if (isSigner) return AccountRole.READONLY_SIGNER;
  if (isWritable) return AccountRole.WRITABLE;
  return AccountRole.READONLY;
}
