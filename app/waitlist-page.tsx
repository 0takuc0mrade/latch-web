"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import styles from "./waitlist-page.module.css";

type Theme = "light" | "dark";
type SubmissionState = "idle" | "loading" | "success" | "error";
type FontRendering = "figma" | "fallback";

const ASSET_ROOT = "/waitlist-assets";
const THEME_STORAGE_KEY = "latch-theme";

function readTheme(): Theme {
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribeToTheme(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  window.addEventListener("storage", onStoreChange);
  mediaQuery.addEventListener("change", onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    mediaQuery.removeEventListener("change", onStoreChange);
  };
}

function readFontRendering(): FontRendering {
  const platformProvidesSanFrancisco = /Macintosh|iPhone|iPad|iPod/.test(navigator.userAgent);

  return platformProvidesSanFrancisco ? "figma" : "fallback";
}

function subscribeToFontRendering() {
  return () => undefined;
}

function FillAsset({ src, className }: { src: string; className?: string }) {
  return (
    <Image
      aria-hidden="true"
      alt=""
      className={`${styles.asset} ${className ?? ""}`}
      draggable={false}
      fill
      sizes="300px"
      src={`${ASSET_ROOT}/${src}`}
    />
  );
}

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const moonAsset = theme === "dark" ? "moon-dark.svg" : "moon-light.svg";

  return (
    <button
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      aria-pressed={theme === "dark"}
      className={styles.themeToggle}
      onClick={onToggle}
      type="button"
    >
      <span className={styles.sunOption}>
        <span className={styles.sunIcon}>
          <FillAsset src="sun-light.svg" />
        </span>
      </span>
      <span className={styles.moonOption}>
        <span className={styles.moonIcon}>
          <FillAsset src={moonAsset} />
        </span>
      </span>
    </button>
  );
}

function FloatingCoins({ theme }: { theme: Theme }) {
  const nodeIds =
    theme === "dark"
      ? ["979:20242", "979:20251", "979:20260", "979:20269", "979:20279"]
      : ["969:20112", "969:20115", "969:20118", "969:20121", "969:20125"];

  return (
    <div className={styles.coinLayer} aria-hidden="true">
      <div className={styles.coinUsdc} data-node-id={nodeIds[0]}>
        <div className={styles.usdcCoinShape}>
          <div className={styles.usdcCoinShapeInner}>
            <div className={styles.usdcCoinShapeAsset}>
              <FillAsset src="coin-usdc-light.svg" />
            </div>
          </div>
        </div>
        <div className={styles.usdcCoinLogo}>
          <div className={styles.usdcCoinLogoInner}>
            <div className={styles.usdcCoinLogoAsset}>
              <FillAsset className={styles.coverAsset} src="usdc-light.png" />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.coinUsdt} data-node-id={nodeIds[1]}>
        <div className={styles.usdtCoinShape}>
          <div className={styles.usdtCoinShapeInner}>
            <div className={styles.usdtCoinShapeAsset}>
              <FillAsset src="coin-usdt-light.svg" />
            </div>
          </div>
        </div>
        <div className={styles.usdtCoinLogo}>
          <div className={styles.usdtCoinLogoInner}>
            <div className={styles.usdtCoinLogoAsset}>
              <FillAsset className={styles.coverAsset} src="usdt-light.png" />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.coinStellar} data-node-id={nodeIds[2]}>
        <div className={styles.stellarCoinShape}>
          <div className={styles.stellarCoinShapeInner}>
            <div className={styles.stellarCoinShapeAsset}>
              <FillAsset src="coin-stellar-light.svg" />
            </div>
          </div>
        </div>
        <div className={styles.stellarCoinLogo}>
          <div className={styles.stellarCoinLogoInner}>
            <div className={styles.stellarCoinLogoAsset}>
              <FillAsset className={styles.coverAsset} src="stellar-light.png" />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.walletCoin} data-node-id={nodeIds[3]}>
        <div className={styles.walletRotation}>
          <div className={styles.walletViewport}>
            <div className={styles.walletAsset}>
              <FillAsset src="wallet-light.svg" />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.cashCoin} data-node-id={nodeIds[4]}>
        <div className={styles.cashRotation}>
          <div className={styles.cashViewport}>
            <div className={styles.cashAsset}>
              <FillAsset src="cash-light.svg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Mascot({ theme }: { theme: Theme }) {
  const shadowAsset = theme === "dark" ? "shadow-dark.svg" : "shadow-light.svg";

  return (
    <>
      <div className={styles.sparkleLayer} aria-hidden="true">
        <span className={styles.sparkleLarge}>
          <FillAsset src="sparkle-large-light.svg" />
        </span>
        <span className={styles.sparkleSmall}>
          <FillAsset src="sparkle-small-light.svg" />
        </span>
      </div>

      <div className={styles.mascotFrame} aria-hidden="true">
        <span className={styles.leftArm}>
          <FillAsset src="arm-left-light.svg" />
        </span>
        <span className={styles.rightArm}>
          <FillAsset src="arm-right-light.svg" />
        </span>
        <span className={styles.mascotBody}>
          <FillAsset src="mascot-light.svg" />
        </span>
        <span className={styles.mascotShadow}>
          <FillAsset src={shadowAsset} />
        </span>
      </div>

      <FloatingCoins theme={theme} />
    </>
  );
}

