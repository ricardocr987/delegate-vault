import { Base58EncodedBytes } from "@solana/rpc-types";
import { Base64EncodedWireTransaction } from "@solana/transactions";
import { Address } from "@solana/kit";

export type JitoBundleSimulationResponse = {
  context: {
    apiVersion: string;
    slot: number;
  };
  value: {
    summary:
      | "succeeded"
      | {
          failed: {
            error: {
              TransactionFailure: [number[], string];
            };
            tx_signature: string;
          };
        };
    transactionResults: Array<{
      err: null | unknown;
      logs: string[];
      postExecutionAccounts: null | unknown;
      preExecutionAccounts: null | unknown;
      returnData: null | unknown;
      unitsConsumed: number;
    }>;
  };
};

export type JitoAddon = {
  getRegions(): string[];
  getTipAccounts(): Address[];
  getBundleStatuses(bundleIds: string[]): {
    context: { slot: number };
    value: {
      bundleId: string;
      transactions: Base58EncodedBytes[];
      slot: number;
      confirmationStatus: string;
      err: any;
    }[];
  };
  getInflightBundleStatuses(bundleIds: string[]): {
    context: { slot: number };
    value: {
      bundle_id: string;
      status: "Invalid" | "Pending" | "Landed" | "Failed";
      landed_slot: number | null;
    }[];
  };
  sendTransaction(transactions: Base64EncodedWireTransaction[]): string;
  simulateBundle(
    transactions: [Base64EncodedWireTransaction[]]
  ): JitoBundleSimulationResponse;
  sendBundle(
    transactions: string[],
    options?: { encoding?: "base58" | "base64" }
  ): string;
};
