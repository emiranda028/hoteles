"use client";

import * as XLSX from "xlsx";

export type CsvReadResult<T = any> = {
  rows: T[];
  sheetName: string;
  sheetNames: string[];
};

/**
 * Normaliza headers “raros”:
 * - quita saltos de línea
 * - colapsa espacios
 * - trim
 */
function normalizeHeader(h: string) {
  return String(h ?? "")
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeObjKeys(obj: any) {
  const out: any = {};
  for (const k of Object.keys(obj ?? {})) {
    out[normalizeHeader(k)] = obj[k];
  }
  return out;
}

/**
 * Lee CSV desde /public usando XLSX (mucho más robusto que split por \n porque
 * soporta comillas, separadores, y headers con newlines).
 */
export async function readCsvFromPublic(path?: string): Promise<CsvReadResult> {
  if (!path) throw new Error("No se pudo cargar CSV: filePath vacío/undefined");

  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`No se pudo cargar ${path} (status ${res.status})`);
  }

  const text = await res.text();

  // XLSX puede “leer” CSV como workbook (1 hoja)
  const wb = XLSX.read(text, { type: "string" });
  const sheetNames = wb.SheetNames ?? [];
  if (sheetNames.length === 0) return { rows: [], sheetName: "", sheetNames: [] };

  const bestSheet = sheetNames[0];
  const ws = wb.Sheets[bestSheet];
  if (!ws) return { rows: [], sheetName: bestSheet, sheetNames };

  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];
  const rows = rawRows.map(normalizeObjKeys);

  return { rows, sheetName: bestSheet, sheetNames };
}
