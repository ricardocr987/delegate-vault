import {
  createDefaultRpcTransport,
  createJsonRpcApi,
  createRpc,
  createSolanaRpcApi,
  SolanaRpcApiMainnet,
} from "@solana/rpc";
import {
  createSolanaRpcSubscriptions,
  sendAndConfirmTransactionFactory,
} from "@solana/kit";
import { JitoAddon } from "./transaction/jito/types";
import { web3 } from "@coral-xyz/anchor";

// RPC HTTP Transport
export const heliusRpcTransport = createDefaultRpcTransport({
  url: process.env.RPC_ENDPOINT!,
});

const solanaApi = createSolanaRpcApi<SolanaRpcApiMainnet>({
  defaultCommitment: "confirmed",
});

export const rpc = createRpc({
  api: solanaApi,
  transport: heliusRpcTransport,
});

const wsEndpoint = process.env.RPC_ENDPOINT.replace("https://", "wss://");
const rpcSubscriptions = createSolanaRpcSubscriptions(wsEndpoint);
export const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({
  rpc,
  rpcSubscriptions,
});

export const JitoEndpoints = {
  mainnet: "https://mainnet.block-engine.jito.wtf/api/v1/transactions",
  amsterdam:
    "https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/transactions",
  frankfurt:
    "https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/transactions",
  ny: "https://ny.mainnet.block-engine.jito.wtf/api/v1/transactions",
  tokyo: "https://tokyo.mainnet.block-engine.jito.wtf/api/v1/transactions",
};

const jitoApi = createJsonRpcApi<JitoAddon>({
  responseTransformer: (response: any) => response.result,
});
const jitoTransport = createDefaultRpcTransport({
  url: JitoEndpoints.frankfurt,
});
export const jitoRpc = createRpc({
  api: jitoApi,
  transport: jitoTransport,
});

export const solanaConnection = new web3.Connection(
  process.env.RPC_ENDPOINT,
  "confirmed"
);
