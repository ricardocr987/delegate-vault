import { TokenAmount } from "@solana/rpc-types";
import { rpc } from "../rpc";
import { TOKEN_PROGRAM, TOKEN_PROGRAM_2022 } from "../constants";
import { address, Address } from "@solana/kit";
type TokenAccountState = "frozen" | "initialized" | "uninitialized";

export type TokenAccount = Readonly<{
  pubkey: Address;
  account: {
    closeAuthority?: Address;
    delegate?: Address;
    delegatedAmount?: TokenAmount;
    extensions?: readonly unknown[];
    isNative: boolean;
    mint: Address;
    owner: Address;
    rentExemptReserve?: TokenAmount;
    state: TokenAccountState;
    tokenAmount: TokenAmount;
  };
}>;

export async function getTokenAccounts(
  ownerAddress: Address
): Promise<TokenAccount[]> {
  try {
    const response = await rpc
      .getTokenAccountsByOwner(
        address(ownerAddress),
        { programId: address(TOKEN_PROGRAM) },
        { encoding: "jsonParsed" }
      )
      .send();

    if (!response) {
      console.warn("No response from getTokenAccountsByOwner");
      return [];
    }

    if (!response.value) {
      console.warn("No value in getTokenAccountsByOwner response");
      return [];
    }

    const tokenAccounts = response.value
      .map((account) => {
        try {
          if (!account.account.data.parsed?.info) {
            console.warn("Invalid account data structure:", account);
            return null;
          }

          return {
            pubkey: address(account.pubkey),
            account: {
              mint: address(account.account.data.parsed.info.mint),
              owner: address(account.account.data.parsed.info.owner),
              state: account.account.data.parsed.info.state,
              tokenAmount: account.account.data.parsed.info.tokenAmount,
              isNative: account.account.data.parsed.info.isNative,
              closeAuthority: account.account.data.parsed.info.closeAuthority
                ? address(account.account.data.parsed.info.closeAuthority)
                : undefined,
              delegate: account.account.data.parsed.info.delegate
                ? address(account.account.data.parsed.info.delegate)
                : undefined,
              delegatedAmount: account.account.data.parsed.info.delegatedAmount,
              extensions: account.account.data.parsed.info.extensions,
              rentExemptReserve:
                account.account.data.parsed.info.rentExemptReserve,
            },
          };
        } catch (error) {
          console.error("Error parsing account:", error, account);
          return null;
        }
      })
      .filter((account) => account !== null);

    const response22 = await rpc
      .getTokenAccountsByOwner(
        address(ownerAddress),
        { programId: address(TOKEN_PROGRAM_2022) },
        { encoding: "jsonParsed" }
      )
      .send();

    const tokenAccounts22 = response22.value.map((account) => {
      return {
        pubkey: address(account.pubkey),
        account: {
          mint: address(account.account.data.parsed.info.mint),
          owner: address(account.account.data.parsed.info.owner),
          state: account.account.data.parsed.info.state,
          tokenAmount: account.account.data.parsed.info.tokenAmount,
          isNative: account.account.data.parsed.info.isNative,
          closeAuthority: account.account.data.parsed.info.closeAuthority
            ? address(account.account.data.parsed.info.closeAuthority)
            : undefined,
          delegate: account.account.data.parsed.info.delegate
            ? address(account.account.data.parsed.info.delegate)
            : undefined,
          delegatedAmount: account.account.data.parsed.info.delegatedAmount,
          extensions: account.account.data.parsed.info.extensions,
          rentExemptReserve: account.account.data.parsed.info.rentExemptReserve,
        },
      };
    });

    return [...tokenAccounts, ...tokenAccounts22];
  } catch (error) {
    console.error("Error in getTokenAccounts:", error);
    return [];
  }
}
