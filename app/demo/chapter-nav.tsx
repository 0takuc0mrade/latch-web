import { useEffect, useState } from "react";
import { CheckIcon } from "./icons";
import styles from "./demo.module.css";

/** latch's chapters (components/demo/Demo.tsx), in order. Ids are the section ids. */
export const CHAPTERS = [
  ["create", "Create"],
  ["fund", "Fund"],
  ["send", "Try it"],
  ["control", "Control"],
  ["finish", "Your journey"],
] as const;

export type ChapterKey = (typeof CHAPTERS)[number][0];

/**
 * "Your journey" nav: numbers, a check once a chapter is complete, and the
 * chapter in view. Only chapters already on the page are listed; the list
 * grows as they appear.
 */
export function ChapterNav({ completed, shown }: { completed: Record<ChapterKey, boolean>; shown: Record<ChapterKey, boolean> }) {
  const visible = CHAPTERS.filter(([id]) => shown[id]);
  const visibleKey = visible.map(([id]) => id).join(",");
  const [current, setCurrent] = useState<ChapterKey>("create");

  useEffect(() => {
    // Same observer as latch: a chapter is current once its top passes under the sticky bars.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setCurrent(entry.target.id as ChapterKey);
      },
      { rootMargin: "-170px 0px -55% 0px", threshold: 0 },
    );
    for (const id of visibleKey.split(",")) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [visibleKey]);

  return (
    <nav aria-label="Your journey" className={styles.chapterNav}>
      <ol>
        {visible.map(([id, label], index) => (
          <li key={id}>
            <a aria-current={current === id ? "step" : undefined} href={`#${id}`}>
              <span className={styles.chapterNavMark} data-done={completed[id] || undefined}>
                {completed[id] ? <CheckIcon size={12} /> : `0${index + 1}`}
              </span>
              <span className={styles.chapterNavLabel}>{label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
