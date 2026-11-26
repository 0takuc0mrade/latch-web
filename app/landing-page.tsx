"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Artwork, CapeMascot, DeveloperMascot, KeyMascot, SmartAccountArtwork, TokensPhone } from "./landing-artwork";
import styles from "./landing-page.module.css";

type Theme = "light" | "dark";

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem("latch-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // The theme still works when browser storage is unavailable.
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribeToTheme(onChange: () => void) {
  const preference = matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener("storage", onChange);
  preference.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    preference.removeEventListener("change", onChange);
  };
}

const features = [
  {
    title: "Give apps boundaries",
    description: "Limit which actions an app can take and how long its permission lasts.",
    previewTitle: "My Bot",
    labels: ["Expires", "Limit"],
    values: ["1 hour", "1,000,000 USDC"],
  },
  {
    title: "Set your spending rules",
    description: "Choose spending limits and keep control of how your wallet is used.",
    previewTitle: "Spending rules",
    labels: ["Token", "Daily limit"],
    values: ["USDC", "100 USDC"],
  },
  {
    title: "Add another way to approve",
    description: "Manage your signers and add another way to authorize your transactions.",
    previewTitle: "Your signers",
    labels: ["Primary", "Additional"],
    values: ["Your passkey", "Another signer"],
  },
] as const;

const steps = [
  {
    title: "Create your passkey.",
    description: "Follow your device’s prompt to create your account. No new seed phrase required.",
  },
  {
    title: "Add your Tokens",
    description: "Open Receive and use the funding instructions for your account.",
  },
  {
    title: "Make your move.",
    description: "Choose who to send to, review the details, then approve with your passkey.",
  },
] as const;

const questions = [
  {
    question: "What is Latch?",
    answer: "Latch is a passkey-first wallet being built on Stellar. Create an account without a new seed phrase, then use it to hold tokens, send and receive, and connect to supported apps.",
  },
  {
    question: "What is a Smart Account?",
    answer: "A Smart Account is a programmable account. It lets you manage signers, set spending rules, and control which actions connected apps can take.",
  },
  {
    question: "Can I download Latch yet?",
    answer: <>We’re preparing Latch for mainnet. <Link href="/waitlist">Join the waitlist</Link> to follow our progress and hear when it’s ready.</>,
  },
  {
    question: "Will I need a seed phrase?",
    answer: "You won’t need to create or write down a new wallet seed phrase. Latch uses a passkey that you access with your fingerprint, face recognition, or device PIN.",
  },
  {
    question: "Does that mean I never need to think about recovery?",
    answer: "You should still plan for losing access to your device or passkey. How you back up and recover a passkey depends on your device and passkey provider.",
  },
  {
    question: "Can I integrate Latch into my app?",
    answer: "We’re building open-source tools to help wallets and apps create, fund, and work with Stellar Smart Accounts. Join the waitlist for updates as these tools become available.",
  },
  {
    question: "Who is building Latch?",
    answer: "Latch is being built by 3K1 Lab.",
  },
] as const;

