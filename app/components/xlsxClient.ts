"use client";

import * as XLSX from "xlsx";

export type ReadXlsxResult = {
  rows: any[];
  sheetName: string;
  sheetNames: string[];
};

function scoreRows(rows: any[]) {
  if (!rows || rows.length === 0) return 0;

  const keys = Object.keys(rows[0] ?? {});
  const keySet = new Set(keys.map((k) => String(k).trim().toLowerCase()));

  const hasEmpresa = keySet.has("empresa");
  const hasBonboy = keySet.has("bonboy");
  const hasCantidad = keySet.has("cantidad");
  const hasFecha = keySet.has("fecha") || keySet.has("date");
  const hasAno = keySet.has("año") || keySet.has("ano") || keySet.has("year");
  const hasPais = keySet.has("país") || keySet.has("pais") || keySet.has("country");
  const hasCont = keySet.has("continente") || keySet.has("continent");

  let score = keys.length;
  if (hasEmpresa) score += 60;
  if (hasBonboy) score += 35;
  if (hasCantidad) score += 35;
  if (hasFecha) score += 20;
  if (hasAno) score += 25;
  if (hasPais) score += 20;
  if (hasCont) score += 15;

  score += Math.min(rows.length, 400) / 10;
  return score;
}

export async function readXlsxFromPublic(path: string): Promise<ReadXlsxResult> {
  if (!path) throw new Error("No se pudo cargar XLSX: filePath vacío");

  const res = await fetch(path);
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
