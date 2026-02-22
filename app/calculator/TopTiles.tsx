"use client";

type TileProps = {
  iconText: string;
  title: string;
  subtitle?: string;
  onClick: () => void;
  disabled?: boolean;
  selected?: boolean;
  subtitleClassName?: string;
  placeholderSubtitle?: string;
};

function Tile({
  iconText,
  title,
  subtitle,
  onClick,
  subtitleClassName,
  placeholderSubtitle,
  disabled = false,
  selected = false,
}: TileProps) {
  const isSelected = !!selected;

  const cardClass = disabled
    ? "bg-[#2a2a2a]/70 border-white/5 opacity-60"
    : "bg-[#202020]/90 border-white/10 hover:border-white/20";

  const iconWellClass = disabled
    ? "bg-[#2a2a2a] border-white/5"
    : isSelected
    ? "bg-black border-white/20"
    : "bg-[#2a2a2a] border-white/10";

  const iconTextClass = disabled
    ? "text-white/30"
    : isSelected
    ? "text-amber-400"
    : "text-white/50";

  const titleClass = disabled ? "text-white/35" : isSelected ? "text-white" : "text-white/80";

  const defaultSubtitleClass = disabled ? "text-white/30" : isSelected ? "text-cyan-400" : "text-white/50";

  const subtitleText =
    subtitle ??
    placeholderSubtitle ??
    (disabled ? "Select location first" : "Tap to select");

  const subtitleFinalClass =
    subtitleClassName ??
    (subtitle ? defaultSubtitleClass : disabled ? "text-white/30" : "text-white/40");

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={[
        "w-full rounded-2xl text-left overflow-hidden shadow-xl border transition active:scale-[0.99]",
        cardClass,
      ].join(" ")}
      style={{ height: 72 }}
    >
      {/* Fixed-height inner — icon well and text area both fill the same 72px */}
      <div style={{ display: "flex", alignItems: "stretch", height: "100%", padding: 4, gap: 0 }}>
        {/* Icon well — square, fills full card height minus 4px padding each side */}
        <div
          className={[
            "rounded-xl border flex items-center justify-center transition-colors flex-shrink-0",
            iconWellClass,
          ].join(" ")}
          style={{ width: 56, minWidth: 56 }}
        >
          <span className={["text-base font-bold transition-colors", iconTextClass].join(" ")}>
            {iconText}
          </span>
        </div>

        {/* Text area — takes remaining width, clips gracefully */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 8px 0 10px" }}>
          <div
            className={["font-semibold transition-colors", titleClass].join(" ")}
            style={{ fontSize: "clamp(12px, 3.5vw, 16px)", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {title}
          </div>
          <div
            className={["mt-0.5 transition-colors", subtitleFinalClass].join(" ")}
            style={{ fontSize: "clamp(10px, 2.8vw, 13px)", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {subtitleText}
          </div>
        </div>
      </div>
    </button>
  );
}

export function TopTiles({
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
}: {
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
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Tile
        iconText="SC"
        title={locationTitle}
        subtitle={ambientSubtitle}
        onClick={onOpenLocation}
        selected={locationSelected}
        disabled={false}
        placeholderSubtitle="Tap to select"
      />

      <Tile
        iconText="T"
        title={terminalTitle}
        subtitle={terminalSubtitle}
        subtitleClassName={terminalSubtitleClassName}
        onClick={onOpenTerminal}
        disabled={!terminalEnabled}
        selected={terminalSelected}
        placeholderSubtitle={terminalEnabled ? "Tap to select" : "Select location first"}
      />
    </div>
  );
}

