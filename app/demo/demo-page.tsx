"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  computeReveal,
  createDemoAdapter,
  currentChapter,
  DEMO_PERIOD_LEDGERS,
  DEMO_SPENDING_LIMIT_STROOPS,
  DemoError,
  FRIENDBOT_BALANCE_STROOPS,
  inferStepFromChain,
  isDemoError,
  isPasskeyHost,
  parseStepOverride,
  shortAddress,
  type AccountState,
  type CreateStep,
  type DemoAccount,
  type DemoAdapter,
  type DemoStep,
  type SendStep,
} from "@/lib/demo";
import { MockDemoAdapter } from "@/lib/demo/mock-adapter";
import { useDemoProgress } from "@/lib/demo/use-demo-progress";
import { useSiteTheme } from "../use-site-theme";
import { ClosingSections, FIRST_CLOSING_HEADING_ID } from "./closing-sections";
import { DemoFooter } from "./demo-footer";
import { FundChapter } from "./fund-chapter";
import { Hero, type CreatePhase } from "./hero";
import { RuleChapter } from "./rule-chapter";
import { TestnetBar } from "./testnet-bar";
import { formatXlm } from "./parts";
import { TryChapter } from "./try-chapter";
import styles from "./demo.module.css";

const noopSubscribe = () => () => {};
/** Dev-only `?step=N`; parseStepOverride returns null in production builds. */
const readStepOverride = () => parseStepOverride(window.location.search, process.env.NODE_ENV);
/** Can passkeys for latch-api work here? (https on uselatch.app or a subdomain) */
const readPasskeyHost = () => isPasskeyHost(window.location.hostname, window.location.protocol);
/** Before "Waking up the demo's server" appears on the setting-up card. */
const SLOW_CREATE_MS = 5000;

type RestoreStatus = "unchecked" | "checking" | "ok";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Move focus to a revealed section's heading and scroll it to the top. Any
 * other target (e.g. the Create button) only scrolls if it is out of view.
 */
function revealHeading(targetId: string): boolean {
  const target = document.getElementById(targetId);
  if (!target) return false;
  const isHeading = /^H[1-6]$/.test(target.tagName);
  target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: isHeading ? "start" : "nearest" });
  target.focus({ preventScroll: true });
  return true;
}

/**
 * /demo: chapters reveal one after another. Saved progress lives in
 * localStorage (useDemoProgress); a returning visitor sees "Continue where
 * you left off" and nothing below the hero until they choose to.
 */
