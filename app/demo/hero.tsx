import { useState } from "react";
import type { CreateStep, DemoAccount, DemoError } from "@/lib/demo";
import { DEMO_EXPLORER_CONTRACT_URL, DEMO_LIVE_URL } from "@/lib/demo";
import { MascotScene } from "../mascot-scene";
import { Disclosure } from "./chapter";
import { ArrowRightIcon, CheckIcon, CopyIcon, CrossIcon, PasskeyIcon, SendIcon, ShieldIcon, XlmIcon } from "./icons";
import { DonePill, InlineAlert, Spinner } from "./parts";
import styles from "./demo.module.css";

/** Account creation in this page view. */
export type CreatePhase = "idle" | "creating" | "error";

interface HeroProps {
  dark: boolean;
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
  /** Forget this account on this device and go back to Create (the passkey stays on the device). */
  onStartOver: () => void;
}

/* "Your next few minutes" from latch's welcome panel, plus the spending-limit step. */
const NEXT_MINUTES = [
  { icon: <PasskeyIcon size={17} />, title: "Start with a passkey", detail: "Use your device to create your account." },
  { icon: <XlmIcon size={17} />, title: "Give it a little XLM", detail: "Free funds for a safe first try." },
  { icon: <ShieldIcon size={17} />, title: "Set a spending limit", detail: "Only 100 XLM can leave every 24 hours." },
  { icon: <SendIcon size={17} />, title: "Make your first move", detail: "You approve. Stellar records it." },
] as const;

const CREATE_STEPS: readonly { id: CreateStep; label: string }[] = [
  { id: "passkey", label: "Passkey created" },
  { id: "account", label: "Creating your Smart Account" },
  { id: "signer", label: "Adding your passkey as signer" },
];

/**
 * 01 Create, the top of the page: latch's welcome copy with the create
 * actions under it. The card on the right follows the account: what's
 * ahead, then the setup steps, then the account itself.
 */
