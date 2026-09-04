"use client";
// app/planner/components/PlannerIcons.tsx
//
// Icons for the Planner's header-merged plan-letter/Equipment/Location/
// Temperature cluster (page.tsx's headerIconsEl, portaled into
// CalculatorLayoutClient.tsx's shared Header). Per the mockup, only
// Location is a real icon glyph now -- plan-letter, Equipment ("EQ"), and
// Temperature ("86°F") are plain text labels, styled directly in page.tsx.
// SolidPinIcon is the one glyph this cluster needs: a filled map-pin,
// matching the mockup exactly (not the stroke-outline style used
// elsewhere in this app, e.g. CalculatorLayoutClient.tsx's BellIcon/
// GearIcon).

import React from "react";

// Standard "place" pin glyph -- the inner circle is a real hole (opposite
// path winding under the default nonzero fill rule), not an overlay, so it
// reads correctly on any background color behind it.
export function SolidPinIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"></path>
    </svg>
  );
}
