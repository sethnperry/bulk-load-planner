"use client";

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

type TempDialProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
};

export default function TempDialModal(props: {
  open: boolean;
  onClose: () => void;

  title?: string;

  value: number;
  min?: number;
  max?: number;
  step?: number;

  onChange: (v: number) => void;

  TempDial: React.ComponentType<TempDialProps>;
}) {
  const { open, onClose, title, value, min = -20, max = 140, step = 0.1, onChange, TempDial } = props;

  return (
    <FullscreenModal open={open} title={title ?? "Temp"} onClose={onClose}>
      {/* Dial only. No extra content. */}
      <TempDial value={value} min={min} max={max} step={step} onChange={onChange} />
    </FullscreenModal>
  );
}
