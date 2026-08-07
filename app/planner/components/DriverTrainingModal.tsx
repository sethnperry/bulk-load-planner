"use client";
// app/planner/components/DriverTrainingModal.tsx
//
// Lead (or admin-acting-as-lead) picks a trainee before loading. Single-load
// model -- see CLAUDE.md "Terminal Tier — Build Spec": this doesn't create a
// second load, it just tags whatever the lead loads next with trainee_id
// (wired in useLoadWorkflow.ts right after begin_load succeeds).

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import DriverPicker from "./DriverPicker";

export default function DriverTrainingModal({
  open,
  onClose,
  companyId,
  excludeUserId,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string | null;
  excludeUserId?: string;
  onPick: (userId: string, displayName: string) => void;
}) {
  return (
    <FullscreenModal open={open} title="Driver Training" onClose={onClose} footer={null}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 12 }}>
        Pick the trainee for the next load. It's still one load, submitted by you — this just tags it so it counts toward their training record.
      </div>
      <DriverPicker
        companyId={companyId}
        excludeUserId={excludeUserId}
        onPick={(id, name) => { onPick(id, name); onClose(); }}
        emptyLabel="No other drivers in this company."
      />
    </FullscreenModal>
  );
}
