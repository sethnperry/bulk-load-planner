"use client";
// app/page.tsx — protankr.com marketing landing page.
// Unauthenticated and authenticated visitors both see this; the CTA links
// straight to /planner, which already client-side-redirects to /login if
// there's no session (see CalculatorShellContext.tsx) -- no separate auth
// check needed here.
//
// Light marketing theme (white body, black header) per the 2026-08-08
// mockup pass -- deliberately different from the app's own dark-only
// theme. The phone mockup's own screen content stays dark to match the
// real (dark-only, no light mode) product; only the page chrome around it
// is light.

import Link from "next/link";

type CardSpec = {
  eyebrow: string;
  title: string;
  body: string;
  tone: "light" | "dark";
  pos: React.CSSProperties;
};

const CARDS: CardSpec[] = [
  {
    eyebrow: "Preset E",
    title: "Custom load plans on tap",
    body: "Set it once for the way you load. Whether it's a single product or a split load. One compartment or five. The plan adapts to you.",
    tone: "light",
    pos: { left: 0, top: 14 },
  },
  {
    eyebrow: "Compartment 2",
    title: "Cap on the fly",
    body: "Not enough room to deliver a full compartment. Slide the handle down to dial it in while the others compensate.",
    tone: "dark",
    pos: { right: 0, top: 100 },
  },
  {
    eyebrow: "Equipment",
    title: "Slip seat with ease",
    body: "Drivers share visibility of primary equipment as well as spares to keep track of equipment needs like service history.",
    tone: "dark",
    pos: { left: 6, top: 292 },
  },
  {
    eyebrow: "Tare weights",
    title: "Swap Equipment",
    body: "This truck with that trailer? Doesn't matter — we track the tare weight for each combination, a quick tap to switch it up.",
    tone: "dark",
    pos: { right: 8, top: 300 },
  },
  {
    eyebrow: "Product temperature",
    title: "Density math made easy",
    body: "Load dynamically for product density changes. Let the model predict the temp, or manually override with a known temp for precision.",
    tone: "light",
    pos: { left: 22, top: 566 },
  },
  {
    eyebrow: "Access cards",
    title: "Renewal tracking",
    body: "Access cards refresh automatically every load, helping you avoid a last-minute lapse before it costs you the run.",
    tone: "light",
    pos: { right: 12, top: 574 },
  },
];

const TAB_BAR = ["Dispatch", "Terminal", "Planner", "Cards", "Vault"];

