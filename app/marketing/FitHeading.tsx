"use client";
// app/marketing/FitHeading.tsx
// Renders a heading that always stays on one line, shrinking its own font
// size to fit the available width instead of wrapping -- used for
// app/about/page.tsx's "How ProTankr Works" H1 and app/about/[slug]/page.tsx's
// per-topic H1 (topic.title varies a lot in length, from "Understanding
// over/under" to "How the self-correcting network works", so a single
// hand-tuned clamp() couldn't fit all of them; this measures actual
// rendered width instead of guessing from viewport width).
//
// SSR renders at maxSize (matches every other "client-only measurement"
// pattern already used in this app, e.g. useNow()'s hydration-safe clock --
// start at the server-safe default, correct it client-side after mount).

import { useLayoutEffect, useRef, useState } from "react";

export default function FitHeading({
  children,
  as: Tag = "h1",
  maxSize,
  minSize = 15,
  className,
  style,
}: {
  children: React.ReactNode;
  as?: "h1" | "h2";
  maxSize: number;
  minSize?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [fontSize, setFontSize] = useState(maxSize);

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    function fit() {
      const el2 = ref.current;
      const parent2 = el2?.parentElement;
      if (!el2 || !parent2) return;
      let size = maxSize;
      el2.style.fontSize = `${size}px`;
      // clientWidth includes the parent's own padding, which isn't
      // available space for this child's content -- subtract it, or a
      // padded parent (e.g. .hero) reports room that doesn't actually exist.
      const parentStyle = getComputedStyle(parent2);
      const available =
        parent2.clientWidth - parseFloat(parentStyle.paddingLeft) - parseFloat(parentStyle.paddingRight);
      while (el2.scrollWidth > available && size > minSize) {
        size -= 1;
        el2.style.fontSize = `${size}px`;
      }
      setFontSize(size);
    }

    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children, maxSize, minSize]);

  return (
    <Tag
      ref={ref}
      className={className}
      style={{ ...style, fontSize, whiteSpace: "nowrap" }}
    >
      {children}
    </Tag>
  );
}