export function DemoPage() {
  // Created once per page view; never replaced, so state (not a ref) is safe to read in render.
  const [adapter] = useState<DemoAdapter>(createDemoAdapter);

  const { theme, toggleTheme } = useSiteTheme({ light: "#fffaec", dark: "#111111" });
  const { hydrated, progress, save, clear } = useDemoProgress();
  const stepOverride = useSyncExternalStore(noopSubscribe, readStepOverride, () => null);
  const passkeyHost = useSyncExternalStore(noopSubscribe, readPasskeyHost, () => true);
  /** Live demo on a host where passkeys can't work (localhost, *.vercel.app): link to uselatch.app instead. */
  const offsite = adapter.mode === "live" && !passkeyHost;

  /** True once the visitor acts in this page view (create, continue, start over). */
  const [sessionActive, setSessionActive] = useState(false);
  const [createPhase, setCreatePhase] = useState<CreatePhase>("idle");
  const [completedSteps, setCompletedSteps] = useState<CreateStep[]>([]);
  const [createError, setCreateError] = useState<DemoError | null>(null);
  const [chain, setChain] = useState<AccountState | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus>("unchecked");
  const [notice, setNotice] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [slowCreate, setSlowCreate] = useState(false);
  /** A send over the limit was blocked in this visit (06 Your journey only says so if it happened). */
  const [blockedOnce, setBlockedOnce] = useState(false);
  /** Text of the page's single polite live region. */
  const [announcement, setAnnouncement] = useState("");
  /** Heading to scroll to and focus after the next render. A ref, so setting it never re-renders. */
  const pendingFocus = useRef<string | null>(null);

  const step: DemoStep = progress?.step ?? 0;
  const account: DemoAccount | null = progress?.accountAddress
    ? { address: progress.accountAddress, credentialId: "" }
    : null;

  /** The dev ?step override applies once per page load; after that the visitor's own progress wins. */
  const overrideApplied = useRef(false);

  // Mock: trust storage, but make the fake chain agree with it (and apply ?step in dev).
  useEffect(() => {
    if (!hydrated || !(adapter instanceof MockDemoAdapter)) return;
    if (stepOverride !== null && !overrideApplied.current) {
      overrideApplied.current = true;
      const seeded = adapter.seedForStep(stepOverride, null, { force: true });
      save(stepOverride, seeded?.address ?? null);
      return;
    }
    if (progress) adapter.seedForStep(progress.step, progress.accountAddress);
  }, [adapter, hydrated, progress, save, stepOverride]);

  // Live: confirm the saved account still exists before trusting saved progress.
  useEffect(() => {
    if (!hydrated || adapter.mode !== "live" || offsite || restoreStatus !== "unchecked") return;
    if (!progress || progress.step === 0) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setRestoreStatus("checking");
      adapter
        .restoreSession()
        .then((restored) => {
          if (cancelled) return;
          if (restored?.address === progress.accountAddress) {
            setRestoreStatus("ok");
            return;
          }
          clear();
          setRestoreStatus("ok");
          setNotice("We couldn’t find your previous account, so the demo starts over.");
        })
        .catch(() => {
          if (cancelled) return;
          clear();
          setRestoreStatus("ok");
          setNotice("We couldn’t reach your previous account, so the demo starts over.");
        });
    });
    return () => {
      cancelled = true;
    };
  }, [adapter, clear, hydrated, offsite, progress, restoreStatus]);

  // Wake the backend as soon as the page is usable (Render's free tier sleeps).
  useEffect(() => {
    if (hydrated && !offsite) adapter.warmUp?.();
  }, [adapter, hydrated, offsite]);

  // If creating hasn't made progress after a few seconds, say why (usually a cold backend).
  useEffect(() => {
    if (createPhase !== "creating" || completedSteps.length > 0) return;
    const timer = window.setTimeout(() => {
      setSlowCreate(true);
      announce("Waking up the demo’s server. This can take up to 30 seconds.");
    }, SLOW_CREATE_MS);
    return () => window.clearTimeout(timer);
  }, [createPhase, completedSteps.length]);

  const restoring = adapter.mode === "live" && !offsite && !!progress && progress.step > 0 && restoreStatus !== "ok";
  const ready = hydrated && !restoring;
  const revealed = sessionActive || stepOverride !== null || !progress || progress.step === 0;
  const reveal = computeReveal({ hydrated: ready, step, revealed });
  const chainKnown = chain !== null;

  // Load balance / rule / usage once the chapters are on screen.
  useEffect(() => {
    if (!ready || !revealed || !account || step < 2 || chainKnown) return;
    let cancelled = false;
    adapter
      .getAccountState(account)
      .then((state) => {
        if (!cancelled) setChain(state);
      })
      .catch(() => {
        /* Cards fall back to "…" until a refresh works. */
      });
    return () => {
      cancelled = true;
    };
    // account is derived from progress; its address is the stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, ready, revealed, account?.address, step, chainKnown]);

  // After a reveal renders, scroll to and focus the new section's heading.
  useEffect(() => {
    if (pendingFocus.current && revealHeading(pendingFocus.current)) pendingFocus.current = null;
  });

  function focusAfterRender(headingId: string) {
    pendingFocus.current = headingId;
  }

  /** Speak a status change. A repeated message gets a trailing space so it is read again. */
  function announce(message: string) {
    setAnnouncement((previous) => (previous === message ? `${message}\u00a0` : message));
  }

  async function handleCreate() {
    if (createPhase === "creating" || signingIn) return;
    setSessionActive(true);
    setNotice(null);
    setCreatePhase("creating");
    setCompletedSteps([]);
    setCreateError(null);
    setSlowCreate(false);
    announce("Setting up your account. Keep this tab open.");
    try {
      const created = await adapter.createAccount({
        onStep: (next) => setCompletedSteps((steps) => (steps.includes(next) ? steps : [...steps, next])),
      });
      setChain({ balanceStroops: BigInt(0), rule: null, usedStroops: BigInt(0) });
      setCreatePhase("idle");
      focusAfterRender("chapter-fund-title");
      save(1, created.address);
      announce("Smart Account created. Next: add free test XLM.");
    } catch (caught) {
      const error = isDemoError(caught)
        ? caught
        : new DemoError("network_unavailable", "Something went wrong. Nothing was created.");
      setCreateError(error);
      setCreatePhase("error");
      announce(`${error.message} You can try again safely.`);
    }
  }

  function focusCurrentChapter(atStep: DemoStep) {
    const next = currentChapter(computeReveal({ hydrated: true, step: atStep, revealed: true }));
    focusAfterRender(next ? `chapter-${next}-title` : FIRST_CLOSING_HEADING_ID);
  }

  function handleContinue() {
    setSessionActive(true);
    focusCurrentChapter(step);
  }

  /**
   * "Sign in": the returning-visitor path on a new device. Finds the account
   * with the passkey; with no saved progress, the step comes from the chain.
   * No account: back to the create flow with one line of explanation.
   */
  async function handleSignIn() {
    if (signingIn || createPhase === "creating") return;
    setSessionActive(true);
    setNotice(null);
    setSigningIn(true);
    announce("Signing in. Confirm with your passkey.");
    try {
      const found = await adapter.restoreSession({ prompt: true });
      if (!found) {
        const message = "We didn’t find an account for this passkey, so let’s create one.";
        setNotice(message);
        announce(message);
        focusAfterRender("hero-create");
        return;
      }
      let nextStep: DemoStep;
      if (progress?.accountAddress === found.address) {
        nextStep = progress.step;
      } else {
        const state = await adapter.getAccountState(found);
        setChain(state);
        nextStep = inferStepFromChain(state);
      }
      focusCurrentChapter(nextStep);
      save(nextStep, found.address);
      announce("Signed in. Welcome back.");
    } catch (caught) {
      const message = isDemoError(caught) ? caught.message : "Sign-in didn’t work. Nothing changed.";
      setNotice(message);
      announce(message);
    } finally {
      setSigningIn(false);
    }
  }

  async function handleStartOver() {
    await adapter.reset();
    clear();
    setSessionActive(true);
    setChain(null);
    setCreatePhase("idle");
    setCreateError(null);
    setCompletedSteps([]);
    setNotice(null);
    setBlockedOnce(false);
    focusAfterRender("hero-title");
    announce("The demo has been reset. Your test account is forgotten on this device.");
  }

  async function handleFund() {
    if (!account) return;
    const result = await adapter.fund(account);
    setChain((current) => ({ rule: null, usedStroops: BigInt(0), ...current, balanceStroops: result.balanceStroops }));
    focusAfterRender("chapter-rule-title");
    save(2, account.address);
    announce(`${formatXlm(result.balanceStroops)} test XLM added. Next: set a spending rule.`);
  }

  async function handleRefresh() {
    if (!account) return;
    setChain(await adapter.getAccountState(account));
  }

  async function handleInstallRule() {
    if (!account) return;
    const result = await adapter.installSpendingRule(account, {
      limitStroops: DEMO_SPENDING_LIMIT_STROOPS,
      periodLedgers: DEMO_PERIOD_LEDGERS,
    });
    setChain((current) => ({ balanceStroops: BigInt(0), ...current, rule: result.rule, usedStroops: BigInt(0) }));
    focusAfterRender("chapter-try-title");
    save(3, account.address);
    announce("Spending rule active: 100 XLM every 24 hours. Next: put it to the test.");
  }

  async function handleSend(to: string, amountStroops: bigint, onStep: (step: SendStep) => void) {
    if (!account) throw new DemoError("send_failed", "No account yet. Nothing was sent.");
    const result = await adapter.send({ account, to, amountStroops, onStep });
    setChain((current) => ({
      rule: current?.rule ?? null,
      balanceStroops: result.balanceStroops,
      usedStroops: result.usedStroops,
    }));
    // The chapter counts as done after the first send within the rule. Unlike
    // the other chapters, don't scroll away: the 150 XLM test is the point.
    if (step < 4) save(4, account.address);
    const receipt = adapter.mode === "live" ? await adapter.getReceipt(result.txHash).catch(() => null) : null;
    return { ...result, explorerUrl: receipt?.explorerUrl };
  }

  const balance = chain?.balanceStroops ?? null;
  const used = chain?.usedStroops ?? BigInt(0);

  return (
    <div className={styles.page} data-theme={theme ?? undefined}>
      <TestnetBar onToggleTheme={toggleTheme} theme={theme} />
      <main className={styles.main}>
        <Hero
          account={account}
          completedSteps={completedSteps}
          createPhase={createPhase}
          cta={reveal.heroCta}
          dark={theme === "dark"}
          error={createError}
          notice={notice}
          onContinue={handleContinue}
          onCreate={handleCreate}
          onSignIn={handleSignIn}
          offsite={offsite ? { devHint: process.env.NODE_ENV !== "production" } : null}
          onStartOver={handleStartOver}
          signingIn={signingIn}
          slowCreate={slowCreate}
          showAccountCard={reveal.heroAccountCard}
        />

        {reveal.chapters.fund !== "hidden" ? (
          <FundChapter
            balanceStroops={balance}
            onAnnounce={announce}
            onFund={handleFund}
            onRefresh={handleRefresh}
            variant={reveal.chapters.fund}
          />
        ) : null}
        {reveal.chapters.rule !== "hidden" ? (
          <RuleChapter
            balanceStroops={balance}
            onAnnounce={announce}
            onInstall={handleInstallRule}
            usedStroops={used}
            variant={reveal.chapters.rule}
          />
        ) : null}
        {reveal.chapters.try !== "hidden" ? (
          <TryChapter
            balanceStroops={balance}
            blockedOnce={blockedOnce}
            onAnnounce={announce}
            onBlocked={() => setBlockedOnce(true)}
            onSeeWhatHappened={() => revealHeading(FIRST_CLOSING_HEADING_ID)}
            onSend={handleSend}
            showExplorerLinks={adapter.mode === "live"}
            usedStroops={used}
            variant={reveal.chapters.try}
          />
        ) : null}
        {reveal.showClosing && account ? (
          <ClosingSections
            journey={{
              shortAddress: shortAddress(account.address),
              fundedXlm: formatXlm(FRIENDBOT_BALANCE_STROOPS),
              sentXlm: formatXlm(used > BigInt(0) ? used : BigInt(500_000_000)),
              blocked: blockedOnce,
            }}
          />
        ) : null}

        {/* The page's one status voice: every state change is announced here. */}
        <p aria-atomic="true" aria-live="polite" className={styles.srOnly} role="status">
          {announcement}
        </p>

      </main>
      {/* Outside <main> so it is the page's contentinfo landmark; same column as main. */}
      <div className={styles.main}>
        <DemoFooter onReset={handleStartOver} />
      </div>
    </div>
  );
}
