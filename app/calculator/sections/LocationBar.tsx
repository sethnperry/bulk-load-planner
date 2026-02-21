"use client";

import React from "react";
import { TopTiles } from "../TopTiles";

type Styles = {
  help: React.CSSProperties;
};

export default function LocationBar(props: {
  styles: Styles;

  // TopTiles
  locationTitle: string;
  ambientSubtitle?: string;
  terminalTitle: string;
  terminalSubtitle?: string;
  terminalSubtitleClassName?: string;

  onOpenLocation: () => void;
  onOpenTerminal: () => void;

  terminalEnabled: boolean;
  locationSelected: boolean;
  terminalSelected: boolean;

  // Slot UI (already built in page.tsx for now)
  snapshotSlots: React.ReactNode;

  // Auth line
 
}) {
  const {
    styles,
    locationTitle,
    ambientSubtitle,
    terminalTitle,
    terminalSubtitle,
    terminalSubtitleClassName,
    onOpenLocation,
    onOpenTerminal,
    terminalEnabled,
    locationSelected,
    terminalSelected,
    snapshotSlots,
    
  } = props;

  return (
    <>
      <div className="my-3">
        <TopTiles
          locationTitle={locationTitle}
          ambientSubtitle={ambientSubtitle}
          terminalTitle={terminalTitle}
          terminalSubtitle={terminalSubtitle}
          terminalSubtitleClassName={terminalSubtitleClassName}
          onOpenLocation={onOpenLocation}
          onOpenTerminal={onOpenTerminal}
          terminalEnabled={terminalEnabled}
          locationSelected={locationSelected}
          terminalSelected={terminalSelected}
        />

        {snapshotSlots}
      </div>

     
      
    </>
  );
}