function WaitlistForm() {
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const emailInput = form.elements.namedItem("email");

    if (!(emailInput instanceof HTMLInputElement) || !emailInput.checkValidity()) {
      setSubmissionState("error");
      setMessage("Enter a valid email address.");
      if (emailInput instanceof HTMLInputElement) emailInput.focus();
      return;
    }

    setSubmissionState("loading");
    setMessage("");

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput.value }),
      });
      const result = (await response.json()) as { ok?: boolean; message?: unknown };
      const responseMessage =
        typeof result.message === "string" ? result.message : "The waitlist is unavailable right now.";

      if (!response.ok || result.ok !== true) {
        setSubmissionState("error");
        setMessage(responseMessage);
        return;
      }

      form.reset();
      setSubmissionState("success");
      setMessage(responseMessage);
    } catch {
      setSubmissionState("error");
      setMessage("The waitlist is unavailable right now. Please try again.");
    }
  }

  const isLoading = submissionState === "loading";

  return (
    <form className={styles.waitlistForm} noValidate onSubmit={handleSubmit}>
      <label className={styles.srOnly} htmlFor="waitlist-email">
        Email address
      </label>
      <input
        aria-describedby={message ? "waitlist-message" : undefined}
        autoComplete="email"
        className={styles.emailInput}
        disabled={isLoading}
        id="waitlist-email"
        inputMode="email"
        maxLength={254}
        name="email"
        placeholder="Enter Email Address"
        required
        type="email"
      />
      <button className={styles.submitButton} disabled={isLoading} type="submit">
        {isLoading ? "Joining…" : "Join Waitlist"}
      </button>
      {message ? (
        <p
          className={`${styles.formMessage} ${
            submissionState === "success" ? styles.successMessage : styles.errorMessage
          }`}
          id="waitlist-message"
          role={submissionState === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}

export function WaitlistPage() {
  const storedTheme = useSyncExternalStore<Theme>(subscribeToTheme, readTheme, () => "light");
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const theme = selectedTheme ?? storedTheme;
  const fontRendering = useSyncExternalStore<FontRendering>(
    subscribeToFontRendering,
    readFontRendering,
    () => "figma",
  );

  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
    document.documentElement.style.backgroundColor = theme === "dark" ? "#020202" : "#fff8e1";
    document.body.style.backgroundColor = theme === "dark" ? "#020202" : "#fff8e1";
  }, [theme]);

  function toggleTheme() {
    const nextTheme = readTheme() === "light" ? "dark" : "light";
    setSelectedTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  const logoAsset = theme === "dark" ? "logo-dark.svg" : "logo-light.svg";

  return (
    <main className={styles.page} data-font-rendering={fontRendering} data-theme={theme}>
      <header className={styles.header}>
        <Link aria-label="Latch home" className={styles.logoLink} href="/">
          <Image
            alt="Latch"
            className={styles.logo}
            height={29.7612}
            priority
            src={`${ASSET_ROOT}/${logoAsset}`}
            width={152.416}
          />
        </Link>
        <ThemeToggle onToggle={toggleTheme} theme={theme} />
      </header>

      <section className={styles.hero} aria-labelledby="waitlist-heading">
        <Mascot theme={theme} />
        <div className={styles.heroCopy}>
          <h1 id="waitlist-heading">
            <span>Join the road </span>
            <span>to Mainnet now!</span>
          </h1>
          <p>Follow Latch as we prepare for mainnet on Stellar.</p>
        </div>
      </section>

      <WaitlistForm />
    </main>
  );
}
