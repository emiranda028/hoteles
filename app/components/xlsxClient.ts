"use client";

import * as XLSX from "xlsx";

export type ReadResult = {
  rows: any[];
  sheetName: string;
  sheetNames: string[];
};

function normKey(k: any) {
  return String(k ?? "").trim().toLowerCase();
}

function scoreRows(rows: any[]) {
  if (!rows || rows.length === 0) return 0;

  const keys = Object.keys(rows[0] ?? {});
  const keySet = new Set(keys.map((k) => normKey(k)));

  const hasEmpresa = keySet.has("empresa");
  const hasBonboy = keySet.has("bonboy");
  const hasCantidad = keySet.has("cantidad");
  const hasFecha = keySet.has("fecha") || keySet.has("date") || keySet.has("día") || keySet.has("dia");

  // Base: más columnas = mejor
  let score = keys.length;

  // Señales típicas
  if (hasEmpresa) score += 50;
  if (hasBonboy) score += 25;
  if (hasCantidad) score += 25;
  if (hasFecha) score += 15;

  // Bonus por cantidad de filas (evita hojas vacías)
  score += Math.min(rows.length, 300) / 10;

  return score;
}

export async function readXlsxFromPublic(path?: string): Promise<ReadResult> {
  if (!path) throw new Error("No se pudo cargar: filePath está vacío/undefined");

  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (status ${res.status})`);

  const buffer = await res.arrayBuffer();

  // cellDates true ayuda a traer fechas como Date cuando Excel lo permite
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
