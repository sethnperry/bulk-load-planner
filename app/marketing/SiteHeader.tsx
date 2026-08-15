"use client";
// app/marketing/SiteHeader.tsx
// Shared header for the marketing site (/, /pricing, /get-the-app, and
// eventually /about) -- pulled out of app/page.tsx so the nav, logo, and
// "Get the App" CTA stay in sync everywhere instead of three copies
// drifting apart. Same light theme/typography as the landing page (white
// bg, Outfit font, black wordmark) -- see app/page.tsx's own header
// comment for why this site is light, not the app's dark #111111 theme.

import Link from "next/link";

const LOGO_PATH =
  "m -50.568768,-33.479618 c -0.379508,0 -0.747403,0.04834 -1.09766,0.139414 -0.241358,0.06276 -0.287389,0.279561 -0.110962,0.455988 l 2.762871,2.762871 a 1.1791924,1.1791924 22.5 0 0 0.833814,0.345377 h 4.240473 3.803385 4.844666 c 0.320197,0 0.577742,0.257545 0.577742,0.577742 0,0.320197 -0.257545,0.578259 -0.577742,0.578259 h -4.844666 -3.259536 a 0.54384869,0.54384869 135 0 0 -0.543849,0.543849 v 3.02906 0.19637 10.722212 a 0.21369808,0.21369808 22.501943 0 0 0.364795,0.151117 l 3.05794,-3.057525 a 1.2994077,1.2994077 112.50194 0 0 0.38065,-0.918882 v -3.289907 -3.607015 h 4.877222 c 2.390258,0 4.314982,-1.924207 4.314982,-4.314465 0,-2.390258 -1.924724,-4.314465 -4.314982,-4.314465 h -4.877222 -3.803385 z";

function PhoneIcon() {
  return (
    <svg width="11" height="15" viewBox="0 0 11 15" fill="none" aria-hidden="true">
      <rect x="0.75" y="0.75" width="9.5" height="13.5" rx="1.6" stroke="currentColor" strokeWidth="1.3" />
      <line x1="4" y1="12.2" x2="7" y2="12.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export type ActiveNav = "about" | "pricing" | "get-the-app" | undefined;

export default function SiteHeader({ active }: { active?: ActiveNav }) {
  return (
    <header className="site-header">
      <div className="nav-row">
        <Link href="/" className="brand">
          <svg className="mark" width="40" height="36" viewBox="-53.56 -35.05 24.29 22.70" aria-hidden="true">
            <path d={LOGO_PATH} fill="#111111" />
          </svg>
          <span className="wordmark">PROTANKR</span>
        </Link>

        <nav className="nav-links">
          <Link href="/about" className={active === "about" ? "is-active" : undefined}>About</Link>
          <Link href="/pricing" className={active === "pricing" ? "is-active" : undefined}>Pricing</Link>
          <Link href="/login" className="nav-login">Login</Link>
          <Link href="/get-the-app" className="nav-cta">
            Get the App <PhoneIcon />
          </Link>
        </nav>
      </div>

      {/*
        Deliberately `jsx global`, not scoped `jsx` -- scoped styled-jsx
        requires a `jsx-<hash>` class to be attached to every styled
        element, and that attachment silently failed to happen under this
        project's dev setup (confirmed live: the generated CSS rules were
        present in a <style> tag, but the DOM elements only ever carried
        their plain className, with no matching hash class, so none of the
        rules could ever match -- nav rendered completely unstyled). Global
        mode sidesteps the hash-matching step entirely, which is also the
        exact pattern app/page.tsx's own original inline header already
        used successfully before this file existed. Class names below are
        deliberately specific (site-header, nav-cta, etc.) to avoid
        colliding with any other page's own global styles.
      */}
      <style jsx global>{`
        .site-header { padding: 28px 48px 0; }
        .site-header .nav-row { display: flex; align-items: center; gap: 16px; }
        .site-header .brand { display: flex; align-items: center; gap: 8px; flex-shrink: 0; text-decoration: none; }
        .site-header .wordmark { font: 800 15px var(--font-outfit), sans-serif; letter-spacing: 0.04em; color: #111; }
        .site-header .nav-links { display: flex; align-items: center; gap: 26px; flex-shrink: 0; margin-left: auto; }
        .site-header .nav-links a {
          font: 600 14px var(--font-outfit), sans-serif;
          color: #111;
          text-decoration: none;
        }
        .site-header .nav-links a:hover { opacity: 0.6; }
        .site-header .nav-links a.is-active { opacity: 0.45; }
        .site-header .nav-login { opacity: 0.65; }
        .site-header .nav-cta {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: #111;
          color: #fff !important;
          padding: 9px 16px;
          border-radius: 999px;
        }
        .site-header .nav-cta:hover { opacity: 0.85 !important; }

        @media (max-width: 980px) {
          .site-header { padding: 20px 24px 0; }
          .site-header .nav-row { flex-wrap: wrap; row-gap: 12px; }
          .site-header .nav-links { gap: 18px; flex-wrap: wrap; }
          .site-header .nav-links a { font-size: 14px; }
        }
      `}</style>
    </header>
  );
}
