"use client";
// app/learn/page.tsx

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { LEARN_TOPICS, type LearnBlock } from "@/lib/content/learnTopics";

function Section({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.80)", marginBottom: 6 }}>
        {emoji}&nbsp;&nbsp;{title}
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", lineHeight: 1.65 }}>{children}</div>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.25)" }}>{label}</div>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.65, color: "#fdba74", background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.22)", borderLeft: "3px solid #fb923c", borderRadius: "0 10px 10px 0", padding: "10px 14px" }} className="lt-callout">
      {children}
    </div>
  );
}

function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" as const }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{title}</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms" }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column" as const, gap: 10 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function renderBlock(block: LearnBlock, i: number) {
  if (block.type === "divider") return <Divider key={i} label={block.label} />;
  if (block.type === "callout") return <Callout key={i}>{block.body}</Callout>;
  return (
    <Section key={i} emoji={block.emoji} title={block.title}>
      {block.body}
    </Section>
  );
}

export default function LearnPage() {
  const router = useRouter();

  return (
    <div style={{ minHeight: "100dvh", background: "#111111", color: "rgba(255,255,255,0.85)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* Shared content (lib/content/learnTopics.tsx) marks emphasis with a
          bare <strong className="lt-em">, colored here for this page's dark
          background -- app/about/[slug]/page.tsx defines its own .lt-em
          rule for its light background instead. */}
      <style>{`.lt-em { color: rgba(255,255,255,0.70); }`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.55)", fontSize: 20, lineHeight: 1, padding: "4px 8px 4px 0" }}
        >
          ‹
        </button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.2 }}>Learn</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>How ProTankr works</div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "20px 18px", display: "flex", flexDirection: "column" as const, gap: 12, maxWidth: 600, margin: "0 auto" }}>

        {/* ── Guided Tours ── */}
        <Accordion title="▶ Guided tours">
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", lineHeight: 1.65, padding: "4px 0 8px" }}>
            These tours run on the planner page and walk you through each step interactively. A pulsing ring will highlight what to tap next.
          </div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
            {[
              { id: "setup", label: "First-time setup", desc: "Select equipment, set compartment caps, save a plan slot" },
            ].map(t => (
              <a
                key={t.id}
                href={`/planner?tour=${t.id}`}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(103,232,249,0.20)", background: "rgba(103,232,249,0.05)", textDecoration: "none", cursor: "pointer" }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.88)", marginBottom: 2 }}>{t.label}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.40)" }}>{t.desc}</div>
                </div>
                <span style={{ fontSize: 18, color: "rgba(103,232,249,0.70)", flexShrink: 0, marginLeft: 12 }}>›</span>
              </a>
            ))}
          </div>
        </Accordion>

        {/* ── Shared topics (also power app/about) ── */}
        {LEARN_TOPICS.map((topic) => (
          <Accordion key={topic.slug} title={`${topic.emoji} ${topic.title}`}>
            {topic.blocks.map(renderBlock)}
          </Accordion>
        ))}

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}
