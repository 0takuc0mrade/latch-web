import Image from "next/image";
import { useWaitlistSignup } from "../use-waitlist-signup";
import styles from "./demo.module.css";

/** Black waitlist panel. Uses the same signup hook and `/api/waitlist` as /waitlist. */
function WaitlistPanel() {
  const { submissionState, message, handleSubmit, isLoading } = useWaitlistSignup();

  return (
    <div className={styles.waitlistPanel}>
      <Image
        alt=""
        aria-hidden="true"
        className={styles.waitlistMascot}
        height={144}
        src="/demo-assets/mascot-hero.png"
        width={160}
      />
      <div className={styles.waitlistCopy}>
        <p className={styles.waitlistHeading}>Latch brings Smart Accounts to everyday people on Stellar.</p>
        <p className={`${styles.waitlistSub} ${styles.desktopOnly}`}>Coming to mobile and browser.</p>
      </div>
      <form
        className={styles.waitlistForm}
        noValidate
        onSubmit={(event) => (isLoading ? event.preventDefault() : handleSubmit(event))}
      >
        <label className={styles.srOnly} htmlFor="demo-waitlist-email">
          Email address
        </label>
        <input
          aria-describedby={message ? "demo-waitlist-message" : undefined}
          autoComplete="email"
          className={styles.waitlistInput}
          readOnly={isLoading}
          id="demo-waitlist-email"
          inputMode="email"
          maxLength={254}
          name="email"
          placeholder="Enter email address"
          required
          type="email"
        />
        <button aria-disabled={isLoading || undefined} className={styles.waitlistButton} type="submit">
          {isLoading ? "Joining…" : "Join the waitlist"}
        </button>
        {message ? (
          <p
            className={`${styles.waitlistMessage} ${
              submissionState === "success" ? styles.waitlistSuccess : styles.waitlistError
            }`}
            id="demo-waitlist-message"
            role={submissionState === "error" ? "alert" : "status"}
          >
            {message}
          </p>
        ) : null}
      </form>
    </div>
  );
}

export function DemoFooter({ onReset }: { onReset: () => void }) {
  return (
    <div className={styles.footerBlock}>
      <WaitlistPanel />
      <footer className={styles.smallPrint}>
        <span>Latch · A simpler way into Stellar.</span>
        <span>Testnet only · Test funds have no monetary value.</span>
        <button className={styles.linkButton} onClick={onReset} type="button">
          Reset demo
        </button>
      </footer>
    </div>
  );
}
