"use client";

import { useEffect, useState } from "react";

/* =============================
   Tipos base
============================= */

export type CsvRow = Record<string, any>;

export type CsvReadResult = {
  rows: CsvRow[];
  headers: string[];
};

/* =============================
   Loader CSV (fetch + parse)
============================= */

function parseCSV(text: string): CsvReadResult {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { rows: [], headers: [] };
  }

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

  return { rows, headers };
}

export async function readCsvFromPublic(path: string): Promise<CsvReadResult> {
  const res = await fetch(path, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`No se pudo leer CSV: ${path} (${res.status})`);
  }

  const text = await res.text();
  return parseCSV(text);
}

/* =============================
   Hook principal
============================= */

export function useCsvClient(filePath: string) {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let alive = true;

    setLoading(true);
    setError("");

    readCsvFromPublic(filePath)
      .then(r => {
        if (!alive) return;
        setRows(r.rows);
        setHeaders(r.headers);
        setLoading(false);
      })
      .catch(e => {
        if (!alive) return;
        setError(e?.message ?? "Error leyendo CSV");
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  return { rows, headers, loading, error };
}

/* =============================
   Helpers numéricos
============================= */

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;

  if (typeof v === "string") {
    const cleaned = v
      .replace(/\./g, "")
      .replace(",", ".")
      .replace("%", "")
      .trim();

    const n = Number(cleaned);
    return isNaN(n) ? 0 : n;
  }

  return 0;
}

export function toPercent01(v: number): number {
  if (v > 1) return v / 100;
  return v;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function formatMoneyUSD0(n: number): string {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatPct01(n: number): string {
  return (n * 100).toFixed(1) + "%";
}
