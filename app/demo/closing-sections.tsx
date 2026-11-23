import styles from "./demo.module.css";

const SECTIONS = [
  {
    id: "how",
    label: "05 · HOW IT WORKS",
    accent: "Your account. Your say.",
    title: "What happened when you approved.",
  },
  {
    id: "journey",
    label: "06 · YOUR JOURNEY",
    accent: "Look how far you’ve come",
    title: "You just used a Smart Account.",
  },
  {
    id: "why",
    label: "07 · WHY SMART ACCOUNTS",
    accent: "You just used two of these.",
    title: "An account that does more, so you don’t have to.",
  },
] as const;

/** Focus target for "See what happened". */
export const FIRST_CLOSING_HEADING_ID = "closing-how-title";

/**
 * 05–07, revealed once chapter 04 is done. Placeholder bodies for now: the
 * content (three-step diagram, journey list, eight capability cards) is the
 * next pass.
 */
export function ClosingSections() {
  return (
    <>
      {SECTIONS.map((section) => (
        <section aria-labelledby={`closing-${section.id}-title`} className={styles.closing} id={`closing-${section.id}`} key={section.id}>
          <p className={styles.chapterLabel}>{section.label}</p>
          <p className={styles.accent}>{section.accent}</p>
          <h2 className={styles.chapterTitle} id={`closing-${section.id}-title`} tabIndex={-1}>
            {section.title}
          </h2>
          <div className={styles.closingPlaceholder}>Content for this section comes in the next pass.</div>
        </section>
      ))}
    </>
  );
}
