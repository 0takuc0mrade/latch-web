import Link from "next/link";
import { useState } from "react";
import { DEMO_EXPLORER_CONTRACT_URL, shortAddress } from "@/lib/demo";
import { Chapter, type ChapterVariant } from "./chapter";
import { ArrowRightIcon, PasskeyIcon, PeopleIcon, ShieldIcon } from "./icons";
import { formatXlm, type ReceiptInfo } from "./parts";
import styles from "./demo.module.css";

/*
 * 04 Control and 05 Your journey, from latch's demo (#control, #finish).
 * Changes: the "App permissions" lesson and the journey summary mention the
 * spending limit; links to latch-only pages (multisig, technical demo) are
 * left out because this site doesn't have them.
 */

type Lesson = "passkey" | "approval" | "permissions";

const LESSONS: readonly [Lesson, string][] = [
  ["passkey", "Your passkey"],
  ["approval", "More approvals"],
  ["permissions", "App permissions"],
];

export function ControlChapter({ variant, onExplore }: { variant: ChapterVariant; onExplore: () => void }) {
  const [lesson, setLesson] = useState<Lesson>("passkey");

  return (
    <Chapter
      accent="You stay in control"
      body={
        <p className={styles.lede}>
          Having an account and approving an action are different things. Your address tells others where to send funds.
          Your passkey helps prove that you approve an action.
        </p>
      }
      id="control"
      label="04 · CONTROL"
      title={
        <>
          Your account.
          <br />
          Your say.
        </>
      }
      variant={variant}
    >
      <div className={styles.actionCard}>
        <div className={styles.cardHead}>
          <span className={styles.amberPill}>Educational illustration</span>
          <h3 className={styles.statusTitle}>What makes an action possible?</h3>
        </div>
        <div className={styles.chips} role="group" aria-label="Lessons">
          {LESSONS.map(([id, label]) => (
            <button
              aria-pressed={lesson === id}
              className={styles.chip}
              key={id}
              onClick={() => {
                setLesson(id);
                onExplore();
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <div aria-live="polite" className={styles.lessonBox}>
          {lesson === "passkey" ? (
            <>
              <PasskeyIcon size={30} />
              <h4 className={styles.lessonTitle}>A key, kept by your device</h4>
              <p className={styles.statusDetail}>
                In this demo, your passkey signs an authorization that the Smart Account verifies on-chain. Signing in
                restores access; sending requires a fresh approval.
              </p>
            </>
          ) : lesson === "approval" ? (
            <>
              <PeopleIcon size={30} />
              <h4 className={styles.lessonTitle}>Some accounts ask for more</h4>
              <p className={styles.statusDetail}>
                A shared account can require several people’s approvals. This journey does not configure multiple
                signers or recovery.
              </p>
            </>
          ) : (
            <>
              <ShieldIcon size={30} />
              <h4 className={styles.lessonTitle}>Rules define what is allowed</h4>
              <p className={styles.statusDetail}>
                The send flow adds a rule for calling the XLM contract with your passkey signer, with a spending limit:
                no more than 100 XLM in any 24 hours, even when you approve. This journey does not configure arbitrary
                app policies.
              </p>
            </>
          )}
        </div>
        <p className={styles.cardHint}>These explanation buttons do not change your account or submit transactions.</p>
      </div>
    </Chapter>
  );
}

export interface JourneyFacts {
  accountAddress: string | null;
  balanceStroops: bigint | null;
  funding: ReceiptInfo | null;
  /** The account already held XLM (e.g. signed in on a new device). */
  alreadyFunded: boolean;
  limitActive: boolean;
  setupReceipt: ReceiptInfo | null;
  activity: (ReceiptInfo & { amountStroops: bigint }) | null;
  /** Largest amount the rule refused in this visit, if any. */
  blockedStroops: bigint | null;
  showExplorerLinks: boolean;
}

function TxLink({ receipt, show }: { receipt: ReceiptInfo | null; show: boolean }) {
  if (!show || !receipt?.explorerUrl || !receipt.txHash) return null;
  return (
    <a className={styles.txLink} href={receipt.explorerUrl} rel="noreferrer" target="_blank">
      View transaction ↗ <span>{receipt.txHash}</span>
    </a>
  );
}

export function JourneyChapter({ variant, facts }: { variant: ChapterVariant; facts: JourneyFacts }) {
  const ready = !!facts.accountAddress;
  const sent = facts.activity?.status === "success";
  const funded = facts.funding?.status === "success" || facts.alreadyFunded;

  return (
    <section aria-labelledby="finish-title" className={styles.journeySection} data-variant={variant} id="finish">
      <p className={styles.chapterLabel}>05 · YOUR JOURNEY</p>
      <p className={styles.accent}>Look how far you’ve come</p>
      <h2 className={styles.chapterTitle} id="finish-title" tabIndex={-1}>
        {ready && sent ? "Your first steps, on Stellar." : "Your journey, so far."}
      </h2>
      <p className={styles.lede}>Here’s what you’ve actually completed. You can return to any chapter to keep exploring.</p>
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <span className={styles.factLabel}>Smart Account</span>
          <strong>{ready ? "Deployment verified" : "Not yet confirmed"}</strong>
          {facts.accountAddress ? (
            facts.showExplorerLinks ? (
              <a className={styles.breakAll} href={`${DEMO_EXPLORER_CONTRACT_URL}/${facts.accountAddress}`} rel="noreferrer" target="_blank">
                {facts.accountAddress} ↗
              </a>
            ) : (
              <span className={styles.breakAll}>{shortAddress(facts.accountAddress)}</span>
            )
          ) : null}
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.factLabel}>Test funds</span>
          <strong>
            {facts.funding?.status === "success"
              ? "Funding confirmed"
              : facts.alreadyFunded
                ? "Existing XLM balance verified"
                : facts.funding
                  ? `Funding ${facts.funding.status === "failed" ? "failed" : "pending"}`
                  : "Funding not completed in this journey"}
          </strong>
          <p>Current balance: {facts.balanceStroops === null ? "—" : formatXlm(facts.balanceStroops)} XLM</p>
          <TxLink receipt={facts.funding} show={facts.showExplorerLinks} />
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.factLabel}>Spending limit</span>
          <strong>{facts.limitActive ? "100 XLM every 24 hours, active" : "Not set yet"}</strong>
          {facts.blockedStroops !== null ? <p>Blocked a {formatXlm(facts.blockedStroops)} XLM send, even after your approval.</p> : null}
          <TxLink receipt={facts.setupReceipt} show={facts.showExplorerLinks} />
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.factLabel}>On-chain activity</span>
          <strong>
            {sent
              ? "XLM transfer confirmed"
              : facts.activity
                ? `Transaction ${facts.activity.status === "failed" ? "failed" : "pending"}`
                : "No confirmed action yet"}
          </strong>
          {facts.activity && sent ? <p>{formatXlm(facts.activity.amountStroops)} test XLM sent.</p> : null}
          <TxLink receipt={facts.activity} show={facts.showExplorerLinks} />
        </div>
      </div>
      <div className={styles.cardActionsInline}>
        <Link className={styles.primaryButton} href="/">
          More about Latch <ArrowRightIcon size={18} />
        </Link>
        {!funded && ready ? (
          <a className={styles.secondaryAction} href="#fund">
            Back to Fund
          </a>
        ) : null}
      </div>
    </section>
  );
}
