import ky from "ky";

export type JitoApiResponse<T> = {
  jsonrpc: "2.0";
  result: T;
  id: number;
};

export type BundleStatus = {
  bundle_id: string;
  status: "Invalid" | "Pending" | "Landed" | "Failed";
  landed_slot: number | null;
};

export type BundleStatusResponse = {
  context: { slot: number };
  value: BundleStatus[];
};

export type BundleDetails = {
  bundleId: string;
  slot: number;
  validator: string;
  tippers: string[];
  landedTipLamports: number;
  landedCu: number;
  blockIndex: number;
  timestamp: string;
  txSignatures: string[];
};

export type TipFloorStats = {
  time: string;
  landed_tips_25th_percentile: number;
  landed_tips_50th_percentile: number;
  landed_tips_75th_percentile: number;
  landed_tips_95th_percentile: number;
  landed_tips_99th_percentile: number;
  ema_landed_tips_50th_percentile: number;
};

export type BundleStatusDetail = {
  bundle_id: string;
  transactions: string[];
  slot: number;
  confirmation_status: "processed" | "confirmed" | "finalized";
  err: { Ok: null } | { Err: string };
};

export type BundleStatusesResponse = {
  context: { slot: number };
  value: (BundleStatusDetail | null)[];
};

export class JitoApi {
  private readonly client: typeof ky;
  private readonly bundlesClient: typeof ky;

  constructor(
    baseUrl: string = "https://mainnet.block-engine.jito.wtf/api/v1"
  ) {
    this.client = ky.create({
      prefixUrl: baseUrl,
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    this.bundlesClient = ky.create({
      prefixUrl: "https://bundles.jito.wtf/api/v1",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retry: {
        backoffLimit: 1000,
        limit: 3,
      },
    });
  }

  private async sendRequest<T>(
    method: string,
    params: unknown[] = []
  ): Promise<JitoApiResponse<T>> {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    });

    return this.client.post("bundles", { body }).json<JitoApiResponse<T>>();
  }

  async sendBundle(
    transactions: string[],
    options: { encoding: "base58" | "base64" }
  ): Promise<string> {
    const response = await this.sendRequest<string>("sendBundle", [
      transactions,
      options,
    ]);

    if (!response) {
      console.log(
        "Bundle sent failed, the response is",
        JSON.stringify(response)
      );
    }

    return response.result;
  }

  async getInflightBundleStatuses(
    bundleIds: string[]
  ): Promise<BundleStatusResponse> {
    const response = await this.sendRequest<BundleStatusResponse>(
      "getInflightBundleStatuses",
      [bundleIds]
    );
    return response.result;
  }

  async getTipAccounts(): Promise<string[]> {
    const response = await this.sendRequest<string[]>("getTipAccounts");
    return response.result;
  }

  async getRandomTipAccount(): Promise<string> {
    const accounts = await this.getTipAccounts();
    return accounts[Math.floor(Math.random() * accounts.length)];
  }

  async pollBundleStatus(
    bundleId: string,
    timeoutMs: number = 30000
  ): Promise<BundleStatus> {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < timeoutMs) {
      const response = await this.getInflightBundleStatuses([bundleId]);
      const status = response.value[0];

      if (!status || status.status === "Failed") {
        throw new Error(`Error confirming bundleId: ${bundleId}`);
      }

      if (status.status === "Landed") {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Polling timeout reached for bundle ${bundleId}`);
  }

  async getBundleStatuses(
    bundleIds: string[]
  ): Promise<BundleStatusesResponse> {
    if (bundleIds.length > 5) {
      throw new Error("Maximum of 5 bundle IDs can be queried at once");
    }

    const response = await this.sendRequest<BundleStatusesResponse>(
      "getBundleStatuses",
      [bundleIds]
    );
    return response.result;
  }

  /** @deprecated Use getBundleStatuses instead, takes long to get a proper response */
  async getBundleDetails(bundleId: string): Promise<BundleDetails> {
    console.warn(
      "getBundleDetails is deprecated. Please use getBundleStatuses instead"
    );
    return this.bundlesClient
      .get(`bundles/bundle/${bundleId}`, {
        throwHttpErrors: false,
      })
      .json<BundleDetails>();
  }

  async getBundleStatus(bundleId: string): Promise<BundleStatusDetail | null> {
    const response = await this.getBundleStatuses([bundleId]);
    return response.value[0];
  }

  async getTipFloorStats(): Promise<TipFloorStats[]> {
    return this.bundlesClient
      .get("bundles/tip_floor", {
        throwHttpErrors: false,
      })
      .json<TipFloorStats[]>();
  }
}

export const jitoApi = new JitoApi();
