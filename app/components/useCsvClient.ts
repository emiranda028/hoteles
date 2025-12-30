"use client";

import { useEffect, useState } from "react";

/* =========================
   Tipos
========================= */

export type CsvRow = Record<string, any>;

export type UseCsvResult = {
  rows: CsvRow[];
  loading: boolean;
  error: string;
};

/* =========================
   CSV Parser robusto (sin libs)
   - soporta comillas
   - soporta comas dentro de comillas
   - soporta saltos de línea dentro de comillas (CLAVE para tu hf_diario.csv)
========================= */

function parseCSV(text: string): CsvRow[] {
  if (!text) return [];

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    // Evita rows vacías totales
    const allEmpty = row.every((x) => (x ?? "").trim() === "");
    if (!allEmpty) rows.push(row);
    row = [];
  };

  // Normalizo \r\n a \n, pero NO rompo por líneas (lo manejamos con el parser)
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (ch === '"') {
      // Si estamos en comillas y viene "" => comilla escapada
      const next = s[i + 1];
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

    // fin de línea
    if (ch === "\n" && !inQuotes) {
      pushField();
      pushRow();
      continue;
    }

    // caracter normal (incluye \n si está dentro de comillas)
    field += ch;
  }

  // flush final
  pushField();
  pushRow();

  if (!rows.length) return [];

  // headers
  const headersRaw = rows[0] ?? [];
  const headers = headersRaw.map((h, idx) => {
    const clean = String(h ?? "")
      .replace(/^"|"$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // si viniera vacío, generamos un nombre
    return clean || `col_${idx + 1}`;
  });

  // data
  const out: CsvRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const values = rows[r] ?? [];
    const obj: CsvRow = {};

    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      const v = values[c] ?? "";
      // limpiamos comillas externas y espacios, pero NO destruimos contenido
      obj[key] = String(v).replace(/^"|"$/g, "").trim();
    }

    out.push(obj);
  }

  return out;
}

/* =========================
   Hook ÚNICO
========================= */

export function useCsvClient(filePath: string): UseCsvResult {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    setLoading(true);
    setError("");

    fetch(filePath, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`No se pudo leer CSV: ${filePath} (${res.status})`);
        }
        return res.text();
      })
      .then((text) => {
        if (!alive) return;
        const parsed = parseCSV(text);
        setRows(parsed);
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
   Helpers numéricos (mejorados)
========================= */

export function num(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;

  const s = String(v).trim();
  if (!s) return 0;

  // Ej: "22.441,71" -> 22441.71  |  "59,40%" -> 59.40
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace("%", "");

  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

export function pct(v: any): number {
  const n = typeof v === "number" ? v : num(v);
  // si viene 59.4 => 0.594
  return n > 1 ? n / 100 : n;
}
