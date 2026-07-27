"use client";
// app/calculator/cards/page.tsx — Terminals sub-tab (Cards tab rework, Phase 1)
//
// This is now the real source of truth for terminal card data (card number/
// PIN/private note, last-visit date) -- MyTerminalsModal.tsx (the Planner's
// terminal picker) reads the same shared state via CalculatorShellContext
// but no longer edits it; editing happens here, on the back of each card.
//
// All starred terminals (shell.terminals.terminals) are shown, every status,
// grouped by city with a divider header per city -- filter chips only
// narrow what's visible, they never change what's fetched (the underlying
// my_terminals_with_status view already returns every status for every
// starred terminal).

import React, { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCalculatorShell } from "../CalculatorShellContext";
import { formatMDY, formatMDYWithCountdown_ } from "../utils/dates";
import CardsSubTabs from "./CardsSubTabs";
import FlippableCard from "./FlippableCard";
import SourcingModal from "../modals/SourcingModal";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import {
  toneFor, formatCardNumber, cardStateFor, matchesFilter, FILTERS, EXP_COLOR,
  fieldLabel, fieldInput, btnPrimary, btnSecondary, btnDanger,
  type CardState, type FilterKey,
} from "./cardTheme";

// ── Terminal card (front + back) ────────────────────────────────────────────

