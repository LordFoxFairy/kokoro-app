import { restoreRssTriggerParent } from "./bff-rss-trigger-parent"
import { createHash } from "node:crypto"
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex")
/** Exact current delta inverse; all previous owner bytes remain independently pinned. */
export function restoreBillingCreditAccountParent(bytes: Uint8Array): Buffer {
 bytes = restoreRssTriggerParent(bytes)
 if (hash(bytes) !== "bf1b8809173fcbbabb1d3c4c1994f55763e552b9d3b46b3c577ef10ee7291423") throw new Error("not fixed public19.3")
 let text = Buffer.from(bytes).toString("utf8")
 text = text.replace(/^  \/v1\/billing\/credit-account:\n[\s\S]*?(?=^  \/v1\/)/mu, value => { if (hash(value) !== "c905e818a49b75af3a2c390db76347a3b0bbbc64ee7bc413e02438db0e4f1634") throw new Error("billing operation delta drift"); return "" })
 text = text.replace(/^    BillingCreditAccountError400:\n[\s\S]*?(?=^    BillingSummaryResponse:)/mu, value => { if (hash(value) !== "3c038da3ecfe00d569bbfbb64a1afc0a952a0f64095b250089ab140ae38f501e") throw new Error("billing schema delta drift"); return "" })
 text = text.replace("  version: 19.3.0\n", "  version: 19.2.0\n")
 if (hash(text) !== "ef56014105cc187bd86da74eb5ba6eef5f54aacb934e2f86e007c98719ff02f6") throw new Error("public19.2 bytes drift")
 return Buffer.from(text)
}
