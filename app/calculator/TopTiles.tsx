"use client";

// ── Duration color: grey=healthy, orange=≤7 days, red=expired ─────────────────
function terminalSubColor(subtitle: string | undefined, subtitleClassName: string | undefined): string {
  if (subtitleClassName?.includes("red")) return "#ef4444";
  // Parse days from countdown text like "86 days", "6 days", "Expired"
  if (!subtitle) return "rgba(255,255,255,0.45)";
  if (/[Ee]xpired/.test(subtitle)) return "#ef4444";
  const m = subtitle.match(/(\d+)\s*d(?:ays?)?/i);
  if (m) {
    const d = parseInt(m[1], 10);
    if (d <= 7) return "#f97316";
  }
  return "rgba(255,255,255,0.45)";
}

// ── Sub-button strip ──────────────────────────────────────────────────────────
function SubButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", padding: "5px 10px",
        background: "rgba(255,255,255,0.04)",
        border: "none",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        cursor: "pointer", flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.50)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
        {label}
      </span>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginLeft: 4, flexShrink: 0 }}>›</span>
    </button>
  );
}

// ── Single tile ───────────────────────────────────────────────────────────────
type TileProps = {
  subLabel?: string;
  onSubClick?: () => void;
  title: string;
  subtitle?: string;
  subtitleClassName?: string;
  onClick: () => void;
  disabled?: boolean;
  selected?: boolean;
  placeholderTitle?: string;
  isTerminal?: boolean;
};

function Tile({ subLabel, onSubClick, title, subtitle, subtitleClassName, onClick, disabled = false, selected = false, placeholderTitle, isTerminal = false }: TileProps) {
  const cardBorder = disabled ? "1px solid rgba(255,255,255,0.05)" : selected ? "1px solid rgba(255,255,255,0.16)" : "1px solid rgba(255,255,255,0.10)";
  const cardBg = disabled ? "rgba(42,42,42,0.7)" : selected ? "rgba(28,28,28,0.95)" : "rgba(32,32,32,0.90)";
  const titleColor = disabled ? "rgba(255,255,255,0.35)" : selected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.80)";

  const hasSubtitle = subtitle != null && String(subtitle).trim().length > 0;
  const subtitleDisplay = hasSubtitle ? subtitle : (disabled ? "Select location first" : "Tap to select");
  const subColor = isTerminal
    ? terminalSubColor(subtitle, subtitleClassName)
    : "rgba(255,166,35,0.90)";
  const subtitleColor = hasSubtitle ? subColor : "rgba(255,255,255,0.30)";

  const displayTitle = title || (placeholderTitle ?? "");

  return (
    <div style={{ borderRadius: 16, border: cardBorder, background: cardBg, boxShadow: "0 8px 24px rgba(0,0,0,0.40)", overflow: "hidden", display: "flex", flexDirection: "column", opacity: disabled ? 0.6 : 1, transition: "border-color 200ms" }}>
      {subLabel && onSubClick && !disabled && (
        <SubButton label={subLabel} onClick={onSubClick} />
      )}
      <button
        type="button"
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", padding: "10px 12px", background: "transparent", border: "none", cursor: disabled ? "default" : "pointer", textAlign: "left" as const, width: "100%", minHeight: 52 }}
      >
        <div style={{ fontWeight: 700, fontSize: "clamp(12px, 3.5vw, 15px)", color: titleColor, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, width: "100%" }}>
          {displayTitle}
        </div>
        <div style={{ marginTop: 3, fontSize: "clamp(10px, 2.6vw, 12px)", color: subtitleColor, fontWeight: 600, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, width: "100%" }}>
          {subtitleDisplay}
        </div>
      </button>
    </div>
  );
}

// ── TopTiles export ───────────────────────────────────────────────────────────
export function TopTiles({
  locationTitle, ambientSubtitle, terminalTitle, terminalSubtitle,
  terminalSubtitleClassName, onOpenLocation, onOpenTerminal,
  terminalEnabled, locationSelected, terminalSelected,
}: {
  locationTitle: string; ambientSubtitle?: string; terminalTitle: string;
  terminalSubtitle?: string; terminalSubtitleClassName?: string;
  onOpenLocation: () => void; onOpenTerminal: () => void;
  terminalEnabled: boolean; locationSelected: boolean; terminalSelected: boolean;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <Tile
        subLabel={locationSelected ? locationTitle : undefined}
        onSubClick={onOpenLocation}
        title={locationSelected ? locationTitle : "Location"}
        subtitle={ambientSubtitle}
        onClick={onOpenLocation}
        selected={locationSelected}
        isTerminal={false}
      />
      <Tile
        subLabel={terminalSelected ? terminalTitle : undefined}
        onSubClick={onOpenTerminal}
        title={terminalSelected ? terminalTitle : "Terminal"}
        subtitle={terminalSubtitle}
        subtitleClassName={terminalSubtitleClassName}
        onClick={onOpenTerminal}
        disabled={!terminalEnabled}
        selected={terminalSelected}
        isTerminal={true}
      />
    </div>
  );
}
