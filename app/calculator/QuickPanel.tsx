"use client";

type QuickPanelProps = {
  equipmentLabel?: string;
  locationLabel?: string;
  terminalLabel?: string;

  onOpenEquipment: () => void;
  onOpenLocation: () => void;
  onOpenTerminal: () => void;

  terminalEnabled: boolean;
};

function QuickButton({
  label,
  value,
  onClick,
  enabled = true,
}: {
  label: string;
  value?: string;
  onClick: () => void;
  enabled?: boolean;
}) {
  const hasValue = Boolean(value);
  const base =
    "flex w-full flex-col rounded-2xl border px-3 py-3 text-left transition";
  const enabledStyles = enabled ? "hover:bg-gray-50" : "opacity-50";
  const selectedStyles = hasValue ? "border-black" : "border-gray-200";

  return (
    <button
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      className={`${base} ${enabledStyles} ${selectedStyles}`}
    >
      <div className="text-xs uppercase tracking-wide opacity-60">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${hasValue ? "" : "opacity-50"}`}>
        {hasValue ? value : "Select"}
      </div>
    </button>
  );
}

export function QuickPanel(props: QuickPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <QuickButton
        label="Equipment"
        value={props.equipmentLabel}
        onClick={props.onOpenEquipment}
      />
      <QuickButton
        label="Location"
        value={props.locationLabel}
        onClick={props.onOpenLocation}
      />
      <QuickButton
        label="Terminal"
        value={props.terminalLabel}
        onClick={props.onOpenTerminal}
        enabled={props.terminalEnabled}
      />
    </div>
  );
}
