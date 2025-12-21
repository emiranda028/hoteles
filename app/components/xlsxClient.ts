"use client";

import * as XLSX from "xlsx";

export type ReadResult = {
  rows: any[];
  sheetName: string;
  sheetNames: string[];
};

function normKey(k: any) {
  return String(k ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function scoreRows(rows: any[]) {
  if (!rows || rows.length === 0) return 0;

  const keys = Object.keys(rows[0] ?? {});
  const keySet = new Set(keys.map(normKey));

  const hasEmpresa = keySet.has("empresa");
  const hasBonboy = keySet.has("bonboy") || keySet.has("membership") || keySet.has("membresia");
  const hasCantidad = keySet.has("cantidad") || keySet.has("qty") || keySet.has("cant");
  const hasFecha = keySet.has("fecha") || keySet.has("date");

  let score = keys.length;
  if (hasEmpresa) score += 50;
  if (hasBonboy) score += 25;
  if (hasCantidad) score += 25;
  if (hasFecha) score += 15;

  score += Math.min(rows.length, 300) / 10;
  return score;
}

export async function readXlsxFromPublic(path?: string): Promise<ReadResult> {
  if (!path) throw new Error("No se pudo cargar: filePath está vacío/undefined");

  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (status ${res.status})`);

  const buffer = await res.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  const sheetNames = wb.SheetNames ?? [];
  if (sheetNames.length === 0) return { rows: [], sheetName: "", sheetNames: [] };

  let bestSheet = sheetNames[0];
  let bestRows: any[] = [];
  let bestScore = -1;

  for (let i = 0; i < sheetNames.length; i++) {
    const name = sheetNames[i];
    const ws = wb.Sheets[name];
    if (!ws) continue;

    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];
    const s = scoreRows(rows);

    if (s > bestScore) {
      bestScore = s;
      bestSheet = name;
      bestRows = rows;
    }
  }

  return { rows: bestRows, sheetName: bestSheet, sheetNames };
}

// Helpers exportables
export function normalizeHeaderMap(row: any) {
  const out: Record<string, string> = {};
  const keys = Object.keys(row ?? {});
  for (let i = 0; i < keys.length; i++) {
    out[normKey(keys[i])] = keys[i];
  }
  return out;
}

export function pickKey(hmap: Record<string, string>, candidates: string[]) {
  for (let i = 0; i < candidates.length; i++) {
    const k = hmap[normKey(candidates[i])];
    if (k) return k;
  }
  return "";
}

export function excelDateToJS(d: any): Date | null {
  // Si ya es Date:
  if (d instanceof Date && !isNaN(d.getTime())) return d;

  // Excel serial (46000 etc):
  const n = Number(d);
  if (!isNaN(n) && n > 30000 && n < 60000) {
    // Excel epoch 1899-12-30
    const ms = Math.round((n - 25569) * 86400 * 1000);
    const dt = new Date(ms);
    if (!isNaN(dt.getTime())) return dt;
  }

  // string date:
  const s = String(d ?? "").trim();
  if (!s) return null;

  // dd-mm-yy / dd-mm-yyyy / dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    const dt = new Date(yy, mm - 1, dd);
    if (!isNaN(dt.getTime())) return dt;
  }

  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt;

  return null;
}
