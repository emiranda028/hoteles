// app/components/csvClient.ts
export type CsvRow = Record<string, any>;

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // doble comilla escapada dentro de quoted
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsv(text: string): CsvRow[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]).map((h) =>
    h.replace(/^"|"$/g, "").trim()
  );

  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]).map((c) =>
      c.replace(/^"|"$/g, "").trim()
    );

    // si viene una línea mal cortada, la ignoramos
    if (cols.length < Math.min(2, header.length)) continue;

    const r: CsvRow = {};
    for (let j = 0; j < header.length; j++) {
      r[header[j]] = cols[j] ?? "";
    }
    rows.push(r);
  }

  return rows;
}

export async function readCsvFromPublic(path: string): Promise<CsvRow[]> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer CSV: ${path} (${res.status})`);
  const text = await res.text();
  return parseCsv(text);
}

/* ======================
   Helpers numéricos
====================== */

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  const s = String(v).trim();
  if (!s) return 0;

  // % y espacios
  const noPct = s.replace(/%/g, "").trim();

  // formato es-AR: 22.441,71  /  126,79
  // formato en-US: 22,441.71
  // estrategia:
  // - si tiene "," y ".", asumimos miles + decimales según última ocurrencia
  const hasComma = noPct.includes(",");
  const hasDot = noPct.includes(".");

  let normalized = noPct;

  if (hasComma && hasDot) {
    // decide decimal por el último separador
    const lastComma = noPct.lastIndexOf(",");
    const lastDot = noPct.lastIndexOf(".");
    if (lastComma > lastDot) {
      // coma decimal, puntos miles
      normalized = noPct.replace(/\./g, "").replace(",", ".");
    } else {
      // punto decimal, comas miles
      normalized = noPct.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    // coma decimal
    normalized = noPct.replace(",", ".");
  } else {
    // punto decimal o entero
    normalized = noPct;
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

// convierte 59.4 (porcentaje) a 0.594 si detecta escala > 1
export function toPercent01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v > 1.5) return v / 100;
  return v;
}

export function formatMoney(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatInt(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return Math.round(v).toLocaleString("es-AR");
}

export function formatPct(n01: number): string {
  const v = Number.isFinite(n01) ? n01 : 0;
  return (v * 100).toFixed(1) + "%";
}

// alias explícito (a veces lo llamaste así en componentes)
export const formatPct01 = formatPct;

/* ======================
   Fechas
====================== */

// intenta parsear:
// - "1/6/2022"
// - "01-06-22 Wed"
// - Date serial de Excel (46004)
// - "2022-06-01"
export function parseFechaSmart(v: any): Date | null {
  if (v === null || v === undefined) return null;

  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;

  // excel serial
  const asNum = typeof v === "number" ? v : toNumberSmart(v);
  if (asNum > 30000 && asNum < 80000) {
    // Excel epoch: 1899-12-30 (aprox para Windows)
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + asNum * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(v).trim();
  if (!s) return null;

  // dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]) - 1;
    const yy = Number(m1[3]);
    const d = new Date(yy, mm, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // dd-mm-yy ...
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m2) {
    const dd = Number(m2[1]);
    const mm = Number(m2[2]) - 1;
    let yy = Number(m2[3]);
    if (yy < 100) yy = 2000 + yy;
    const d = new Date(yy, mm, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // yyyy-mm-dd
  const m3 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m3) {
    const yy = Number(m3[1]);
    const mm = Number(m3[2]) - 1;
    const dd = Number(m3[3]);
    const d = new Date(yy, mm, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
