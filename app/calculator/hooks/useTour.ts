"use client";
// hooks/useTour.ts
// Lightweight guided tour engine.
// Tours are defined as arrays of steps. Each step highlights a DOM element
// by ID, shows a tooltip, and waits for a completion condition before advancing.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type TourStep = {
  targetId: string;           // id of the DOM element to highlight
  title: string;              // short heading
  message: string;            // instruction
  waitFor?: "tap" | "state"; // "tap" = advance when user taps target; "state" = advance when condition is true
  position?: "top" | "bottom" | "center"; // tooltip position relative to target
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
      {
        targetId: "tour-equipment-btn",
        title: "Select your equipment",
        message: "Tap here to open the equipment selector.",
        waitFor: "tap",
        position: "bottom",
      },
      {
        targetId: "tour-fleet-btn",
        title: "Browse the fleet",
        message: "Tap Browse fleet & couple equipment to find your units.",
        waitFor: "tap",
        position: "bottom",
      },
      {
        targetId: "tour-fleet-couple",
        title: "Couple or select",
        message: "Pick a truck and trailer then tap Couple. Already coupled? Tap the combo or use Slip Seat. Star a combo to pin it for quick access.",
        waitFor: "tap",
        position: "bottom",
      },
      {
        targetId: "tour-location-btn",
        title: "Set your location",
        message: "Tap here to select the state and city you are loading in.",
        waitFor: "tap",
        position: "top",
      },
      {
        targetId: "tour-terminal-btn",
        title: "Select your terminal",
        message: "Tap here to choose the terminal you are loading at.",
        waitFor: "tap",
        position: "top",
      },
      {
        targetId: "tour-comp-bar-first",
        title: "Set compartment caps",
        message: "Tap any compartment to set the headspace cap — the percentage to leave empty for expansion. Do this once per trailer.",
        waitFor: "tap",
        position: "bottom",
      },
      {
        targetId: "tour-plan-slot-A",
        title: "Save a plan slot",
        message: "Set up a load in the compartments, then hold this button to save it as a preset for this terminal. Next time — just tap to load.",
        waitFor: "tap",
        position: "top",
      },
    ],
  },
};

export function useTour(opts: {
  // Pass true when a condition is met to auto-advance a "state" step
  stateConditions?: Record<string, boolean>;
}): TourState {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tourId, setTourId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number>(0);

  // Start tour from URL param
  useEffect(() => {
    const param = searchParams?.get("tour");
    if (param && TOURS[param]) {
      setTourId(param);
      setStepIndex(0);
    }
  }, [searchParams]);

  const tour = tourId ? TOURS[tourId] : null;
  const currentStep = tour ? (tour.steps[stepIndex] ?? null) : null;

  // Track target element position (RAF loop so it follows scroll/resize)
  useEffect(() => {
    if (!currentStep) { setTargetRect(null); return; }
    function measure() {
      const el = document.getElementById(currentStep!.targetId);
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
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
      // Tour complete
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

  // Auto-advance "state" steps when condition becomes true
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
