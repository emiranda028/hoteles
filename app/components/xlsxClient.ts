"use client";

import * as XLSX from "xlsx";

export type ReadResult = {
  rows: any[];
  sheetName: string;
  sheetNames: string[];
};

function normKey(k: any) {
  return String(k ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRowKeys(row: any) {
  const out: any = {};
  Object.keys(row ?? {}).forEach((k) => {
    out[normKey(k)] = row[k];
  });
  return out;
}

function scoreRows(rows: any[]) {
  if (!rows || rows.length === 0) return 0;

  const keys = Object.keys(rows[0] ?? {});
  const keySet = new Set(keys.map((k) => normKey(k).toLowerCase()));

  const hasEmpresa = keySet.has("empresa") || keySet.has("hotel");
  const hasBonboy = keySet.has("bonboy") || keySet.has("membership") || keySet.has("membresia");
  const hasCantidad =
    keySet.has("cantidad") || keySet.has("qty") || keySet.has("quantity") || keySet.has("importe");
  const hasFecha = keySet.has("fecha") || keySet.has("date") || keySet.has("año") || keySet.has("ano");

  let score = keys.length;
  if (hasEmpresa) score += 50;
  if (hasBonboy) score += 25;
  if (hasCantidad) score += 25;
  if (hasFecha) score += 15;
  score += Math.min(rows.length, 200) / 10;

  return score;
}

export async function readXlsxFromPublic(path?: string): Promise<ReadResult> {
  if (!path) throw new Error("No se pudo cargar: filePath está vacío/undefined");

  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (status ${res.status})`);

  const buffer = await res.arrayBuffer();

  // CLAVE: cellDates=true para que XLSX devuelva Date cuando el Excel es fecha
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });

  const sheetNames = wb.SheetNames ?? [];
  if (sheetNames.length === 0) return { rows: [], sheetName: "", sheetNames: [] };

  let bestSheet = sheetNames[0];
  let bestRows: any[] = [];
  let bestScore = -1;

  for (let i = 0; i < sheetNames.length; i++) {
    const name = sheetNames[i];
    const ws = wb.Sheets[name];
    if (!ws) continue;

    // raw=true + cellDates=true => Date objects donde corresponde
    const rowsRaw = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true }) as any[];
    const rows = rowsRaw.map(normalizeRowKeys);
    const s = scoreRows(rows);

    if (s > bestScore) {
      bestScore = s;
      bestSheet = name;
      bestRows = rows;
    }
  }

  return { rows: bestRows, sheetName: bestSheet, sheetNames };
}
