import Image from "next/image";
import { useState } from "react";
import { isDemoError } from "@/lib/demo";
import { Chapter, type ChapterVariant } from "./chapter";
import { ArrowRightIcon } from "./icons";
import { formatXlm, InlineAlert, Receipt, Spinner, TestTag, type ReceiptInfo } from "./parts";
import styles from "./demo.module.css";

interface FundChapterProps {
  variant: ChapterVariant;
  /** An account exists (latch's `ready`). */
  ready: boolean;
  balanceStroops: bigint | null;
  /** Receipt of this visit's funding, if any. */
  funding: (ReceiptInfo & { beforeStroops: bigint; afterStroops: bigint }) | null;
  showExplorerLinks: boolean;
  onFund: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onAnnounce: (message: string) => void;
}

/** 02 Fund, from latch's #fund chapter: free test XLM from Friendbot. */
export function FundChapter({ variant, ready, balanceStroops, funding, showExplorerLinks, onFund, onRefresh, onAnnounce }: FundChapterProps) {
  const [busy, setBusy] = useState<"" | "fund" | "refresh">("");
  const [fundError, setFundError] = useState("");
  const [balanceError, setBalanceError] = useState("");

  async function fund() {
    if (busy) return;
    setBusy("fund");
    setFundError("");
    onAnnounce("Asking Friendbot for test XLM.");
    try {
      await onFund();
    } catch (caught) {
      const text = isDemoError(caught) ? caught.message : "Friendbot didn’t answer. Nothing was added. Try again.";
      setFundError(text);
      onAnnounce(text);
    } finally {
      setBusy("");
    }
  }

  async function refresh() {
    if (busy) return;
    setBusy("refresh");
    setBalanceError("");
    try {
      await onRefresh();
      onAnnounce("Balance refreshed.");
    } catch {
      setBalanceError("Balance refresh failed. Please refresh again.");
      onAnnounce("The balance couldn’t be refreshed. Try again.");
    } finally {
      setBusy("");
    }
  }

  const hasXlm = balanceStroops !== null && balanceStroops > BigInt(0);

  return (
    <Chapter
      accent="Room to experiment"
      body={
        <>
          <p className={styles.lede}>
            XLM is Stellar’s native currency. Friendbot is a faucet that gives you free test XLM to try things out.
          </p>
          <p className={styles.lede}>These funds only work on testnet and have no monetary value.</p>
        </>
      }
      id="fund"
      label="02 · FUND"
      summary={{ title: `${balanceStroops === null ? "…" : formatXlm(balanceStroops)} test XLM`, detail: "Testnet only · no real value" }}
      title={
        <>
          A little fuel.
          <br />
          Zero real money.
        </>
      }
      variant={variant}
    >
      <div className={`${styles.actionCard} ${styles.fundCard}`} data-current={variant === "now" || undefined}>
        <Image alt="" aria-hidden="true" className={styles.fundArt} height={160} src="/demo-assets/wallet-coins.png" width={152} />
        <div className={styles.balanceLabel}>
          <span>Your test XLM balance</span>
          <TestTag />
        </div>
        <div className={styles.balanceValue}>
          <span className={styles.balanceNumber}>{balanceStroops === null ? "—" : formatXlm(balanceStroops)}</span>
          <span className={styles.balanceUnit}>XLM</span>
        </div>
        <span className={styles.amberPill}>Live network · no real value</span>
        {balanceStroops === null ? (
          <p className={styles.cardHint}>{ready ? "Refresh to read your balance." : "Create or sign in to your account first."}</p>
        ) : null}
        {balanceError ? <InlineAlert>{balanceError}</InlineAlert> : null}
        <div className={styles.cardActionsInline}>
          <button
            aria-busy={busy === "fund"}
            className={styles.primaryButton}
            disabled={!ready || !!busy || hasXlm}
            onClick={fund}
            type="button"
          >
            {busy === "fund" ? (
              <>
                <Spinner light />
                Asking Friendbot…
              </>
            ) : (
              <>
                Add test XLM <ArrowRightIcon size={18} />
              </>
            )}
          </button>
          <button aria-busy={busy === "refresh"} className={styles.secondaryAction} disabled={!ready || !!busy} onClick={refresh} type="button">
            {busy === "refresh" ? <Spinner /> : null}
            {busy === "refresh" ? "Refreshing…" : "Refresh balance"}
          </button>
        </div>
        {fundError ? <InlineAlert>{fundError}</InlineAlert> : null}
        {funding ? (
          <Receipt receipt={funding} showExplorerLinks={showExplorerLinks} title={funding.status === "failed" ? "Funding transaction failed." : "Funding confirmed on Stellar."}>
            Before: {formatXlm(funding.beforeStroops)} XLM → After funding: {formatXlm(funding.afterStroops)} XLM
          </Receipt>
        ) : hasXlm && variant === "done" ? (
          <p className={styles.cardHint}>Your account already has test XLM.</p>
        ) : null}
        {ready ? (
          <a className={styles.textAction} href="#send">
            Next: make something happen ↓
          </a>
        ) : null}
      </div>
    </Chapter>
  );
}
