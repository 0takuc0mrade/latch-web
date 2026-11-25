import { MascotScene } from "../mascot-scene";
import { ArrowRightIcon, PasskeyIcon, SendIcon, ShieldIcon, XlmIcon } from "./icons";
import styles from "./demo.module.css";

/*
 * Welcome, copied from latch's demo (components/demo/Demo.tsx, #welcome).
 * The only addition is the spending-limit step in "Your next few minutes".
 */
const NEXT_MINUTES = [
  { icon: <PasskeyIcon size={17} />, title: "Start with a passkey", detail: "Use your device to create your account." },
  { icon: <XlmIcon size={17} />, title: "Give it a little XLM", detail: "Free funds for a safe first try." },
  { icon: <ShieldIcon size={17} />, title: "Set a spending limit", detail: "Only 100 XLM can leave every 24 hours." },
  { icon: <SendIcon size={17} />, title: "Make your first move", detail: "You approve. Stellar records it." },
] as const;

export function Hero({ dark }: { dark: boolean }) {
  return (
    <section aria-labelledby="welcome-title" className={styles.hero} id="welcome">
      <div className={styles.heroCopy}>
        {/* Mobile keeps the small mascot beside the headline. */}
        <div className={styles.heroMascotMobile}>
          <MascotScene dark={dark} />
        </div>
        <p className={styles.accent}>A little curiosity. A real first step.</p>
        <h1 id="welcome-title" tabIndex={-1}>
          Your first Smart Account, <span className={styles.headlineAccent}>made simple.</span>
        </h1>
        <p className={styles.lede}>
          A wallet that starts with you. Create an account with a passkey, add free test funds, set a spending limit,
          and make your first move on Stellar.
        </p>
        <div className={styles.ctaRow}>
          <a className={styles.primaryButton} href="#create">
            Get started <ArrowRightIcon size={18} />
          </a>
          <span className={styles.helper}>Real network. Test funds. No real money needed.</span>
        </div>
      </div>

      <div className={styles.heroVisual}>
        <div aria-hidden="true" className={styles.heroDisc} />
        <div aria-label="Latch mascot meditating while juggling coins" className={styles.heroMascot} role="img">
          <MascotScene dark={dark} />
        </div>
        <div className={`${styles.card} ${styles.previewCard}`}>
          <h2 className={styles.cardEyebrow}>YOUR NEXT FEW MINUTES</h2>
          <ol className={styles.previewList}>
            {NEXT_MINUTES.map((step) => (
              <li key={step.title}>
                <span aria-hidden="true" className={styles.stepNumber}>
                  {step.icon}
                </span>
                <span className={styles.stepText}>
                  <span className={styles.stepTitle}>{step.title}</span>
                  <span className={styles.stepDetail}>{step.detail}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className={styles.previewFooter}>All here, one step at a time.</p>
        </div>
      </div>
    </section>
  );
}
