"use client";

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

export default function EquipmentModal(props: {
  open: boolean;
  onClose: () => void;
}) {
  const { open, onClose } = props;

  return (
    <FullscreenModal open={open} title="Select Equipment" onClose={onClose}>
      <div className="text-sm opacity-70">
        Placeholder: equipment selector goes here (modal list).
      </div>
    </FullscreenModal>
  );
}
