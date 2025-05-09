import { Address, address } from "@solana/kit";
import {
  AddressesByLookupTableAddress,
  fetchJsonParsedAccounts,
} from "@solana/kit";
import { rpc } from "../rpc";

type FetchedAddressLookup = {
  addresses: Address[];
};

export async function getLookupTables(
  lookupTableAddresses: string[]
): Promise<AddressesByLookupTableAddress> {
  if (lookupTableAddresses.length === 0) {
    return {};
  }

  const fetchedLookupTables = await fetchJsonParsedAccounts<
    FetchedAddressLookup[]
  >(
    rpc,
    lookupTableAddresses.map((a) => address(a))
  );

  return fetchedLookupTables.reduce<AddressesByLookupTableAddress>(
    (acc, lookup: any) => {
      return {
        ...acc,
        [lookup.address]: lookup.data.addresses,
      };
    },
    {}
  );
}
