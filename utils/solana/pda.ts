import {
  address,
  Address,
  getAddressEncoder,
  getProgramDerivedAddress,
  getU16Encoder,
} from "@solana/kit";
import { DELEGATE_VAULT_PROGRAM, TOKEN_PROGRAM } from "./constants";
import { findAssociatedTokenPda } from "@solana-program/token";
import { WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";

export async function getManagerAddress(authority: Address, project: Address) {
  return (
    await getProgramDerivedAddress({
      programAddress: DELEGATE_VAULT_PROGRAM,
      seeds: [
        Buffer.from("manager"),
        getAddressEncoder().encode(project),
        getAddressEncoder().encode(authority),
      ],
    })
  )[0];
}

export async function getOrderAddress(manager: Address, orderId: Address) {
  return (
    await getProgramDerivedAddress({
      programAddress: DELEGATE_VAULT_PROGRAM,
      seeds: [
        Buffer.from("order"),
        getAddressEncoder().encode(manager),
        getAddressEncoder().encode(orderId),
      ],
    })
  )[0];
}

export async function getOrderVaultAddress(
  signer: Address,
  manager: Address,
  order: Address,
  token: Address
) {
  return (
    await getProgramDerivedAddress({
      programAddress: DELEGATE_VAULT_PROGRAM,
      seeds: [
        Buffer.from("order_vault"),
        getAddressEncoder().encode(signer),
        getAddressEncoder().encode(manager),
        getAddressEncoder().encode(order),
        getAddressEncoder().encode(token),
      ],
    })
  )[0];
}

export async function getTokenVaultAddress(
  signer: Address,
  manager: Address,
  order: Address,
  token: Address
) {
  return (
    await getProgramDerivedAddress({
      programAddress: DELEGATE_VAULT_PROGRAM,
      seeds: [
        Buffer.from("token_vault"),
        getAddressEncoder().encode(signer),
        getAddressEncoder().encode(manager),
        getAddressEncoder().encode(order),
        getAddressEncoder().encode(token),
      ],
    })
  )[0];
}

export async function getTickArrayAddress(
  whirlpool: Address,
  startTickIndex: number
) {
  return (
    await getProgramDerivedAddress({
      programAddress: WHIRLPOOL_PROGRAM_ADDRESS,
      seeds: [
        Buffer.from("tick_array"),
        getAddressEncoder().encode(whirlpool),
        `${startTickIndex}`,
      ],
    })
  )[0];
}

export async function getOracleAddress(whirlpool: Address) {
  return (
    await getProgramDerivedAddress({
      programAddress: WHIRLPOOL_PROGRAM_ADDRESS,
      seeds: [Buffer.from("oracle"), getAddressEncoder().encode(whirlpool)],
    })
  )[0];
}

export async function getAtaAddress(
  owner: Address,
  mint: Address,
  tokenProgram: Address = TOKEN_PROGRAM
) {
  return (
    await findAssociatedTokenPda({
      mint,
      owner,
      tokenProgram,
    })
  )[0];
}

export async function getPositionAddress(positionMint: Address) {
  return (
    await getProgramDerivedAddress({
      programAddress: WHIRLPOOL_PROGRAM_ADDRESS,
      seeds: [
        Buffer.from("position"),
        getAddressEncoder().encode(positionMint),
      ],
    })
  )[0];
}

const whirlpoolConfigAddress = address(
  "2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ"
);
const tickSpacing = 64;

export async function getWhirlpoolAddress(
  tokenMintA: Address,
  tokenMintB: Address
): Promise<Address> {
  return (
    await getProgramDerivedAddress({
      programAddress: WHIRLPOOL_PROGRAM_ADDRESS,
      seeds: [
        "whirlpool",
        getAddressEncoder().encode(whirlpoolConfigAddress),
        getAddressEncoder().encode(tokenMintA),
        getAddressEncoder().encode(tokenMintB),
        getU16Encoder().encode(tickSpacing),
      ],
    })
  )[0];
}

export async function getProjectAddress(projectOwner: Address) {
  return (
    await getProgramDerivedAddress({
      programAddress: DELEGATE_VAULT_PROGRAM,
      seeds: [Buffer.from("project"), getAddressEncoder().encode(projectOwner)],
    })
  )[0];
}
