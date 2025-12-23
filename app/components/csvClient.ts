// app/components/csvClient.ts
// CSV robusto sin dependencias externas (maneja comillas + newlines dentro de campos)

export type CsvRow = Record<string, any>;

function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    // Evitar filas vacías
    const anyVal = row.some((c) => String(c ?? "").trim() !== "");
    if (anyVal) rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (ch === '"') {
      // si estamos en comillas y viene "" => escape
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i += 1;
      continue;
    }

    if (!inQuotes && ch === ",") {
      pushField();
      i += 1;
      continue;
    }

    // soportar CRLF / LF
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      // si es CRLF, saltar ambos
      if (ch === "\r" && text[i + 1] === "\n") i += 2;
      else i += 1;

      pushField();
      pushRow();
      continue;
    }

    field += ch;
    i += 1;
  }

  // flush final
  pushField();
  pushRow();

  return rows;
}

export async function readCsvFromPublic(path: string): Promise<CsvRow[]> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer CSV: ${path} (${res.status})`);
  const text = await res.text();

  const table = parseCsvText(text);
  if (table.length < 2) return [];

  const header = table[0].map((h) => String(h ?? "").trim());
  const out: CsvRow[] = [];

  for (let r = 1; r < table.length; r++) {
    const line = table[r];
    if (!line || line.length === 0) continue;

    const obj: CsvRow = {};
    for (let c = 0; c < header.length; c++) {
      const k = header[c] || `col_${c}`;
      obj[k] = (line[c] ?? "").toString().trim();
    }
    out.push(obj);
  }

  return out;
}

/* ======================
   Helpers numéricos
====================== */

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;

  const s = String(v).trim();
  if (!s) return 0;

  // porcentajes tipo "59,40%" o "59.40%"
  const isPct = s.includes("%");

  // normalizar números latam: 22.441,71 => 22441.71
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/%/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const n = Number(cleaned);
  if (!isFinite(n)) return 0;

  return isPct ? n / 100 : n;
}

export function safeDiv(a: number, b: number): number {
  if (!isFinite(a) || !isFinite(b) || b === 0) return 0;
  return a / b;
}

export function clamp01(x: number): number {
  if (!isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function formatMoneyUSD(n: number): string {
  const v = isFinite(n) ? n : 0;
  return v.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatInt(n: number): string {
  const v = isFinite(n) ? n : 0;
  return v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

export function formatPct01(n01: number): string {
  const v = clamp01(n01) * 100;
  return `${v.toFixed(1)}%`;
}

/* ======================
   Fechas (H&F)
====================== */

export function parseFechaSmart(row: Record<string, any>): Date | null {
  // Preferir "Fecha" tipo 1/6/2022
  const raw = row["Fecha"] ?? row["fecha"] ?? "";
  const s = String(raw).trim();

  const tryDMY = (t: string): Date | null => {
    const parts = t.split("/");
    if (parts.length !== 3) return null;
    const d = Number(parts[0]);
    const m = Number(parts[1]);
    const y = Number(parts[2]);
    if (!d || !m || !y) return null;
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  };

  const dmy = tryDMY(s);
  if (dmy) return dmy;

  // Fallback: "Date" tipo 01-06-22 Wed
  const raw2 = row["Date"] ?? row["date"] ?? "";
  const s2 = String(raw2).trim();
  // 01-06-22
  const m = s2.match(/^(\d{2})-(\d{2})-(\d{2})/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = Number(m[3]);
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;
    const dt = new Date(year, mm - 1, dd);
    return isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}
