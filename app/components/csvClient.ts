// app/components/csvClient.ts
"use client";

export type CsvRow = Record<string, any>;

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normKey(k: string) {
  return stripAccents(String(k ?? ""))
    .trim()
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .replace(/\./g, "")
    .replace(/%/g, "pct")
    .replace(/\(|\)|\[|\]|\{|\}/g, "")
    .replace(/\//g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, "_");
}

export function toNumberLoose(v: any): number {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;

  const s0 = String(v).trim();
  if (!s0) return NaN;

  // Mantener signo y dígitos, manejar miles y decimales (AR/EU)
  // Ej: "22.441,71" -> 22441.71 | "59,40%" -> 59.4
  const s = s0
    .replace(/\s/g, "")
    .replace(/[%]/g, "")
    .replace(/[^\d,.\-]/g, "");

  // Si tiene "," y ".", asumimos "." miles y "," decimal (EU/AR)
  let normalized = s;
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");
  if (hasComma && hasDot) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    normalized = normalized.replace(",", ".");
  }

  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : NaN;
}

export function toPercentNumber(v: any): number {
  // Devuelve porcentaje en escala 0..100
  // Si viene "0.59" lo interpreta como 59%
  const n = toNumberLoose(v);
  if (!Number.isFinite(n)) return NaN;
  if (n >= 0 && n <= 1) return n * 100;
  return n; // ya está 0..100 (ej 59.4)
}

function parseDateLoose(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  const s = String(v).trim();
  if (!s) return null;

  // Formatos típicos: "1/6/2022" "01-06-22" "2022-06-01"
  // 1) yyyy-mm-dd
  const m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m1) {
    const y = Number(m1[1]);
    const mo = Number(m1[2]) - 1;
    const d = Number(m1[3]);
    const dt = new Date(y, mo, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 2) dd-mm-yy o dd-mm-yyyy
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m2) {
    const d = Number(m2[1]);
    const mo = Number(m2[2]) - 1;
    let y = Number(m2[3]);
    if (y < 100) y = 2000 + y;
    const dt = new Date(y, mo, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 3) d/m/yyyy
  const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m3) {
    const d = Number(m3[1]);
    const mo = Number(m3[2]) - 1;
    let y = Number(m3[3]);
    if (y < 100) y = 2000 + y;
    const dt = new Date(y, mo, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

function csvSplitLine(line: string): string[] {
  // Split CSV básico con comillas
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Doble comilla dentro de quoted string
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export async function readCsvFromPublic(filePath: string): Promise<CsvRow[]> {
  const res = await fetch(filePath, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar ${filePath} (status ${res.status})`);
  const text = await res.text();

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  const rawHeaders = csvSplitLine(lines[0]).map((h) => h.trim());
  const headers = rawHeaders.map((h) => normKey(h));

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = csvSplitLine(lines[i]);
    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (cols[j] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

export type HofNormalized = {
  empresa: string;
  hof: "history" | "forecast" | "";
  date: Date | null;
  year: number | null;
  month: number | null; // 1..12
  occPct: number | null; // 0..100
  adr: number | null;
  roomRevenue: number | null;
  roomsOcc: number | null; // "Total Occ." si existe
  arrRooms: number | null;
  compRooms: number | null;
};

export function normalizeHofRows(rows: CsvRow[]): HofNormalized[] {
  // Mapeos flexibles
  const pick = (r: CsvRow, candidates: string[]) => {
    for (const c of candidates) {
      if (c in r) return r[c];
    }
    return "";
  };

  return rows.map((r) => {
    const empresa = String(
      pick(r, ["empresa", "company", "hotel", "propiedad", "property", "hotelempresa"])
    ).trim();

    const hofRaw = String(pick(r, ["hof", "history_or_forecast", "history_forecast"])).trim().toLowerCase();
    let hof: HofNormalized["hof"] = "";
    if (hofRaw.includes("hist")) hof = "history";
    else if (hofRaw.includes("fore")) hof = "forecast";

    const dateVal = pick(r, ["fecha", "date", "fech"]);
    const date = parseDateLoose(dateVal);

    const year = date ? date.getFullYear() : null;
    const month = date ? date.getMonth() + 1 : null;

    const occPct = (() => {
      const v = pick(r, ["occ_pct", "occ", "occpct", "occ%", "occ_pct_", "occ_pct__", "occ_pct__"]);
      const n = toPercentNumber(v);
      return Number.isFinite(n) ? n : null;
    })();

    const adr = (() => {
      const v = pick(r, ["average_rate", "adr", "average", "average_rate_", "average_rate__"]);
      const n = toNumberLoose(v);
      return Number.isFinite(n) ? n : null;
    })();

    const roomRevenue = (() => {
      const v = pick(r, ["room_revenue", "roomrevenue", "revenue_room", "room_rev"]);
      const n = toNumberLoose(v);
      return Number.isFinite(n) ? n : null;
    })();

    const roomsOcc = (() => {
      const v = pick(r, ["total_occ", "total_occ_", "total_occ__", "total_occ___", "totalocc", "rooms_occupied", "rooms_occ"]);
      const n = toNumberLoose(v);
      return Number.isFinite(n) ? n : null;
    })();

    const arrRooms = (() => {
      const v = pick(r, ["arr_rooms", "arr_rooms_", "arrrooms"]);
      const n = toNumberLoose(v);
      return Number.isFinite(n) ? n : null;
    })();

    const compRooms = (() => {
      const v = pick(r, ["comp_rooms", "comp_rooms_", "comprooms"]);
      const n = toNumberLoose(v);
      return Number.isFinite(n) ? n : null;
    })();

    return {
      empresa,
      hof,
      date,
      year,
      month,
      occPct,
      adr,
      roomRevenue,
      roomsOcc,
      arrRooms,
      compRooms,
    };
  });
}
