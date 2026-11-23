"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  computeReveal,
  createDemoAdapter,
  currentChapter,
  DEMO_PERIOD_LEDGERS,
  DEMO_SPENDING_LIMIT_STROOPS,
  DemoError,
  isDemoError,
  parseStepOverride,
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
import { TryChapter } from "./try-chapter";
import styles from "./demo.module.css";

const noopSubscribe = () => () => {};
/** Dev-only `?step=N`; parseStepOverride returns null in production builds. */
const readStepOverride = () => parseStepOverride(window.location.search, process.env.NODE_ENV);

type RestoreStatus = "unchecked" | "checking" | "ok";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Smooth-scroll a revealed section into view and move focus to its heading. */
function revealHeading(headingId: string): boolean {
  const heading = document.getElementById(headingId);
  if (!heading) return false;
  heading.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  heading.focus({ preventScroll: true });
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

  /** True once the visitor acts in this page view (create, continue, start over). */
  const [sessionActive, setSessionActive] = useState(false);
  const [createPhase, setCreatePhase] = useState<CreatePhase>("idle");
  const [completedSteps, setCompletedSteps] = useState<CreateStep[]>([]);
  const [createError, setCreateError] = useState<DemoError | null>(null);
  const [chain, setChain] = useState<AccountState | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus>("unchecked");
  const [notice, setNotice] = useState<string | null>(null);
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
    if (!hydrated || adapter.mode !== "live" || restoreStatus !== "unchecked") return;
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
  }, [adapter, clear, hydrated, progress, restoreStatus]);

  const restoring = adapter.mode === "live" && !!progress && progress.step > 0 && restoreStatus !== "ok";
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

  async function handleCreate() {
    if (createPhase === "creating") return;
    setSessionActive(true);
    setNotice(null);
    setCreatePhase("creating");
    setCompletedSteps([]);
    setCreateError(null);
    try {
      const created = await adapter.createAccount({
        onStep: (next) => setCompletedSteps((steps) => (steps.includes(next) ? steps : [...steps, next])),
      });
      setChain({ balanceStroops: BigInt(0), rule: null, usedStroops: BigInt(0) });
      setCreatePhase("idle");
      focusAfterRender("chapter-fund-title");
      save(1, created.address);
    } catch (caught) {
      setCreateError(
        isDemoError(caught) ? caught : new DemoError("network_unavailable", "Something went wrong. Nothing was created."),
      );
      setCreatePhase("error");
    }
  }

  function handleContinue() {
    setSessionActive(true);
    const next = currentChapter(computeReveal({ hydrated: true, step, revealed: true }));
    focusAfterRender(next ? `chapter-${next}-title` : FIRST_CLOSING_HEADING_ID);
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
    focusAfterRender("hero-title");
  }

  async function handleFund() {
    if (!account) return;
    const result = await adapter.fund(account);
    setChain((current) => ({ rule: null, usedStroops: BigInt(0), ...current, balanceStroops: result.balanceStroops }));
    focusAfterRender("chapter-rule-title");
    save(2, account.address);
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
          onStartOver={handleStartOver}
          showAccountCard={reveal.heroAccountCard}
        />

        {reveal.chapters.fund !== "hidden" ? (
          <FundChapter balanceStroops={balance} onFund={handleFund} onRefresh={handleRefresh} variant={reveal.chapters.fund} />
        ) : null}
        {reveal.chapters.rule !== "hidden" ? (
          <RuleChapter balanceStroops={balance} onInstall={handleInstallRule} usedStroops={used} variant={reveal.chapters.rule} />
        ) : null}
        {reveal.chapters.try !== "hidden" ? (
          <TryChapter
            balanceStroops={balance}
            onSeeWhatHappened={() => revealHeading(FIRST_CLOSING_HEADING_ID)}
            onSend={handleSend}
            showExplorerLinks={adapter.mode === "live"}
            usedStroops={used}
            variant={reveal.chapters.try}
          />
        ) : null}
        {reveal.showClosing ? <ClosingSections /> : null}

        <p aria-live="polite" className={styles.srOnly}>
          {reveal.showClosing ? "Chapter 4 done. How it works, Your journey and Why Smart Accounts are open below." : ""}
        </p>

        <DemoFooter onReset={handleStartOver} />
      </main>
    </div>
  );
}
