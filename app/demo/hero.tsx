import Image from "next/image";
import { useState } from "react";
import type { CreateStep, DemoAccount, DemoError } from "@/lib/demo";
import { shortAddress } from "@/lib/demo";
import { CheckIcon, CrossIcon, PasskeyIcon } from "./icons";
import styles from "./demo.module.css";

export type CreatePhase = "idle" | "creating" | "error" | "created";

interface HeroProps {
  phase: CreatePhase;
  /** Steps of account creation already finished (drives the loading card). */
  completedSteps: readonly CreateStep[];
  account: DemoAccount | null;
  error: DemoError | null;
  onCreate: () => void;
}

const PREVIEW_STEPS = [
  { title: "Create your account", detail: "With a passkey. No seed phrase." },
  { title: "Add free test XLM", detail: "10,000 XLM of practice money." },
  { title: "Set a spending rule", detail: "Only 100 XLM can leave every 24 hours." },
  { title: "Put the rule to the test", detail: "Send within it, then try to go over." },
] as const;

const CREATE_STEPS: readonly { id: CreateStep; label: string }[] = [
  { id: "passkey", label: "Passkey created" },
  { id: "account", label: "Creating your Smart Account" },
  { id: "signer", label: "Adding your passkey as signer" },
];

export function Hero({ phase, completedSteps, account, error, onCreate }: HeroProps) {
  const created = phase === "created" && account;

  return (
    <section aria-labelledby="hero-title" className={styles.hero}>
      <div className={styles.heroCopy}>
        {/* Mobile keeps the small mascot beside the headline. */}
        <Image
          alt=""
          aria-hidden="true"
          className={styles.heroMascotMobile}
          height={105}
          priority
          src="/demo-assets/mascot-meditate.png"
          width={96}
        />
        <p className={styles.chapterLabel}>01 · CREATE</p>
        <p className={styles.accent}>
          <span className={styles.desktopOnly}>A little curiosity. A real first step.</span>
          <span className={styles.mobileOnly}>A real first step.</span>
        </p>
        <h1 id="hero-title">
          Your first Smart Account, <span className={styles.headlineAccent}>made simple.</span>
        </h1>
        <p className={styles.lede}>
          <span className={styles.desktopOnly}>
            Create an account with a passkey, fund it with test XLM, give it a spending rule and watch the account
            enforce it on Stellar. About 4 minutes.
          </span>
          <span className={styles.mobileOnly}>
            Passkey account, test funds, a spending rule your account enforces. About 4 minutes.
          </span>
        </p>

        {created ? (
          <CreatedStatus account={account} />
        ) : (
          <div className={styles.ctaRow}>
            <button
              aria-busy={phase === "creating"}
              className={styles.primaryButton}
              disabled={phase === "creating"}
              onClick={onCreate}
              type="button"
            >
              {phase === "creating" ? (
                <>
                  <span aria-hidden="true" className={styles.spinnerLight} />
                  Setting up…
                </>
              ) : (
                <>
                  <PasskeyIcon size={20} />
                  Create account
                </>
              )}
            </button>
            <span className={`${styles.helper} ${styles.desktopOnly}`}>Uses your fingerprint, face or screen lock.</span>
          </div>
        )}
      </div>

      <div className={styles.heroVisual}>
        <div aria-hidden="true" className={styles.heroDisc} />
        <Image
          alt={created ? "Latch mascot in a hero pose" : "Latch mascot meditating while juggling coins"}
          className={created ? styles.heroMascotDone : styles.heroMascot}
          height={created ? 213 : 262}
          priority
          src={created ? "/demo-assets/mascot-hero.png" : "/demo-assets/mascot-meditate.png"}
          width={created ? 240 : 272}
        />
        {created ? (
          <AccountCard account={account} />
        ) : phase === "creating" ? (
          <CreatingCard completedSteps={completedSteps} />
        ) : phase === "error" && error ? (
          <ErrorCard error={error} onRetry={onCreate} />
        ) : (
          <PreviewCard />
        )}
      </div>
    </section>
  );
}

