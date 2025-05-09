import { jitoApi } from "./api";

const POLL_TIMEOUT_MS = 60000;

export type JitoBundleConfirmation = {
  bundleId: string;
  signatures: string[];
};

export async function confirmJitoBundle(
  transactions: string[],
  encoding: "base58" | "base64" = "base64"
): Promise<JitoBundleConfirmation> {
  try {
    let bundleId = await jitoApi.sendBundle(transactions, { encoding });
    console.log(`Bundle sent with ID: ${bundleId}`);

    if (!bundleId) {
      console.log("Failed to send bundle, retrying...");
      bundleId = await jitoApi.sendBundle(transactions, { encoding });
      console.log(`Retried bundle sent with ID: ${bundleId}`);

      if (!bundleId) {
        throw new Error("Failed to send bundle");
      }
    }

    const finalStatus = await jitoApi.pollBundleStatus(
      bundleId,
      POLL_TIMEOUT_MS
    );

    if (finalStatus.status === "Failed") {
      throw new Error(`Bundle ${bundleId} failed`);
    }

    if (finalStatus.status === "Landed") {
      console.log(
        `Bundle ${bundleId} landed in slot ${finalStatus.landed_slot}`
      );
      const bundleDetails = await jitoApi.getBundleStatus(bundleId);

      console.log("bundleDetails", bundleDetails);
      return {
        bundleId,
        signatures: bundleDetails?.transactions || [],
      };
    }

    throw new Error(`Unexpected bundle status: ${finalStatus.status}`);
  } catch (error) {
    console.error("Error confirming Jito bundle:", error);
    throw error;
  }
}