function TerminalCard({
  t, tid, expiresISO, state, isFlipped, isSelected,
  onFlipOpen, onFlipClose,
  draft, updateDraft,
  lastVisitISO, onSetAccessDate,
  confirmAction, setConfirmAction,
  onOpenSourcing, onSelect, onDeactivate, onRemove,
}: {
  t: any; tid: string; expiresISO: string | null; state: CardState;
  isFlipped: boolean; isSelected: boolean;
  onFlipOpen: () => void; onFlipClose: () => void;
  draft: { cardNumber: string; pin: string; privateNote: string };
  updateDraft: (patch: Partial<{ cardNumber: string; pin: string; privateNote: string }>) => void;
  lastVisitISO: string; onSetAccessDate: (iso: string) => void;
  confirmAction: null | "deactivate" | "remove"; setConfirmAction: (a: null | "deactivate" | "remove") => void;
  onOpenSourcing: () => void; onSelect: () => void; onDeactivate: () => void; onRemove: () => void;
}) {
  const name = String(t.terminal_name ?? "Terminal");
  const [base, shade] = toneFor(name);
  const inactive = state === "inactive";
  const cardBg = `radial-gradient(circle at 25% 15%, rgba(255,255,255,0.7), transparent 55%), linear-gradient(135deg, ${base} 0%, ${shade} 100%)`;

  const front = (
    <div style={{
      height: "100%", borderRadius: 8, padding: "12px 14px", boxSizing: "border-box",
      background: cardBg,
      border: isSelected ? "1px solid rgba(0,0,0,0.35)" : "1px solid rgba(0,0,0,0.08)",
      boxShadow: "0 6px 14px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.55)",
      opacity: inactive ? 0.55 : 1,
      filter: inactive ? "grayscale(0.5)" : "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#161616", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </div>
        {inactive && (
          <div style={{ fontSize: 9, fontWeight: 800, color: "rgba(0,0,0,0.45)", background: "rgba(0,0,0,0.08)", borderRadius: 4, padding: "2px 6px", letterSpacing: 0.4, textTransform: "uppercase", flexShrink: 0 }}>
            Inactive
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", marginTop: 1 }}>
        {t.city}{t.state ? `, ${t.state}` : ""}
      </div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", letterSpacing: 1, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {draft.cardNumber ? formatCardNumber(draft.cardNumber) : "No card on file"}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: 0.4 }}>Exp</div>
          <div style={{ fontSize: 12, fontWeight: 800, color: EXP_COLOR[state] }}>
            {expiresISO ? formatMDY(expiresISO) : "Not carded"}
          </div>
        </div>
      </div>
    </div>
  );

  const back = (
    <div style={{
      height: "100%", borderRadius: 8, overflow: "hidden", boxSizing: "border-box",
      background: cardBg,
      border: "1px solid rgba(0,0,0,0.08)",
      boxShadow: "0 6px 14px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.55)",
    }}>
      <div style={{ background: "rgba(0,0,0,0.85)", padding: "9px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </div>
        <button type="button" onClick={onFlipClose} style={{ border: "none", background: "none", color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "4px 6px" }}>
          Done
        </button>
      </div>

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div>
          <div style={fieldLabel}>Last Visit</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input type="date" value={lastVisitISO} onChange={(e) => onSetAccessDate(e.target.value)} style={{ ...fieldInput, flex: 1 }} />
            <button type="button" onClick={() => onSetAccessDate(new Date().toISOString().slice(0, 10))} style={btnSecondary}>Today</button>
          </div>
          <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: EXP_COLOR[state] }}>
            {expiresISO ? `Expires ${formatMDYWithCountdown_(expiresISO)}` : "Not yet carded"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={fieldLabel}>Card Number</div>
            <input type="text" value={draft.cardNumber} onChange={(e) => updateDraft({ cardNumber: e.target.value })} placeholder="Enter card #" style={fieldInput} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={fieldLabel}>PIN</div>
            <input type="text" value={draft.pin} onChange={(e) => updateDraft({ pin: e.target.value })} placeholder="Enter PIN" style={fieldInput} />
          </div>
        </div>

        <button type="button" onClick={onOpenSourcing} style={{ ...btnSecondary, width: "100%" }}>
          Sourcing
        </button>

        <div>
          <div style={fieldLabel}>Private Note</div>
          <textarea value={draft.privateNote} onChange={(e) => updateDraft({ privateNote: e.target.value })} placeholder="Gate codes, contacts, reminders…" rows={2} style={{ ...fieldInput, resize: "none" as const }} />
        </div>

        {confirmAction === null && (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onSelect} style={btnPrimary}>Select</button>
            {lastVisitISO && <button type="button" onClick={() => setConfirmAction("deactivate")} style={btnDanger}>Deactivate</button>}
            <button type="button" onClick={() => setConfirmAction("remove")} style={btnDanger}>Remove</button>
          </div>
        )}
        {confirmAction === "deactivate" && (
          <div style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(153,27,27,0.25)", background: "rgba(153,27,27,0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#3a1414", marginBottom: 8 }}>
              Remove last visit date and mark as not carded?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={onDeactivate} style={{ ...btnDanger, flex: 1 }}>Yes, deactivate</button>
              <button type="button" onClick={() => setConfirmAction(null)} style={{ ...btnSecondary, flex: 1 }}>Cancel</button>
            </div>
          </div>
        )}
        {confirmAction === "remove" && (
          <div style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(153,27,27,0.25)", background: "rgba(153,27,27,0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#3a1414", marginBottom: 8 }}>
              Remove this card from your wallet? Card number, PIN, and notes stay saved if you add it back later.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={onRemove} style={{ ...btnDanger, flex: 1 }}>Yes, remove card</button>
              <button type="button" onClick={() => setConfirmAction(null)} style={{ ...btnSecondary, flex: 1 }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return <FlippableCard flipped={isFlipped} onFlipToBack={onFlipOpen} front={front} back={back} />;
}

// ── Add Terminal Card sheet ──────────────────────────────────────────────────

function AddCardSheet({
  open, onClose, terminalCatalog, myTerminalIdSet, onAdd,
}: {
  open: boolean; onClose: () => void; terminalCatalog: any[]; myTerminalIdSet: Set<string>;
  onAdd: (terminalId: string, fields: { lastVisit: string; cardNumber: string; pin: string; privateNote: string }) => void;
}) {
  const [step, setStep] = useState<"search" | "details">("search");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<any | null>(null);
  const [lastVisit, setLastVisit] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [pin, setPin] = useState("");
  const [privateNote, setPrivateNote] = useState("");

  const reset = () => { setStep("search"); setQuery(""); setPicked(null); setLastVisit(""); setCardNumber(""); setPin(""); setPrivateNote(""); };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (terminalCatalog ?? [])
      .filter((c: any) => !myTerminalIdSet.has(String(c.terminal_id)))
      .filter((c: any) => {
        if (!q) return true;
        const hay = `${c.terminal_name ?? ""} ${c.city ?? ""} ${c.state ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 60);
  }, [terminalCatalog, myTerminalIdSet, query]);

  return (
    <FullscreenModal
      open={open}
      title={step === "search" ? "Add Terminal Card" : String(picked?.terminal_name ?? "Add Card")}
      onClose={() => { onClose(); reset(); }}
      footer={null}
    >
      {step === "search" ? (
        <div className="space-y-3">
          <input
            type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by terminal, city, or state…"
            className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30"
            autoFocus
          />
          <div className="grid grid-cols-1 gap-2">
            {results.map((c: any) => {
              const id = String(c.terminal_id);
              return (
                <div
                  key={id}
                  role="button" tabIndex={0}
                  onClick={() => { setPicked(c); setStep("details"); }}
                  className="rounded-md border border-white/10 bg-white/5 hover:bg-white/8 cursor-pointer px-3 py-2"
                >
                  <div className="text-sm font-semibold text-white truncate">{c.terminal_name ?? "(unnamed terminal)"}</div>
                  <div className="text-xs text-white/45 mt-0.5">{c.city}{c.state ? `, ${c.state}` : ""}</div>
                </div>
              );
            })}
            {results.length === 0 && (
              <div className="text-sm text-white/40 text-center py-8">No matching terminals.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-white/60">
            {picked?.city}{picked?.state ? `, ${picked.state}` : ""}
          </div>
          <div>
            <div className="text-xs text-white/40 mb-1 font-medium">Last Visit (optional)</div>
            <div className="flex gap-2">
              <input type="date" value={lastVisit} onChange={(e) => setLastVisit(e.target.value)} className="flex-1 min-w-0 rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white" />
              <button type="button" onClick={() => setLastVisit(new Date().toISOString().slice(0, 10))} className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/70 hover:bg-white/10 whitespace-nowrap">Today</button>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-white/40 mb-1 font-medium">Card Number (optional)</div>
              <input type="text" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-white/20" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-white/40 mb-1 font-medium">PIN (optional)</div>
              <input type="text" value={pin} onChange={(e) => setPin(e.target.value)} className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-white/20" />
            </div>
          </div>
          <div>
            <div className="text-xs text-white/40 mb-1 font-medium">Private Note (optional)</div>
            <textarea value={privateNote} onChange={(e) => setPrivateNote(e.target.value)} rows={2} className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-white/20 resize-none" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setStep("search")} className="flex-1 rounded-md border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-white/70">Back</button>
            <button
              type="button"
              onClick={() => { onAdd(String(picked.terminal_id), { lastVisit, cardNumber, pin, privateNote }); onClose(); reset(); }}
              className="flex-1 rounded-md border border-white/15 bg-white/90 py-2.5 text-sm font-bold text-black"
            >
              Add Card
            </button>
          </div>
        </div>
      )}
    </FullscreenModal>
  );
}

// ── Cards tab: Terminals sub-tab ─────────────────────────────────────────────

export default function CardsPage() {
  const shell = useCalculatorShell();
  const { terminals, location, cardDataByTerminalId, setCardDataForTerminal_, authUserId, myTerminalIdSet } = shell;
  const router = useRouter();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [flippedId, setFlippedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ cardNumber: string; pin: string; privateNote: string }>({ cardNumber: "", pin: "", privateNote: "" });
  const [confirmAction, setConfirmAction] = useState<null | "deactivate" | "remove">(null);
  const [sourcingTerminal, setSourcingTerminal] = useState<{ id: string; name: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [cityJump, setCityJump] = useState("");

  const cityRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const enriched = useMemo(() => {
    return (terminals.terminals ?? []).map((t: any) => {
      const tid = String(t.terminal_id);
      const expiresISO = terminals.terminalDisplayInfo(t, tid);
      return { t, tid, expiresISO, state: cardStateFor(expiresISO) };
    });
  }, [terminals.terminals, terminals.terminalDisplayInfo]);

  const cityGroups = useMemo(() => {
    const filtered = enriched.filter((i) => matchesFilter(i.state, filter));
    const map = new Map<string, typeof filtered>();
    for (const item of filtered) {
      const city = String(item.t.city ?? "Unknown");
      if (!map.has(city)) map.set(city, []);
      map.get(city)!.push(item);
    }
    return Array.from(map.keys())
      .sort()
      .map((city) => ({
        city,
        items: map.get(city)!.sort((a, b) => String(a.t.terminal_name ?? "").localeCompare(String(b.t.terminal_name ?? ""))),
      }));
  }, [enriched, filter]);

  const handleFlipOpen = (tid: string) => {
    const saved = cardDataByTerminalId[tid];
    setDraft({ cardNumber: saved?.cardNumber ?? "", pin: saved?.pin ?? "", privateNote: saved?.privateNote ?? "" });
    setConfirmAction(null);
    setFlippedId(tid);
  };
  const handleFlipClose = () => {
    if (flippedId) setCardDataForTerminal_(flippedId, draft);
    setConfirmAction(null);
    setFlippedId(null);
  };
  const handleSelect = (tid: string) => {
    if (!terminals.accessDateByTerminalId[tid]) terminals.setAccessDateForTerminal(tid, new Date().toISOString().slice(0, 10));
    location.setSelectedTerminalId(tid);
    handleFlipClose();
    router.push("/calculator");
  };
  const handleDeactivate = (tid: string) => {
    terminals.setAccessDateForTerminal(tid, "");
    setConfirmAction(null);
    setFlippedId(null);
  };
  const handleRemove = (tid: string) => {
    terminals.toggleTerminalStar(tid, true);
    setConfirmAction(null);
    setFlippedId(null);
  };
  const handleAddCard = async (terminalId: string, fields: { lastVisit: string; cardNumber: string; pin: string; privateNote: string }) => {
    await terminals.toggleTerminalStar(terminalId, false);
    if (fields.lastVisit) await terminals.setAccessDateForTerminal(terminalId, fields.lastVisit);
    if (fields.cardNumber || fields.pin || fields.privateNote) {
      await setCardDataForTerminal_(terminalId, { cardNumber: fields.cardNumber, pin: fields.pin, privateNote: fields.privateNote });
    }
  };

  const cities = cityGroups.map((g) => g.city);

  return (
    <div>
      <CardsSubTabs />

      {terminals.termError && <div className="text-sm text-red-400 mb-3">{terminals.termError}</div>}

      {(terminals.terminals ?? []).length === 0 ? (
        <div style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.3)", fontSize: 14, padding: "60px 20px", lineHeight: 1.5 }}>
          No starred terminals yet.<br />Star a terminal from the Planner to see its card here.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <CustomSelect
                value={filter}
                onChange={(v) => setFilter(v as FilterKey)}
                options={FILTERS.map((f) => ({ value: f.key, label: f.label }))}
                buttonStyle={{ padding: "6px 10px", fontSize: 13, color: "rgba(255,255,255,0.55)" }}
              />
            </div>
            {cities.length > 1 && (
              <div style={{ flex: 1 }}>
                <CustomSelect
                  value={cityJump}
                  onChange={(v) => {
                    setCityJump(v);
                    if (v) {
                      cityRefs.current[v]?.scrollIntoView({ behavior: "smooth", block: "start" });
                      setTimeout(() => setCityJump(""), 300);
                    }
                  }}
                  options={[{ value: "", label: "Jump to city…" }, ...cities.map((c) => ({ value: c, label: c }))]}
                  buttonStyle={{ padding: "6px 10px", fontSize: 13, color: "rgba(255,255,255,0.55)" }}
                />
              </div>
            )}
          </div>

          {cityGroups.length === 0 ? (
            <div style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.3)", fontSize: 14, padding: "40px 20px" }}>
              No cards match this filter.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {cityGroups.map(({ city, items }) => (
                <div key={city} ref={(el) => { cityRefs.current[city] = el; }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.6)", letterSpacing: 0.5, textTransform: "uppercase" as const, whiteSpace: "nowrap" }}>
                      {city}
                    </div>
                    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.10)" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {items.map(({ t, tid, expiresISO, state }) => (
                      <TerminalCard
                        key={tid}
                        t={t} tid={tid} expiresISO={expiresISO} state={state}
                        isFlipped={flippedId === tid}
                        isSelected={tid === String(location.selectedTerminalId)}
                        onFlipOpen={() => handleFlipOpen(tid)}
                        onFlipClose={handleFlipClose}
                        draft={flippedId === tid ? draft : { cardNumber: cardDataByTerminalId[tid]?.cardNumber ?? "", pin: cardDataByTerminalId[tid]?.pin ?? "", privateNote: cardDataByTerminalId[tid]?.privateNote ?? "" }}
                        updateDraft={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                        lastVisitISO={terminals.accessDateByTerminalId[tid] ?? ""}
                        onSetAccessDate={(iso) => terminals.setAccessDateForTerminal(tid, iso)}
                        confirmAction={flippedId === tid ? confirmAction : null}
                        setConfirmAction={setConfirmAction}
                        onOpenSourcing={() => setSourcingTerminal({ id: tid, name: String(t.terminal_name ?? tid) })}
                        onSelect={() => handleSelect(tid)}
                        onDeactivate={() => handleDeactivate(tid)}
                        onRemove={() => handleRemove(tid)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        style={{
          width: "100%", marginTop: 18, padding: "13px 0", borderRadius: 8,
          border: "1px dashed rgba(255,255,255,0.20)", background: "transparent",
          color: "rgba(255,255,255,0.4)", fontSize: 14, fontWeight: 700, cursor: "pointer",
        }}
      >
        + Add Terminal Card
      </button>

      <AddCardSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        terminalCatalog={terminals.terminalCatalog}
        myTerminalIdSet={myTerminalIdSet}
        onAdd={handleAddCard}
      />

      {sourcingTerminal && (
        <SourcingModal
          open={!!sourcingTerminal}
          onClose={() => setSourcingTerminal(null)}
          terminalId={sourcingTerminal.id}
          terminalName={sourcingTerminal.name}
          authUserId={authUserId}
        />
      )}
    </div>
  );
}
