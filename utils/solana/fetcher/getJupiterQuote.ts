import ky from "ky";
import { config } from "../../../config";

interface JupiterQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps?: number;
  onlyDirectRoutes?: boolean;
  asLegacyTransaction?: boolean;
}

interface PlatformFee {
  amount: string;
  feeBps: number;
  pct: number;
}

interface RoutePlanStep {
  swapInfo: {
    ammKey: string;
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    minOutAmount: string;
    priceImpactPct: number;
  };
  percent: number;
  swapPlan: {
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      minOutAmount: string;
      priceImpactPct: number;
    };
    otherAmountThreshold: string;
    swapMode: "ExactIn" | "ExactOut";
    fees: {
      signatureFee: number;
      openOrdersDeposits: number[];
      ataDeposits: number[];
      totalFeeAndDeposits: number;
      minimumSOLForTransaction: number;
      lpfFee?: {
        amount: string;
        pct: number;
      };
    };
  };
}

interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: "ExactIn" | "ExactOut";
  slippageBps: number;
  platformFee?: PlatformFee;
  priceImpactPct: string;
  routePlan: RoutePlanStep[];
  contextSlot?: number;
  timeTaken?: number;
}

export async function getJupiterQuote({
  inputMint,
  outputMint,
  amount,
  slippageBps = 100,
  onlyDirectRoutes = false,
  asLegacyTransaction = false,
}: JupiterQuoteParams): Promise<JupiterQuoteResponse> {
  const response = await ky
    .get("https://api.jup.ag/swap/v1/quote", {
      searchParams: {
        inputMint,
        outputMint,
        amount,
        slippageBps,
        onlyDirectRoutes,
        asLegacyTransaction,
      },
      headers: {
        "x-api-key": config.JUPITER_API_KEY,
      },
    })
    .json<JupiterQuoteResponse>();

  return response;
}
