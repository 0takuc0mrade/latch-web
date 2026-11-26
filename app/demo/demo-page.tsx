"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createDemoAdapter,
  DEMO_EXPLORER_TX_URL,
  DEMO_PERIOD_LEDGERS,
  DEMO_SPENDING_LIMIT_STROOPS,
  DemoError,
  inferStepFromChain,
  isDemoError,
  isPasskeyHost,
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
import { ChapterNav, type ChapterKey } from "./chapter-nav";
import type { ChapterVariant } from "./chapter";
import { ControlChapter, JourneyChapter } from "./closing-sections";
import { DemoFooter } from "./demo-footer";
import { FundChapter } from "./fund-chapter";
import { Hero, type CreatePhase } from "./hero";
import { formatXlm, type ReceiptInfo } from "./parts";
import { TestnetBar } from "./testnet-bar";
import { TryChapter, type SendOutcome } from "./try-chapter";
import { HowItWorks, WhySmartAccounts } from "./why-sections";
import { loadReceipts, saveReceipts, type FundingReceipt } from "./receipts";
import styles from "./demo.module.css";

const noopSubscribe = () => () => {};
/** Dev-only `?step=N` (mock seeding); parseStepOverride returns null in production builds. */
const readStepOverride = () => parseStepOverride(window.location.search, process.env.NODE_ENV);
/** Can passkeys for latch-api work here? (https on uselatch.app or a subdomain; localhost with the dev-only local backend) */
const readPasskeyHost = () => isPasskeyHost(window.location.hostname, window.location.protocol);
/** Before "Waking up the demo's server" appears while creating. */
const SLOW_CREATE_MS = 5000;

type RestoreStatus = "unchecked" | "checking" | "ok";

/**
 * /demo, following latch's guided demo (components/demo/Demo.tsx): Create,
 * Fund, Try it, Control, Your journey (latch's welcome copy opens 01 Create). Chapters appear one at a time:
 * finishing a chapter's action reveals the next one underneath, scrolls to it
 * and focuses its heading. The one addition to latch's flow is the spending
 * limit, approved before the first send.
 */
