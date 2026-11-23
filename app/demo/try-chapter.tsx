import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DEMO_RECIPIENT_ADDRESS,
  DEMO_SPENDING_LIMIT_STROOPS,
  isDemoError,
  looksLikeStellarAddress,
  xlmToStroops,
  type SendResult,
  type SendStep,
} from "@/lib/demo";
import { Chapter, type ChapterVariant } from "./chapter";
import { ArrowDownIcon, BlockIcon, CheckIcon, CrossIcon, InfoIcon, PasskeyIcon } from "./icons";
import { DonePill, formatXlm, Spinner, TestTag, UsageMeter } from "./parts";
import styles from "./demo.module.css";

const AMOUNTS = [50, 100, 150] as const;
type Amount = (typeof AMOUNTS)[number];

/** idle: the chapter's resting card (payment form, or the "Rule tested" summary once done). */
type Phase = "idle" | "compose" | "review" | "signing" | "success" | "blocked" | "cancelled" | "failed";

interface TryChapterProps {
  variant: ChapterVariant;
  usedStroops: bigint;
  balanceStroops: bigint | null;
  /** Mock mode has no real explorer link to show. */
  showExplorerLinks: boolean;
  onSend: (to: string, amountStroops: bigint, onStep: (step: SendStep) => void) => Promise<SendResult & { explorerUrl?: string }>;
  /** Scroll to 05 How it works (shown once the chapter is done). */
  onSeeWhatHappened: () => void;
  /** A send over the limit was blocked in this visit (06 Your journey reports it). */
  blockedOnce: boolean;
  onBlocked: () => void;
  /** Status messages for the page's live region. */
  onAnnounce: (message: string) => void;
}

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Payment",
  compose: "Payment",
  review: "Review payment",
  signing: "Approving",
  success: "Payment sent",
  blocked: "Blocked by your rule",
  cancelled: "Approval cancelled",
  failed: "Payment failed",
};

const SIGNING_STEPS: readonly { id: SendStep; label: string }[] = [
  { id: "signed", label: "Your device signed" },
  { id: "checking", label: "Smart Account is checking" },
  { id: "recorded", label: "Stellar records it" },
];

