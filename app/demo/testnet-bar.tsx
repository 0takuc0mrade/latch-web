import Image from "next/image";
import styles from "./demo.module.css";

/** Sticky striped bar. It replaces the site nav on /demo. */
export function TestnetBar() {
  return (
    <header className={styles.testnetBar}>
      <div className={styles.testnetInner}>
        <Image
          alt="Latch"
          className={styles.barLogo}
          height={48}
          priority
          src="/demo-assets/latch-logo.jpg"
          width={48}
        />
        <p className={styles.testnetMessage}>
          <span className={styles.testnetTag}>TESTNET</span>
          <span className={styles.desktopOnly}>This demo runs on Stellar testnet. Test funds only, no real value.</span>
          <span className={styles.mobileOnly}>Test funds only, no real value.</span>
        </p>
        <span aria-hidden="true" className={styles.barSpacer} />
      </div>
    </header>
  );
}
