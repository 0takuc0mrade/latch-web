import { useState } from "react";
import { DEMO_SPENDING_LIMIT_STROOPS, isDemoError } from "@/lib/demo";
import { Chapter, type ChapterVariant } from "./chapter";
import { ChevronDownIcon, PasskeyIcon, ShieldIcon } from "./icons";
import { DonePill, formatXlm, InlineAlert, Spinner, TestTag, UsageMeter } from "./parts";
import styles from "./demo.module.css";

interface RuleChapterProps {
  variant: ChapterVariant;
  usedStroops: bigint;
  balanceStroops: bigint | null;
  onInstall: () => Promise<void>;
  onAnnounce: (message: string) => void;
}

type RuleStatus = "idle" | "prompting" | "error";

/** 03 Set a rule: 100 XLM per 24 hours, approved with the passkey. */
export function RuleChapter({ variant, usedStroops, balanceStroops, onInstall, onAnnounce }: RuleChapterProps) {
  const [status, setStatus] = useState<RuleStatus>("idle");
  const [error, setError] = useState("");

  async function install() {
    if (status === "prompting") return;
    setStatus("prompting");
    setError("");
    onAnnounce("Waiting for your passkey. Approve on your device. Nothing changes until you do.");
    try {
      await onInstall();
      setStatus("idle");
    } catch (caught) {
      const text = isDemoError(caught) ? caught.message : "The rule wasn’t added. Nothing was changed.";
      setError(text);
      setStatus("error");
      onAnnounce(text);
    }
  }

  const done = variant === "done";

  return (
    <Chapter
      accent="Smart, not just stored."
      aside={
        <details className={styles.disclosure}>
          <summary>
            <span className={styles.disclosureLabel}>
              <span aria-hidden="true" className={styles.disclosureMark}>
                ?
              </span>
              What else can a rule do?
            </span>
            <ChevronDownIcon className={styles.disclosureChevron} size={18} />
          </summary>
          <p>Spending limits like this one. Time locks and allowlists work the same way.</p>
        </details>
      }
      body={{
        desktop:
          "This is what makes it a Smart Account. You set a policy once: no more than 100 XLM can leave in any 24 hours. From then on, the account itself enforces it on Stellar. Not an app, not Latch.",
        mobile: "Only 100 XLM can leave in any 24 hours. Your account enforces it on-chain, not an app.",
      }}
      id="rule"
      label="03 · SET A RULE"
      summary={{ title: "100 XLM every 24 hours", detail: "Active · enforced on-chain" }}
      title="Give your account a spending rule."
      variant={variant}
    >
      <div className={styles.actionCard} data-current={!done || undefined}>
        <div className={styles.ruleHeader}>
          <span className={styles.ruleHeading}>
            <span className={styles.ruleIcon}>
              <ShieldIcon size={24} />
            </span>
            <span className={styles.ruleHeadingText}>
              <span className={styles.ruleTitle}>Daily spending limit</span>
              <span className={styles.ruleSubtitle}>Enforced on-chain by your Smart Account</span>
            </span>
          </span>
          {done ? <DonePill label="Active" /> : <span className={styles.amberPill}>Not set yet</span>}
        </div>
        <div className={styles.ruleAmount}>
          <span className={styles.ruleNumber}>100 XLM</span>
          <span className={styles.rulePeriod}>every 24 hours</span>
          <TestTag />
        </div>
        {done ? (
          <UsageMeter
            limitStroops={DEMO_SPENDING_LIMIT_STROOPS}
            note={
              balanceStroops === null
                ? "Only 100 test XLM can leave in any 24 hours."
                : `You hold ${formatXlm(balanceStroops)} test XLM, but only 100 can leave in any 24 hours.`
            }
            usedStroops={usedStroops}
          />
        ) : (
          <>
            {status === "error" ? <InlineAlert>{error}</InlineAlert> : null}
            <button
              aria-busy={status === "prompting"}
              className={styles.primaryButton}
              aria-disabled={status === "prompting" || undefined}
              onClick={install}
              type="button"
            >
              {status === "prompting" ? (
                <>
                  <Spinner light />
                  Waiting for your passkey…
                </>
              ) : (
                <>
                  <PasskeyIcon size={20} />
                  {status === "error" ? "Try again with passkey" : "Add rule with passkey"}
                </>
              )}
            </button>
            {status === "prompting" ? (
              <p className={styles.cardHint}>
                Approve on your device. Nothing changes until you do.
              </p>
            ) : null}
          </>
        )}
      </div>
    </Chapter>
  );
}
