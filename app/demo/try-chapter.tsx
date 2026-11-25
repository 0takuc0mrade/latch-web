import { useEffect, useState } from "react";
import {
  DEMO_EXPLORER_ACCOUNT_URL,
  DEMO_RECIPIENT_ADDRESS,
  DEMO_SPENDING_LIMIT_STROOPS,
  isDemoError,
  looksLikeStellarAddress,
  parseXlmAmount,
  shortAddress,
  type SendStep,
} from "@/lib/demo";
import { Chapter, Disclosure, type ChapterVariant } from "./chapter";
import { ArrowRightIcon, BlockIcon, CheckIcon, PasskeyIcon, ShieldIcon } from "./icons";
import { formatXlm, InlineAlert, Receipt, Spinner, TestTag, UsageMeter, type ReceiptInfo } from "./parts";
import styles from "./demo.module.css";

export interface SendOutcome {
  receipt: ReceiptInfo;
  amountStroops: bigint;
}

interface TryChapterProps {
  variant: ChapterVariant;
  /** The visitor's account address, or null before create/sign in. */
  accountAddress: string | null;
  balanceStroops: bigint | null;
  /** Whether the spending limit is on the account (the XLM rule with the policy). */
  limitActive: boolean;
  usedStroops: bigint;
  showExplorerLinks: boolean;
  setupReceipt: ReceiptInfo | null;
  activity: SendOutcome | null;
  blocked: bigint | null;
  getBalance: (address: string) => Promise<bigint>;
  onInstallLimit: () => Promise<void>;
  onSend: (to: string, amountStroops: bigint, onStep: (step: SendStep) => void) => Promise<void>;
  onBlocked: (amountStroops: bigint) => void;
  onAnnounce: (message: string) => void;
}

const SIGNING_STEPS: readonly { id: SendStep; label: string }[] = [
  { id: "signed", label: "Your device signed" },
  { id: "checking", label: "Smart Account is checking" },
  { id: "recorded", label: "Stellar records it" },
];

type Busy = "" | "setup" | "send";

/**
 * 03 Try it, from latch's #send chapter: recipient, amount, review, approve
 * with the passkey. Where latch asks for an "XLM transfer permission" before
 * the first send, this demo asks for the spending limit (100 XLM per 24 hours):
 * the same kind of rule, with the limit policy attached.
 */
