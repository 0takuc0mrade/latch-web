import type { ReceiptInfo } from "./parts";
import type { SendOutcome } from "./try-chapter";

export type FundingReceipt = ReceiptInfo & { beforeStroops: bigint; afterStroops: bigint };

export interface SavedReceipts {
  funding: FundingReceipt | null;
  setup: ReceiptInfo | null;
  activity: SendOutcome | null;
}

/** Same key shape as latch's demo (`latch-demo:<address>` in sessionStorage). */
const key = (address: string) => `latch-demo:${address}`;

/** bigint amounts are stored as decimal strings. */
export function saveReceipts(address: string, receipts: SavedReceipts): void {
  try {
    window.sessionStorage.setItem(key(address), JSON.stringify(receipts, (_k, v) => (typeof v === "bigint" ? `${v}n` : v)));
  } catch {
    /* Storage is optional; receipts are a convenience. */
  }
}

export function loadReceipts(address: string): SavedReceipts | null {
  try {
    const raw = window.sessionStorage.getItem(key(address));
    if (!raw) return null;
    const value = JSON.parse(raw, (_k, v) => (typeof v === "string" && /^\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v)) as Partial<SavedReceipts>;
    return { funding: value.funding ?? null, setup: value.setup ?? null, activity: value.activity ?? null };
  } catch {
    return null;
  }
}
