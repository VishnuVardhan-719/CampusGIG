"use client";
import { useEffect, useRef } from "react";

/**
 * Scroll entrance wrapper. Children are rendered at their final values from the first
 * paint; this only flips a DOM attribute on first intersection so CSS can play the
 * entrance. Nothing here holds page state, and the hidden state is opt-in:
 * `.motion-ready` is added after mount (so a no-JS or failed-hydration render stays
 * fully visible) and globals.css applies the offset only under
 * `prefers-reduced-motion: no-preference`.
 */
export default function Reveal({ children, delayMs = 0, className = "" }: {
  children: React.ReactNode;
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.classList.add("motion-ready");
    if (typeof IntersectionObserver === "undefined") {
      node.dataset.revealed = "true";
      return;
    }
    // threshold 0 and a small negative bottom margin: a row reveals as soon as any part of
    // it is 32px inside the viewport, so a row can never be left invisible at the fold.
    const observer = new IntersectionObserver((entries) => {
      const reached = entries.some((entry) => entry.isIntersecting || entry.boundingClientRect.bottom < 0);
      if (!reached) return;
      node.dataset.revealed = "true";
      observer.disconnect();
    }, { threshold: 0, rootMargin: "0px 0px -32px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className ? `reveal ${className}` : "reveal"}
      style={{ "--reveal-delay": `${delayMs}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
