import { useState } from "react";
import type { CreateStep, DemoAccount, DemoError } from "@/lib/demo";
import { DEMO_EXPLORER_CONTRACT_URL, DEMO_LIVE_URL } from "@/lib/demo";
import { Chapter, Disclosure, type ChapterVariant } from "./chapter";
import { ArrowRightIcon, CheckIcon, CopyIcon, CrossIcon, PasskeyIcon } from "./icons";
import { InlineAlert, Spinner } from "./parts";
import styles from "./demo.module.css";

/** Account creation in this page view. */
export type CreatePhase = "idle" | "creating" | "error";

interface CreateChapterProps {
  variant: ChapterVariant;
  account: DemoAccount | null;
  /** Looking for a saved account on load (latch: "Checking your existing session…"). */
  recovering: boolean;
  createPhase: CreatePhase;
  completedSteps: readonly CreateStep[];
  createError: DemoError | null;
  /** Creating is taking long (the backend waking up). */
  slowCreate: boolean;
  signingIn: boolean;
  checking: boolean;
  /** One line about sign-in or restore (e.g. no account for this passkey). */
  notice: string | null;
  /** Live demo on a host where passkeys can't work: a link to uselatch.app instead of the buttons. */
  offsite: { devHint: boolean } | null;
  showExplorerLinks: boolean;
  onCreate: () => void;
  onSignIn: () => void;
  onCheck: () => void;
}

const CREATE_STEPS: readonly { id: CreateStep; label: string }[] = [
  { id: "passkey", label: "Passkey created" },
  { id: "account", label: "Creating your Smart Account" },
  { id: "signer", label: "Adding your passkey as signer" },
];

/** 01 Create, from latch's #create chapter. */
export function CreateChapter(props: CreateChapterProps) {
  const { variant, account, recovering, createPhase, offsite } = props;
  const ready = !!account;
  const creating = createPhase === "creating";

  let card;
  if (offsite) {
    card = (
      <div className={styles.offsite}>
        <p className={styles.offsiteText}>The live demo runs on uselatch.app, where your passkey works.</p>
        <a className={styles.primaryButton} href={DEMO_LIVE_URL}>
          Try it on uselatch.app
        </a>
        {offsite.devHint ? (
          <p className={styles.offsiteHint}>
            Local development: add <code>?mock</code>, or run against a local latch-api with{" "}
            <code>NEXT_PUBLIC_DEMO_LOCAL_BACKEND=1</code>.
          </p>
        ) : null}
      </div>
    );
  } else if (recovering) {
    card = (
      <p className={styles.cardMuted} role="status">
        <Spinner /> Checking your existing session…
      </p>
    );
  } else if (ready) {
    card = <ReadyAccount account={account} showExplorerLinks={props.showExplorerLinks} />;
  } else if (creating) {
    card = <CreatingSteps completedSteps={props.completedSteps} slow={props.slowCreate} />;
  } else {
    card = (
      <>
        {createPhase === "error" && props.createError ? <CreateErrorBox error={props.createError} /> : null}
        <div className={styles.cardActionsInline}>
          <button
            aria-disabled={props.signingIn || undefined}
            className={styles.primaryButton}
            id="create-account"
            onClick={props.onCreate}
            type="button"
          >
            <PasskeyIcon size={20} />
            {createPhase === "error" ? "Try again" : "Create my account"}
          </button>
          <button
            aria-busy={props.signingIn}
            aria-disabled={props.signingIn || undefined}
            className={styles.secondaryAction}
            onClick={props.onSignIn}
            type="button"
          >
            {props.signingIn ? <Spinner /> : null}
            {props.signingIn ? "Signing in…" : "Sign in with a passkey"}
          </button>
        </div>
      </>
    );
  }

  return (
    <Chapter
      accent="A place to begin"
      aside={
        <Disclosure summary="What do I need?">
          A browser with passkey support, a screen lock, and access to this site on uselatch.app. Keep the passkey to
          sign in again. Testnet accounts and funds may be reset by Stellar.
        </Disclosure>
      }
      body={
        <>
          <p className={styles.lede}>
            Your device helps you create a passkey using a fingerprint, face scan, or screen lock. Latch uses its public
            key to create your wallet on Stellar.
          </p>
          <p className={styles.lede}>
            This wallet is a <strong>Smart Account</strong>: an account with programmable rules for approving actions.
          </p>
        </>
      }
      id="create"
      label="01 · CREATE"
      summary={account ? { title: "Smart Account created", detail: "Live on Stellar testnet" } : undefined}
      title={
        <>
          An account.
          <br />
          All yours to explore.
        </>
      }
      variant={variant}
    >
      <div className={styles.actionCard} data-current={variant === "now" || undefined}>
        <div className={styles.cardHead}>
          <span className={styles.ruleIcon}>
            <PasskeyIcon size={24} />
          </span>
          <h3 className={styles.statusTitle}>{ready ? "Your account is ready." : "Your device is your starting point."}</h3>
          <p className={styles.statusDetail}>
            {ready
              ? "Your account is deployed on Stellar testnet. Your passkey will approve each action."
              : "No wallet extension needed. Your browser will guide you through creating or choosing a passkey."}
          </p>
        </div>
        {card}
        {props.notice ? <InlineAlert>{props.notice}</InlineAlert> : null}
        {!offsite && !creating ? (
          <button
            aria-busy={props.checking}
            aria-disabled={props.checking || recovering || props.signingIn || undefined}
            className={styles.textAction}
            onClick={props.onCheck}
            type="button"
          >
            {props.checking ? "Checking account…" : "Check account / restore session"}
          </button>
        ) : null}
      </div>
    </Chapter>
  );
}

