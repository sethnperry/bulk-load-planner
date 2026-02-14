"use client";

import { useMemo } from "react";
import { normCity, normState } from "../utils/normalize";

type BaseTerminal = {
  terminal_id?: any;
  terminal_name?: any;
  state?: any;
  city?: any;
};

export function useTerminalFilters<TMy extends BaseTerminal & { starred?: any }, TCat extends BaseTerminal>(args: {
  terminals: TMy[];
  terminalCatalog: TCat[];
  selectedState: string;
  selectedCity: string;
  myTerminalIdSet: Set<string>;
}) {
  const { terminals, terminalCatalog, selectedState, selectedCity, myTerminalIdSet } = args;

  const terminalsFiltered = useMemo(() => {
    return (terminals ?? [])
      .filter(
        (t) => normState(t.state ?? "") === normState(selectedState) && normCity(t.city ?? "") === normCity(selectedCity)
      )
      .sort((a, b) => {
        const aStar = Boolean((a as any).starred);
        const bStar = Boolean((b as any).starred);
        if (aStar !== bStar) return aStar ? -1 : 1;
        return String((a as any).terminal_name ?? "").localeCompare(String((b as any).terminal_name ?? ""));
      });
  }, [terminals, selectedState, selectedCity]);

  const catalogTerminalsInCity = useMemo(() => {
    return (terminalCatalog ?? [])
      .filter(
        (t) => normState((t as any).state ?? "") === normState(selectedState) && normCity((t as any).city ?? "") === normCity(selectedCity)
      )
      .sort((a, b) => {
        const aInMy = myTerminalIdSet.has(String((a as any).terminal_id));
        const bInMy = myTerminalIdSet.has(String((b as any).terminal_id));
        if (aInMy !== bInMy) return aInMy ? -1 : 1;
        return String((a as any).terminal_name ?? "").localeCompare(String((b as any).terminal_name ?? ""));
      });
  }, [terminalCatalog, selectedState, selectedCity, myTerminalIdSet]);

  return { terminalsFiltered, catalogTerminalsInCity };
}
