// app/components/csvClient.ts
export type CsvRow = Record<string, any>;

type ReadCsvResult = {
  rows: CsvRow[];
  delimiter: string;
  headers: string[];
};

function normalizeHeader(h: string) {
  return String(h ?? "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^"+|"+$/g, "")
    .trim();
}

/**
 * Parser CSV robusto:
 * - Soporta separador ; o ,
 * - Soporta comillas dobles,
 * - Soporta saltos de línea dentro de campos entrecomillados (tu caso en hf_diario.csv),
 * - No requiere dependencias.
 */
function parseCsv(text: string, delimiterGuess?: string): { headers: string[]; rows: CsvRow[]; delimiter: string } {
  const src = text ?? "";

  // auto-guess delimiter (pero ojo: tu primer “línea” puede estar cortada por headers con \n)
  const guessDelimiter = () => {
    if (delimiterGuess) return delimiterGuess;

    // tomamos una muestra de los primeros N chars y contamos ; y ,
    const sample = src.slice(0, 5000);
    const semi = (sample.match(/;/g) || []).length;
    const comma = (sample.match(/,/g) || []).length;
    return semi >= comma ? ";" : ",";
  };

  const delimiter = guessDelimiter();

  const rowsArr: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    // evita filas totalmente vacías
    const isEmpty = row.every((c) => String(c ?? "").trim() === "");
    if (!isEmpty) rowsArr.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        // "" => escape quote
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    // not in quotes
    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === delimiter) {
      pushField();
      continue;
    }

    if (ch === "\n") {
      pushField();
      pushRow();
      continue;
    }

    if (ch === "\r") {
      // ignoramos CR, porque el \n ya corta fila
      continue;
    }

    field += ch;
  }

  // flush final
  pushField();
  pushRow();

  if (rowsArr.length === 0) return { headers: [], rows: [], delimiter };

  // headers
  const rawHeaders = rowsArr[0].map(normalizeHeader);
  const body = rowsArr.slice(1);

  const data: CsvRow[] = body
    .map((r) => {
      const obj: CsvRow = {};
      for (let c = 0; c < rawHeaders.length; c++) {
        const key = rawHeaders[c] || `col_${c + 1}`;
        obj[key] = r[c] ?? "";
      }
      return obj;
    })
    .filter((o) => Object.keys(o).length > 0);

  return { headers: rawHeaders, rows: data, delimiter };
}

export async function readCsvFromPublic(path: string): Promise<ReadCsvResult> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer CSV: ${path} (${res.status})`);
  const text = await res.text();

  const parsed = parseCsv(text);
  return { rows: parsed.rows, delimiter: parsed.delimiter, headers: parsed.headers };
}

/* ======================
   Helpers numéricos
====================== */

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;

  const s = String(v ?? "").trim();
  if (!s) return 0;

  // si viene con % lo tratamos como porcentaje “humano” (59,40% => 59.40)
  const isPct = s.includes("%");

  // quita separadores de miles y normaliza decimal
  const cleaned = s
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace("%", "");

  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return isPct ? n : n;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

/** Convierte 59.4 (o "59,4%") a 0.594; si ya viene 0.59 lo deja */
export function toPercent01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v > 1) return v / 100;
  if (v < 0) return 0;
  return v;
}

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export function formatMoneyUSD(n: number, digits: number = 0): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  });
}

export function formatInt(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

export function formatPct(n01: number, digits: number = 1): string {
  const v = clamp01(n01);
  return (v * 100).toFixed(digits) + "%";
}
