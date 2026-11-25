import Image from "next/image";
import type { SiteTheme } from "../use-site-theme";
import styles from "./demo.module.css";

interface TestnetBarProps {
  /** Null until hydrated; the toggle then shows the OS preference via CSS. */
  theme: SiteTheme | null;
  onToggleTheme: () => void;
}

/** Sticky striped bar. It replaces the site nav on /demo. */
export function TestnetBar({ theme, onToggleTheme }: TestnetBarProps) {
  return (
    <header className={styles.testnetBar}>
      <div className={styles.testnetInner}>
        <p className={styles.testnetMessage}>
          <span className={styles.testnetTag}>TESTNET</span>
          <span className={styles.desktopOnly}>This demo runs on Stellar testnet. Test funds only, no real value.</span>
          <span className={styles.mobileOnly}>Test funds only, no real value.</span>
        </p>
        <button
          aria-label="Dark mode"
          aria-pressed={theme === "dark"}
          className={styles.themeToggle}
          onClick={onToggleTheme}
          type="button"
        >
          <span className={styles.sunOption}>
            <Image alt="" height={29} src="/landing-assets/sun.svg" width={29} />
          </span>
          <span className={styles.moonOption}>
            <Image alt="" height={24} src="/landing-assets/moon.svg" width={25} />
          </span>
        </button>
      </div>
    </header>
  );
}
