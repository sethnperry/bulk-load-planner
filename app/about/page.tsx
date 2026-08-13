"use client";
// app/about/page.tsx
// Card grid over lib/content/learnTopics.tsx's shared topics -- each card
// shows the marketing "why this matters" pitch; tapping it goes to
// app/about/[slug]/page.tsx for the full technical breakdown, which is the
// SAME detailed content app/learn/page.tsx shows in-app (shared source,
// see that file's own header comment).

import Link from "next/link";
import SiteHeader from "../marketing/SiteHeader";
import { LEARN_TOPICS } from "@/lib/content/learnTopics";

export default function AboutPage() {
  return (
    <div className="page">
      <SiteHeader active="about" />

      <section className="hero">
        <h1 className="hero-h1">How ProTankr Works</h1>
        <p className="hero-sub">
          Every fuel transport driver has loaded conservatively at some
          point — guessing low because the alternative was finding out the
          hard way, at the scale. Here's exactly what ProTankr does about
          each part of that problem.
        </p>
      </section>

      <section className="grid-section">
        <div className="topic-grid">
          {LEARN_TOPICS.map((topic) => (
            <Link key={topic.slug} href={`/about/${topic.slug}`} className="topic-card">
              <div className="topic-emoji">{topic.emoji}</div>
              <div className="topic-name">{topic.shortName}</div>
              <div className="topic-tagline">{topic.tagline}</div>
              <div className="topic-marketing">{topic.marketing}</div>
              <div className="topic-more">Learn more <span>&rarr;</span></div>
            </Link>
          ))}
        </div>
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
        .hero-h1 { margin: 0; font: 900 52px var(--font); letter-spacing: -0.02em; color: #111; }
        .hero-sub { margin: 14px 0 0; font: 400 16px var(--font); color: rgba(0,0,0,0.6); line-height: 1.55; }

        .grid-section { padding: 44px 48px 100px; }
        .topic-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 20px;
          max-width: 940px;
          margin: 0 auto;
        }

        .topic-card {
          display: block;
          text-decoration: none;
          color: inherit;
          border-radius: 20px;
          background: #f6f6f5;
          border: 1px solid rgba(0,0,0,0.08);
          padding: 28px;
          transition: border-color 150ms ease, background 150ms ease;
        }
        .topic-card:hover { background: #f0f0ee; border-color: rgba(0,0,0,0.14); }

        .topic-emoji { font-size: 28px; line-height: 1; }
        .topic-name { margin-top: 14px; font: 800 20px var(--font); }
        .topic-tagline { margin-top: 4px; font: 600 13px var(--font); color: rgba(0,0,0,0.45); }

        .topic-marketing { margin-top: 14px; font: 400 14px var(--font); color: rgba(0,0,0,0.62); line-height: 1.6; }
        .topic-marketing p { margin: 0 0 10px; }
        .topic-marketing p:last-child { margin-bottom: 0; }

        .topic-more {
          margin-top: 18px;
          font: 700 13px var(--font);
          color: #111;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .topic-more span { transition: transform 150ms ease; }
        .topic-card:hover .topic-more span { transform: translateX(3px); }

        @media (max-width: 760px) {
          .hero { padding: 28px 24px 0; }
          .hero-h1 { font-size: 38px; }
          .grid-section { padding: 32px 24px 64px; }
          .topic-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
