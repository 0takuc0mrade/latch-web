import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./legal.module.css";

// Shown on both /privacy and /terms.
export const LEGAL = {
  entity: "3K1 Labs LLC",
  address: "312 W 2nd St, Unit #A3626, Casper, WY 82601, USA",
  contactEmail: "superfranky@3k1labs.io",
  privacyEmail: "superfranky@3k1labs.io",
  governingLaw: "the State of Wyoming, USA",
  lastUpdated: "November 14, 2026",
} as const;

type LegalPageProps = {
  title: string;
  children: ReactNode;
};

export function LegalPage({ title, children }: LegalPageProps) {
  return (
    <main className={styles.page}>
      <article className={styles.article}>
        <Link aria-label="Latch home" className={styles.logoLink} href="/">
          <Image
            alt="Latch"
            className={styles.logo}
            height={23.43}
            priority
            src="/waitlist-assets/logo-light.svg"
            width={120}
          />
        </Link>
        <h1>{title}</h1>
        <p className={styles.updated}>Last updated: {LEGAL.lastUpdated}</p>
        {children}
        <footer className={styles.footer}>
          <Link href="/">Home</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
        </footer>
      </article>
    </main>
  );
}

export { styles as legalStyles };
