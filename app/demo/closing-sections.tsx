import Image from "next/image";
import type { ReactNode } from "react";
import {
  AgentIcon,
  AppsIcon,
  CheckIcon,
  FeeIcon,
  LedgerIcon,
  PasskeyIcon,
  PeopleIcon,
  PhoneIcon,
  RecoveryIcon,
  ShieldIcon,
  SparkIcon,
} from "./icons";
import styles from "./demo.module.css";

/** Focus target for "See what happened". */
export const FIRST_CLOSING_HEADING_ID = "closing-how-title";

/*
 * Copy below is from latch-demo-design/frames (desktop-one-page and
 * mobile-one-page), with the item 30 corrections in PR_NOTES.md applied.
 * Do not add or strengthen claims here; the Possible and Future-proof cards
 * stay conditional.
 */

function ClosingHeader({ id, label, accent, title }: { id: string; label: string; accent: string; title: string }) {
  return (
    <>
      <p className={styles.chapterLabel}>{label}</p>
      <p className={styles.accent}>{accent}</p>
      <h2 className={styles.chapterTitle} id={`closing-${id}-title`} tabIndex={-1}>
        {title}
      </h2>
    </>
  );
}

/* 05 How it works ---------------------------------------------------------- */

const HOW_STEPS: readonly {
  icon: ReactNode;
  title: string;
  mobileTitle: string;
  body: string;
  mobileBody: string;
}[] = [
  {
    icon: <PhoneIcon size={32} />,
    title: "1. Your device signs",
    mobileTitle: "Your device signs",
    body: "You approve with your passkey. Latch never sees your private key.",
    mobileBody: "Latch never sees your private key.",
  },
  {
    icon: <Image alt="" className={styles.howLogo} height={38} src="/demo-assets/latch-logo.jpg" width={38} />,
    title: "2. Your Smart Account checks",
    mobileTitle: "Your Smart Account checks",
    body: "It verifies the signature and your 100 XLM rule on-chain.",
    mobileBody: "Signature and 100 XLM rule.",
  },
  {
    icon: <LedgerIcon size={32} />,
    title: "3. Stellar records it",
    mobileTitle: "Stellar records it",
    body: "If either check fails, nothing moves.",
    mobileBody: "If either check fails, nothing moves.",
  },
];

