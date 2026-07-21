// app/calculator/layout.tsx
//
// Server component (no "use client") specifically so it can export its own
// `viewport` -- Next's Metadata API requires viewport/metadata exports to
// live in a server component. Planner/Cards/Vault all share the light
// gradient header (see CalculatorLayoutClient's Header), so the Android
// status bar (drawn by the OS and colored via theme-color -- never blended
// with page content the way iOS's translucent overlay mode is) needs its
// own theme-color here to match, instead of inheriting the app-wide dark
// one from the root layout. Every other (still dark-themed) screen keeps
// the root layout's default.
//
// All actual interactive shell logic (header, tab bar, modals) lives in
// CalculatorLayoutClient.tsx, a client component this just renders.

import type { Viewport } from "next";
import CalculatorLayoutClient from "./CalculatorLayoutClient";

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function CalculatorLayout({ children }: { children: React.ReactNode }) {
  return <CalculatorLayoutClient>{children}</CalculatorLayoutClient>;
}
