import Image from "next/image";
import { useState } from "react";
import type { CreateStep, DemoAccount, DemoError, HeroCta } from "@/lib/demo";
import { DEMO_LIVE_URL, shortAddress } from "@/lib/demo";
import { MascotScene } from "../mascot-scene";
import { CheckIcon, CrossIcon, PasskeyIcon } from "./icons";
import styles from "./demo.module.css";

/** Account creation in this page view (independent of saved progress). */
export type CreatePhase = "idle" | "creating" | "error";

interface HeroProps {
  /** From the reveal rules: pending (not hydrated), create, continue, done. */
  cta: HeroCta;
  /** Right column: account card instead of the preview. */
  showAccountCard: boolean;
  createPhase: CreatePhase;
  /** Steps of account creation already finished (drives the loading card). */
  completedSteps: readonly CreateStep[];
  account: DemoAccount | null;
  error: DemoError | null;
  /** One-line explanation shown above the CTA (e.g. a saved account could not be restored). */
  notice: string | null;
  onCreate: () => void;
  onContinue: () => void;
  onStartOver: () => void;
  /** "Sign in": find an existing account with the passkey (e.g. on a new device). */
  onSignIn: () => void;
  signingIn: boolean;
  /** Dark theme (swaps the mascot's ground shadow). */
  dark: boolean;
  /**
   * The live demo can't run on this host (passkeys need uselatch.app): show a
   * short notice with a link instead of the Create button. `devHint` adds the
   * local-development line about the mock.
   */
  offsite: { devHint: boolean } | null;
  /** Creating is taking long (e.g. the backend waking up): say so on the setting-up card. */
  slowCreate: boolean;
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

export function Hero({
  cta,
  showAccountCard,
  createPhase,
  completedSteps,
  account,
  error,
  notice,
  onCreate,
  onContinue,
  onStartOver,
  onSignIn,
  signingIn,
  dark,
  offsite,
  slowCreate,
}: HeroProps) {
  const created = showAccountCard && account;
  const creating = createPhase === "creating";

  return (
    <section aria-labelledby="hero-title" className={styles.hero}>
      <div className={styles.heroCopy}>
        {/* Mobile keeps the small mascot beside the headline. */}
        <div className={styles.heroMascotMobile}>
          <MascotScene dark={dark} />
        </div>
        <p className={styles.chapterLabel}>01 · CREATE</p>
        <p className={styles.accent}>
          <span className={styles.desktopOnly}>A little curiosity. A real first step.</span>
          <span className={styles.mobileOnly}>A real first step.</span>
        </p>
        <h1 id="hero-title" tabIndex={-1}>
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

        {notice ? (
          <p className={styles.heroNotice}>
            {notice}
          </p>
        ) : null}

        {cta === "pending" ? (
          // Neutral until saved progress is read, so the wrong CTA never flashes.
          <div aria-busy="true" className={styles.ctaPending} />
        ) : offsite ? (
          <div className={styles.offsite}>
            <p className={styles.offsiteText}>The live demo runs on uselatch.app, where your passkey works.</p>
            <a className={styles.primaryButton} href={DEMO_LIVE_URL}>
              Try it on uselatch.app
            </a>
            {offsite.devHint ? (
              <p className={styles.offsiteHint}>
                Local development: set <code>NEXT_PUBLIC_DEMO_ADAPTER=mock</code> (or add <code>?mock</code>) to run the mock.
              </p>
            ) : null}
          </div>
        ) : cta === "continue" ? (
          <div className={`${styles.ctaRow} ${styles.ctaStack}`}>
            <button className={styles.primaryButton} onClick={onContinue} type="button">
              Continue where you left off
            </button>
            <button className={styles.linkButton} onClick={onStartOver} type="button">
              Start a new account
            </button>
          </div>
        ) : cta === "done" && account ? (
          <CreatedStatus account={account} />
        ) : (
          <div className={styles.ctaRow}>
            <button
              aria-busy={creating}
              // aria-disabled, not disabled: a disabled button drops keyboard focus to <body>.
              aria-disabled={creating || signingIn || undefined}
              className={styles.primaryButton}
              id="hero-create"
              onClick={onCreate}
              type="button"
            >
              {creating ? (
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
            <p className={styles.signInLine}>
              Already have one?{" "}
              <button
                aria-busy={signingIn}
                aria-disabled={creating || signingIn || undefined}
                className={styles.linkButton}
                onClick={onSignIn}
                type="button"
              >
                {signingIn ? "Signing in…" : "Sign in"}
              </button>
            </p>
          </div>
        )}
      </div>

      <div className={styles.heroVisual}>
        <div aria-hidden="true" className={styles.heroDisc} />
        {created ? (
          <Image
            alt="Latch mascot in a hero pose"
            className={styles.heroMascotDone}
            height={213}
            priority
            src="/demo-assets/mascot-hero.png"
            width={240}
          />
        ) : (
          <div aria-label="Latch mascot meditating while juggling coins" className={styles.heroMascot} role="img">
            <MascotScene dark={dark} />
          </div>
        )}
        {created ? (
          <AccountCard account={account} />
        ) : creating ? (
          <CreatingCard completedSteps={completedSteps} slow={slowCreate} />
        ) : createPhase === "error" && error ? (
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

function CreatingCard({ completedSteps, slow }: { completedSteps: readonly CreateStep[]; slow: boolean }) {
  const firstPending = CREATE_STEPS.findIndex((step) => !completedSteps.includes(step.id));

  return (
    <div className={`${styles.card} ${styles.statusCard}`}>
      <h2 className={styles.statusTitle}>Setting up your account</h2>
      <p className={styles.statusDetail}>
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

function ErrorCard({ error, onRetry }: { error: DemoError; onRetry: () => void }) {
  // The design's copy for a closed prompt; otherwise the adapter's own message
  // (e.g. live mode off uselatch.app, or an account that wasn't deployed).
  const title =
    error.code === "passkey_cancelled"
      ? "We couldn’t create your passkey"
      : error.code === "passkey_unsupported"
        ? "Passkeys aren’t available here"
        : "We couldn’t set up your account";
  const message = error.nothingHappened ? error.message.replace(/\s*Nothing was created\.$/, "") : error.message;
  // The reassurance line below already says "Nothing was created", so the message doesn't repeat it.
  const detail = error.code === "passkey_cancelled" ? "The prompt was closed, or this browser doesn’t support passkeys." : message;

  return (
    <div className={`${styles.card} ${styles.statusCard}`}>
      <span className={styles.errorIcon}>
        <CrossIcon size={24} />
      </span>
      <h2 className={styles.statusTitle}>{title}</h2>
      <p className={styles.statusDetail}>{detail}</p>
      {/* Only promise "nothing was created" when that is true (not after an orphaned passkey). */}
      {error.nothingHappened ? (
        <p className={styles.reassure}>
          <span className={styles.reassureDot}>
            <CheckIcon size={11} />
          </span>
          Nothing was created. You can try again safely.
        </p>
      ) : null}
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