export function DemoPage() {
  // Created once per page view; never replaced, so state (not a ref) is safe to read in render.
  const [adapter] = useState<DemoAdapter>(createDemoAdapter);
  const live = adapter.mode === "live";

  const { theme, toggleTheme } = useSiteTheme({ light: "#fffaec", dark: "#111111" });
  const { hydrated, progress, save, clear } = useDemoProgress();
  const stepOverride = useSyncExternalStore(noopSubscribe, readStepOverride, () => null);
  const passkeyHost = useSyncExternalStore(noopSubscribe, readPasskeyHost, () => true);
  /** Live demo on a host where passkeys can't work (*.vercel.app previews): link to uselatch.app instead. */
  const offsite = live && !passkeyHost;

  const [createPhase, setCreatePhase] = useState<CreatePhase>("idle");
  const [completedSteps, setCompletedSteps] = useState<CreateStep[]>([]);
  const [createError, setCreateError] = useState<DemoError | null>(null);
  const [slowCreate, setSlowCreate] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [chain, setChain] = useState<AccountState | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus>("unchecked");
  const [funding, setFunding] = useState<FundingReceipt | null>(null);
  const [setupReceipt, setSetupReceipt] = useState<ReceiptInfo | null>(null);
  const [activity, setActivity] = useState<SendOutcome | null>(null);
  /** The latest refused amount (shown in Try it until the next send goes through). */
  const [blocked, setBlocked] = useState<bigint | null>(null);
  /** The largest amount refused in this visit (Your journey). */
  const [blockedMax, setBlockedMax] = useState<bigint | null>(null);
  const [exploredControl, setExploredControl] = useState(false);
  /** Text of the page's single polite live region. */
  const [announcement, setAnnouncement] = useState("");
  /** Heading to scroll to and focus after the next render. A ref, so setting it never re-renders. */
  const pendingFocus = useRef<string | null>(null);

  const step: DemoStep = progress?.step ?? 0;
  const account: DemoAccount | null = progress?.accountAddress ? { address: progress.accountAddress, credentialId: "" } : null;
  const address = account?.address ?? null;

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

  // Live: confirm the saved account still exists before trusting saved progress
  // (latch: "Checking your existing session…"). Not cancelled by this effect's
  // cleanup: setting "checking" re-runs the effect, and a cleanup-scoped flag
  // would drop the answer. Only unmounting discards it.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (!hydrated || !live || offsite || restoreStatus !== "unchecked") return;
    if (!progress || progress.step === 0) return;
    const expected = progress.accountAddress;
    let started = false;
    queueMicrotask(() => {
      // Under dev StrictMode a second run may repeat this read-only check; harmless.
      if (started || !mountedRef.current) return;
      started = true;
      setRestoreStatus("checking");
      adapter
        .restoreSession()
        .then((restored) => {
          if (!mountedRef.current) return;
          setRestoreStatus("ok");
          if (restored?.address === expected) return;
          clear();
          setNotice("We could not restore your session. Sign in with your existing passkey, or create a new account.");
        })
        .catch(() => {
          if (!mountedRef.current) return;
          setRestoreStatus("ok");
          setNotice("We could not restore your session. Retry below or sign in with your existing passkey.");
        });
    });
  }, [adapter, clear, hydrated, live, offsite, progress, restoreStatus]);

  // If creating hasn't made progress after a few seconds, say why (usually a cold backend).
  useEffect(() => {
    if (createPhase !== "creating" || completedSteps.length > 0) return;
    const timer = window.setTimeout(() => {
      setSlowCreate(true);
      announce("Waking up the demo’s server. This can take up to 30 seconds.");
    }, SLOW_CREATE_MS);
    return () => window.clearTimeout(timer);
  }, [createPhase, completedSteps.length]);

  const recovering = !hydrated || (live && !offsite && step > 0 && restoreStatus !== "ok");
  const ready = !recovering && !!account;
  const chainKnown = chain !== null;

  // Receipts from earlier in this browser session (latch keeps them in sessionStorage too).
  const receiptsLoadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !address || receiptsLoadedFor.current === address) return;
    receiptsLoadedFor.current = address;
    const saved = loadReceipts(address);
    if (!saved) return;
    queueMicrotask(() => {
      setFunding(saved.funding);
      setSetupReceipt(saved.setup);
      setActivity(saved.activity);
    });
  }, [address, ready]);
  useEffect(() => {
    if (ready && address && receiptsLoadedFor.current === address) saveReceipts(address, { funding, setup: setupReceipt, activity });
  }, [activity, address, funding, ready, setupReceipt]);

  // Balance, spending limit and usage, once the account is known.
  useEffect(() => {
    if (!ready || !account || chainKnown) return;
    let cancelled = false;
    adapter
      .getAccountState(account)
      .then((state) => {
        if (!cancelled) setChain(state);
      })
      .catch(() => {
        /* Cards show "—" until Refresh balance works. */
      });
    return () => {
      cancelled = true;
    };
    // account is derived from progress; its address is the stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, ready, address, chainKnown]);

  // After a reveal renders, scroll to the new chapter and focus its heading.
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    const heading = document.getElementById(id);
    if (!heading) return;
    pendingFocus.current = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    heading.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    heading.focus({ preventScroll: true });
  });

  /** Speak a status change. A repeated message gets a trailing space so it is read again. */
  function announce(message: string) {
    setAnnouncement((previous) => (previous === message ? `${message} ` : message));
  }

  function forgetVisit() {
    setChain(null);
    setFunding(null);
    setSetupReceipt(null);
    setActivity(null);
    setBlocked(null);
    setBlockedMax(null);
    receiptsLoadedFor.current = null;
  }

  async function handleCreate() {
    if (createPhase === "creating" || signingIn) return;
    setNotice(null);
    setCreatePhase("creating");
    setCompletedSteps([]);
    setCreateError(null);
    setSlowCreate(false);
    announce("Creating your passkey. Keep this tab open.");
    try {
      const created = await adapter.createAccount({
        onStep: (next) => setCompletedSteps((steps) => (steps.includes(next) ? steps : [...steps, next])),
      });
      forgetVisit();
      setChain({ balanceStroops: BigInt(0), rule: null, usedStroops: BigInt(0) });
      setCreatePhase("idle");
      save(1, created.address);
      pendingFocus.current = "fund-title";
      announce("Your account is ready. Next: add test funds.");
    } catch (caught) {
      const error = isDemoError(caught) ? caught : new DemoError("network_unavailable", "Something went wrong. Nothing was created.");
      setCreateError(error);
      setCreatePhase("error");
      announce(`${error.message} You can try again safely.`);
    }
  }

  /** latch's "Sign in with a passkey": finds the account, also one made on another device. */
  async function handleSignIn() {
    if (signingIn || createPhase === "creating") return;
    setNotice(null);
    setSigningIn(true);
    announce("Sign in with your passkey.");
    try {
      const found = await adapter.restoreSession({ prompt: true });
      if (!found) {
        const message = "We didn’t find an account for this passkey. Create one instead.";
        setNotice(message);
        announce(message);
        return;
      }
      const state = await adapter.getAccountState(found);
      if (found.address !== address) forgetVisit();
      setChain(state);
      setRestoreStatus("ok");
      const nextStep = progress?.accountAddress === found.address ? progress.step : inferStepFromChain(state);
      save(nextStep, found.address);
      pendingFocus.current = nextStep >= 2 ? "send-title" : "fund-title";
      announce("Signed in. Welcome back.");
    } catch (caught) {
      const message = isDemoError(caught) ? caught.message : "Sign-in didn’t work. Nothing changed.";
      setNotice(message);
      announce(message);
    } finally {
      setSigningIn(false);
    }
  }

  /** latch's "Check account / restore session". */
  async function handleCheck() {
    if (checking) return;
    setChecking(true);
    setNotice(null);
    try {
      const found = await adapter.restoreSession();
      if (!found) {
        setNotice("No account found in this browser session. Sign in with your passkey, or create an account.");
        return;
      }
      const state = await adapter.getAccountState(found);
      setChain(state);
      setRestoreStatus("ok");
      if (found.address !== address) save(inferStepFromChain(state), found.address);
      announce("Account checked.");
    } catch {
      setNotice("We could not restore your session. Retry below or sign in with your existing passkey.");
    } finally {
      setChecking(false);
    }
  }

  async function handleReset(focusId = "create-title") {
    await adapter.reset();
    clear();
    forgetVisit();
    setCreatePhase("idle");
    setCreateError(null);
    setCompletedSteps([]);
    setNotice(null);
    setExploredControl(false);
    pendingFocus.current = focusId;
    announce("The demo has been reset. Your test account is forgotten on this device.");
  }

  /** "Start a new account": the same reset, then back to the Create buttons. */
  function handleStartOver() {
    return handleReset();
  }

  async function handleFund() {
    if (!account) return;
    const before = chain?.balanceStroops ?? BigInt(0);
    const result = await adapter.fund(account);
    setChain((current) => ({ rule: null, usedStroops: BigInt(0), ...current, balanceStroops: result.balanceStroops }));
    setFunding({
      txHash: result.txHash,
      status: "success",
      explorerUrl: live && result.txHash ? `${DEMO_EXPLORER_TX_URL}/${result.txHash}` : undefined,
      beforeStroops: before,
      afterStroops: result.balanceStroops,
    });
    if (step < 2) save(2, account.address);
    pendingFocus.current = "send-title";
    announce(`Funding confirmed. ${formatXlm(result.balanceStroops)} test XLM in your account.`);
  }

  async function handleRefresh() {
    if (!account) return;
    setChain(await adapter.getAccountState(account));
  }

  async function handleInstallLimit() {
    if (!account) return;
    const result = await adapter.installSpendingRule(account, { limitStroops: DEMO_SPENDING_LIMIT_STROOPS, periodLedgers: DEMO_PERIOD_LEDGERS });
    setChain((current) => ({ balanceStroops: BigInt(0), usedStroops: BigInt(0), ...current, rule: result.rule }));
    setSetupReceipt({
      txHash: result.txHash,
      status: "success",
      explorerUrl: live && result.txHash ? `${DEMO_EXPLORER_TX_URL}/${result.txHash}` : undefined,
    });
    if (step < 3) save(3, account.address);
  }

  async function handleSend(to: string, amountStroops: bigint, onStep: (step: SendStep) => void): Promise<"success" | "pending"> {
    if (!account) throw new DemoError("send_failed", "Sign in first. Nothing was sent.");
    const result = await adapter.send({ account, to, amountStroops, onStep });
    // Balances that couldn't be read right after the send keep their last known values (Refresh updates them).
    setChain((current) =>
      current
        ? {
            rule: current.rule,
            balanceStroops: result.balanceStroops ?? current.balanceStroops,
            usedStroops: result.usedStroops ?? current.usedStroops,
          }
        : result.balanceStroops !== null && result.usedStroops !== null
          ? { rule: null, balanceStroops: result.balanceStroops, usedStroops: result.usedStroops }
          : null,
    );
    setActivity({
      amountStroops,
      receipt: { txHash: result.txHash, status: result.status, explorerUrl: live ? `${DEMO_EXPLORER_TX_URL}/${result.txHash}` : undefined },
    });
    setBlocked(null);
    // Only a confirmed payment completes Try it.
    if (result.status === "success" && step < 4) save(4, account.address);
    return result.status;
  }

  function handleBlocked(amountStroops: bigint) {
    setBlocked(amountStroops);
    setBlockedMax((current) => (current === null || amountStroops > current ? amountStroops : current));
  }

  /** Explorer links only for real transactions; after hydration, since the mock is chosen from the URL. */
  const explorerLinks = hydrated && live;
  const getBalance = useCallback((target: string) => adapter.getBalance(target), [adapter]);

  const balance = chain?.balanceStroops ?? null;
  const limitActive = !!chain?.rule || (step >= 3 && !chainKnown);
  const funded = ready && ((balance !== null && balance > BigInt(0)) || step >= 2);
  const sent = ready && (activity?.receipt.status === "success" || step >= 4);

  const completed: Record<ChapterKey, boolean> = {
    create: ready,
    fund: funded,
    send: sent,
    control: exploredControl,
    finish: ready && funded && sent,
    // Reading sections: numbered in the nav, never "complete".
    "closing-how": false,
    "closing-why": false,
  };
  const variant = (done: boolean): ChapterVariant => (done ? "done" : "now");
  /** Which chapters are on the page: each appears once the one before it is done. */
  const shown: Record<ChapterKey, boolean> = {
    create: true,
    fund: ready,
    send: ready && funded,
    // The first send completes Try it; Control and Your journey appear under it (no scroll away from Try it,
    // so the 150 XLM test stays in view).
    control: ready && funded && sent,
    finish: ready && funded && sent,
    // 06 How it works and 07 Why Smart Accounts follow Your journey.
    "closing-how": ready && funded && sent,
    "closing-why": ready && funded && sent,
  };

  return (
    <div className={styles.page} data-theme={theme ?? undefined}>
      <TestnetBar onToggleTheme={toggleTheme} theme={theme} />
      <ChapterNav completed={completed} shown={shown} />
      <main className={styles.main}>
        <Hero
          dark={theme === "dark"}
          account={ready ? account : null}
          checking={checking}
          completedSteps={completedSteps}
          createError={createError}
          createPhase={createPhase}
          notice={notice}
          offsite={offsite ? { devHint: process.env.NODE_ENV !== "production" } : null}
          // After hydration only: the adapter (and so mock vs live) is chosen from the URL in the browser.
          simulated={hydrated && !live}
          onCheck={handleCheck}
          onCreate={handleCreate}
          onSignIn={handleSignIn}
          onStartOver={handleStartOver}
          recovering={recovering && !offsite}
          showExplorerLinks={explorerLinks}
          signingIn={signingIn}
          slowCreate={slowCreate}
        />
        {shown.fund ? (
        <FundChapter
          balanceStroops={ready ? balance : null}
          funding={funding}
          onAnnounce={announce}
          onFund={handleFund}
          onRefresh={handleRefresh}
          ready={ready}
          showExplorerLinks={explorerLinks}
          variant={variant(funded)}
        />
        ) : null}
        {shown.send ? (
        <TryChapter
          accountAddress={ready ? address : null}
          activity={activity}
          balanceStroops={ready ? balance : null}
          blocked={blocked}
          getBalance={getBalance}
          limitActive={limitActive}
          onAnnounce={announce}
          onBlocked={handleBlocked}
          onInstallLimit={handleInstallLimit}
          onSend={handleSend}
          setupReceipt={setupReceipt}
          showExplorerLinks={explorerLinks}
          usedStroops={chain?.usedStroops ?? BigInt(0)}
          variant={variant(sent)}
        />
        ) : null}
        {shown.control ? <ControlChapter onExplore={() => setExploredControl(true)} variant={variant(exploredControl)} /> : null}
        {shown.finish ? (
        <JourneyChapter
          facts={{
            accountAddress: ready ? address : null,
            balanceStroops: ready ? balance : null,
            funding,
            alreadyFunded: funded && !funding,
            limitActive: ready && limitActive,
            setupReceipt,
            activity: activity ? { ...activity.receipt, amountStroops: activity.amountStroops } : null,
            blockedStroops: blockedMax,
            showExplorerLinks: explorerLinks,
          }}
          variant={variant(completed.finish)}
        />
        ) : null}
        {shown["closing-how"] ? <HowItWorks /> : null}
        {shown["closing-why"] ? <WhySmartAccounts /> : null}

        {/* The page's one status voice: every state change is announced here. */}
        <p aria-atomic="true" aria-live="polite" className={styles.srOnly} role="status">
          {announcement}
        </p>
      </main>
      {/* Outside <main> so it is the page's contentinfo landmark; same column as main. */}
      <div className={styles.main}>
        <DemoFooter onReset={() => handleReset()} />
      </div>
    </div>
  );
}
