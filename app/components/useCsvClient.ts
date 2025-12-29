"use client";

import { useEffect, useState } from "react";

/* =====================================================
   Tipos
===================================================== */

export type CsvRow = Record<string, any>;

export type CsvReadResult = {
  rows: CsvRow[];
};

/* =====================================================
   Fetch + parse CSV (SIN papaparse)
===================================================== */

export async function readCsvFromPublic(path: string): Promise<CsvReadResult> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`No se pudo leer CSV: ${path} (${res.status})`);
  }

  const text = await res.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { rows: [] };

  const headers = splitCsvLine(lines[0]);

  const rows: CsvRow[] = lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const obj: CsvRow = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = values[i]?.trim() ?? "";
    });
    return obj;
  });

  return { rows };
}

/* =====================================================
   CSV split (maneja comillas)
===================================================== */

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];

    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (c === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += c;
  }

  result.push(current);
  return result;
}

/* =====================================================
   Hook genérico
===================================================== */

export function useCsv(path: string) {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");

    readCsvFromPublic(path)
      .then((r) => {
        if (!alive) return;
        setRows(r.rows);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e.message ?? "Error leyendo CSV");
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [path]);

  return { rows, loading, error };
}

/* =====================================================
   Helpers NUMÉRICOS (CLAVE)
===================================================== */

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;

  if (typeof v === "string") {
    const cleaned = v
      .replace(/\./g, "")     // miles
      .replace(",", ".")      // decimales
      .replace("%", "")
      .trim();

    const n = Number(cleaned);
    return isNaN(n) ? 0 : n;
  }

  return 0;
}

/** Convierte % a 0–1 si viene 59,4 → 0,594 */
export function toPercent01(v: number): number {
  if (!isFinite(v)) return 0;
  return v > 1 ? v / 100 : v;
}

export function safeDiv(a: number, b: number): number {
  if (!isFinite(a) || !isFinite(b) || b === 0) return 0;
  return a / b;
}

/* =====================================================
   Fechas (MUY importante para H&F)
===================================================== */

export function parseDateSmart(row: CsvRow): Date | null {
  const raw =
    row.Fecha ??
    row.Date ??
    row.FECHA ??
    row.DATE ??
    row.fecha ??
    row.date ??
    null;

  if (!raw) return null;

  // Excel serial
  if (typeof raw === "number" && raw > 1000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + raw * 86400000);
  }

  if (typeof raw === "string") {
    const s = raw.trim();
    const token = s.split(" ")[0];

    // ISO
    const d1 = new Date(s);
    if (!isNaN(d1.getTime())) return d1;

    const d2 = new Date(token);
    if (!isNaN(d2.getTime())) return d2;

    // dd/mm/yyyy
    const m = token.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      let y = Number(m[3]);
      if (y < 100) y += 2000;
      return new Date(y, Number(m[2]) - 1, Number(m[1]));
    }
  }

  return null;
}

/* =====================================================
   Normalizaciones CLAVE
===================================================== */

export function normalizeHotel(v: any): string {
  return String(v ?? "").trim().toUpperCase();
}

export function normalizeHof(v: any): "H" | "F" | "" {
  const s = String(v ?? "").toUpperCase();
  if (s.startsWith("H")) return "H";
  if (s.startsWith("F")) return "F";
  return "";
}

export function readOcc01(row: CsvRow): number {
  const v =
    row["Occ.%"] ??
    row["Occ%"] ??
    row["OCC.%"] ??
    row["Ocupación"] ??
    row["Occupancy"];

  return toPercent01(toNumberSmart(v));
}

/* =====================================================
   Formatters
===================================================== */

export function formatMoney(n: number): string {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatPct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}
