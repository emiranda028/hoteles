"use client";

import { useEffect, useState } from "react";

/* =========================
   Tipos
========================= */

export type CsvRow = Record<string, any>;

export type UseCsvResult = {
  rows: CsvRow[];
  loading: boolean;
  error: string;
};

/* =========================
   Parser CSV simple (sin libs)
========================= */

function parseCSV(text: string): CsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const headers = lines[0]
    .split(",")
    .map(h => h.replace(/^"|"$/g, "").trim());

  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]
      .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
      .map(v => v.replace(/^"|"$/g, "").trim());

    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });

    rows.push(row);
  }

  return rows;
}

/* =========================
   Hook ÚNICO
========================= */

export function useCsvClient(filePath: string): UseCsvResult {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    setLoading(true);
    setError("");

    fetch(filePath, { cache: "no-store" })
      .then(res => {
        if (!res.ok) {
          throw new Error(`No se pudo leer CSV: ${filePath}`);
        }
        return res.text();
      })
      .then(text => {
        if (!alive) return;
        setRows(parseCSV(text));
        setLoading(false);
      })
      .catch(err => {
        if (!alive) return;
        setError(err?.message ?? "Error leyendo CSV");
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  return { rows, loading, error };
}

/* =========================
   Helpers numéricos
========================= */

export function num(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;

  if (typeof v === "string") {
    const n = Number(
      v.replace(/\./g, "").replace(",", ".").replace("%", "").trim()
    );
    return isNaN(n) ? 0 : n;
  }

  return 0;
}

export function pct(v: number): number {
  return v > 1 ? v / 100 : v;
}
