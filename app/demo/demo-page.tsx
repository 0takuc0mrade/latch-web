"use client";

import { useRef, useState } from "react";
import {
  createDemoAdapter,
  DemoError,
  isDemoError,
  type CreateStep,
  type DemoAccount,
  type DemoAdapter,
} from "@/lib/demo";
import { DemoFooter } from "./demo-footer";
import { Hero, type CreatePhase } from "./hero";
import { useSiteTheme } from "../use-site-theme";
import { TestnetBar } from "./testnet-bar";
import styles from "./demo.module.css";

/**
 * /demo shell. This pass wires only "Create account" to the adapter; the fund,
 * rule and try-it chapters and the progressive reveal come next, along with
 * persisted progress.
 */
export function DemoPage() {
  const adapterRef = useRef<DemoAdapter | null>(null);
  if (adapterRef.current === null) adapterRef.current = createDemoAdapter();
  const adapter = adapterRef.current;

  const { theme, toggleTheme } = useSiteTheme({ light: "#fffaec", dark: "#111111" });

  const [phase, setPhase] = useState<CreatePhase>("idle");
  const [completedSteps, setCompletedSteps] = useState<CreateStep[]>([]);
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [error, setError] = useState<DemoError | null>(null);

  async function handleCreate() {
    if (phase === "creating") return;
    setPhase("creating");
    setCompletedSteps([]);
    setError(null);

    try {
      const created = await adapter.createAccount({
        onStep: (step) => setCompletedSteps((steps) => (steps.includes(step) ? steps : [...steps, step])),
      });
      setAccount(created);
      setPhase("created");
    } catch (caught) {
      setError(
        isDemoError(caught)
          ? caught
          : new DemoError("network_unavailable", "Something went wrong. Nothing was created."),
      );
      setPhase("error");
    }
  }

  async function handleReset() {
    await adapter.reset();
    setAccount(null);
    setError(null);
    setCompletedSteps([]);
    setPhase("idle");
  }

  return (
    <div className={styles.page} data-theme={theme ?? undefined}>
      <TestnetBar onToggleTheme={toggleTheme} theme={theme} />
      <main className={styles.main}>
        <Hero
          account={account}
          completedSteps={completedSteps}
          dark={theme === "dark"}
          error={error}
          onCreate={handleCreate}
          phase={phase}
        />
        {/* Chapters 02 Fund, 03 Set a rule, 04 Try it, and 05–07 are built in the next pass. */}
        <DemoFooter onReset={handleReset} />
      </main>
    </div>
  );
}
