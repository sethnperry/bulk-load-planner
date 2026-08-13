"use client";
// app/about/[slug]/page.tsx
// Deep-dive page for one topic from lib/content/learnTopics.tsx. Renders
// the exact same `blocks` content app/learn/page.tsx shows in its
// accordion for this topic -- just laid out as a full light-themed page
// with the marketing intro on top, instead of a dark in-app accordion.

import { useParams, notFound } from "next/navigation";
import Link from "next/link";
import SiteHeader from "../../marketing/SiteHeader";
import { getLearnTopic, type LearnBlock } from "@/lib/content/learnTopics";

function Section({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="lt-section">
      <div className="lt-section-title">{emoji}&nbsp;&nbsp;{title}</div>
      <div className="lt-section-body">{children}</div>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="lt-divider">
      <div className="lt-divider-line" />
      <div className="lt-divider-label">{label}</div>
      <div className="lt-divider-line" />
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return <div className="lt-callout">{children}</div>;
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

export default function AboutTopicPage() {
  const params = useParams<{ slug: string }>();
  const topic = getLearnTopic(params.slug);

  if (!topic) {
    notFound();
    return null;
  }

  return (
    <div className="page">
      <SiteHeader active="about" />

      <section className="hero">
        <Link href="/about" className="back-link">&larr; How ProTankr Works</Link>
        <div className="hero-emoji">{topic.emoji}</div>
        <h1 className="hero-h1">{topic.title}</h1>
        <div className="hero-marketing">{topic.marketing}</div>
      </section>

      <section className="detail-section">
        <div className="detail-card">
          {topic.blocks.map(renderBlock)}
        </div>

        <Link href="/get-the-app" className="cta-link">
          Request Early Access <span>&rarr;</span>
        </Link>
      </section>

      <style jsx global>{`
        .page {
          --ink: #0d0d0c;
          --font: var(--font-outfit), "Outfit", Helvetica, Arial, sans-serif;
          min-height: 100dvh;
          background: #ffffff;
          color: var(--ink);
          font-family: var(--font);
          overflow-x: hidden;
        }

        .hero { padding: 40px 48px 0; max-width: 680px; }
        .back-link {
          display: inline-block;
          font: 700 13px var(--font);
          color: rgba(0,0,0,0.45);
          text-decoration: none;
          margin-bottom: 18px;
        }
        .back-link:hover { color: rgba(0,0,0,0.75); }
        .hero-emoji { font-size: 34px; line-height: 1; }
        .hero-h1 { margin: 12px 0 0; font: 900 40px var(--font); letter-spacing: -0.02em; color: #111; }
        .hero-marketing { margin-top: 16px; font: 400 16px var(--font); color: rgba(0,0,0,0.62); line-height: 1.6; }
        .hero-marketing p { margin: 0 0 12px; }
        .hero-marketing p:last-child { margin-bottom: 0; }

        .detail-section { padding: 36px 48px 100px; max-width: 680px; margin: 0 auto; }
        .detail-card {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 8px 0 0;
        }

        .lt-section {
          padding: 18px 20px;
          border-radius: 14px;
          border: 1px solid rgba(0,0,0,0.08);
          background: #f6f6f5;
        }
        .lt-section-title { font: 800 14px var(--font); color: #111; margin-bottom: 8px; }
        .lt-section-body { font: 400 14px var(--font); color: rgba(0,0,0,0.62); line-height: 1.65; }
        .lt-em { color: #111; }

        .lt-divider { display: flex; align-items: center; gap: 10px; margin: 6px 0; }
        .lt-divider-line { flex: 1; height: 1px; background: rgba(0,0,0,0.1); }
        .lt-divider-label {
          font: 800 10px var(--font);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.35);
          white-space: nowrap;
        }

        .lt-callout {
          font: 500 14px var(--font);
          line-height: 1.65;
          color: #92400e;
          background: rgba(251,146,60,0.08);
          border: 1px solid rgba(251,146,60,0.28);
          border-left: 3px solid #f97316;
          border-radius: 0 12px 12px 0;
          padding: 14px 18px;
        }
        .lt-callout strong { color: #c2410c; }

        .cta-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 28px;
          padding: 13px 22px;
          border-radius: 999px;
          background: #111;
          color: #fff;
          font: 700 14px var(--font);
          text-decoration: none;
        }
        .cta-link:hover { opacity: 0.85; }

        @media (max-width: 760px) {
          .hero { padding: 28px 24px 0; }
          .hero-h1 { font-size: 32px; }
          .detail-section { padding: 28px 24px 64px; }
        }
      `}</style>
    </div>
  );
}
