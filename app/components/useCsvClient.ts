"use client";

import { useEffect, useState } from "react";

/* =========================
   Tipos
========================= */

export type CsvRow = Record<string, any>;

export type CsvReadResult = {
  rows: CsvRow[];
  rawText?: string;
};

export type UseCsvResult = {
  rows: CsvRow[];
  loading: boolean;
  error: string;
};

/* =========================
   CSV parser robusto (sin libs)
   - respeta comillas
   - soporta comas dentro de comillas
========================= */

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // escape de comillas dobles "" dentro de campo
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((v) => v.trim());
}

function stripOuterQuotes(s: string): string {
  const t = String(s ?? "").trim();
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).trim();
  return t;
}

function parseCSV(text: string): CsvRow[] {
  if (!text) return [];

  // normaliza fin de línea
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  // headers
  const headerParts = splitCsvLine(lines[0]).map(stripOuterQuotes);
  const headers = headerParts.map((h, idx) => (h ? h : `col_${idx + 1}`));

  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i]).map(stripOuterQuotes);
    const row: CsvRow = {};

    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = parts[c] ?? "";
    }

    rows.push(row);
  }

  return rows;
}

/* =========================
   API COMPAT (clave)
   Muchos componentes viejos hacen:
     readCsvFromPublic(file).then(({ rows }) => ...)
========================= */

export async function readCsvFromPublic(path: string): Promise<CsvReadResult> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`No se pudo leer CSV: ${path} (${res.status})`);
  }
  const text = await res.text();
  const rows = parseCSV(text);
  return { rows, rawText: text };
}

/* =========================
   Hook
========================= */

export function useCsvClient(filePath: string): UseCsvResult {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    setLoading(true);
    setError("");

    readCsvFromPublic(filePath)
      .then(({ rows }) => {
        if (!alive) return;
        setRows(rows);
        setLoading(false);
      })
      .catch((err) => {
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

  const s = String(v).trim();
  if (!s) return 0;

  // 22.441,71  -> 22441.71
  // 59,40%     -> 59.40
  const cleaned = s.replace(/\./g, "").replace(",", ".").replace("%", "").trim();
  const n = Number(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

/** Convierte a proporción 0..1 si viene en % (59,4 -> 0,594) */
export function pct01(v: any): number {
  const n = num(v);
  return n > 1 ? n / 100 : n;
}