function CreatedStatus({ account }: { account: DemoAccount }) {
  return (
    <>
      <div className={`${styles.ctaRow} ${styles.desktopOnly}`}>
        <span className={styles.doneBadge}>
          <span className={styles.badgeDot}>
            <CheckIcon size={10} />
          </span>
          Account created
        </span>
        <span className={styles.helper}>Scroll down for your next step.</span>
      </div>
      <div className={`${styles.summaryRow} ${styles.mobileOnly}`}>
        <span className={styles.summaryCheck}>
          <CheckIcon size={15} />
        </span>
        <span className={styles.summaryText}>
          <span className={styles.summaryLabel}>01 · CREATE</span>
          <span className={styles.summaryTitle}>Smart Account created</span>
          <span className={styles.summaryDetail}>{shortAddress(account.address)} · Live on testnet</span>
        </span>
      </div>
    </>
  );
}

function PreviewCard() {
  return (
    <div className={`${styles.card} ${styles.previewCard}`}>
      <h2 className={styles.cardEyebrow}>YOUR NEXT FEW MINUTES</h2>
      <ol className={styles.previewList}>
        {PREVIEW_STEPS.map((step, index) => (
          <li key={step.title}>
            <span className={styles.stepNumber}>{index + 1}</span>
            <span className={styles.stepText}>
              <span className={styles.stepTitle}>{step.title}</span>
              <span className={styles.stepDetail}>{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CreatingCard({ completedSteps }: { completedSteps: readonly CreateStep[] }) {
  const firstPending = CREATE_STEPS.findIndex((step) => !completedSteps.includes(step.id));

  return (
    <div className={`${styles.card} ${styles.statusCard}`} role="status">
      <h2 className={styles.statusTitle}>Setting up your account</h2>
      <p className={styles.statusDetail}>A few seconds. Keep this tab open.</p>
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

function ErrorCard({ error, onRetry }: { error: DemoError; onRetry: () => void }) {
  const passkeyProblem = error.code === "passkey_cancelled" || error.code === "passkey_unsupported";

  return (
    <div className={`${styles.card} ${styles.statusCard}`} role="alert">
      <span className={styles.errorIcon}>
        <CrossIcon size={24} />
      </span>
      <h2 className={styles.statusTitle}>
        {passkeyProblem ? "We couldn’t create your passkey" : "We couldn’t set up your account"}
      </h2>
      <p className={styles.statusDetail}>
        {passkeyProblem ? "The prompt was closed, or this browser doesn’t support passkeys." : error.message}
      </p>
      <p className={styles.reassure}>
        <span className={styles.reassureDot}>
          <CheckIcon size={11} />
        </span>
        Nothing was created. You can try again safely.
      </p>
      <button className={styles.primaryButton} onClick={onRetry} type="button">
        Try again
      </button>
    </div>
  );
}

function AccountCard({ account }: { account: DemoAccount }) {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(account.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard can be unavailable; the short address stays visible. */
    }
  }

  return (
    <div className={`${styles.card} ${styles.accountCard}`}>
      <div className={styles.accountHeader}>
        <span className={styles.accountLabel}>Your Smart Account</span>
        <span className={styles.liveTag}>
          <span aria-hidden="true" className={styles.liveDot} />
          Live on testnet
        </span>
      </div>
      <div className={styles.accountAddressRow}>
        <span className={styles.accountAddress} title={account.address}>
          {shortAddress(account.address)}
        </span>
        <button className={styles.copyButton} onClick={copyAddress} type="button">
          {copied ? "Copied" : "Copy address"}
        </button>
      </div>
      <div className={styles.accountFacts}>
        <div>
          <span className={styles.factLabel}>Receives funds</span>
          <span className={styles.factValue}>This address</span>
        </div>
        <div>
          <span className={styles.factLabel}>Approves actions</span>
          <span className={styles.factValue}>
            <PasskeyIcon className={styles.factIcon} size={15} />
            Your passkey
          </span>
        </div>
      </div>
    </div>
  );
}
