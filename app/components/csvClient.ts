// app/components/csvClient.ts
export type CsvRow = Record<string, string>;

function parseCsvText(text: string): { columns: string[]; rows: CsvRow[] } {
  // CSV parser robusto (maneja comillas, comas dentro de valores, CRLF, etc.)
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    cur.push(field);
    field = "";
  };
  const pushRow = () => {
    // Evitar filas vacías completas
    const allEmpty = cur.every((x) => (x ?? "").trim() === "");
    if (!allEmpty) rows.push(cur);
    cur = [];
  };

  // Normalizar newlines
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (inQuotes) {
      if (ch === '"') {
        // "" dentro de comillas => "
        const next = s[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        pushField();
      } else if (ch === "\n") {
        pushField();
        pushRow();
      } else {
        field += ch;
      }
    }
  }

  // flush final
  pushField();
  pushRow();

  if (rows.length === 0) return { columns: [], rows: [] };

  const rawColumns = rows[0].map((h) => (h ?? "").trim());
  const columns = rawColumns.map((c, idx) => (c && c.length ? c : `col_${idx}`));

  const outRows: CsvRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const arr = rows[r];
    const obj: CsvRow = {};
    for (let c = 0; c < columns.length; c++) {
      obj[columns[c]] = (arr[c] ?? "").trim();
    }
    outRows.push(obj);
  }

  return { columns, rows: outRows };
}

export async function readCsvFromPublic(filePath: string): Promise<{ columns: string[]; rows: CsvRow[] }> {
  const res = await fetch(filePath, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`No se pudo leer CSV: ${filePath} (${res.status})`);
  }
  const text = await res.text();
  return parseCsvText(text);
}

// Helpers numéricos (para H&F)
export function toNumberSmart(v: unknown): number {
  if (v == null) return NaN;
  const s0 = String(v).trim();
  if (!s0) return NaN;

  // quitar % y espacios
  const s1 = s0.replace(/\s+/g, "").replace(/%/g, "");

  // Si viene como "22,441.71" (USA) o "22.441,71" (EU)
  const hasComma = s1.includes(",");
  const hasDot = s1.includes(".");

  if (hasComma && hasDot) {
    // Decidir decimal por último separador
    const lastComma = s1.lastIndexOf(",");
    const lastDot = s1.lastIndexOf(".");
    if (lastDot > lastComma) {
      // 22,441.71 => sacar comas miles
      return Number(s1.replace(/,/g, ""));
    } else {
      // 22.441,71 => sacar puntos miles, coma decimal
      return Number(s1.replace(/\./g, "").replace(",", "."));
    }
  }

  if (hasComma && !hasDot) {
    // podría ser decimal coma
    // pero si hay más de una coma, asumimos miles
    const commas = (s1.match(/,/g) || []).length;
    if (commas > 1) return Number(s1.replace(/,/g, ""));
    return Number(s1.replace(",", "."));
  }

  // solo dot
  return Number(s1);
}

export function toPercent01(v: unknown): number {
  const n = toNumberSmart(v);
  if (!isFinite(n)) return NaN;
  // Si venía como 59.40 (ya sin %), lo interpretamos como %
  return n > 1 ? n / 100 : n;
}

export function safeDiv(a: number, b: number): number {
  if (!isFinite(a) || !isFinite(b) || b === 0) return NaN;
  return a / b;
}

export function formatInt(n: number): string {
  if (!isFinite(n)) return "—";
  return Math.round(n).toLocaleString("es-AR");
}

export function formatMoney(n: number): string {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function formatPct(n01: number): string {
  if (!isFinite(n01)) return "—";
  return `${(n01 * 100).toFixed(1)}%`;
}

export function monthKeyFromFecha(fecha: string): string {
  // Espera dd/mm/yyyy o d/m/yyyy o yyyy-mm-dd
  const s = (fecha || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const mm = String(m[2]).padStart(2, "0");
  return `${m[3]}-${mm}`;
}

export function yearFromFecha(fecha: string): number | null {
  const s = (fecha || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return Number(s.slice(0, 4));
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return Number(m[3]);
  return null;
}
