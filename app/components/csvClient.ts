// app/components/csvClient.ts
"use client";

export type CsvRow = Record<string, any>;

/**
 * CSV parser simple (sin dependencias).
 * Soporta:
 * - separador coma o punto y coma (detecta por header)
 * - comillas dobles para campos con separador
 * - saltos de línea CRLF/LF
 */
function parseCsv(text: string): CsvRow[] {
  const clean = text.replace(/\uFEFF/g, ""); // BOM
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  const headerLine = lines[0];

  // detectar delimitador
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semiCount = (headerLine.match(/;/g) || []).length;
  const delim = semiCount > commaCount ? ";" : ",";

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (ch === '"') {
        // escape "" dentro de quoted
        const next = line[i + 1];
        if (inQuotes && next === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (ch === delim && !inQuotes) {
        out.push(cur);
        cur = "";
        continue;
      }

      cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const headers = parseLine(headerLine).map((h) => h.replace(/^"|"$/g, "").trim());

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    if (!vals.length) continue;

    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j] ?? `col_${j}`;
      row[key] = (vals[j] ?? "").replace(/^"|"$/g, "").trim();
    }
    rows.push(row);
  }

  return rows;
}

export async function readCsvFromPublic(path: string): Promise<CsvRow[]> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo descargar CSV: ${path} (${res.status})`);
  const text = await res.text();
  return parseCsv(text);
}

/* ======================
   Helpers numéricos
====================== */

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  if (typeof v === "string") {
    const cleaned = v
      .replace(/\./g, "")
      .replace(",", ".")
      .replace("%", "")
      .trim();
    const n = Number(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function toPercent01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v > 1) return v / 100;
  return v;
}

export function formatMoney(n: number): string {
  const nn = Number.isFinite(n) ? n : 0;
  return nn.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatPct(n: number): string {
  const nn = Number.isFinite(n) ? n : 0;
  return (nn * 100).toFixed(1).replace(".", ",") + "%";
}