function ReadyAccount({ account, showExplorerLinks }: { account: DemoAccount; showExplorerLinks: boolean }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(account.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <>
      <div className={styles.addressBox}>
        <span className={styles.factLabel}>Your account address</span>
        <code className={styles.fullAddress}>{account.address}</code>
      </div>
      <div className={styles.cardActionsInline}>
        <button className={styles.secondaryAction} onClick={copy} type="button">
          {copied ? (
            "Copied"
          ) : (
            <>
              <CopyIcon size={16} />
              Copy address
            </>
          )}
        </button>
        {showExplorerLinks ? (
          <a className={styles.linkButton} href={`${DEMO_EXPLORER_CONTRACT_URL}/${account.address}`} rel="noreferrer" target="_blank">
            View on Stellar Expert ↗
          </a>
        ) : null}
      </div>
      {copyFailed ? <InlineAlert>Copy unavailable. Select and copy the address above.</InlineAlert> : null}
      <a className={styles.primaryButton} href="#fund">
        Next: add test funds <ArrowRightIcon size={18} />
      </a>
    </>
  );
}

function CreatingSteps({ completedSteps, slow }: { completedSteps: readonly CreateStep[]; slow: boolean }) {
  const firstPending = CREATE_STEPS.findIndex((step) => !completedSteps.includes(step.id));
  return (
    <div className={styles.creatingBox}>
      <p className={styles.cardHint}>
        {slow ? "Waking up the demo’s server. This can take up to 30 seconds. Keep this tab open." : "A few seconds. Keep this tab open."}
      </p>
      <ol className={styles.progressList}>
        {CREATE_STEPS.map((step, index) => {
          const done = completedSteps.includes(step.id);
          const active = index === firstPending;
          return (
            <li data-state={done ? "done" : active ? "active" : "waiting"} key={step.id}>
              <span className={styles.progressMark}>
                {done ? <CheckIcon size={12} /> : active ? <span aria-hidden="true" className={styles.spinner} /> : null}
              </span>
              {step.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function CreateErrorBox({ error }: { error: DemoError }) {
  const title =
    error.code === "passkey_cancelled"
      ? "We couldn’t create your passkey"
      : error.code === "passkey_unsupported"
        ? "Passkeys aren’t available here"
        : "We couldn’t set up your account";
  const message = error.nothingHappened ? error.message.replace(/\s*Nothing was created\.$/, "") : error.message;
  return (
    <div className={styles.errorBox} role="alert">
      <span className={styles.errorIcon}>
        <CrossIcon size={20} />
      </span>
      <div>
        <p className={styles.errorTitle}>{title}</p>
        <p className={styles.statusDetail}>{message}</p>
        {error.nothingHappened ? <p className={styles.reassureText}>Nothing was created. You can try again safely.</p> : null}
      </div>
    </div>
  );
}
