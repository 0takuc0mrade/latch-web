import type { ReactNode } from "react";
import { DonePill, NextPill, SummaryRow } from "./parts";
import styles from "./demo.module.css";

export type ChapterVariant = "now" | "done";

interface ChapterProps {
  /** Used for ids: `chapter-<id>` (section) and `chapter-<id>-title` (heading, focus target). */
  id: string;
  label: string;
  variant: ChapterVariant;
  accent: string;
  title: string;
  /** Desktop and mobile copy differ in the design. */
  body: { desktop: ReactNode; mobile: ReactNode };
  /** Extra left-column content (disclosure, hint box). Desktop only, like the design. */
  aside?: ReactNode;
  /** The action card (right column). */
  children: ReactNode;
  /** Mobile collapses a finished chapter to this row. Omit to keep the full chapter. */
  summary?: { title: string; detail: string };
}

/** A numbered chapter: copy on the left, action card on the right. */
export function Chapter({ id, label, variant, accent, title, body, aside, children, summary }: ChapterProps) {
  const collapsesOnMobile = variant === "done" && summary;

  return (
    <section
      aria-labelledby={`chapter-${id}-title`}
      className={`${styles.chapter} ${collapsesOnMobile ? styles.chapterCollapsible : ""}`}
      data-variant={variant}
      id={`chapter-${id}`}
    >
      <div className={styles.chapterCopy}>
        <div className={styles.chapterHeader}>
          <p className={styles.chapterLabel}>{label}</p>
          {variant === "done" ? <DonePill /> : <NextPill />}
        </div>
        <p className={styles.accent}>{accent}</p>
        <h2 className={styles.chapterTitle} id={`chapter-${id}-title`} tabIndex={-1}>
          {title}
        </h2>
        <p className={styles.lede}>
          <span className={styles.desktopOnly}>{body.desktop}</span>
          <span className={styles.mobileOnly}>{body.mobile}</span>
        </p>
        {aside ? <div className={styles.desktopOnly}>{aside}</div> : null}
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
