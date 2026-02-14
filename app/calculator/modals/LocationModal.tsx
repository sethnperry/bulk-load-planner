"use client";

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

type StateOption = { code: string; name?: string | null };

export default function LocationModal(props: {
  open: boolean;
  onClose: () => void;

  // State picker
  selectedState: string;
  selectedStateLabel: string;

  statesError: string | null;
  statesLoading: boolean;
  statePickerOpen: boolean;
  setStatePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  stateOptions: StateOption[];

  setSelectedState: (code: string) => void;

  // City picker
  selectedCity: string;
  citiesLoading: boolean;
  citiesError: string | null;
  cities: string[];

  topCities: string[];
  allCities: string[];

  setSelectedCity: (city: string) => void;

  // helpers from page.tsx (keep logic centralized)
  normState: (s: string) => string;
  toggleCityStar: (state: string, city: string) => void;
  isCityStarred: (state: string, city: string) => boolean;
  starBtnClass: (starred: boolean) => string;

  // to preserve existing behavior (modal closes on city select)
  setLocOpen: (open: boolean) => void;
}) {
  const {
    open,
    onClose,

    selectedState,
    selectedStateLabel,

    statesError,
    statesLoading,
    statePickerOpen,
    setStatePickerOpen,
    stateOptions,

    setSelectedState,

    selectedCity,
    citiesLoading,
    citiesError,
    cities,

    topCities,
    allCities,

    setSelectedCity,

    normState,
    toggleCityStar,
    isCityStarred,
    starBtnClass,

    setLocOpen,
  } = props;

  return (
    <FullscreenModal open={open} title="Select Location" onClose={onClose} footer={null}>
      <div className="space-y-4">
        <div className="text-sm text-white/70">Choose your loading city.</div>

        {/* STATE (compact / set-and-forget) */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-white/50">State</div>
              <div className="mt-1 text-sm font-semibold">{selectedState ? selectedStateLabel : "Select a state"}</div>
              {statesError ? <div className="mt-1 text-xs text-red-400">{statesError}</div> : null}
            </div>

            <button
              onClick={() => setStatePickerOpen((v) => !v)}
              className="rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
            >
              {statePickerOpen ? "Close" : "Change"}
            </button>
          </div>

          {statePickerOpen ? (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {statesLoading ? (
                <div className="col-span-2 sm:col-span-3 text-sm text-white/60">Loading states…</div>
              ) : (
                stateOptions.map((s) => {
                  const active = normState(s.code) === normState(selectedState);
                  return (
                    <button
                      key={s.code}
                      onClick={() => {
                        setSelectedState(s.code);
                        setStatePickerOpen(false);
                      }}
                      className={[
                        "rounded-2xl border px-3 py-3 text-left",
                        active ? "border-white/30 bg-white/5" : "border-white/10 hover:bg-white/5",
                      ].join(" ")}
                    >
                      <div className="text-sm font-semibold">
                        {s.code} — {s.name || s.code}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>

        {/* CITY (cards) */}
        <div>
          {!selectedState ? (
            <div className="text-sm text-white/50">Select a state first.</div>
          ) : citiesLoading ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
              Loading cities…
            </div>
          ) : citiesError ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-red-400">
              {citiesError}
            </div>
          ) : cities.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
              No cities available yet.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Top Cities (manual starred) */}
              {topCities.length ? (
                <div>
                  <div className="mb-2 text-xs uppercase tracking-wide text-white/50">Top Cities</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {topCities.map((c) => {
                      const active = c === selectedCity;
                      return (
                        <div
                          key={`top-${c}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setSelectedCity(c);
                            setLocOpen(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedCity(c);
                              setLocOpen(false);
                            }
                          }}
                          className={[
                            "rounded-2xl border px-4 py-3 text-left cursor-pointer select-none",
                            active ? "border-white/30 bg-white/5" : "border-white/10 hover:bg-white/5",
                          ].join(" ")}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold">{c}</div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCityStar(selectedState, c);
                              }}
                              aria-label="Unstar city"
                              className={starBtnClass(true)}
                            >
                              ★
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Ghost divider */}
              {topCities.length ? <div className="h-px w-full bg-white/10" /> : null}

              {/* All Cities (non-starred only) */}
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-white/50">All Cities</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {allCities.map((c) => {
                    const active = c === selectedCity;
                    const starred = isCityStarred(selectedState, c);

                    return (
                      <div
                        key={c}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedCity(c);
                          setLocOpen(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedCity(c);
                            setLocOpen(false);
                          }
                        }}
                        className={[
                          "rounded-2xl border px-4 py-3 text-left cursor-pointer select-none",
                          active ? "border-white/30 bg-white/5" : "border-white/10 hover:bg-white/5",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold">{c}</div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCityStar(selectedState, c);
                            }}
                            aria-label={starred ? "Unstar city" : "Star city"}
                            className={starBtnClass(starred)}
                          >
                            {starred ? "★" : "☆"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </FullscreenModal>
  );
}