export function TryChapter(props: TryChapterProps) {
  const { variant, accountAddress, balanceStroops, limitActive, usedStroops, showExplorerLinks, onAnnounce } = props;
  const ready = !!accountAddress;

  const [useOwnRecipient, setUseOwnRecipient] = useState(false);
  const [pasted, setPasted] = useState("");
  const [amount, setAmount] = useState("50");
  const [review, setReview] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState<Busy>("");
  const [stepsDone, setStepsDone] = useState<SendStep[]>([]);
  const [txError, setTxError] = useState("");
  /** Bumped after each send so the recipient's balance is read again. */
  const [balanceVersion, setBalanceVersion] = useState(0);
  const [recipientBalance, setRecipientBalance] = useState<{ key: string; value: bigint | null } | null>(null);

  const recipient = useOwnRecipient ? pasted.trim() : DEMO_RECIPIENT_ADDRESS;
  const recipientLooksValid = looksLikeStellarAddress(recipient);
  const balanceKey = `${recipient}#${balanceVersion}`;
  const amountStroops = parseXlmAmount(amount);
  const left = DEMO_SPENDING_LIMIT_STROOPS > usedStroops ? DEMO_SPENDING_LIMIT_STROOPS - usedStroops : BigInt(0);
  const overLimit = amountStroops !== null && amountStroops > left;
  const { getBalance } = props;

  // The recipient's balance, shown under the address (the Latch demo account by default).
  useEffect(() => {
    if (!recipientLooksValid) return;
    let active = true;
    getBalance(recipient)
      .then((value) => active && setRecipientBalance({ key: balanceKey, value }))
      .catch(() => active && setRecipientBalance({ key: balanceKey, value: null }));
    return () => {
      active = false;
    };
  }, [balanceKey, getBalance, recipient, recipientLooksValid]);

  const shownRecipientBalance = recipientBalance?.key === balanceKey ? recipientBalance : null;

  function resetReview() {
    setReview(false);
    setTxError("");
  }

  /** latch's validateReview, without its 10 XLM cap: going over the limit is the point. */
  function validateReview() {
    setTxError("");
    if (!recipientLooksValid) {
      setTxError("Enter a valid testnet recipient address starting with G or C.");
      return;
    }
    if (recipient === accountAddress) {
      setTxError("Choose a different account to see a transfer.");
      return;
    }
    if (amountStroops === null) {
      setTxError("Enter an amount of XLM greater than 0, with up to 7 decimal places.");
      return;
    }
    if (balanceStroops === null || amountStroops > balanceStroops) {
      setTxError("Refresh your balance or add test XLM before sending this amount.");
      return;
    }
    setReview(true);
    onAnnounce(`Review: send ${formatXlm(amountStroops)} test XLM.`);
  }

  async function confirm() {
    if (busy || amountStroops === null) return;
    // latch asks for the XLM rule when the first send needs it; here that rule carries the limit.
    if (!limitActive) {
      setNeedsSetup(true);
      setReview(false);
      onAnnounce("First, set your spending limit. Then review and confirm your payment again.");
      return;
    }
    setBusy("send");
    setTxError("");
    setStepsDone([]);
    onAnnounce("Approve with your passkey.");
    try {
      await props.onSend(recipient, amountStroops, (step) => setStepsDone((steps) => (steps.includes(step) ? steps : [...steps, step])));
      setReview(false);
      onAnnounce(`Your XLM transfer is confirmed. ${formatXlm(amountStroops)} test XLM sent.`);
    } catch (caught) {
      if (isDemoError(caught) && caught.code === "spending_limit_exceeded") {
        setReview(false);
        props.onBlocked(amountStroops);
        onAnnounce(`Your rule said no. You approved ${formatXlm(amountStroops)} XLM, but only 100 XLM can leave in 24 hours. Nothing was sent.`);
      } else {
        const text = isDemoError(caught) ? caught.message : "Something went wrong. Nothing was sent.";
        setTxError(text);
        onAnnounce(text);
      }
    } finally {
      setBusy("");
      setBalanceVersion((version) => version + 1);
    }
  }

  async function setup() {
    if (busy) return;
    setBusy("setup");
    setTxError("");
    onAnnounce("Approve the spending limit with your passkey. Nothing changes until you do.");
    try {
      await props.onInstallLimit();
      setNeedsSetup(false);
      onAnnounce("Spending limit active: 100 XLM every 24 hours. Now review and confirm your payment again.");
    } catch (caught) {
      const text = isDemoError(caught) ? caught.message : "The spending limit wasn’t added. Nothing was changed.";
      setTxError(text);
      onAnnounce(text);
    } finally {
      setBusy("");
    }
  }

  const formLocked = !!busy || review || !ready;
  const activity = props.activity;

  let lower;
  if (!ready) {
    lower = <p className={styles.cardHint}>Create or sign in to your account above to continue.</p>;
  } else if (needsSetup) {
    lower = (
      <div className={styles.noticeBox}>
        <div className={styles.ruleHeading}>
          <span className={styles.ruleIcon}>
            <ShieldIcon size={24} />
          </span>
          <span className={styles.ruleHeadingText}>
            <span className={styles.ruleTitle}>First, set your spending limit</span>
            <span className={styles.ruleSubtitle}>Enforced on-chain by your Smart Account</span>
          </span>
        </div>
        <div className={styles.ruleAmount}>
          <span className={styles.ruleNumber}>100 XLM</span>
          <span className={styles.rulePeriod}>every 24 hours</span>
          <TestTag />
        </div>
        <p className={styles.statusDetail}>
          This is a separate on-chain change to your account rules: your account will refuse any send that takes more
          than 100 XLM out in 24 hours. Approve it, then review and confirm your payment again.
        </p>
        <button aria-busy={busy === "setup"} className={styles.primaryButton} disabled={!!busy} onClick={setup} type="button">
          {busy === "setup" ? (
            <>
              <Spinner light />
              Waiting for your passkey…
            </>
          ) : (
            <>
              <PasskeyIcon size={20} />
              Approve spending limit with passkey
            </>
          )}
        </button>
      </div>
    );
  } else if (busy === "send") {
    const firstPending = SIGNING_STEPS.findIndex((step) => !stepsDone.includes(step.id));
    lower = (
      <div className={styles.reviewBox}>
        <h3 className={styles.statusTitle}>Approving…</h3>
        <ol className={styles.signingList}>
          {SIGNING_STEPS.map((step, index) => {
            const state = stepsDone.includes(step.id) ? "done" : index === firstPending ? "active" : "waiting";
            return (
              <li data-state={state} key={step.id}>
                <span className={styles.signingMark}>{state === "done" ? <CheckIcon size={12} /> : state === "active" ? <Spinner /> : null}</span>
                {step.label}
              </li>
            );
          })}
        </ol>
      </div>
    );
  } else if (review && amountStroops !== null) {
    lower = (
      <div className={styles.reviewBox}>
        <h3 className={styles.statusTitle}>Ready to send?</h3>
        <dl className={styles.reviewRows}>
          <div>
            <dt>Network</dt>
            <dd>Stellar testnet</dd>
          </div>
          <div>
            <dt>Action</dt>
            <dd>{formatXlm(amountStroops)} XLM transfer</dd>
          </div>
          <div>
            <dt>Recipient</dt>
            <dd className={styles.breakAll}>{useOwnRecipient ? recipient : `Latch demo account (${shortAddress(recipient)})`}</dd>
          </div>
        </dl>
        {limitActive && overLimit ? (
          <p className={styles.pointNote}>
            <b>Over your limit.</b>
            <span>Your account will say no, even after you approve.</span>
          </p>
        ) : null}
        <p className={styles.cardHint}>Your passkey approves this action. Latch’s existing bundler pays the network fee.</p>
        <div className={styles.cardActionsInline}>
          <button className={styles.primaryButton} onClick={confirm} type="button">
            <PasskeyIcon size={18} />
            Confirm & approve with passkey
          </button>
          <button className={styles.secondaryAction} onClick={resetReview} type="button">
            Edit / cancel
          </button>
        </div>
      </div>
    );
  } else {
    lower = (
      <button className={styles.primaryButton} disabled={!!busy} onClick={validateReview} type="button">
        Review payment <ArrowRightIcon size={18} />
      </button>
    );
  }

  return (
    <Chapter
      accent="Your first move"
      aside={
        <Disclosure summary="About the spending limit">
          The first send needs a separate passkey approval to add an XLM rule to your account: the native XLM contract
          can be called with your signer, up to 100 XLM in any 24 hours. Your account enforces the limit on Stellar. You
          still authorize each payment separately.
        </Disclosure>
      }
      body={
        <>
          <p className={styles.lede}>
            Send a little test XLM to another account. You’ll review the details and approve with your passkey before
            anything moves.
          </p>
          <p className={styles.lede}>
            Your first send asks you to set a spending limit: no more than 100 XLM can leave in any 24 hours. Send 50 XLM,
            then try 150 and watch your account say no.
          </p>
        </>
      }
      id="send"
      label="03 · TRY IT"
      title={
        <>
          Small action.
          <br />
          Real possibility.
        </>
      }
      variant={variant}
    >
      <div className={`${styles.actionCard} ${styles.flowCard}`} data-current={variant === "now" || undefined}>
        <fieldset className={styles.choiceGroup} disabled={formLocked}>
          <legend>Recipient’s testnet address</legend>
          <div className={styles.chips}>
            <button aria-pressed={!useOwnRecipient} className={styles.chip} onClick={() => { setUseOwnRecipient(false); resetReview(); }} type="button">
              Latch demo account
            </button>
            <button aria-pressed={useOwnRecipient} className={styles.chip} onClick={() => { setUseOwnRecipient(true); resetReview(); }} type="button">
              Paste your own
            </button>
          </div>
          {useOwnRecipient ? (
            <div className={styles.pasteField}>
              <label className={styles.srOnly} htmlFor="demo-recipient">
                Recipient’s testnet address
              </label>
              <textarea
                autoComplete="off"
                className={styles.pasteInput}
                id="demo-recipient"
                onChange={(event) => {
                  setPasted(event.target.value);
                  resetReview();
                }}
                placeholder="Paste a G… or C… address"
                rows={2}
                spellCheck={false}
                value={pasted}
              />
              <span className={styles.cardHint}>Use another deployed Smart Account or an existing funded Stellar testnet account.</span>
            </div>
          ) : (
            <p className={styles.recipientLine}>
              {showExplorerLinks ? (
                <a href={`${DEMO_EXPLORER_ACCOUNT_URL}/${DEMO_RECIPIENT_ADDRESS}`} rel="noreferrer" target="_blank" title={DEMO_RECIPIENT_ADDRESS}>
                  {shortAddress(DEMO_RECIPIENT_ADDRESS)} ↗
                </a>
              ) : (
                <span title={DEMO_RECIPIENT_ADDRESS}>{shortAddress(DEMO_RECIPIENT_ADDRESS)}</span>
              )}
              <span className={styles.cardMuted}>A testnet account Latch set up to receive demo payments.</span>
            </p>
          )}
          {recipientLooksValid ? (
            <p className={styles.recipientBalance} role="status">
              Recipient balance:{" "}
              <b>{shownRecipientBalance ? (shownRecipientBalance.value === null ? "unavailable" : `${formatXlm(shownRecipientBalance.value)} test XLM`) : "…"}</b>
            </p>
          ) : null}
        </fieldset>

        <fieldset className={styles.choiceGroup} disabled={formLocked}>
          <legend>
            <label htmlFor="demo-amount">Amount in XLM</label> <TestTag />
          </legend>
          <input
            className={styles.amountInput}
            id="demo-amount"
            inputMode="decimal"
            onChange={(event) => {
              setAmount(event.target.value);
              resetReview();
            }}
            value={amount}
          />
          <span className={styles.cardHint}>Your limit is 100 XLM in any 24 hours. Try 50 XLM, then try 150.</span>
        </fieldset>

        {limitActive ? (
          <UsageMeter
            limitStroops={DEMO_SPENDING_LIMIT_STROOPS}
            note={
              amountStroops === null
                ? `${formatXlm(left)} XLM left for today.`
                : overLimit
                  ? `${formatXlm(amountStroops)} XLM is more than your rule allows today. Your account will say no, even after you approve.`
                  : `${formatXlm(amountStroops)} XLM fits. You’d have ${formatXlm(left - amountStroops)} XLM left for today.`
            }
            usedStroops={usedStroops}
          />
        ) : null}

        {lower}
        {txError ? <InlineAlert>{txError}</InlineAlert> : null}

        {props.setupReceipt ? (
          <Receipt receipt={props.setupReceipt} showExplorerLinks={showExplorerLinks} title="Spending limit: confirmed">
            100 XLM every 24 hours, enforced by your account.
          </Receipt>
        ) : null}
        {props.blocked !== null ? (
          <div className={styles.blockedBox}>
            <span className={styles.blockedIcon}>
              <BlockIcon size={22} />
            </span>
            <div className={styles.cardHead}>
              <h3 className={styles.statusTitle}>Your rule said no</h3>
              <p className={styles.statusDetail}>
                You approved {formatXlm(props.blocked)} XLM, but your Smart Account only allows 100 XLM per 24 hours. Even a
                valid signature can’t break the account’s rules. Nothing was sent.
              </p>
            </div>
          </div>
        ) : null}
        {activity ? (
          <Receipt
            receipt={activity.receipt}
            showExplorerLinks={showExplorerLinks}
            title={activity.receipt.status === "failed" ? "The transaction failed. Review before retrying." : "Your XLM transfer is confirmed."}
          >
            {formatXlm(activity.amountStroops)} test XLM sent, within your rule.
          </Receipt>
        ) : null}
      </div>
    </Chapter>
  );
}
