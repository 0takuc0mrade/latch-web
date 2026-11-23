import Image from "next/image";
import { useState } from "react";
import { isDemoError } from "@/lib/demo";
import { Chapter, type ChapterVariant } from "./chapter";
import { formatXlm, InlineAlert, Spinner, TestTag } from "./parts";
import styles from "./demo.module.css";

interface FundChapterProps {
  variant: ChapterVariant;
  balanceStroops: bigint | null;
  onFund: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onAnnounce: (message: string) => void;
}

type FundStatus = "idle" | "loading" | "error";

/** 02 Fund: free test XLM from Friendbot. */
export function FundChapter({ variant, balanceStroops, onFund, onRefresh, onAnnounce }: FundChapterProps) {
  const [status, setStatus] = useState<FundStatus>("idle");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  async function fund() {
    if (status === "loading") return;
    setStatus("loading");
    setError("");
    onAnnounce("Asking Friendbot for test XLM.");
    try {
      await onFund();
      setStatus("idle");
    } catch (caught) {
      const text = isDemoError(caught) ? caught.message : "Friendbot didn’t answer. Nothing was added. Try again.";
      setError(text);
      setStatus("error");
      onAnnounce(text);
    }
  }

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
      onAnnounce("Balance refreshed.");
    } catch {
      onAnnounce("The balance couldn’t be refreshed. Try again.");
    } finally {
      setRefreshing(false);
    }
  }

  const done = variant === "done";
  const balance = balanceStroops === null ? (done ? "…" : "0") : formatXlm(balanceStroops);

  return (
    <Chapter
      accent="Room to experiment"
      body={{
        desktop:
          "XLM is Stellar’s own currency. Here it comes free from Friendbot, Stellar’s testnet faucet. These funds only work on testnet and have no monetary value.",
        mobile: "Free test XLM from Friendbot, Stellar’s testnet faucet. No monetary value.",
      }}
      id="fund"
      label="02 · FUND"
      summary={{ title: `${balance} test XLM added`, detail: "Testnet only · no real value" }}
      title="A little fuel. Zero real money."
      variant={variant}
    >
      <div className={`${styles.actionCard} ${styles.fundCard}`} data-current={!done || undefined}>
        <Image alt="" aria-hidden="true" className={styles.fundArt} height={160} src="/demo-assets/wallet-coins.png" width={152} />
        <div className={styles.balanceLabel}>
          <span>Your test balance</span>
          <TestTag />
        </div>
        <div className={styles.balanceValue}>
          <span className={styles.balanceNumber}>{balance}</span>
          <span className={styles.balanceUnit}>XLM</span>
        </div>
        <span className={styles.amberPill}>Testnet only · no real value</span>
        {status === "error" ? <InlineAlert>{error}</InlineAlert> : null}
        <div className={styles.cardActions}>
          {done ? (
            <button aria-busy={refreshing} aria-disabled={refreshing || undefined} className={styles.secondaryAction} onClick={refresh} type="button">
              {refreshing ? <Spinner /> : null}
              {refreshing ? "Refreshing…" : "Refresh balance"}
            </button>
          ) : (
            <button
              aria-busy={status === "loading"}
              className={styles.primaryButton}
              aria-disabled={status === "loading" || undefined}
              onClick={fund}
              type="button"
            >
              {status === "loading" ? (
                <>
                  <Spinner light />
                  Asking Friendbot…
                </>
              ) : status === "error" ? (
                "Try again"
              ) : (
                "Get free test XLM"
              )}
            </button>
          )}
        </div>
      </div>
    </Chapter>
  );
}