/** 04 Try it: 50 XLM goes through, 150 XLM is blocked by the rule (3221). */
export function TryChapter({
  variant,
  usedStroops,
  balanceStroops,
  showExplorerLinks,
  onSend,
  onSeeWhatHappened,
  blockedOnce,
  onBlocked,
  onAnnounce,
}: TryChapterProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [amount, setAmount] = useState<Amount>(50);
  const [recipientMode, setRecipientMode] = useState<"demo" | "paste">("demo");
  const [pasted, setPasted] = useState("");
  const [stepsDone, setStepsDone] = useState<SendStep[]>([]);
  const [message, setMessage] = useState("");
  const [lastSent, setLastSent] = useState<{ amount: Amount; explorerUrl?: string } | null>(null);
  /** Each phase swaps the card, removing the focused button; focus follows to the new card. */
  const cardRef = useRef<HTMLDivElement>(null);
  const previousPhase = useRef<Phase>(phase);

  useEffect(() => {
    if (previousPhase.current === phase) return;
    previousPhase.current = phase;
    cardRef.current?.focus({ preventScroll: true });
    cardRef.current?.scrollIntoView({ block: "nearest" });
  }, [phase]);

  const limit = DEMO_SPENDING_LIMIT_STROOPS;
  const left = limit > usedStroops ? limit - usedStroops : BigInt(0);
  const amountStroops = xlmToStroops(amount);
  const fits = amountStroops <= left;
  const recipientValid = recipientMode === "demo" || looksLikeStellarAddress(pasted);
  const recipientLabel = recipientMode === "demo" ? "Latch demo account" : `${pasted.trim().slice(0, 4)}…${pasted.trim().slice(-4)}`;
  const done = variant === "done";

  function review(next: Amount) {
    setAmount(next);
    setMessage("");
    setPhase("review");
    onAnnounce(`Review: send ${next} test XLM.`);
  }

  async function approve() {
    setPhase("signing");
    setStepsDone([]);
    onAnnounce("Approving. Confirm with your passkey.");
    try {
      const to = recipientMode === "demo" ? DEMO_RECIPIENT_ADDRESS : pasted.trim();
      const result = await onSend(to, amountStroops, (step) =>
        setStepsDone((steps) => (steps.includes(step) ? steps : [...steps, step])),
      );
      setLastSent({ amount, explorerUrl: result.explorerUrl });
      setPhase("success");
      // `done` is this render's variant: false means this send just completed the chapter.
      onAnnounce(
        done
          ? `Within your rule. ${amount} test XLM sent.`
          : `Within your rule. ${amount} test XLM sent. How it works, Your journey and Why Smart Accounts are now open below.`,
      );
    } catch (caught) {
      if (isDemoError(caught) && caught.code === "spending_limit_exceeded") {
        onBlocked();
        setPhase("blocked");
        onAnnounce(`Your rule said no. You approved ${amount} XLM, but only 100 XLM can leave in 24 hours. Nothing was sent.`);
      } else if (isDemoError(caught) && caught.code === "passkey_cancelled") {
        setPhase("cancelled");
        onAnnounce("Approval was cancelled. Nothing was sent.");
      } else {
        const text = isDemoError(caught) ? caught.message : "Something went wrong. Nothing was sent.";
        setMessage(text);
        setPhase("failed");
        onAnnounce(text);
      }
    }
  }

  const seeWhatHappened = done ? (
    <button className={styles.linkButton} onClick={onSeeWhatHappened} type="button">
      See what happened <ArrowDownIcon size={14} />
    </button>
  ) : null;

  let card: ReactNode;
  if (phase === "review") {
    card = (
      <div className={`${styles.actionCard} ${styles.flowCard}`} data-current={!done || undefined}>
        <div className={styles.reviewAmount}>
          <span className={styles.cardMuted}>You’re sending</span>
          <span className={styles.reviewValue}>
            <span className={styles.reviewNumber}>{amount} XLM</span>
            <TestTag />
          </span>
        </div>
        <dl className={styles.reviewRows}>
          <div>
            <dt>From</dt>
            <dd>Your Smart Account</dd>
          </div>
          <div>
            <dt>To</dt>
            <dd>{recipientLabel}</dd>
          </div>
          <div>
            <dt>Network fee</dt>
            <dd>Covered by Latch</dd>
          </div>
        </dl>
        <p className={styles.limeNote}>
          <PasskeyIcon size={18} />
          <span>
            <b>Your passkey approves</b> only this payment.
          </span>
        </p>
        <button className={styles.primaryButton} onClick={approve} type="button">
          <PasskeyIcon size={18} />
          Approve with passkey
        </button>
        <button className={styles.textAction} onClick={() => setPhase("compose")} type="button">
          Cancel
        </button>
      </div>
    );
  } else if (phase === "signing") {
    const firstPending = SIGNING_STEPS.findIndex((step) => !stepsDone.includes(step.id));
    card = (
      <div className={`${styles.actionCard} ${styles.flowCard}`} data-current={!done || undefined}>
        <div>
          <h3 className={styles.statusTitle}>Approving…</h3>
          <p className={styles.statusDetail}>Your passkey proves it’s you. Your Smart Account checks that proof.</p>
        </div>
        <ol className={styles.signingList}>
          {SIGNING_STEPS.map((step, index) => {
            const state = stepsDone.includes(step.id) ? "done" : index === firstPending ? "active" : "waiting";
            return (
              <li data-state={state} key={step.id}>
                <span className={styles.signingMark}>
                  {state === "done" ? <CheckIcon size={12} /> : state === "active" ? <Spinner /> : null}
                </span>
                {step.label}
              </li>
            );
          })}
        </ol>
        <button className={styles.primaryButton} disabled type="button">
          <Spinner light />
          {stepsDone.includes("signed") ? "Waiting for Stellar…" : "Waiting for your passkey…"}
        </button>
      </div>
    );
  } else if (phase === "success" && lastSent) {
    card = (
      <div className={`${styles.actionCard} ${styles.flowCard}`}>
        <div className={styles.resultHeader}>
          <Image alt="" aria-hidden="true" className={styles.resultArt} height={70} src="/demo-assets/mascot-keys.png" width={70} />
          <div>
            <h3 className={styles.statusTitle}>Within your rule!</h3>
            <p className={styles.statusDetail}>
              {lastSent.amount} test XLM sent. {formatXlm(left)} XLM left for today.
            </p>
          </div>
        </div>
        <div className={styles.confirmedRow}>
          <span>
            <span className={styles.reassureDot}>
              <CheckIcon size={11} />
            </span>
            Confirmed on testnet
          </span>
          {showExplorerLinks && lastSent.explorerUrl ? (
            <a href={lastSent.explorerUrl} rel="noreferrer" target="_blank">
              View ↗
            </a>
          ) : null}
        </div>
        <ul className={styles.resultList}>
          <li>You approved with your passkey</li>
          <li>Your Smart Account checked the 100 XLM rule</li>
          <li>Stellar recorded it on the ledger</li>
        </ul>
        {!blockedOnce ? (
          <button className={styles.primaryButton} onClick={() => review(150)} type="button">
            Now try 150 XLM
          </button>
        ) : (
          <button className={styles.secondaryAction} onClick={() => setPhase("compose")} type="button">
            Send more
          </button>
        )}
        {seeWhatHappened}
      </div>
    );
  } else if (phase === "blocked") {
    card = (
      <div className={`${styles.actionCard} ${styles.flowCard}`}>
        <span className={styles.blockedIcon}>
          <BlockIcon size={26} />
        </span>
        <div>
          <h3 className={styles.statusTitle}>Your rule said no</h3>
          <p className={styles.statusDetail}>
            You approved {amount} XLM, but your Smart Account only allows 100 XLM per 24 hours.
          </p>
        </div>
        <UsageMeter compact limitStroops={limit} usedStroops={usedStroops} />
        <p className={styles.pointNote}>
          <b>This is the point.</b>
          <span>Even a valid signature can’t break the account’s rules. Nothing was sent.</span>
        </p>
        {left >= xlmToStroops(50) ? (
          <button className={styles.primaryButton} onClick={() => review(50)} type="button">
            Send 50 XLM instead
          </button>
        ) : (
          <button className={styles.secondaryAction} onClick={() => setPhase("compose")} type="button">
            Back to the payment
          </button>
        )}
        {seeWhatHappened}
      </div>
    );
  } else if (phase === "cancelled" || phase === "failed") {
    card = (
      <div className={`${styles.actionCard} ${styles.flowCard}`} data-current={!done || undefined}>
        <span className={styles.errorIcon}>
          <CrossIcon size={24} />
        </span>
        <div>
          <h3 className={styles.statusTitle}>{phase === "cancelled" ? "Approval was cancelled" : "The payment didn’t go through"}</h3>
          <p className={styles.statusDetail}>
            {phase === "cancelled" ? "The passkey prompt was closed or timed out." : message}
          </p>
        </div>
        <p className={styles.reassure}>
          <span className={styles.reassureDot}>
            <CheckIcon size={11} />
          </span>
          Nothing was sent. Your test XLM is still in your account.
        </p>
        <button className={styles.primaryButton} onClick={() => review(amount)} type="button">
          Try again
        </button>
        <button className={styles.textAction} onClick={() => setPhase("compose")} type="button">
          Change the payment
        </button>
      </div>
    );
  } else if (phase === "idle" && done) {
    // Done variant (returning visit, or back from a result): the rule-tested summary.
    card = (
      <div className={`${styles.actionCard} ${styles.flowCard}`}>
        <div className={styles.testedHeader}>
          <span className={styles.ruleTitle}>Rule tested</span>
          <DonePill />
        </div>
        <p className={styles.outcomeRow} data-tone="ok">
          <span className={styles.outcomeMark}>
            <CheckIcon size={14} />
          </span>
          <span>
            <b>{formatXlm(usedStroops > BigInt(0) ? usedStroops : xlmToStroops(50))} XLM sent.</b> Within your rule.
          </span>
        </p>
        {blockedOnce ? (
          <p className={styles.outcomeRow} data-tone="blocked">
            <span className={styles.outcomeMark}>
              <BlockIcon size={14} />
            </span>
            <span>
              <b>150 XLM blocked</b> by your rule, even after your passkey approved it.
            </span>
          </p>
        ) : (
          <div className={styles.outcomeRow} data-tone="blocked">
            <span className={styles.outcomeMark}>
              <InfoIcon size={14} />
            </span>
            <span>Now go over the limit and watch the account say no.</span>
            <button className={styles.inlineAction} onClick={() => review(150)} type="button">
              Try 150 XLM
            </button>
          </div>
        )}
        <UsageMeter
          limitStroops={limit}
          note={
            balanceStroops === null
              ? `${formatXlm(left)} XLM left today`
              : `Balance ${formatXlm(balanceStroops)} test XLM · ${formatXlm(left)} XLM left today`
          }
          usedStroops={usedStroops}
        />
        <button className={styles.textAction} onClick={() => setPhase("compose")} type="button">
          Send another payment
        </button>
        {seeWhatHappened}
      </div>
    );
  } else {
    card = (
      <div className={`${styles.actionCard} ${styles.flowCard}`} data-current={!done || undefined}>
        <fieldset className={styles.choiceGroup}>
          <legend>Send to</legend>
          <div className={styles.chips}>
            <button aria-pressed={recipientMode === "demo"} className={styles.chip} onClick={() => setRecipientMode("demo")} type="button">
              Latch demo account
            </button>
            <button aria-pressed={recipientMode === "paste"} className={styles.chip} onClick={() => setRecipientMode("paste")} type="button">
              Paste an address
            </button>
          </div>
          {recipientMode === "paste" ? (
            <div className={styles.pasteField}>
              <label className={styles.srOnly} htmlFor="demo-recipient">
                Stellar address (G… or C…)
              </label>
              <input
                aria-describedby="demo-recipient-hint"
                aria-invalid={pasted.length > 0 && !recipientValid}
                autoComplete="off"
                className={styles.pasteInput}
                id="demo-recipient"
                onChange={(event) => setPasted(event.target.value)}
                placeholder="G… or C… testnet address"
                spellCheck={false}
                value={pasted}
              />
              <span className={styles.cardHint} id="demo-recipient-hint">
                {pasted.length > 0 && !recipientValid ? "That doesn’t look like a Stellar address yet." : "Any testnet account or contract."}
              </span>
            </div>
          ) : null}
        </fieldset>
        <fieldset className={styles.choiceGroup}>
          <legend>
            Amount <TestTag />
          </legend>
          <div className={styles.chips}>
            {AMOUNTS.map((value) => (
              <button
                aria-pressed={amount === value}
                className={styles.chip}
                data-over={value === 150 || undefined}
                key={value}
                onClick={() => setAmount(value)}
                type="button"
              >
                {value} XLM{value === 150 ? <span className={styles.desktopOnly}>&nbsp;· over the limit</span> : null}
              </button>
            ))}
          </div>
        </fieldset>
        <UsageMeter
          limitStroops={limit}
          note={
            fits
              ? `${amount} XLM fits. You’d have ${formatXlm(left - amountStroops)} XLM left for today.`
              : `${amount} XLM is more than your rule allows today. Your account will say no, even after you approve.`
          }
          usedStroops={usedStroops}
        />
        <button className={styles.primaryButton} disabled={!recipientValid} onClick={() => review(amount)} type="button">
          Review payment
        </button>
      </div>
    );
  }

  // Keep the full chapter on mobile while a payment result is on screen.
  const showingFlow = phase !== "idle";

  return (
    <Chapter
      accent="Small action. Real possibility."
      aside={
        <p className={styles.hintBox}>
          <InfoIcon size={20} />
          <span>
            <b>Your passkey says yes, your rule can still say no.</b> Approval proves it’s you. The rule decides whether
            it’s allowed.
          </span>
        </p>
      }
      body={{
        desktop:
          "Send 50 XLM: it goes through. Then try 150 XLM, more than the rule allows, and watch your Smart Account say no on-chain, even though you approved it with your passkey.",
        mobile: "Send 50 XLM and it goes through. Try 150 XLM and your Smart Account says no, even after you approve it.",
      }}
      id="try"
      label="04 · TRY IT"
      summary={
        showingFlow
          ? undefined
          : {
              title: "Rule tested",
              detail: blockedOnce ? "50 XLM sent · 150 XLM blocked by your rule" : "50 XLM sent within your rule",
            }
      }
      title="Put your rule to the test."
      variant={variant}
    >
      <div aria-label={PHASE_LABEL[phase]} className={styles.flowFocus} ref={cardRef} role="group" tabIndex={-1}>
        {card}
      </div>
    </Chapter>
  );
}
