// app/components/csvClient.ts
export type CsvRow = Record<string, any>;

/**
 * CSV parser sin dependencias.
 * - Soporta comillas dobles, comas dentro de comillas, saltos de línea en campos.
 * - Asume separador "," (como tus exports típicos).
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    // Evita agregar filas vacías "fantasma"
    const isEmpty = row.length === 1 && row[0].trim() === "";
    if (!isEmpty) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') {
          // escape "" -> "
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }

    if (c === ",") {
      pushField();
      continue;
    }

    if (c === "\n") {
      pushField();
      pushRow();
      continue;
    }

    if (c === "\r") {
      // ignorar CR (windows)
      continue;
    }

    field += c;
  }

  // flush final
  pushField();
  pushRow();

  return rows;
}

export async function readCsvFromPublic(path: string): Promise<CsvRow[]> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No pude leer CSV: ${path} (${res.status})`);

  const text = await res.text();
  const table = parseCsv(text);

  if (table.length === 0) return [];

  const header = table[0].map((h) => (h ?? "").toString().trim());
  const out: CsvRow[] = [];

  for (let r = 1; r < table.length; r++) {
    const arr = table[r];
    const obj: CsvRow = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = arr?.[c] ?? "";
    }

    // skip empty lines (todas las cols vacías)
    const anyVal = Object.values(obj).some((v) => String(v ?? "").trim() !== "");
    if (anyVal) out.push(obj);
  }

  return out;
}

/* ======================
   Helpers numéricos
====================== */

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  const s = String(v).trim();
  if (!s) return 0;

  // Detecta porcentaje estilo "59,40%"
  const isPct = s.includes("%");

  // Normaliza: "22.441,71" -> "22441.71"
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/%/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;

  return isPct ? n / 100 : n;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

/** si viene 59.4 lo pasa a 0.594; si ya viene 0.594 lo deja */
export function toPercent01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v > 1.5) return v / 100;
  return v;
}

export function formatMoney(n: number): string {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatInt(n: number): string {
  const x = Number.isFinite(n) ? n : 0;
  return Math.round(x).toLocaleString("es-AR");
}

export function formatPct(n01: number): string {
  const x = Number.isFinite(n01) ? n01 : 0;
  return (x * 100).toFixed(1) + "%";
}
