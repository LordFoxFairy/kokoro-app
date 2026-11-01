import { restoreBillingCreditAccountParent } from "./bff-billing-credit-account-parent"
import { createHash } from "node:crypto"
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex")
/** One test-only exact inverse; old I3 and historical parent assertions remain unchanged. */
export function restoreRunHistoryParent(bytes: Uint8Array): Buffer {
 bytes = restoreBillingCreditAccountParent(bytes)
 if (hash(bytes) !== "ef56014105cc187bd86da74eb5ba6eef5f54aacb934e2f86e007c98719ff02f6") throw new Error("not fixed public19.2")
 let text = Buffer.from(bytes).toString("utf8")
 text = text.replace(/^  \/v1\/scheduled-task-runs:\n[\s\S]*?(?=^  \/v1\/)/mu, value => { if (hash(value) !== "30531e0e8b0a992308986b06f2fd2aa849f17bba1adc568c405f67117212bef5") throw new Error("run history delta drift"); return "" })
 text = text.replace(/^    ScheduledTaskRunItem:\n[\s\S]*?(?=^    ScheduledTask:\n)/mu, value => { if (hash(value) !== "9bf92f75d80825c454e21d89c1dfadd0ac1a7d4b7f4c7f2e5042ffc1ac11726d") throw new Error("run history delta drift"); return "" })
 text = text.replace("  version: 19.2.0\n", "  version: 19.1.0\n")
 if (hash(text) !== "ac649109f7b394ab894d17352c5f9f106e24e1cbf94e74672569333190adfab5") throw new Error("public19.1 bytes drift")
 return Buffer.from(text)
}
