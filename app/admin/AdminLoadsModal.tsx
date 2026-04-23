"use client";
// app/admin/AdminLoadsModal.tsx
// Reuses MyLoadsModal to show a driver's load history from the admin page.
// Fetches data internally so the admin page doesn't need new state.

import React, { useEffect, useState } from "react";
import MyLoadsModal from "@/app/calculator/modals/MyLoadsModal";
import { useLoadHistory } from "@/app/calculator/hooks/useLoadHistory";
import { supabase } from "@/lib/supabase/client";

type Props = {
  open: boolean;
  onClose: () => void;
  targetUserId: string;
  targetDisplayName: string;
};

export default function AdminLoadsModal({ open, onClose, targetUserId, targetDisplayName }: Props) {
  const loadHistory = useLoadHistory(targetUserId);
  const [terminalCatalog, setTerminalCatalog] = useState<any[]>([]);
  const [combos, setCombos] = useState<any[]>([]);

  // Load terminal catalog + combos once so MyLoadsModal can resolve labels
  useEffect(() => {
    if (!open) return;
    supabase
      .from("terminals")
      .select("terminal_id, terminal_name")
      .then(({ data }) => setTerminalCatalog(data ?? []));
    supabase
      .from("equipment_combos")
      .select("combo_id, combo_name, truck_id, trailer_id")
      .eq("active", true)
      .then(({ data }) => setCombos(data ?? []));
  }, [open]);

  return (
    <MyLoadsModal
      open={open}
      onClose={onClose}
      authUserId={targetUserId}
      rows={loadHistory.rows}
      loading={loadHistory.loading}
      error={loadHistory.error}
      linesCache={loadHistory.linesCache}
      linesLoading={loadHistory.linesLoading}
      onFetchLines={loadHistory.fetchLines}
      onFetchRange={loadHistory.fetch}
      terminalCatalog={terminalCatalog}
      combos={combos}
      headerOverride={targetDisplayName}
    />
  );
}
