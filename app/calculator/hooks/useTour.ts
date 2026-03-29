"use client";
// hooks/useTour.ts

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type TourStep = {
  targetId: string;
  title: string;
  message: string;
  waitFor?: "tap" | "state";
  position?: "top" | "bottom" | "center";
  // center steps only: show "OK I'll do it" to collapse, or "Next compartment / Move on" choice
  collapseLabel?: string;
  nextLabel?: string;       // shown as a second button on center steps
  onNext?: "advance";       // what nextLabel does
};

export type TourDef = {
  id: string;
  steps: TourStep[];
};

export type TourState = {
  active: boolean;
  tourId: string | null;
  stepIndex: number;
  currentStep: TourStep | null;
  targetRect: DOMRect | null;
  advance: () => void;
  skip: () => void;
};

const TOURS: Record<string, TourDef> = {
  setup: {
    id: "setup",
    steps: [
      // 1 — equipment button
      {
        targetId: "tour-equipment-btn",
        title: "Step 1 — Select your equipment",
        message: "Tap here to open the equipment selector.",
        waitFor: "tap",
        position: "bottom",
      },
      // 2 — browse fleet button (inside equipment modal)
      {
        targetId: "tour-fleet-btn",
        title: "Step 2 — Browse the fleet",
        message: "Tap here to find and couple your units.",
        waitFor: "tap",
        position: "top",
      },
      // 3 — instruction: pick/couple equipment, hidden while user acts, auto-advances when combo selected + modal closed
      {
        targetId: "tour-fleet-instruction",
        title: "Step 3 — Find your equipment",
        message: "If your unit is already coupled, tap the combo card or use Slip Seat. If not yet coupled, pick a region, select a truck and trailer, then tap Couple. Star a combo to pin it. When done, close the Equipment modal.",
        waitFor: "state",
        position: "center",
        collapseLabel: "OK, I'll do it",
      },
      // 4 — location button tap, then hide tour until city selected + modal closed
      {
        targetId: "tour-location-btn",
        title: "Step 4 — Set your location",
        message: "Tap here to pick the state and city you are loading in.",
        waitFor: "tap",
        position: "bottom",
      },
      // 5 — hidden while user picks state + city, auto-advances when modal closes with city set
      {
        targetId: "tour-location-instruction",
        title: "Step 5 — Pick your city",
        message: "Select your state then choose the city you are loading in.",
        waitFor: "state",
        position: "center",
        collapseLabel: "OK, I'll do it",
      },
      // 6 — terminal button, tooltip ABOVE the button
      {
        targetId: "tour-terminal-btn",
        title: "Step 6 — Select your terminal",
        message: "Tap here to open My Terminals and pick the terminal you are loading at.",
        waitFor: "tap",
        position: "top",
      },
      // 6a — instruction inside terminal modal, hidden while user picks
      {
        targetId: "tour-terminal-instruction",
        title: "Step 6a — Pick your terminal",
        message: "Tap any terminal from the list to select it, then close the modal.",
        waitFor: "state",
        position: "center",
        collapseLabel: "OK, I'll do it",
      },
      // 7 — highlight ALL compartments area, tooltip ABOVE
      {
        targetId: "tour-comp-area",
        title: "Step 7 — Configure compartments",
        message: "Tap each compartment to set its headspace cap and product. Do this once per trailer.",
        waitFor: "tap",
        position: "top",
      },
      // 7a — instruction inside compartment modal, hidden while user configures
      //      has two buttons: "Next compartment" (collapse) and "Move to Step 9" (advance)
      {
        targetId: "tour-comp-instruction",
        title: "Step 7a — Set cap and product",
        message: "Adjust the headspace cap and select a product for this compartment, then tap Done.",
        waitFor: "tap",
        position: "center",
        collapseLabel: "Next compartment",
        nextLabel: "Move to Step 9",
        onNext: "advance",
      },
      // 8 — CG slider
      {
        targetId: "tour-cg-slider",
        title: "Step 8 — Adjust the CG",
        message: "Slide to shift weight distribution between axles. Center is neutral. Adjust this before saving your plan.",
        waitFor: "tap",
        position: "top",
      },
      // 9 — plan slots
      {
        targetId: "tour-plan-slots",
        title: "Step 9 — Save a plan slot",
        message: "Hold any slot (A-E) to save this plan for this terminal. Next time just tap to load it instantly.",
        waitFor: "tap",
        position: "top",
      },
      // 10 — completion
      {
        targetId: "tour-complete",
        title: "Setup complete",
        message: "You are all set. Next time you load here, open the app, select this terminal, and tap your saved slot. The plan loads instantly.",
        waitFor: "tap",
        position: "center",
        collapseLabel: "Done",
      },
    ],
  },
};

export function useTour(opts: {
  stateConditions?: Record<string, boolean>;
}): TourState {
  const router = useRouter();
  const [tourId, setTourId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const param = params.get("tour");
    if (param && TOURS[param]) {
      setTourId(param);
      setStepIndex(0);
    }
  }, []);

  const tour = tourId ? TOURS[tourId] : null;
  const currentStep = tour ? (tour.steps[stepIndex] ?? null) : null;

  useEffect(() => {
    if (!currentStep) { setTargetRect(null); return; }
    function measure() {
      const el = document.getElementById(currentStep!.targetId);
      if (el) {
        setTargetRect(el.getBoundingClientRect());
      } else {
        setTargetRect(null);
      }
      rafRef.current = requestAnimationFrame(measure);
    }
    rafRef.current = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(rafRef.current);
  }, [currentStep]);

  const advance = useCallback(() => {
    if (!tour) return;
    const next = stepIndex + 1;
    if (next >= tour.steps.length) {
      setTourId(null);
      router.replace("/calculator");
    } else {
      setStepIndex(next);
    }
  }, [tour, stepIndex, router]);

  const skip = useCallback(() => {
    setTourId(null);
    router.replace("/calculator");
  }, [router]);

  // Auto-advance state steps when condition fires
  useEffect(() => {
    if (!currentStep || currentStep.waitFor !== "state") return;
    const cond = opts.stateConditions?.[currentStep.targetId];
    if (cond) advance();
  }, [currentStep, opts.stateConditions, advance]);

  return {
    active: !!tourId && !!currentStep,
    tourId,
    stepIndex,
    currentStep,
    targetRect,
    advance,
    skip,
  };
}
