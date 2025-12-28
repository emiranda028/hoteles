// app/components/HofDataProvider.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { readCsvFromPublic, CsvRow } from "./useCsvClient";
import {
  GlobalHotel,
  HofFlag,
  HofRow,
  normalizeHofRows,
  filterByHotel,
  filterByYear,
  filterByHoF,
  availableYears,
  detectedHotels,
} from "./hofModel";

type HofContextValue = {
  loading: boolean;
  error: string;

  rawCsvRows: CsvRow[];
  rows: HofRow[];

  // data source
  filePath: string;

  // filtros comunes
  year: number; // año activo
  setYear: (y: number) => void;

  baseYear: number; // año comparativo
  setBaseYear: (y: number) => void;

  hof: HofFlag | "All";
  setHof: (v: HofFlag | "All") => void;

  // filtros por bloque
  jcrHotel: Exclude<GlobalHotel, "MAITEI">;
  setJcrHotel: (h: Exclude<GlobalHotel, "MAITEI">) => void;

  maiteiOn: boolean; // para habilitar bloque Gotel
  setMaiteiOn: (v: boolean) => void;

  // derivados
  jcrRows: HofRow[]; // ya filtrado por año/hof/hotel JCR
  maiteiRows: HofRow[]; // ya filtrado por año/hof/MAITEI

  yearsAvailableJcr: number[];
  yearsAvailableMaitei: number[];

  hotelsDetected: string[];
};

const HofContext = createContext<HofContextValue | null>(null);

export function HofDataProvider({
  children,
  filePath = "/data/hf_diario.csv",
  defaultYear = 2025,
  defaultBaseYear = 2024,
  defaultJcrHotel = "MARRIOTT",
}: {
  children: React.ReactNode;
  filePath?: string;
  defaultYear?: number;
  defaultBaseYear?: number;
  defaultJcrHotel?: Exclude<GlobalHotel, "MAITEI">;
}) {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const [rawCsvRows, setRawCsvRows] = useState<CsvRow[]>([]);
  const [rows, setRows] = useState<HofRow[]>([]);

  // filtros
  const [year, setYear] = useState<number>(defaultYear);
  const [baseYear, setBaseYear] = useState<number>(defaultBaseYear);
  const [hof, setHof] = useState<HofFlag | "All">("All");

  const [jcrHotel, setJcrHotel] = useState<Exclude<GlobalHotel, "MAITEI">>(defaultJcrHotel);
  const [maiteiOn, setMaiteiOn] = useState<boolean>(true);

  // carga CSV
  useEffect(() => {
    let alive = true;

    setLoading(true);
    setError("");

    readCsvFromPublic(filePath)
      .then((data) => {
        if (!alive) return;

        // data es CsvRow[]
        setRawCsvRows(data);

        const normalized = normalizeHofRows(data);
        setRows(normalized);

        setLoading(false);

        // si defaultYear no existe, ajusto al último disponible (ideal 2025)
        const years = availableYears(normalized);
        if (years.length > 0) {
          const hasDefault = years.includes(defaultYear);
          if (!hasDefault) {
            const last = years[years.length - 1];
            setYear(last);
          }
          // baseYear: si no existe, el anterior al year o el primero
          const by = years.includes(defaultBaseYear) ? defaultBaseYear : years[Math.max(0, years.length - 2)] ?? years[0];
          setBaseYear(by);
        }
      })
      .catch((e: any) => {
        if (!alive) return;
        setError(e?.message ? `No se pudo leer CSV: ${filePath} (${e.message})` : `No se pudo leer CSV: ${filePath}`);
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath, defaultYear, defaultBaseYear]);

  // detectados (para debug / ver nombres reales en Empresa)
  const hotelsDetected = useMemo(() => detectedHotels(rows), [rows]);

  // years disponibles por bloque
  const yearsAvailableJcr = useMemo(() => {
    const set = new Set<number>();
    for (const h of ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"] as const) {
      availableYears(rows, h).forEach((y) => set.add(y));
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [rows]);

  const yearsAvailableMaitei = useMemo(() => availableYears(rows, "MAITEI"), [rows]);

  // filtrado JCR: hotel elegido (solo esos 3), año y HoF
  const jcrRows = useMemo(() => {
    let r = rows;

    // JCR siempre excluye MAITEI
    r = r.filter((x) => x.empresa !== "MAITEI");

    // hotel puntual elegido
    r = filterByHotel(r, jcrHotel);

    // filtros comunes
    r = filterByYear(r, year);
    r = filterByHoF(r, hof);

    return r;
  }, [rows, jcrHotel, year, hof]);

  // filtrado MAITEI: solo si maiteiOn, año y HoF
  const maiteiRows = useMemo(() => {
    if (!maiteiOn) return [];
    let r = rows;
    r = filterByHotel(r, "MAITEI");
    r = filterByYear(r, year);
    r = filterByHoF(r, hof);
    return r;
  }, [rows, maiteiOn, year, hof]);

  const value: HofContextValue = {
    loading,
    error,

    rawCsvRows,
    rows,

    filePath,

    year,
    setYear,

    baseYear,
    setBaseYear,

    hof,
    setHof,

    jcrHotel,
    setJcrHotel,

    maiteiOn,
    setMaiteiOn,

    jcrRows,
    maiteiRows,

    yearsAvailableJcr,
    yearsAvailableMaitei,

    hotelsDetected,
  };

  return <HofContext.Provider value={value}>{children}</HofContext.Provider>;
}

export function useHofData() {
  const ctx = useContext(HofContext);
  if (!ctx) throw new Error("useHofData debe usarse dentro de HofDataProvider");
  return ctx;
}