function WalletControls() {
  const [active, setActive] = useState(0);
  const feature = features[active];

  return (
    <div className={styles.walletControls}>
      <div className={styles.featureOptions}>
        {features.map((item, index) => (
          <button
            aria-controls="wallet-control-preview"
            aria-expanded={active === index}
            className={styles.featureOption}
            data-active={active === index}
            id={`wallet-control-${index}`}
            key={item.title}
            onClick={() => setActive(index)}
            type="button"
          >
            <span>{item.title}</span>
            {active === index && <span className={styles.featureDescription}>{item.description}</span>}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`wallet-control-${active}`}
        className={styles.permissionPreview}
        id="wallet-control-preview"
        role="region"
      >
        <Artwork alt="Latch on a phone, held in your hands" className={styles.permissionPhoto} name="permissions-photo.png" />
        <div aria-hidden="true" className={styles.permissionCard}>
          <p>{feature.previewTitle}</p>
          <div className={styles.permissionTags}><span>Transfer</span><span>Swap</span></div>
          <div className={styles.permissionFields}>
            {feature.labels.map((label, index) => (
              <div key={label}><span>{label}</span><span>{feature.values[index]}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  const track = useRef<HTMLOListElement>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(true);

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    function update() {
      if (!element) return;
      setCanGoBack(element.scrollLeft > 2);
      setCanGoForward(element.scrollLeft + element.clientWidth < element.scrollWidth - 2);
    }
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  function move(direction: number) {
    const element = track.current;
    const card = element?.firstElementChild;
    if (!element || !card) return;
    element.scrollBy({
      left: direction * (card.getBoundingClientRect().width + 16),
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  return (
    <section aria-labelledby="how-it-works-heading" className={styles.howItWorks}>
      <div className={`${styles.sectionWidth} ${styles.howHeading}`}>
        <h2 id="how-it-works-heading">How it works</h2>
        <div className={styles.carouselControls}>
          <button aria-controls="latch-steps" aria-label="Previous step" disabled={!canGoBack} onClick={() => move(-1)} type="button"><Artwork name="arrow-left.svg" /></button>
          <button aria-controls="latch-steps" aria-label="Next step" disabled={!canGoForward} onClick={() => move(1)} type="button"><Artwork name="arrow-right.svg" /></button>
        </div>
      </div>
      <ol aria-label="Getting started with Latch" className={styles.steps} id="latch-steps" ref={track} tabIndex={0}>
        {steps.map((step, index) => (
          <li className={styles.step} key={step.title}>
            <div aria-hidden="true" className={styles.stepArt}>
              {index === 0 && <><Artwork className={styles.passkeyPhone} name="step-phone-passkey.png" /><KeyMascot /></>}
              {index === 1 && <><TokensPhone /><CapeMascot /><KeyMascot mirrored /></>}
              {index === 2 && <><Artwork className={styles.sendPhone} name="step-phone-send.png" /><CapeMascot left /></>}
            </div>
            <div className={styles.stepCopy}><h3>{step.title}</h3><p>{step.description}</p></div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function LandingPage() {
  const storedTheme = useSyncExternalStore(subscribeToTheme, readTheme, () => "light" as Theme);
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const theme = selectedTheme ?? storedTheme;

  useEffect(() => {
    const background = theme === "dark" ? "#111111" : "#ffffff";
    document.documentElement.style.colorScheme = theme;
    document.documentElement.style.backgroundColor = background;
    document.body.style.backgroundColor = background;
  }, [theme]);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setSelectedTheme(next);
    try { localStorage.setItem("latch-theme", next); } catch { /* Storage is optional. */ }
  }

  return (
    <div className={styles.page} data-theme={theme}>
      <a className={styles.skipLink} href="#main-content">Skip to content</a>
      <header className={styles.header}>
        <Link aria-label="Latch home" className={styles.logo} href="/">
          <Image
            alt="Latch"
            className={styles.artwork}
            height={25.7459}
            loading="eager"
            src={theme === "dark" ? "/waitlist-assets/logo-dark.svg" : "/landing-assets/logo.svg"}
            width={131.852}
          />
        </Link>
        <nav aria-label="Main navigation" className={styles.navigation}>
          <a href="#features">Features</a>
          <a href="#contact">Contact us</a>
        </nav>
        <button aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} aria-pressed={theme === "dark"} className={styles.themeToggle} onClick={toggleTheme} type="button">
          <span className={styles.sunOption}><Artwork name="sun.svg" /></span>
          <span className={styles.moonOption}><Artwork name="moon.svg" /></span>
        </button>
      </header>

      <main id="main-content">
        <section aria-labelledby="hero-heading" className={styles.hero}>
          <h1 aria-label="The new smart account wallet on Stellar" id="hero-heading">
            <span className={styles.heroLine}>The new smart</span>
            <span className={styles.heroLine}>Account <span aria-hidden="true" className={styles.heroMascotGroup}><Artwork className={styles.heroMascotShadow} name="mascot-shadow.svg" /><Artwork className={styles.heroMascot} name="hero-mascot.svg" priority /></span> wallet</span>
            <span className={styles.heroLine}>On Stellar <Artwork className={styles.stellarCoin} name="stellar-coin.png" priority /></span>
          </h1>
          <Link className={styles.primaryButton} href="/waitlist">Get Latch now</Link>
          <Link className={styles.secondaryButton} href="/demo">Try the demo</Link>
          <p className={styles.poweredBy}>powered by <Artwork alt="Stellar" name="stellar-logo.png" /></p>
        </section>

        <section aria-label="Meet your Latch wallet" className={`${styles.sectionWidth} ${styles.walletShowcase}`}>
          <article className={styles.walletCard}>
            <div className={styles.walletCardCopy}><p>Your wallet</p><h2>Send, add, swap and receive funds</h2></div>
            <span aria-hidden="true" className={styles.sendRibbon}><Artwork name="send.svg" />Send Token</span>
            <Artwork alt="Latch wallet showing your balance and options to fund, send, receive, and swap tokens" className={styles.walletPhone} name="phone.png" />
            <span aria-hidden="true" className={styles.sendRibbonLeft}>Send Token</span>
          </article>
          <article className={styles.smartWalletCard}>
            <div className={styles.smartCardCopy}><p>Smart wallet</p><h2>Manage signers &amp; access with programmable control built into your wallet.</h2></div>
            <div className={styles.smartCardIllustration}>
              <SmartAccountArtwork />
              <Artwork className={styles.smartCardPeople} name="wallet-people.png" />
            </div>
          </article>
        </section>

        <section aria-labelledby="features-heading" className={`${styles.sectionWidth} ${styles.features}`} id="features">
          <h2 className={styles.sectionHeading} id="features-heading">A familiar way into<br />something <Artwork alt="new." className={styles.scriptNew} name="script-new.png" /></h2>
          <div className={styles.featureGrid}>
            <article><Artwork className={styles.featureArt} name="feature-wallet.png" /><h3>Skip the secret words.</h3><p>With passkey onboarding, there’s no new wallet seed phrase to write down, memorize, or store.</p></article>
            <article><Artwork className={styles.featureArt} name="feature-passkey.png" /><h3>Make yourself at home.</h3><p>Use your fingerprint, face recognition, or device PIN to access your passkey.</p></article>
            <article><Artwork alt="A Latch transaction review with a passkey approval prompt" className={styles.featureArt} name="feature-approval.svg" /><h3>Approve with a passkey.</h3><p>Your passkey can authorize transactions too. Review what you’re doing, then approve with your device.</p></article>
          </div>
        </section>

        <section aria-labelledby="possibilities-heading" className={`${styles.sectionWidth} ${styles.possibilities}`}>
          <h2 className={styles.sectionHeading} id="possibilities-heading">A simpler start.<br /><Artwork alt="more" className={styles.scriptMore} name="script-more.png" /> Possibilities</h2>
          <WalletControls />
        </section>

        <section aria-labelledby="download-heading" className={styles.download}>
          <div className={styles.downloadContent}>
            <h2 id="download-heading">Your wallet,<br />wherever <Artwork alt="you" className={styles.scriptYou} name="script-you.png" /> go!</h2>
            <p>We’re bringing Latch to your phone and browser,<br className={styles.desktopBreak} /> so you can choose where you use Stellar.</p>
            <Link className={styles.primaryButton} href="/waitlist">Download Latch</Link>
          </div>
        </section>

        <HowItWorks />

        <section aria-labelledby="developers-heading" className={styles.developers}>
          <div className={`${styles.sectionWidth} ${styles.developersInner}`}>
            <div className={styles.developersCopy}><p className={styles.developersLabel}>For developers</p><h2 id="developers-heading">Give your users a passkey-first start.</h2><p>We’re building open-source tools to help wallets and apps create, fund, and work with Stellar Smart Accounts.</p></div>
            <DeveloperMascot />
          </div>
        </section>

        <section aria-labelledby="faq-heading" className={styles.faq}>
          <h2 className={styles.sectionHeading} id="faq-heading">Frequently<br /><Artwork alt="Asked" className={styles.scriptAsked} name="script-asked.png" /> Questions</h2>
          <div className={styles.questions}>
            {questions.map(({ question, answer }, index) => (
              <details className={styles.question} key={question} name="latch-faq" open={index === 0}>
                <summary><h3>{question}</h3><span aria-hidden="true" className={styles.questionIcon}><Artwork className={styles.plusIcon} name="plus.svg" /><Artwork className={styles.minusIcon} name="minus.svg" /></span></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className={styles.footer} id="contact">
        <div className={`${styles.sectionWidth} ${styles.footerTop}`}>
          <p>Latch. Your passkey to Stellar.</p>
          <div className={styles.socialLinks}>
            <a aria-label="Latch on X" href="https://x.com/uselatchapp" rel="noreferrer" target="_blank">
              <svg aria-hidden="true" fill="none" viewBox="0 0 36.6 40" xmlns="http://www.w3.org/2000/svg"><path d="M28.7845 3.4375H34.3906L22.1458 17.4688L36.5517 36.5625H25.2732L16.4391 24.9802L6.3303 36.5625H0.721897L13.8188 21.5534L0 3.4375H11.5663L19.5506 14.0215L28.7845 3.4375ZM26.8198 33.1997H29.9267L9.87582 6.62435H6.54504L26.8198 33.1997Z" fill="currentColor" /></svg>
            </a>
            <a aria-label="Email Latch" href="mailto:Superfranky@3k1labs.io">
              <svg aria-hidden="true" fill="none" viewBox="60.5517 0 40 40" xmlns="http://www.w3.org/2000/svg"><path d="M93.8437 4H66.4268C64.8686 4 63.3743 4.61898 62.2725 5.72077C61.1707 6.82255 60.5517 8.3169 60.5517 9.87506V29.4586C60.5517 31.0168 61.1707 32.5111 62.2725 33.6129C63.3743 34.7147 64.8686 35.3337 66.4268 35.3337H93.8437C95.4019 35.3337 96.8962 34.7147 97.998 33.6129C99.0998 32.5111 99.7188 31.0168 99.7188 29.4586V9.87506C99.7188 8.3169 99.0998 6.82255 97.998 5.72077C96.8962 4.61898 95.4019 4 93.8437 4ZM92.5316 7.91671L80.1353 17.2189L67.7389 7.91671H92.5316ZM93.8437 31.417H66.4268C65.9074 31.417 65.4093 31.2106 65.042 30.8434C64.6748 30.4761 64.4684 29.978 64.4684 29.4586V10.3646L78.9602 21.2335C79.2992 21.4877 79.7115 21.6252 80.1353 21.6252C80.559 21.6252 80.9713 21.4877 81.3103 21.2335L95.8021 10.3646V29.4586C95.8021 29.978 95.5958 30.4761 95.2285 30.8434C94.8612 31.2106 94.3631 31.417 93.8437 31.417Z" fill="currentColor" /></svg>
            </a>
          </div>
          <p className={styles.builtBy}>Built by <span><Artwork alt="3K1 Lab" name="3k1-logo.png" /></span></p>
        </div>
        <Artwork className={styles.footerLogo} name="footer-logo.svg" />
      </footer>
    </div>
  );
}