function HowItWorks() {
  return (
    <section aria-labelledby="closing-how-title" className={styles.closing} id="closing-how">
      <div className={styles.closingIntro}>
        <ClosingHeader accent="Your account. Your say." id="how" label="05 · HOW IT WORKS" title="What happened when you approved." />
        <p className={`${styles.lede} ${styles.desktopOnly}`}>
          Your passkey proves it’s you. Your Smart Account checks that proof against its rules. Only then does Stellar
          record the transaction.
        </p>
      </div>
      <ol className={styles.howSteps}>
        {HOW_STEPS.map((step) => (
          <li className={styles.howStep} key={step.title}>
            <span aria-hidden="true" className={styles.howIcon}>
              {step.icon}
            </span>
            <span className={styles.howText}>
              <span className={styles.howTitle}>
                <span className={styles.desktopOnly}>{step.title}</span>
                <span className={styles.mobileOnly}>{step.mobileTitle}</span>
              </span>
              <span className={styles.howBody}>
                <span className={styles.desktopOnly}>{step.body}</span>
                <span className={styles.mobileOnly}>{step.mobileBody}</span>
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* 06 Your journey ---------------------------------------------------------- */

export interface JourneyFacts {
  /** "CBX4…7Q2M" for the account the visitor created. */
  shortAddress: string;
  /** "10,000" test XLM added. */
  fundedXlm: string;
  /** "50" XLM sent within the rule (the window total). */
  sentXlm: string;
  /** Whether a send over the limit was blocked in this visit. */
  blocked: boolean;
}

function YourJourney({ facts }: { facts: JourneyFacts }) {
  // Frame copy with the visitor's own values; "150 XLM blocked" only after they saw it happen.
  const items = [
    { title: "Smart Account created", detail: `${facts.shortAddress} on Stellar testnet` },
    { title: "Test funds added", detail: `${facts.fundedXlm} test XLM` },
    { title: "Spending rule set", detail: "100 XLM every 24 hours" },
    {
      title: "Rule tested",
      detail: facts.blocked ? `${facts.sentXlm} XLM sent, 150 XLM blocked` : `${facts.sentXlm} XLM sent`,
    },
  ];

  return (
    <section aria-labelledby="closing-journey-title" className={`${styles.closing} ${styles.journey}`} id="closing-journey">
      <div className={styles.journeyMain}>
        <ClosingHeader accent="Look how far you’ve come" id="journey" label="06 · YOUR JOURNEY" title="You just used a Smart Account." />
        <ol className={styles.journeyList}>
          {items.map((item) => (
            <li key={item.title}>
              <span aria-hidden="true" className={styles.journeyCheck}>
                <CheckIcon size={15} />
              </span>
              <span className={styles.journeyText}>
                <span className={styles.journeyTitle}>{item.title}</span>
                <span className={`${styles.journeyDetail} ${styles.desktopOnly}`}>{item.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className={`${styles.journeyNote} ${styles.desktopOnly}`}>
        <p className={styles.journeyNoteTitle}>You’ve tried passkeys and programmable rules.</p>
        <p className={styles.journeyNoteBody}>
          That’s two of the things Smart Accounts make possible. See what else they can do below.
        </p>
      </div>
    </section>
  );
}

/* 07 Why Smart Accounts ---------------------------------------------------- */

type WhyTag = "demo" | "possible" | "future";

const TAG_LABEL: Record<WhyTag, string> = {
  demo: "In this demo",
  possible: "Possible",
  future: "Future-proof",
};

const WHY_CARDS: readonly {
  tag: WhyTag;
  icon: ReactNode;
  title: string;
  /** Mobile frame's shorter title, where it differs. */
  mobileTitle?: string;
  body: string;
  mobileBody: string;
}[] = [
  {
    tag: "demo",
    icon: <PasskeyIcon size={26} />,
    title: "Passkeys",
    body: "Sign with your fingerprint, face or screen lock. No seed phrase to write down or lose.",
    mobileBody: "No seed phrase to lose.",
  },
  {
    tag: "demo",
    icon: <ShieldIcon size={26} />,
    title: "Programmable rules",
    body: "Spending limits like the one you just set. Time locks and allowlists work the same way.",
    mobileBody: "Limits the account enforces.",
  },
  {
    tag: "possible",
    icon: <RecoveryIcon size={26} />,
    title: "Recovery options",
    body: "Add a backup signer, like a second device or someone you trust, so losing a phone doesn’t have to mean losing access.",
    mobileBody: "Backup signers for lost devices.",
  },
  {
    tag: "possible",
    icon: <PeopleIcon size={26} />,
    title: "Shared approvals",
    body: "Require 2 of 3 people to approve big moves. Useful for shared accounts: families, teams, treasuries.",
    mobileBody: "2 of 3 for big moves.",
  },
  {
    tag: "possible",
    icon: <AgentIcon size={26} />,
    title: "AI agents, on a leash",
    mobileTitle: "AI agents",
    body: "Let an agent act for you inside strict limits: which apps, how much, for how long. Access you can revoke.",
    mobileBody: "Act for you, inside limits.",
  },
  {
    tag: "possible",
    icon: <AppsIcon size={26} />,
    title: "App permissions",
    body: "Give an app a session with limited access instead of handing over full control.",
    mobileBody: "Limited, revocable access.",
  },
  {
    tag: "possible",
    icon: <FeeIcon size={26} />,
    title: "Fees handled for you",
    mobileTitle: "Fees handled",
    body: "Apps can cover network fees, so new users don’t need XLM just to get started.",
    mobileBody: "Apps can cover network fees.",
  },
  {
    // The mobile frame tags this card "Possible" with the title "Future-proof";
    // the desktop tag and title are used on both (PR_NOTES.md).
    tag: "future",
    icon: <SparkIcon size={26} />,
    title: "Ready for what’s next",
    body: "Signing rules live in the account, so it can adopt new signature types, including post-quantum ones as they arrive, without changing your address.",
    mobileBody: "New signature types, same address.",
  },
];

function WhySmartAccounts() {
  return (
    <section aria-labelledby="closing-why-title" className={styles.closing} id="closing-why">
      <div className={`${styles.closingIntro} ${styles.closingIntroWide}`}>
        <ClosingHeader
          accent="You just used two of these."
          id="why"
          label="07 · WHY SMART ACCOUNTS"
          title="An account that does more, so you don’t have to."
        />
        <p className={`${styles.lede} ${styles.desktopOnly}`}>
          Most wallets today are a single key: lose it, leak it or sign the wrong thing, and that’s it. A Smart Account
          is programmable, so safety, recovery and automation can be built into the account itself.
        </p>
      </div>
      <ul className={styles.whyGrid}>
        {WHY_CARDS.map((card) => (
          <li className={styles.whyCard} data-tag={card.tag} key={card.title}>
            <div className={styles.whyCardTop}>
              <span aria-hidden="true" className={styles.whyIcon}>
                {card.icon}
              </span>
              <span className={styles.whyTag}>{TAG_LABEL[card.tag]}</span>
            </div>
            <h3 className={styles.whyTitle}>
              <span className={card.mobileTitle ? styles.desktopOnly : undefined}>{card.title}</span>
              {card.mobileTitle ? <span className={styles.mobileOnly}>{card.mobileTitle}</span> : null}
            </h3>
            <p className={styles.whyBody}>
              <span className={styles.desktopOnly}>{card.body}</span>
              <span className={styles.mobileOnly}>{card.mobileBody}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 05–07, revealed once chapter 04 is done. */
export function ClosingSections({ journey }: { journey: JourneyFacts }) {
  return (
    <>
      <HowItWorks />
      <YourJourney facts={journey} />
      <WhySmartAccounts />
    </>
  );
}
