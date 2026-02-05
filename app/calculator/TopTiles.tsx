"use client";

type TileProps = {
  iconText: string;
  title: string;
  subtitle?: string;
  onClick: () => void;
  disabled?: boolean;
  selected?: boolean;
  subtitleClassName?: string;
  placeholderSubtitle?: string; // ✅ new
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

  // Card housing is constant.
  const cardClass = disabled
    ? "bg-[#2a2a2a]/70 border-white/5 opacity-60"
    : "bg-[#202020]/90 border-white/10 hover:border-white/20";

  // Icon well is the “switch”
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

  // Default subtitle color (only used when no override is passed)
  const defaultSubtitleClass = disabled ? "text-white/30" : isSelected ? "text-cyan-400" : "text-white/50";

  // ✅ Always render a subtitle row to keep height stable
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
    >
      <div className="relative w-full min-h-[68px]">
        {/* Icon well (left) */}
        <div className="absolute left-1 top-1 bottom-1">
          <div
            className={[
              "h-full w-16 rounded-xl border flex items-center justify-center transition-colors",
              iconWellClass,
            ].join(" ")}
          >
            <span className={["text-lg font-bold transition-colors", iconTextClass].join(" ")}>
              {iconText}
            </span>
          </div>
        </div>

        {/* Text area */}
        <div className="pl-[84px] pr-3 py-2">
          <div className={["text-lg font-semibold truncate transition-colors", titleClass].join(" ")}>
            {title}
          </div>

          <div className={["mt-1 text-sm transition-colors", subtitleFinalClass].join(" ")}>
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
