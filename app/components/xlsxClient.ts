"use client";

import * as XLSX from "xlsx";

export async function readXlsxFromPublic(path?: string) {
  if (!path) {
    throw new Error("No se pudo cargar: filePath está vacío/undefined");
  }

  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`No se pudo cargar ${path}`);
  }

  const buffer = await res.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  return { rows };
}
