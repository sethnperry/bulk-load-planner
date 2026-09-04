"use client";
// app/planner/components/PlannerIcons.tsx
//
// Equipment/Location/Temperature icons for the Planner's new compact icon
// row (replacing the old three stacked Equipment/Location/Temperature
// cards -- see page.tsx's mainInfoStack). Matches the existing house style
// exactly, same as CalculatorLayoutClient.tsx's BellIcon/GearIcon: plain
// Feather/Lucide-shape stroke icons, viewBox 0 0 24 24, fill="none",
// strokeWidth 2, round caps/joins, a `stroke` prop for theming rather than
// a hardcoded color. Deliberately not pulled from an icon library -- this
// project has never taken that dependency, these are hand-copied standard
// Feather paths (truck / map-pin / thermometer) to stay visually
// consistent with the two icons that already exist.

import React from "react";

type IconProps = { size?: number; stroke: string };

export function TruckIcon({ size = 20, stroke }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13"></rect>
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
      <circle cx="5.5" cy="18.5" r="2.5"></circle>
      <circle cx="18.5" cy="18.5" r="2.5"></circle>
    </svg>
  );
}

export function PinIcon({ size = 20, stroke }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
      <circle cx="12" cy="10" r="3"></circle>
    </svg>
  );
}

export function ThermometerIcon({ size = 20, stroke }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z"></path>
    </svg>
  );
}
