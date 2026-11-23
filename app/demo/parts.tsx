import type { ReactNode } from "react";
import { stroopsToXlm } from "@/lib/demo";
import { CheckIcon } from "./icons";
import styles from "./demo.module.css";

/** "10,000" from stroops. Whole XLM in this demo, but keeps decimals if present. */
export function formatXlm(stroops: bigint): string {
  return stroopsToXlm(stroops).toLocaleString("en-US", { maximumFractionDigits: 7 });
}

export function TestTag() {
  return <span className={styles.testTag}>TEST</span>;
}

export function DonePill({ label = "Done" }: { label?: string }) {
  return (
    <span className={styles.donePill}>
      <span className={styles.badgeDot}>
        <CheckIcon size={10} />
      </span>
      {label}
    </span>
  );
}

export function NextPill() {
  return <span className={styles.nextPill}>Next step</span>;
}

export function Spinner({ light = false }: { light?: boolean }) {
  return <span aria-hidden="true" className={light ? styles.spinnerLight : styles.spinner} />;
}

/** "Used in the last 24 hours: X of 100 XLM" with a bar. */
export function UsageMeter({
  usedStroops,
  limitStroops,
  note,
  compact = false,
}: {
  usedStroops: bigint;
  limitStroops: bigint;
  note?: ReactNode;
  compact?: boolean;
}) {
  const percent = limitStroops > BigInt(0) ? Math.min(100, (Number(usedStroops) / Number(limitStroops)) * 100) : 0;
  return (
    <div className={compact ? `${styles.usage} ${styles.usageCompact}` : styles.usage}>
      <div className={styles.usageHeader}>
        <span className={styles.usageLabel}>{compact ? "Used in 24h" : "Used in the last 24 hours"}</span>
        <span>
          <b>{formatXlm(usedStroops)}</b> of {formatXlm(limitStroops)} XLM
        </span>
      </div>
      <div
        aria-label={`${formatXlm(usedStroops)} of ${formatXlm(limitStroops)} XLM used in the last 24 hours`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(percent)}
        className={styles.usageTrack}
        role="progressbar"
      >
        <div className={styles.usageFill} style={{ width: `${percent}%` }} />
      </div>
      {note ? <span className={styles.usageNote}>{note}</span> : null}
    </div>
  );
}

/** One-line summary a finished chapter collapses into on mobile. */
export function SummaryRow({ label, title, detail }: { label: string; title: string; detail: string }) {
  return (
    <div className={styles.summaryRow}>
      <span className={styles.summaryCheck}>
        <CheckIcon size={15} />
      </span>
      <span className={styles.summaryText}>
        <span className={styles.summaryLabel}>{label}</span>
        <span className={styles.summaryTitle}>{title}</span>
        <span className={styles.summaryDetail}>{detail}</span>
      </span>
    </div>
  );
}

/** Red-wash alert used by every chapter error. Copy must say what did not happen. */
export function InlineAlert({ children }: { children: ReactNode }) {
  return (
    <p className={styles.inlineAlert} role="alert">
      {children}
    </p>
  );
}
