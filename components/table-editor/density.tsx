"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { readDensity, writeDensity, type Density } from "./column-prefs";

/**
 * Row density, shared between the toolbar control and the grid that obeys it.
 *
 * They are siblings under a Server Component, so neither can own the state — hence a context rather
 * than a prop. It is the only piece of view state both halves need; column layout stays inside the
 * grid where it is used.
 */
type DensityValue = { density: Density; setDensity: (next: Density) => void };

const DensityContext = createContext<DensityValue | null>(null);

export function DensityProvider({ children }: { children: ReactNode }) {
  // Storage is browser-only, so the server renders the default and the stored value arrives after.
  const [density, set] = useState<Density>("normal");
  useEffect(() => {
    set(readDensity());
  }, []);

  const value = useMemo<DensityValue>(
    () => ({
      density,
      setDensity: (next) => {
        set(next);
        writeDensity(next);
      },
    }),
    [density],
  );

  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>;
}

export function useDensity(): DensityValue {
  const ctx = useContext(DensityContext);
  if (!ctx) throw new Error("useDensity must be used inside DensityProvider");
  return ctx;
}
