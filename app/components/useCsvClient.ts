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
   CSV Parser ROBUSTO (sin libs)
   - respeta comillas
   - soporta comas dentro de comillas
   - soporta saltos de línea dentro de comillas  ✅ (CLAVE para hf_diario.csv)
   - soporta comillas escapadas "" dentro de un campo
========================= */

function parseCSV(text: string): CsvRow[] {
  if (!text) return [];

  // Normalizo saltos de línea (pero NO hago split por líneas)
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    // Evito filas totalmente vacías
    const allEmpty = row.every((x) => String(x ?? "").trim() === "");
    if (!allEmpty) rows.push(row);
    row = [];
  };

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (ch === '"') {
      const next = s[i + 1];

      // "" dentro de comillas => comilla escapada
      if (inQuotes && next === '"') {
        field += '"';
        i++; // salto la segunda comilla
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    // separador de columna
    if (ch === "," && !inQuotes) {
      pushField();
      continue;
    }

    // fin de línea (solo si NO estamos dentro de comillas)
    if (ch === "\n" && !inQuotes) {
      pushField();
      pushRow();
      continue;
    }

    // carácter normal (incluye \n si está dentro de comillas)
    field += ch;
  }

  // flush final
  pushField();
  pushRow();

  if (!rows.length) return [];

  // Headers
  const headersRaw = rows[0] ?? [];
  const headers = headersRaw.map((h, idx) => {
    const clean = String(h ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return clean || `col_${idx + 1}`;
  });

  // Data
  const out: CsvRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const values = rows[r] ?? [];
    const obj: CsvRow = {};

    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      const v = values[c] ?? "";
      obj[key] = String(v).trim();
    }

    out.push(obj);
  }

  return out;
}

/* =========================
   API COMPAT (clave)
   Muchos componentes hacen:
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
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace("%", "");

  const n = Number(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

/** Convierte a proporción 0..1 si viene en % (59,4 -> 0,594) */
export function pct01(v: any): number {
  const n = num(v);
  return n > 1 ? n / 100 : n;
}

/* =========================
   Helpers COMPAT (para no romper componentes viejos)
   Antes estaban en csvClient.ts
========================= */

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

// Alias clásicos
export function toNumberSmart(v: any): number {
  return num(v);
}

export function toPercent01(v: any): number {
  return pct01(v);
}

export function formatMoney(n: number): string {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatPct(n01: number): string {
  return (n01 * 100).toFixed(1) + "%";
}

/* =========================
   Alias de compatibilidad FINAL
   (para componentes legacy)
========================= */

// algunos componentes llaman formatPct01
export function formatPct01(v: any): string {
  const n01 = pct01(v);
  return (n01 * 100).toFixed(1) + "%";
}

