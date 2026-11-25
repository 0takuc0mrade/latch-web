import type { ReactNode } from "react";
import { DonePill, NextPill, SummaryRow } from "./parts";
import styles from "./demo.module.css";

/** todo: not reachable yet (the card says what comes first), now: the next step, done: finished. */
export type ChapterVariant = "todo" | "now" | "done";

interface ChapterProps {
  /** Section id (the chapter nav links to it) and `<id>-title` for the heading. */
  id: string;
  label: string;
  variant: ChapterVariant;
  accent: string;
  title: ReactNode;
  /** Left-column copy. */
  body: ReactNode;
  /** Extra left-column content (a disclosure). */
  aside?: ReactNode;
  /** The action card (right column). */
  children: ReactNode;
  /** Mobile collapses a finished chapter to this row. Omit to keep the full chapter. */
  summary?: { title: string; detail: string };
}

/** A numbered chapter: copy on the left, action card on the right (latch's demo-section). */
export function Chapter({ id, label, variant, accent, title, body, aside, children, summary }: ChapterProps) {
  const collapsesOnMobile = variant === "done" && summary;

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`${styles.chapter} ${collapsesOnMobile ? styles.chapterCollapsible : ""}`}
      data-variant={variant}
      id={id}
    >
      <div className={styles.chapterCopy}>
        <div className={styles.chapterHeader}>
          <p className={styles.chapterLabel}>{label}</p>
          {variant === "done" ? <DonePill /> : variant === "now" ? <NextPill /> : null}
        </div>
        <p className={styles.accent}>{accent}</p>
        <h2 className={styles.chapterTitle} id={`${id}-title`} tabIndex={-1}>
          {title}
        </h2>
        <div className={styles.chapterBody}>{body}</div>
        {aside}
      </div>
      <div className={styles.chapterAction}>{children}</div>
      {collapsesOnMobile ? (
        <div className={styles.chapterSummary}>
          <SummaryRow detail={summary.detail} label={label} title={summary.title} />
        </div>
      ) : null}
    </section>
  );
}

/** The "?" disclosure used in chapter copy (latch's <details>). */
export function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className={styles.disclosure}>
      <summary>
        <span className={styles.disclosureLabel}>
          <span aria-hidden="true" className={styles.disclosureMark}>
            ?
          </span>
          {summary}
        </span>
      </summary>
      <p>{children}</p>
    </details>
  );
}