export function Hero(props: HeroProps) {
  const { account, recovering, createPhase, offsite } = props;
  const ready = !!account;
  const creating = createPhase === "creating";

  let actions;
  if (offsite) {
    actions = (
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
    actions = (
      <p className={styles.cardMuted} role="status">
        <Spinner /> Checking your existing session…
      </p>
    );
  } else if (ready) {
    actions = (
      <div className={styles.cardActionsInline}>
        <a className={styles.primaryButton} href="#fund">
          Next: add test funds <ArrowRightIcon size={18} />
        </a>
        <button className={styles.textAction} onClick={props.onStartOver} type="button">
          Start a new account
        </button>
      </div>
    );
  } else {
    actions = (
      <div className={styles.cardActionsInline}>
        <button
          aria-busy={creating}
          // aria-disabled, not disabled: a disabled button drops keyboard focus to <body>.
          aria-disabled={creating || props.signingIn || undefined}
          className={styles.primaryButton}
          id="create-account"
          onClick={props.onCreate}
          type="button"
        >
          {creating ? <Spinner light /> : <PasskeyIcon size={20} />}
          {creating ? "Setting up…" : createPhase === "error" ? "Try again" : "Create my account"}
        </button>
        <button
          aria-busy={props.signingIn}
          aria-disabled={creating || props.signingIn || undefined}
          className={styles.secondaryAction}
          onClick={props.onSignIn}
          type="button"
        >
          {props.signingIn ? <Spinner /> : null}
          {props.signingIn ? "Signing in…" : "Sign in with a passkey"}
        </button>
      </div>
    );
  }

  let card;
  if (ready) card = <AccountCard account={account} showExplorerLinks={props.showExplorerLinks} />;
  else if (creating) card = <CreatingCard completedSteps={props.completedSteps} slow={props.slowCreate} />;
  else if (createPhase === "error" && props.createError) card = <ErrorCard error={props.createError} />;
  else card = <PreviewCard />;

  return (
    <section aria-labelledby="create-title" className={styles.hero} id="create">
      <div className={styles.heroCopy}>
        {/* Mobile keeps the small mascot beside the headline. */}
        <div className={styles.heroMascotMobile}>
          <MascotScene dark={props.dark} />
        </div>
        <div className={styles.chapterHeader}>
          <p className={styles.chapterLabel}>01 · CREATE</p>
          {ready ? <DonePill /> : null}
        </div>
        <p className={styles.accent}>A little curiosity. A real first step.</p>
        <h1 id="create-title" tabIndex={-1}>
          Your first Smart Account, <span className={styles.headlineAccent}>made simple.</span>
        </h1>
        <p className={styles.lede}>
          A wallet that starts with you. Create an account with a passkey, add free test funds, set a spending limit,
          and make your first move on Stellar.
        </p>
        {actions}
        {props.notice ? <InlineAlert>{props.notice}</InlineAlert> : null}
        {!offsite && !ready && !creating && !recovering ? (
          <>
            <p className={styles.helper}>
              Uses your fingerprint, face or screen lock. Real network, test funds, no real money needed.
            </p>
            <div className={styles.heroExtras}>
              <button
                aria-busy={props.checking}
                aria-disabled={props.checking || props.signingIn || undefined}
                className={styles.linkButton}
                onClick={props.onCheck}
                type="button"
              >
                {props.checking ? "Checking account…" : "Check account / restore session"}
              </button>
              <Disclosure summary="What do I need?">
                A browser with passkey support, a screen lock, and access to this site on uselatch.app. Keep the passkey
                to sign in again. Testnet accounts and funds may be reset by Stellar.
              </Disclosure>
            </div>
          </>
        ) : null}
      </div>

      <div className={styles.heroVisual}>
        <div aria-hidden="true" className={styles.heroDisc} />
        <div aria-label="Latch mascot meditating while juggling coins" className={styles.heroMascot} role="img">
          <MascotScene dark={props.dark} />
        </div>
        {card}
      </div>
    </section>
  );
}

function PreviewCard() {
  return (
    <div className={`${styles.card} ${styles.previewCard}`}>
      <h2 className={styles.cardEyebrow}>YOUR NEXT FEW MINUTES</h2>
      <ol className={styles.previewList}>
        {NEXT_MINUTES.map((step) => (
          <li key={step.title}>
            <span aria-hidden="true" className={styles.stepNumber}>
              {step.icon}
            </span>
            <span className={styles.stepText}>
              <span className={styles.stepTitle}>{step.title}</span>
              <span className={styles.stepDetail}>{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className={styles.previewFooter}>All here, one step at a time.</p>
    </div>
  );
}

function CreatingCard({ completedSteps, slow }: { completedSteps: readonly CreateStep[]; slow: boolean }) {
  const firstPending = CREATE_STEPS.findIndex((step) => !completedSteps.includes(step.id));
  return (
    <div className={`${styles.card} ${styles.previewCard} ${styles.cardStack}`}>
      <div className={styles.cardHead}>
        <h2 className={styles.statusTitle}>Setting up your account</h2>
        <p className={styles.statusDetail}>
          {slow ? "Waking up the demo’s server. This can take up to 30 seconds. Keep this tab open." : "A few seconds. Keep this tab open."}
        </p>
      </div>
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

function ErrorCard({ error }: { error: DemoError }) {
  const title =
    error.code === "passkey_cancelled"
      ? "We couldn’t create your passkey"
      : error.code === "passkey_exists"
        ? "You already have a passkey here"
        : error.code === "passkey_unsupported"
        ? "Passkeys aren’t available here"
        : "We couldn’t set up your account";
  const message = error.nothingHappened ? error.message.replace(/\s*Nothing was created\.$/, "") : error.message;
  return (
    <div className={`${styles.card} ${styles.previewCard} ${styles.cardStack}`} role="alert">
      <span className={styles.errorIcon}>
        <CrossIcon size={22} />
      </span>
      <div className={styles.cardHead}>
        <h2 className={styles.statusTitle}>{title}</h2>
        <p className={styles.statusDetail}>{message}</p>
      </div>
      {error.nothingHappened ? <p className={styles.reassureText}>Nothing was created. You can try again safely.</p> : null}
    </div>
  );
}

function AccountCard({ account, showExplorerLinks }: { account: DemoAccount; showExplorerLinks: boolean }) {
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
    <div className={`${styles.card} ${styles.previewCard} ${styles.cardStack}`}>
      <div className={styles.cardHead}>
        <h2 className={styles.statusTitle}>Your account is ready.</h2>
        <p className={styles.statusDetail}>Your account is deployed on Stellar testnet. Your passkey will approve each action.</p>
      </div>
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
    </div>
  );
}
