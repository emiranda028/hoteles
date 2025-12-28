// app/components/HofDataProvider.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { readCsvFromPublic, CsvRow } from "./useCsvClient";
import { buildHofRows, HofRow, HF_PATH } from "./hofModel";

/**
 * Cache simple en memoria (para no refetchear en cada componente)
 */
type Cache = {
  path: string;
  raw?: CsvRow[];
  rows?: HofRow[];
  loadedAt?: number;
};
let HOF_CACHE: Cache | null = null;

type HofCtxValue = {
  loading: boolean;
  error: string;
  rows: HofRow[];
  sourcePath: string;
  reload: () => void;
};

const HofContext = createContext<HofCtxValue | null>(null);

export function HofDataProvider(props: { children: React.ReactNode; filePath?: string }) {
  const filePath = props.filePath ?? HF_PATH;

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [rows, setRows] = useState<HofRow[]>([]);
  const [tick, setTick] = useState<number>(0);

  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError("");

      try {
        // cache hit
        if (HOF_CACHE && HOF_CACHE.path === filePath && HOF_CACHE.rows && HOF_CACHE.rows.length) {
          if (!alive) return;
          setRows(HOF_CACHE.rows);
          setLoading(false);
          return;
        }

        const raw = await readCsvFromPublic(filePath);
        const normalized = buildHofRows(raw);

        // guardar cache
        HOF_CACHE = {
          path: filePath,
          raw,
          rows: normalized,
          loadedAt: Date.now(),
        };

        if (!alive) return;
        setRows(normalized);
        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? `No se pudo leer CSV: ${filePath}`);
        setRows([]);
        setLoading(false);
      }
    }

    run();

    return () => {
      alive = false;
    };
  }, [filePath, tick]);

  const value = useMemo<HofCtxValue>(
    () => ({
      loading,
      error,
      rows,
      sourcePath: filePath,
      reload,
    }),
    [loading, error, rows, filePath]
  );

  return <HofContext.Provider value={value}>{props.children}</HofContext.Provider>;
}

export function useHofData() {
  const ctx = useContext(HofContext);
  if (!ctx) throw new Error("useHofData debe usarse dentro de HofDataProvider");
  return ctx;
}