export default function Home() {
  return (
    <div className="page">
      <header className="nav">
        <div className="brand">
          <svg className="mark" width="26" height="24" viewBox="-53.56 -35.05 24.29 22.70" aria-hidden="true">
            <path
              d="m -50.568768,-33.479618 c -0.379508,0 -0.747403,0.04834 -1.09766,0.139414 -0.241358,0.06276 -0.287389,0.279561 -0.110962,0.455988 l 2.762871,2.762871 a 1.1791924,1.1791924 22.5 0 0 0.833814,0.345377 h 4.240473 3.803385 4.844666 c 0.320197,0 0.577742,0.257545 0.577742,0.577742 0,0.320197 -0.257545,0.578259 -0.577742,0.578259 h -4.844666 -3.259536 a 0.54384869,0.54384869 135 0 0 -0.543849,0.543849 v 3.02906 0.19637 10.722212 a 0.21369808,0.21369808 22.501943 0 0 0.364795,0.151117 l 3.05794,-3.057525 a 1.2994077,1.2994077 112.50194 0 0 0.38065,-0.918882 v -3.289907 -3.607015 h 4.877222 c 2.390258,0 4.314982,-1.924207 4.314982,-4.314465 0,-2.390258 -1.924724,-4.314465 -4.314982,-4.314465 h -4.877222 -3.803385 z"
              fill="#ffffff"
            />
          </svg>
          <span className="wordmark">PROTANKR</span>
        </div>
        <nav className="nav-links">
          <Link href="/about">About</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/planner" className="nav-cta">Get the App</Link>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-text">
            <h1>Built for Bulk.</h1>
            <p className="hero-sub">Fuel Hauling, Precision Loading.</p>
          </div>

          <div className="stage">
            <p className="stage-label stage-label-easy">It&apos;s Easy.</p>
            <p className="stage-label stage-label-quick">It&apos;s Quick.</p>
            <p className="stage-label stage-label-accurate">It&apos;s Accurate.</p>

            <div className="phone">
              <div className="notch" />
              <div className="screen">
                <div className="screen-top">
                  <span className="icon-hamburger"><span /><span /><span /></span>
                  <div className="screen-top-right">
                    <span className="icon-bell">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 01-3.46 0" />
                      </svg>
                      <span className="badge">2</span>
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 005 15a1.65 1.65 0 00-1.51-1H3.4a2 2 0 010-4h.09A1.65 1.65 0 005 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09c0 .68.39 1.3 1 1.51.6.25 1.3.12 1.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019 9c.25.6.83 1 1.51 1H21a2 2 0 010 4h-.09c-.68 0-1.26.4-1.51 1z" />
                    </svg>
                  </div>
                </div>

                <div className="screen-tabs">
                  <span>Terminal</span>
                  <span className="screen-tab-active">Planner</span>
                  <span>Cards</span>
                </div>

                <div className="screen-presets">
                  <span>C</span>
                  <span className="preset-active">
                    E
                    <i />
                  </span>
                  <span>D</span>
                </div>

                <div className="screen-comps">
                  <div className="comp-col">
                    <span className="comp-num">3</span>
                    <div className="comp-track">
                      <div className="comp-fill" style={{ height: "62%", background: "#f2ede2" }} />
                    </div>
                    <span className="comp-code" style={{ color: "#f2ede2" }}>87</span>
                    <span className="comp-gal">2,585</span>
                  </div>
                  <div className="comp-col">
                    <span className="comp-num">2</span>
                    <div className="comp-track">
                      <div className="comp-cap-dim" style={{ height: "56%" }} />
                      <div className="comp-handle" style={{ top: "44%" }} />
                      <div className="comp-fill" style={{ height: "24%", background: "#d9483d" }} />
                    </div>
                    <span className="comp-code" style={{ color: "#d9483d" }}>93</span>
                    <span className="comp-gal">1,000</span>
                  </div>
                  <div className="comp-col">
                    <span className="comp-num">1</span>
                    <div className="comp-track">
                      <div className="comp-fill" style={{ height: "78%", background: "#eab54a" }} />
                    </div>
                    <span className="comp-code" style={{ color: "#eab54a" }}>D2</span>
                    <span className="comp-gal">4,250</span>
                  </div>
                </div>

                <div className="screen-cg">
                  <span>Rear</span>
                  <div className="cg-track"><div className="cg-dot" /></div>
                  <span>Front</span>
                </div>

                <div className="screen-row">
                  <div>
                    <p className="row-main">Truck · 25184&nbsp;&nbsp;&nbsp;Trailer · 3151</p>
                    <p className="row-sub">Freightliner&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Mac</p>
                  </div>
                  <span className="chev">›</span>
                </div>
                <div className="screen-row">
                  <div>
                    <p className="row-main">Tampa, FL&nbsp;&nbsp;&nbsp;Buckey North</p>
                    <p className="row-sub">Card # 00095&nbsp;&nbsp;&nbsp;Exp. 271 days</p>
                  </div>
                  <span className="chev">›</span>
                </div>
                <div className="screen-row">
                  <div>
                    <p className="row-main">86°F predicted product temp</p>
                    <p className="row-sub row-sub-good">High confidence</p>
                  </div>
                  <span className="chev">›</span>
                </div>

                <div className="screen-reload">RELOAD</div>

                <div className="screen-totals">
                  <div>
                    <p className="total-main">7,835 gal</p>
                  </div>
                  <div className="total-right">
                    <p className="total-main">79,458 lbs</p>
                    <p className="total-sub">Target 79,500 lbs&nbsp;&nbsp;Diff -42 lbs</p>
                  </div>
                </div>

                <p className="screen-foot">
                  Real API &amp; temp confirm automatically after this load — sharpens the number for the next driver…
                </p>
              </div>
            </div>

            {CARDS.map((c, i) => (
              <div
                className={`card card-${c.tone}`}
                key={i}
                style={{ ...c.pos, animationDelay: `${0.05 + i * 0.07}s` }}
              >
                <p className="eyebrow">
                  {c.eyebrow}
                  <span className="dot" />
                </p>
                <p className="title">{c.title}</p>
                <p className="body">{c.body}</p>
              </div>
            ))}

            <svg className="truck-mark" width="170" height="331" viewBox="510.14 63.00 80.25 155.95" aria-hidden="true">
              <g fill="#111111" stroke="none">
                <path d="m 585.7423,123.82603 -1.27486,3.3414 -1.93476,-3.25355 h -2.59467 l 1.56889,3.31866 v 5.2e-4 l 1.46555,3.10007 3.12177,0.0439 0.87953,-2.24172 0.26303,0.53537 v -1.43816 -0.0868 l -0.10852,-0.0589 -0.28628,0.14572 -0.83303,0.42375 0.0785,-0.42375 0.15038,-0.81132 -0.8878,-0.88831 1.2454,-0.16433 0.57051,-1.1188 0.0708,0.14831 v -0.57206 z" />
                <path d="m 582.26551,134.81916 a 1.2001973,1.2001973 0 0 0 -1.20044,1.20044 v 38.7563 0.96169 1.74098 h 3.48247 2.86908 v -1.74098 h -2.86908 v -0.9772 -36.54505 a 0.66002358,0.66002358 0 0 1 0.65991,-0.65991 h 2.20917 v -2.73627 z" />
                <path d="m 545.86825,68.777714 v 31.995466 l 5.4653,-0.007 a 0.41277464,0.41277464 0 0 1 0.41341,0.416 l -0.002,0.22117 a 0.40710665,0.40710665 0 0 1 -0.41909,0.40411 l -5.45755,-0.16588 v 18.98747 c 1.43745,-0.88111 3.62281,-0.752 3.99304,-1.00562 0.45567,-0.31215 1.51812,-10.31018 1.72392,-12.50725 h -0.40462 l 0.75912,-4.50463 0.38138,-2.26343 1.49758,-8.885762 H 555.445 V 68.777714 Z" />
                <path d="m 553.81867,91.462118 -1.49758,8.885762 -0.38138,2.26343 -0.75912,4.50463 h 0.40462 0.33177 1.26349 0.22324 1.67276 32.16031 V 91.462118 h -31.79185 z" />
                <path d="m 551.33355,100.76594 -5.4653,0.007 h -0.0434 l -1.21543,0.009 a 4.8476014,4.8476014 0 0 0 -2.59777,0.77773 l -3.45405,2.23449 a 2.3086469,2.3086469 0 0 0 -1.03302,1.62471 l -0.10335,0.75499 c 0.0261,-0.009 0.0535,-0.0173 0.0827,-0.0227 0.17634,-0.0331 0.6029,-0.0943 1.13895,-0.15554 l 0.0129,-0.16847 a 1.8947166,1.8947166 0 0 1 0.85059,-1.44125 l 3.3197,-2.17558 a 3.478107,3.478107 0 0 1 1.90789,-0.56948 l 1.1343,5.2e-4 5.45755,0.16588 a 0.40710665,0.40710665 0 0 0 0.41909,-0.40411 l 0.002,-0.22117 a 0.41277464,0.41277464 0 0 0 -0.41341,-0.416 z" />
                <path d="m 587.23678,124.39809 -0.0708,-0.14831 -0.57051,1.1188 -1.2454,0.16433 0.8878,0.88831 -0.15038,0.81132 -0.0785,0.42375 0.83303,-0.42375 0.28628,-0.14572 0.10852,0.0589 z" />
                <path d="m 553.18047,107.11594 c -0.44881,2.74876 -1.71305,10.875 -1.09399,11.59723 0.20305,0.2369 0.49813,0.3125 1.002,0.29972 0.38452,-0.01 0.89072,-0.0709 1.56993,-0.15141 1.70159,-0.20166 4.49045,-0.52411 9.18135,-0.4594 4.32756,0.0597 8.95612,-0.0381 12.59975,-0.15607 v -5.1e-4 c 3.94829,-0.1278 6.74016,-0.27906 6.74016,-0.27906 l 3.75377,0.0439 h 0.014 c 0.0964,-0.002 0.19292,-0.005 0.28938,-0.007 v -10.88771 h -32.16031 -1.67276 z" />
                <path d="m 539.02216,122.57856 c -0.36448,-0.0389 -0.68705,-0.0882 -0.96067,-0.1235 -0.0509,-0.007 -0.0976,-0.0188 -0.14004,-0.0362 0.18775,0.68631 0.62981,1.69833 1.66605,2.51251 1.11222,0.8739 3.01078,2.07779 4.23746,2.83342 0.0338,-0.36037 0.0684,-0.71183 0.10336,-1.05265 -0.97902,-0.38188 -2.48722,-1.15786 -3.90571,-2.651 -0.46955,-0.49427 -0.78947,-0.99601 -1.00045,-1.4826 z" />
                <path d="m 587.08589,181.20961 h -39.96707 -32.84141 c 0,0 -1.11077,0.0873 -0.76998,-0.23151 0.1065,-0.0996 0.0929,-0.17903 0.0289,-0.1788 -0.1406,5e-4 -0.524,0.38569 -0.40307,1.78387 0.1759,2.03371 2.34197,30.59348 2.34197,30.59348 h 71.94135 v -30.24621 -1.72083 z" />
                <path d="m 537.584,120.70426 c 0.19873,-0.2109 0.95411,-0.33351 1.39682,-0.46767 0.51305,-0.15546 0.54415,-0.62219 0.54415,-0.62219 0,0 -0.41961,-9.63839 -0.41961,-10.66446 0,-0.93858 0.0131,-1.23981 -0.29404,-1.56993 0,0 0,0 0,0 -0.0286,-0.0308 -0.0601,-0.0617 -0.0946,-0.0935 -0.31691,-0.29253 -1.30306,-0.0311 -1.71411,0.0956 0,0 0,0 0,0 -0.11323,0.0349 -0.18242,0.0594 -0.18242,0.0594 0,0 0.71521,13.65009 0.71521,13.37025 0,-0.0384 0.017,-0.074 0.0486,-0.10749 z" />
                <path d="m 542.28656,106.13616 c -0.0475,0.002 -0.0974,0.007 -0.14986,0.0155 -1.17176,0.19041 -2.67435,0.42211 -3.32538,1.22835 0.30717,0.33012 0.29404,0.63135 0.29404,1.56993 0,1.02607 0.41961,10.66446 0.41961,10.66446 0,0 -0.0311,0.46673 -0.54415,0.62219 -0.44271,0.13416 -1.19809,0.25677 -1.39682,0.46767 -0.10115,0.60206 -0.16172,1.51034 0.33745,1.71462 0.0425,0.0174 0.0891,0.0296 0.14004,0.0362 0.27362,0.0353 0.59619,0.0846 0.96067,0.1235 0.91948,0.0981 2.10514,0.1288 3.44113,-0.3054 1.86558,-0.60631 1.50832,-1.02591 1.55494,-1.35238 0.0466,-0.32648 0,-3.2184 0,-3.2184 0,0 -0.0777,-0.23311 -0.3731,-0.0465 -0.29538,0.18656 -0.46664,-9.96529 -0.46664,-9.96529 0,0 0.13986,-1.20276 -0.5271,-1.49293 -0.10162,-0.0442 -0.2223,-0.0672 -0.36483,-0.0615 z" />
                <path d="m 541.25716,105.82093 c -0.81391,-0.003 -1.83123,0.0852 -2.61431,0.17467 -0.53605,0.0612 -0.96261,0.12248 -1.13895,0.15554 -0.0292,0.005 -0.0566,0.0133 -0.0827,0.0227 h -5.2e-4 c -0.41134,0.15 -0.44595,0.77823 -0.41806,1.2082 0.41105,-0.1267 1.3972,-0.38814 1.71411,-0.0956 0.0345,0.0318 0.0659,0.0628 0.0946,0.0935 0.65103,-0.80624 2.15362,-1.03794 3.32538,-1.22835 0.21,-0.0341 0.3792,-0.013 0.51469,0.046 0.0302,-0.2779 -0.58032,-0.37332 -1.39423,-0.37672 z" />
                <path d="m 563.00054,129.04742 c -0.29538,-0.0194 -0.62219,0.0196 -0.62219,0.0196 0,0 -0.47689,2.58618 -0.50591,5.00589 h -0.0847 v 38.43073 h 1.61696 v -38.43073 h -0.16227 c -0.002,-1.63219 0.02,-4.37048 0.19327,-4.69532 0.12438,-0.23319 -0.13973,-0.31078 -0.43511,-0.33021 z" />
                <path d="m 555.67415,129.48705 a 1.1018157,1.1018157 50.327234 0 1 0.96458,1.16296 l -0.14073,2.99541 0.0488,0.40809 a 30.294352,30.294352 88.798235 0 1 0.0663,3.16226 l 0.0741,34.72189 a 0.44053927,0.44053927 134.93885 0 1 -0.44054,0.44148 h -0.90905 a 0.26985272,0.26985272 44.578754 0 1 -0.26982,-0.26588 l -0.55185,-37.52728 -0.006,-0.33814 0.37148,-4.11062 a 0.71898315,0.71898315 140.63997 0 1 0.79267,-0.65017 z" />
                <path d="m 568.93281,129.2226 h 0.74 a 0.44770543,0.44770543 45 0 1 0.44771,0.44771 v 42.87068 a 0.33579979,0.33579979 135 0 1 -0.3358,0.3358 h -0.64673 a 0.50989136,0.50989136 45 0 1 -0.50989,-0.50989 l 0,-42.83959 a 0.30470682,0.30470682 135 0 1 0.30471,-0.30471 z" />
                <path d="m 575.15155,129.47117 h 0.95451 a 0.23319724,0.23319724 45 0 1 0.2332,0.2332 v 42.27678 a 0.39798572,0.39798572 135 0 1 -0.39799,0.39799 h -0.84572 a 0.24871157,0.24871157 45 0 1 -0.24871,-0.24871 v -42.35455 a 0.30470682,0.30470682 135 0 1 0.30471,-0.30471 z" />
                <path d="m 554.07653,173.49897 v 1.30741 0.18501 h 26.49141 v -0.21343 -1.27899 z" />
                <path d="m 534.93093,162.76991 a 2.1454144,2.1454144 0 0 0 -2.1456,2.14561 2.1454144,2.1454144 0 0 0 2.1456,2.14508 2.1454144,2.1454144 0 0 0 2.14561,-2.14508 2.1454144,2.1454144 0 0 0 -2.14561,-2.14561 z" />
                <path d="m 522.99471,160.44705 c 0.0683,0.32716 0.1606,0.70753 0.27389,1.02475 0.11325,0.317 0.24759,0.57131 0.39894,0.64699 0.46405,0.23203 15.53822,0.51807 20.18636,-1.00924 l -0.0377,-0.48318 z" />
                <path d="m 526.46427,162.76991 a 2.1454144,2.1454144 0 0 0 -2.14561,2.14561 2.1454144,2.1454144 0 0 0 2.14561,2.14508 2.1454144,2.1454144 0 0 0 2.1456,-2.14508 2.1454144,2.1454144 0 0 0 -2.1456,-2.14561 z" />
                <path d="m 522.17512,160.44034 c 0,0 -0.0137,0.0161 -0.0362,0.0393 -0.0617,0.0636 -0.19077,0.18185 -0.29352,0.17518 -0.009,-6.1e-4 -0.0186,-0.002 -0.0274,-0.005 -0.26005,1.60368 -0.74048,4.78742 -0.88419,7.23211 v 5.2e-4 c 0.0253,0.094 0.0458,0.24344 0.0599,0.45527 0.18656,2.79837 3.04716,1.80318 9.57668,1.74098 5.30355,-0.0505 6.75064,-0.55237 7.10706,-0.73898 0.0821,-0.043 0.10645,-0.0692 0.10645,-0.0692 0,0 3.29567,-1.99019 5.0369,-3.23391 0.435,-0.31072 0.7304,-0.60634 0.92863,-0.87437 0.0495,-0.0669 0.0932,-0.1325 0.13125,-0.19585 0.038,-0.0633 0.0708,-0.1251 0.0987,-0.18449 0.0279,-0.0594 0.0512,-0.11701 0.0703,-0.17208 0.0382,-0.11021 0.0602,-0.21198 0.0713,-0.30282 0.0221,-0.18164 8.4e-4,-0.32202 -0.0217,-0.40876 -0.0169,-0.065 -0.0346,-0.10026 -0.0346,-0.10026 l -0.21084,-2.6882 c -4.64814,1.52731 -19.72231,1.24127 -20.18636,1.00924 -0.15135,-0.0757 -0.28569,-0.32999 -0.39894,-0.64699 -0.11329,-0.31722 -0.20563,-0.69759 -0.27389,-1.02475 z m 4.28915,2.32957 a 2.1454144,2.1454144 0 0 1 2.1456,2.14561 2.1454144,2.1454144 0 0 1 -2.1456,2.14508 2.1454144,2.1454144 0 0 1 -2.14561,-2.14508 2.1454144,2.1454144 0 0 1 2.14561,-2.14561 z m 8.46666,0 a 2.1454144,2.1454144 0 0 1 2.14561,2.14561 2.1454144,2.1454144 0 0 1 -2.14561,2.14508 2.1454144,2.1454144 0 0 1 -2.1456,-2.14508 2.1454144,2.1454144 0 0 1 2.1456,-2.14561 z" />
                <path d="m 551.58521,107.11594 c -0.2058,2.19707 -1.26825,12.1951 -1.72392,12.50725 -0.37023,0.25362 -2.55559,0.12451 -3.99304,1.00562 -0.52594,0.32239 -0.95162,0.77956 -1.15187,1.44074 -0.49037,1.6191 -0.50806,4.03053 -0.51159,6.26784 -0.002,1.17334 4e-5,2.2985 -0.0605,3.23701 -0.12482,1.93594 -0.0503,5.8128 -0.33434,8.21035 -0.11624,0.98096 -0.2924,1.71431 -0.56689,1.96577 -0.94543,0.86605 -0.76959,0.88798 -4.66122,1.38596 -3.8916,0.49797 -8.33276,2.25157 -11.47682,6.06217 -3.14407,3.81059 -5.5408,7.38279 -5.49682,8.98498 0.044,1.60218 -2.08185,13.01588 -0.76946,15.95716 0.98521,0.40114 12.90246,0.58012 27.04383,0.64441 -0.26754,-2.15629 -0.48662,-9.46575 -0.59635,-17.56327 -1.20394,-2.05883 -2.53731,-5.73712 -2.53731,-5.73712 0,0 0.49731,-22.82208 0.80822,-26.80198 0.0325,-0.41574 0.14163,-0.77981 0.31109,-1.09864 1.30078,-2.44738 6.15456,-2.22387 7.15615,-2.15026 0.11706,0.009 0.18139,0.015 0.18139,0.015 l 22.66011,-0.48576 c -0.16263,-0.57243 -0.29258,-1.0667 -0.3607,-1.33067 0.19594,-0.0507 0.3839,-0.14785 0.89607,-0.54622 0.13521,-0.10516 0.30589,-0.19101 0.49713,-0.26096 0.9962,-0.36441 2.55023,-0.29869 2.55023,-0.29869 0,0 0.5597,2.14499 1.64796,2.17609 0.71054,0.0203 3.96594,0.0541 6.14019,0.0749 v -2.77399 c -0.0965,0.002 -0.19302,0.004 -0.28938,0.007 h -0.014 l -3.75377,-0.0439 c 0,0 -2.79187,0.15126 -6.74016,0.27906 v 5.1e-4 c -3.64363,0.11797 -8.27219,0.21577 -12.59975,0.15607 -4.6909,-0.0647 -7.47976,0.25774 -9.18135,0.4594 -0.67921,0.0805 -1.18541,0.14166 -1.56993,0.15141 -0.50387,0.0128 -0.79895,-0.0628 -1.002,-0.29972 -0.61906,-0.72223 0.64518,-8.84847 1.09399,-11.59723 h -1.26349 z m -29.41009,53.3244 0.81959,0.007 20.82147,0.17932 0.0377,0.48318 0.21084,2.6882 c 0,0 0.0177,0.0353 0.0346,0.10026 0.0225,0.0867 0.0438,0.22712 0.0217,0.40876 -0.0111,0.0908 -0.0331,0.19261 -0.0713,0.30282 -0.0191,0.0551 -0.0424,0.11268 -0.0703,0.17208 -0.0279,0.0594 -0.0607,0.12119 -0.0987,0.18449 -0.038,0.0633 -0.0817,0.12895 -0.13125,0.19585 -0.19823,0.26803 -0.49363,0.56365 -0.92863,0.87437 -1.74123,1.24372 -5.0369,3.23391 -5.0369,3.23391 0,0 -0.0244,0.0262 -0.10645,0.0692 -0.35642,0.18661 -1.80351,0.68848 -7.10706,0.73898 -6.52952,0.0622 -9.39012,1.05739 -9.57668,-1.74098 -0.0141,-0.21183 -0.0346,-0.36127 -0.0599,-0.45527 v -5.2e-4 c 0.14371,-2.44469 0.62414,-5.62843 0.88419,-7.23211 0.009,0.003 0.0184,0.005 0.0274,0.005 0.10275,0.007 0.23182,-0.11158 0.29352,-0.17518 0.0225,-0.0232 0.0362,-0.0393 0.0362,-0.0393 z" />
                <path d="m 576.8984,118.82531 c -0.19124,0.0699 -0.36192,0.1558 -0.49713,0.26096 -0.51217,0.39837 -0.70013,0.49548 -0.89607,0.54622 0.0681,0.26397 0.19807,0.75824 0.3607,1.33067 0.27258,0.95938 0.63688,2.13886 0.9555,2.8236 0.0746,0.16038 0.14661,0.29375 0.21446,0.39067 0.24907,0.35583 0.84372,1.53229 1.46347,2.80707 0.91199,1.87587 1.87844,3.96461 1.87844,3.96461 0,0 -0.43978,1.31898 2.46238,1.14309 1.08323,-0.0657 2.7425,-0.10703 4.39663,-0.13281 v -1.22732 c -2.09892,-0.023 -4.45529,-0.047 -5.09994,-0.047 -1.23121,0 -1.4952,-3.16574 -2.28668,-4.57285 -0.34438,-0.61222 -0.73875,-1.52414 -1.07436,-2.35903 -0.43575,-1.084 -0.77256,-2.03864 -0.77256,-2.03864 z" />
                <path d="m 578.7758,123.75317 c 0.33561,0.83489 0.72998,1.74681 1.07436,2.35903 0.79148,1.40711 1.05547,4.57285 2.28668,4.57285 0.64465,0 3.00102,0.0241 5.09994,0.047 v -2.06137 l -0.26303,-0.53537 -0.87953,2.24172 -3.12177,-0.0439 -1.46555,-3.10007 v -5.2e-4 l -1.56889,-3.31866 h 2.59467 l 1.93476,3.25355 1.27486,-3.3414 h 1.49448 v -3.04839 c -2.17425,-0.0209 -5.42965,-0.0546 -6.14019,-0.0749 -1.08826,-0.0311 -1.64796,-2.17609 -1.64796,-2.17609 0,0 -1.55403,-0.0657 -2.55023,0.29869 l 1.10484,2.88922 c 0,0 0.33681,0.95464 0.77256,2.03864 z" />
                <path d="m 576.8214,123.78676 c -5.33769,0.093 -19.19385,0.34141 -23.87244,0.49609 -0.28018,0.009 -0.52739,0.0183 -0.73794,0.0269 -4.60176,0.18656 -3.6692,2.42524 -4.53978,6.09421 -0.34778,1.46563 -0.47689,8.95474 -0.4594,17.41702 0.006,3.08592 0.0324,6.3011 0.0744,9.40098 0.10973,8.09752 0.32881,15.40698 0.59635,17.56327 0.0523,0.42122 0.10627,0.64593 0.16174,0.6413 0.74623,-0.0622 3.48248,-0.31109 3.48248,-0.31109 l -0.0145,-0.31626 -0.42065,-9.32243 c 0,0 -0.08,-8.91131 -0.1266,-17.53743 -0.0356,-6.59201 -0.0518,-13.01724 0.002,-15.1722 0.10686,-4.27397 0.67302,-4.87619 1.89498,-5.19762 0.20039,-0.0527 0.41818,-0.0978 0.65474,-0.15037 1.58735,-0.35273 22.68366,-0.42748 24.98245,-0.4346 -0.61975,-1.27478 -1.2144,-2.45124 -1.46347,-2.80707 -0.0678,-0.0969 -0.13983,-0.23029 -0.21446,-0.39067 z" />
                <path d="m 575.8659,120.96316 -22.66011,0.48576 c 0,0 -0.0643,-0.006 -0.18139,-0.015 -0.25039,-0.0184 -0.74132,-0.0462 -1.35754,-0.0393 -1.84864,0.0208 -4.82302,0.354 -5.79861,2.18953 -0.16946,0.31883 -0.27861,0.6829 -0.31109,1.09864 -0.31091,3.9799 -0.80822,26.80198 -0.80822,26.80198 0,0 1.33337,3.67829 2.53731,5.73712 -0.042,-3.09988 -0.068,-6.31506 -0.0744,-9.40098 -0.0175,-8.46228 0.11162,-15.95139 0.4594,-17.41702 0.87058,-3.66897 -0.062,-5.90765 4.53978,-6.09421 0.21055,-0.009 0.45776,-0.0176 0.73794,-0.0269 4.67859,-0.15468 18.53475,-0.40312 23.87244,-0.49609 -0.31862,-0.68474 -0.68292,-1.86422 -0.9555,-2.8236 z" />
                <path d="m 543.80998,139.78475 c 0.28409,-2.39755 0.20952,-6.27441 0.33434,-8.21035 0.0605,-0.93851 0.0586,-2.06367 0.0605,-3.23701 -0.41837,0.14675 -0.99692,0.62897 -1.25936,2.12855 -0.39763,2.27221 -0.17279,6.87952 0.86455,9.31881 z" />
              </g>
            </svg>
          </div>
        </section>

        <section className="manifesto">
          <p>
            Across the country, drivers load bulk petroleum products based on
            a guess of what they think will scale — under the worst
            conditions.
          </p>
          <p>
            When you see a fuel transport truck on the highway, it&apos;s
            likely empty, or only partially loaded.
          </p>
          <p>
            We give you the tools to stop underloading while virtually
            eliminating overweight tickets.
          </p>
          <p>
            The driver will know what they have on board before ever leaving
            the terminal — crowdsourcing API and density details back to
            sharpen the formula for the next driver.
          </p>
        </section>

        <div className="tabbar-wrap">
          <div className="tabbar">
            {TAB_BAR.map((t) => (
              <span key={t} className={t === "Planner" ? "tab-active" : undefined}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </main>

      <style jsx global>{`
        .page {
          --bg: #ffffff;
          --ink: #0d0d0c;
          --muted: #6e6d66;
          --line: #e6e4db;
          --card-light: #f2f0ea;
          --card-dark: #46453e;
          --font: var(--font-outfit), "Outfit", Helvetica, Arial, sans-serif;
          min-height: 100dvh;
          background: var(--bg);
          color: var(--ink);
          font-family: var(--font);
        }

        .nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #0a0a0a;
          padding: 20px 32px;
        }
        .brand { display: flex; align-items: center; gap: 10px; }
        .wordmark { color: #fff; font-weight: 800; font-size: 17px; letter-spacing: 0.02em; }
        .nav-links { display: flex; align-items: center; gap: 28px; }
        .nav-links :global(a) {
          color: #ffffff;
          text-decoration: none;
          font-weight: 600;
          font-size: 15px;
        }
        .nav-links :global(a:hover) { opacity: 0.75; }

        main { max-width: 1320px; margin: 0 auto; padding: 0 32px; }

        .hero { padding: 64px 0 0; }
        .hero-text { margin-bottom: 24px; }
        .hero h1 {
          font-size: 56px;
          font-weight: 800;
          letter-spacing: -0.015em;
          margin: 0 0 8px;
        }
        .hero-sub {
          font-style: italic;
          font-weight: 400;
          font-size: 22px;
          color: var(--muted);
          margin: 0;
        }

        .stage { position: relative; min-height: 1180px; padding: 20px 0 60px; }

        .stage-label {
          position: absolute;
          font-size: 34px;
          font-weight: 800;
          letter-spacing: -0.01em;
          margin: 0;
        }
        .stage-label-quick { right: 4px; top: 0; }
        .stage-label-easy { left: 20px; top: 200px; }
        .stage-label-accurate { right: 4px; top: 764px; }

        .phone {
          position: absolute;
          left: 50%;
          top: 0;
          transform: translateX(-50%);
          width: 300px;
          background: #fbfaf7;
          border: 1px solid #e4e2d9;
          border-radius: 34px;
          padding: 14px 12px 20px;
          box-shadow: 0 30px 60px rgba(0,0,0,0.12);
        }
        .notch {
          width: 90px;
          height: 22px;
          background: #0a0a0a;
          border-radius: 12px;
          margin: 0 auto 10px;
        }
        .screen {
          background: #111111;
          border-radius: 20px;
          padding: 16px 14px 14px;
          color: #ece8de;
          font-family: var(--font);
        }
        .screen-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .icon-hamburger { display: flex; flex-direction: column; gap: 3px; }
        .icon-hamburger span { width: 16px; height: 2px; background: #ece8de; display: block; }
        .screen-top-right { display: flex; align-items: center; gap: 12px; color: #ece8de; }
        .icon-bell { position: relative; display: flex; }
        .badge {
          position: absolute; top: -5px; right: -6px;
          background: #d9483d; color: #fff; font-size: 8px; font-weight: 700;
          width: 13px; height: 13px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
        }

        .screen-tabs {
          display: flex; justify-content: space-between;
          font-size: 12.5px; color: rgba(236,232,222,0.4); font-weight: 600;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          padding-bottom: 10px; margin-bottom: 12px;
        }
        .screen-tab-active { color: #fff; }

        .screen-presets {
          display: flex; justify-content: center; align-items: flex-end; gap: 30px;
          font-size: 13px; color: rgba(236,232,222,0.3); font-weight: 600;
          margin-bottom: 14px;
        }
        .preset-active {
          color: #fff; font-size: 16px; font-weight: 700;
          display: flex; flex-direction: column; align-items: center; gap: 3px;
        }
        .preset-active i {
          width: 4px; height: 4px; border-radius: 50%; background: #fff; font-style: normal;
        }

        .screen-comps { display: flex; justify-content: center; gap: 12px; margin-bottom: 12px; }
        .comp-col { display: flex; flex-direction: column; align-items: center; width: 62px; }
        .comp-num { font-size: 11px; color: rgba(236,232,222,0.4); font-weight: 700; margin-bottom: 4px; }
        .comp-track {
          width: 100%; height: 96px; background: rgba(255,255,255,0.06);
          position: relative; overflow: visible;
        }
        .comp-fill { position: absolute; left: 0; right: 0; bottom: 0; overflow: hidden; }
        .comp-cap-dim {
          position: absolute; left: 0; right: 0; top: 0;
          background: rgba(0,0,0,0.35);
          border-bottom: 1px dashed rgba(255,160,0,0.5);
        }
        .comp-handle {
          position: absolute; left: 50%; transform: translate(-50%, -50%);
          width: 26px; height: 4px; border-radius: 3px; background: #ffb020;
        }
        .comp-code { font-size: 13px; font-weight: 800; margin-top: 6px; }
        .comp-gal { font-size: 11px; color: rgba(236,232,222,0.55); margin-top: 2px; }

        .screen-cg {
          display: flex; align-items: center; gap: 8px;
          font-size: 9.5px; letter-spacing: 0.05em; text-transform: uppercase;
          color: rgba(236,232,222,0.35); margin-bottom: 12px;
        }
        .cg-track { flex: 1; height: 2px; background: rgba(255,255,255,0.12); position: relative; }
        .cg-dot { position: absolute; left: 58%; top: 50%; transform: translate(-50%, -50%); width: 12px; height: 12px; border-radius: 50%; background: #ece8de; }

        .screen-row {
          display: flex; align-items: center; justify-content: space-between;
          border-top: 1px solid rgba(255,255,255,0.08);
          padding: 9px 0;
        }
        .row-main { font-size: 12px; font-weight: 600; margin: 0; }
        .row-sub { font-size: 10.5px; color: rgba(236,232,222,0.45); margin: 2px 0 0; }
        .row-sub-good { color: #7bb586; }
        .chev { color: rgba(236,232,222,0.3); font-size: 16px; }

        .screen-reload {
          margin-top: 10px;
          background: #fff; color: #111;
          text-align: center; font-weight: 800; font-size: 12.5px; letter-spacing: 0.04em;
          padding: 11px 0;
        }

        .screen-totals {
          display: flex; justify-content: space-between; align-items: baseline;
          margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;
        }
        .total-main { font-size: 15px; font-weight: 800; margin: 0; font-variant-numeric: tabular-nums; }
        .total-right { text-align: right; }
        .total-sub { font-size: 9.5px; color: rgba(236,232,222,0.4); margin: 2px 0 0; }

        .screen-foot {
          font-style: italic; font-size: 9px; color: rgba(236,232,222,0.32);
          margin: 10px 0 -6px; line-height: 1.4;
        }

        .card {
          position: absolute;
          width: 258px;
          padding: 14px 16px 15px;
          animation: rise 0.5s ease backwards;
        }
        .card-light { background: var(--card-light); color: var(--ink); }
        .card-dark { background: var(--card-dark); color: #fff; }
        .card .eyebrow {
          font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
          display: flex; align-items: flex-start; justify-content: space-between;
          opacity: 0.55; margin: 0 0 8px;
        }
        .card .dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: 0.5; flex-shrink: 0; margin-left: 8px; }
        .card .title { font-size: 15px; font-weight: 700; margin: 0 0 6px; line-height: 1.3; }
        .card .body { font-size: 12px; line-height: 1.55; opacity: 0.75; margin: 0; }

        .truck-mark { position: absolute; right: -10px; bottom: -10px; opacity: 0.14; }

        @keyframes rise {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .manifesto {
          max-width: 720px;
          margin: 40px auto 64px;
          text-align: center;
        }
        .manifesto p {
          font-size: 17px;
          line-height: 1.7;
          color: var(--ink);
          margin: 0 0 14px;
        }
        .manifesto p:last-child { margin-bottom: 0; }

        .tabbar-wrap { display: flex; justify-content: center; padding-bottom: 56px; }
        .tabbar {
          display: flex;
          gap: 30px;
          background: #0a0a0a;
          border-radius: 999px;
          padding: 14px 34px;
        }
        .tabbar span { color: rgba(255,255,255,0.45); font-size: 14px; font-weight: 600; }
        .tabbar span.tab-active { color: #fff; font-weight: 800; }

        @media (max-width: 900px) {
          .hero h1 { font-size: 38px; }
          .stage { min-height: auto; padding-bottom: 0; }
          .stage-label { position: static; margin: 24px 0 0; }
          .phone { position: static; transform: none; margin: 24px auto; }
          .card { position: static; width: 100%; margin-bottom: 12px; }
          .truck-mark { display: none; }
          .tabbar { flex-wrap: wrap; justify-content: center; gap: 16px 22px; }
        }
      `}</style>
    </div>
  );
}
