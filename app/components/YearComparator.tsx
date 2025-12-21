"use client";

import { useEffect, useMemo, useState } from "react";
import HofExplorer from "./HofExplorer";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";

/**
 * YearComparator
 * - Filtros globales: año + hotel
 * - KPIs (carrouseles) para Grupo JCR
 * - Comparativa año vs baseYear
 * - H&F Explorador (JCR) + H&F Explorador (Maitei)
 * - Membership (JCR) con filtro global (JCR/MARRIOTT/SHERATONS)
 * - Nacionalidades (Marriott-only) con filtro global de año
 *
 * Nota:
 * Evitamos iteración por iterators con for..of.
 */

type GlobalHotel = "JCR" | "MARRIOTT" | "SHERATON MDQ" | "SHERATON BCR" | "MAITEI";

const DEFAULT_YEAR = 2025;
const DEFAULT_BASE_YEAR = 2024;

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

const JCR_HOTELS: GlobalHotel[] = ["MARRIOTT", "SHERATON MDQ", "SHERATON BCR"];
const SHERATONS: GlobalHotel[] = ["SHERATON MDQ", "SHERATON BCR"];

type HfRow = {
  date?: Date;
  year?: number;
  month?: number;
  hotel?: string;

  rooms?: number;
  guests?: number;
  revenue?: number;
  adr?: number;
  occ?: number; // 0..1
};

function norm(s: any) {
  return String(s ?? "").trim();
}

function normKey(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseNumberAny(v: any): number {
  const s0 = String(v ?? "").trim();
  if (!s0) return 0;
  const lastComma = s0.lastIndexOf(",");
  const lastDot = s0.lastIndexOf(".");
  let s = s0;

  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }

  const n = parseFloat(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parsePctAny(v: any): number {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const n = parseNumberAny(s.replace("%", ""));
  // si viene 63.6 => 0.636
  return n > 1 ? n / 100 : n;
}

function parseDateAny(v: any): Date | undefined {
  const s = String(v ?? "").trim();
  if (!s) return undefined;

  // Intento directo
  const d0 = new Date(s);
  if (!isNaN(d0.getTime())) return d0;

  // d/m/y o m/d/y
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const y = parseInt(m[3], 10);
    const year = y < 100 ? 2000 + y : y;

    // Heurística: si a > 12 => a es día. Si b > 12 => b es día.
    let day = a;
    let mon = b;
    if (a <= 12 && b <= 12) {
      // Ambiguo: preferimos d/m (Argentina)
      day = a;
      mon = b;
    } else if (a > 12) {
      day = a;
      mon = b;
    } else {
      // b > 12
      day = b;
      mon = a;
    }

    const d = new Date(year, mon - 1, day);
    if (!isNaN(d.getTime())) return d;
  }

  return undefined;
}

/**
 * CSV parser simple (soporta comillas y newlines en campos).
 * Devuelve array de arrays (rows), donde row[0] son headers.
 */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = i + 1 < text.length ? text[i + 1] : "";

    if (ch === '"' && next === '"') {
      // escape de comillas dentro de campo
      cur += '"';
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cur);
      cur = "";
      // cerramos fila solo si tiene algo
      if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) rows.push(row);
      row = [];
      continue;
    }

    cur += ch;
  }

  // flush final
  row.push(cur);
  if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) rows.push(row);

  return rows;
}

function detectHotelLabel(raw: string): string {
  const s = norm(raw).toUpperCase();
  if (!s) return "";
  if (s.includes("MARRIOTT")) return "MARRIOTT";
  if (s.includes("SHERATON") && s.includes("MDQ")) return "SHERATON MDQ";
  if (s.includes("SHERATON") && (s.includes("BRC") || s.includes("BCR") || s.includes("BARILOCHE"))) return "SHERATON BCR";
  if (s.includes("MAITEI")) return "MAITEI";
  return s;
}

function monthNameES(m: number) {
  const names = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  return names[m - 1] ?? `Mes ${m}`;
}

function formatMoneyUSD(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatInt(n: number) {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function pctDelta(cur: number, base: number): number {
  if (!base) return 0;
  return ((cur - base) / base) * 100;
}

function Card({
  title,
  children,
  subtitle,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
      {title ? (
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline" }}>
          <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>{title}</div>
          {subtitle ? <div style={{ fontSize: ".9rem", opacity: 0.75 }}>{subtitle}</div> : null}
        </div>
      ) : null}
      <div style={{ marginTop: title ? ".85rem" : 0 }}>{children}</div>
    </div>
  );
}

function KPIChip({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number;
}) {
  const d = typeof delta === "number" ? delta : undefined;
  const color =
    d === undefined ? "rgba(255,255,255,.85)" : d >= 0 ? "rgba(102,255,198,.95)" : "rgba(255,155,155,.95)";
  const sign = d === undefined ? "" : d >= 0 ? "+" : "";
  return (
    <div
      style={{
        padding: "1rem",
        borderRadius: 22,
        background: "linear-gradient(135deg, rgba(124,92,255,.35), rgba(24,214,255,.18))",
        border: "1px solid rgba(255,255,255,.10)",
        minHeight: 108,
      }}
    >
      <div style={{ fontSize: ".9rem", opacity: 0.85 }}>{label}</div>
      <div style={{ marginTop: ".35rem", fontSize: "1.55rem", fontWeight: 950, letterSpacing: -0.5 }}>{value}</div>
      {d !== undefined ? (
        <div style={{ marginTop: ".35rem", fontSize: ".9rem", color, fontWeight: 850 }}>
          {sign}
          {d.toFixed(1)}% vs {DEFAULT_BASE_YEAR}
        </div>
      ) : null}
    </div>
  );
}

export default function YearComparator() {
  const [hfRows, setHfRows] = useState<HfRow[]>([]);
  const [hfLoading, setHfLoading] = useState(true);

  const [year, setYear] = useState(DEFAULT_YEAR);
  const [baseYear, setBaseYear] = useState(DEFAULT_BASE_YEAR);

  const [globalHotel, setGlobalHotel] = useState<GlobalHotel>("JCR");

  // 1) Cargar HF diario para carrouseles + comparativa (sin romper HofExplorer)
  useEffect(() => {
    let alive = true;
    setHfLoading(true);

    (async () => {
      try {
        const res = await fetch(HF_PATH);
        const text = await res.text();
        const table = parseCSV(text);
        const header = table[0] ?? [];
        const idx: Record<string, number> = {};
        for (let i = 0; i < header.length; i++) idx[normKey(header[i])] = i;

        // Intentamos detectar columnas típicas (tu CSV tiene headers multi-línea)
        const colHotel =
          idx["hotel"] ??
          idx["empresa"] ??
          idx["property"] ??
          idx["history & forecast"] ??
          idx["history"] ??
          idx["h&f"] ??
          idx["nombre"] ??
          -1;

        // fecha: "Date", "Fecha", etc.
        const colDate = idx["fecha"] ?? idx["date"] ?? idx["día"] ?? idx["dia"] ?? -1;

        // rooms / revenue / guests / occ / adr:
        const colRooms = idx["rooms"] ?? idx["rooms occupied"] ?? idx["rooms occupied minus house use"] ?? idx["rooms occupied minus house use\n"] ?? -1;
        const colRevenue = idx["room revenue"] ?? idx["revenue"] ?? idx["room\nrevenue"] ?? -1;
        const colGuests = idx["total in-house persons"] ?? idx["guests"] ?? idx["huéspedes"] ?? idx["huespedes"] ?? -1;
        const colOcc = idx["occupancy"] ?? idx["ocupación"] ?? idx["ocupacion"] ?? idx["occ"] ?? -1;
        const colAdr = idx["adr"] ?? idx["average daily rate"] ?? -1;

        const out: HfRow[] = [];
        for (let r = 1; r < table.length; r++) {
          const row = table[r];
          if (!row || row.length < 2) continue;

          const hotelRaw = colHotel >= 0 ? row[colHotel] : "";
          const hotel = detectHotelLabel(hotelRaw);

          const d = colDate >= 0 ? parseDateAny(row[colDate]) : undefined;
          const y = d ? d.getFullYear() : undefined;
          const m = d ? d.getMonth() + 1 : undefined;

          const rooms = colRooms >= 0 ? parseNumberAny(row[colRooms]) : 0;
          const revenue = colRevenue >= 0 ? parseNumberAny(row[colRevenue]) : 0;
          const guests = colGuests >= 0 ? parseNumberAny(row[colGuests]) : 0;
          const occ = colOcc >= 0 ? parsePctAny(row[colOcc]) : 0;
          const adr = colAdr >= 0 ? parseNumberAny(row[colAdr]) : 0;

          // si no hay hotel o no hay año, no sirve para agregación
          if (!hotel || !y) continue;

          out.push({ date: d, year: y, month: m, hotel, rooms, revenue, guests, occ, adr });
        }

        if (!alive) return;
        setHfRows(out);
      } catch {
        if (!alive) return;
        setHfRows([]);
      } finally {
        if (!alive) return;
        setHfLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const yearsAvailable = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < hfRows.length; i++) {
      const y = hfRows[i].year;
      if (y) set.add(y);
    }
    const arr = Array.from(set);
    arr.sort((a, b) => b - a);
    return arr;
  }, [hfRows]);

  // si el año seleccionado no existe, lo ajustamos (evita "sin datos" vacío)
  useEffect(() => {
    if (yearsAvailable.length === 0) return;
    if (!yearsAvailable.includes(year)) setYear(yearsAvailable[0]);
    if (!yearsAvailable.includes(baseYear)) {
      // baseYear: preferimos el año inmediatamente anterior si existe
      const idx = yearsAvailable.indexOf(year);
      const candidate = idx >= 0 && idx + 1 < yearsAvailable.length ? yearsAvailable[idx + 1] : yearsAvailable[0];
      setBaseYear(candidate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearsAvailable.length]);

  function hotelsForGlobalFilter(h: GlobalHotel): string[] {
    if (h === "JCR") return Array.from(JCR_HOTELS);
    if (h === "MAITEI") return ["MAITEI"];
    if (h === "SHERATON MDQ") return ["SHERATON MDQ"];
    if (h === "SHERATON BCR") return ["SHERATON BCR"];
    if (h === "MARRIOTT") return ["MARRIOTT"];
    return [];
  }

  const jcrAgg = useMemo(() => {
    const hotels = Array.from(JCR_HOTELS);

    function aggFor(y: number) {
      let rooms = 0;
      let revenue = 0;
      let guests = 0;

      // ADR anual: revenue / rooms (si rooms)
      for (let i = 0; i < hfRows.length; i++) {
        const r = hfRows[i];
        if (r.year !== y) continue;
        if (!r.hotel) continue;
        if (hotels.indexOf(r.hotel as any) === -1) continue;

        rooms += r.rooms || 0;
        revenue += r.revenue || 0;
        guests += r.guests || 0;
      }

      const adr = rooms > 0 ? revenue / rooms : 0;
      return { rooms, revenue, guests, adr };
    }

    const cur = aggFor(year);
    const base = aggFor(baseYear);

    return {
      cur,
      base,
      dRooms: pctDelta(cur.rooms, base.rooms),
      dRevenue: pctDelta(cur.revenue, base.revenue),
      dGuests: pctDelta(cur.guests, base.guests),
      dAdr: pctDelta(cur.adr, base.adr),
    };
  }, [hfRows, year, baseYear]);

  const comparativaByHotel = useMemo(() => {
    // comparativa simple por hotel (JCR + Maitei)
    const hotelsAll = ["MARRIOTT", "SHERATON MDQ", "SHERATON BCR", "MAITEI"];

    function aggHotel(y: number, hotel: string) {
      let rooms = 0;
      let revenue = 0;
      let guests = 0;
      for (let i = 0; i < hfRows.length; i++) {
        const r = hfRows[i];
        if (r.year !== y) continue;
        if ((r.hotel || "") !== hotel) continue;
        rooms += r.rooms || 0;
        revenue += r.revenue || 0;
        guests += r.guests || 0;
      }
      const adr = rooms > 0 ? revenue / rooms : 0;
      return { rooms, revenue, guests, adr };
    }

    const list = hotelsAll.map((h) => {
      const cur = aggHotel(year, h);
      const base = aggHotel(baseYear, h);
      return {
        hotel: h,
        cur,
        base,
        dRooms: pctDelta(cur.rooms, base.rooms),
        dRevenue: pctDelta(cur.revenue, base.revenue),
        dGuests: pctDelta(cur.guests, base.guests),
        dAdr: pctDelta(cur.adr, base.adr),
      };
    });

    return list;
  }, [hfRows, year, baseYear]);

  const globalHotelsOptions: { value: GlobalHotel; label: string }[] = [
    { value: "JCR", label: "JCR (Grupo)" },
    { value: "MARRIOTT", label: "Marriott" },
    { value: "SHERATON MDQ", label: "Sheraton MDQ" },
    { value: "SHERATON BCR", label: "Sheraton Bariloche" },
    { value: "MAITEI", label: "Maitei (GOTEL)" },
  ];

  const membershipHotelFilter = useMemo(() => {
    // Membership es SOLO para JCR; si estás parado en MAITEI, mostramos igual JCR.
    // Para evitar tu error anterior de tipos, devolvemos GlobalHotel válido.
    return globalHotel === "MAITEI" ? ("JCR" as GlobalHotel) : globalHotel;
  }, [globalHotel]);

  return (
    <section className="section" id="comparador" style={{ marginTop: "1rem" }}>
      {/* ====== Header sección ====== */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
            VISTA EJECUTIVA
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Informe dinámico · Filtros globales + cálculo automático
          </div>
        </div>

        {/* ====== Filtros globales (Año + Hotel) ====== */}
        <div
          className="card"
          style={{
            padding: ".75rem",
            borderRadius: 18,
            display: "flex",
            gap: ".65rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 900, opacity: 0.85 }}>Filtros</div>

          <label style={{ display: "grid", gap: ".25rem" }}>
            <span style={{ fontSize: ".8rem", opacity: 0.75 }}>Año</span>
            <select className="select" value={String(year)} onChange={(e) => setYear(parseInt(e.target.value, 10))}>
              {(yearsAvailable.length ? yearsAvailable : [DEFAULT_YEAR, DEFAULT_BASE_YEAR]).map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: ".25rem" }}>
            <span style={{ fontSize: ".8rem", opacity: 0.75 }}>Base</span>
            <select className="select" value={String(baseYear)} onChange={(e) => setBaseYear(parseInt(e.target.value, 10))}>
              {(yearsAvailable.length ? yearsAvailable : [DEFAULT_BASE_YEAR]).map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: ".25rem", minWidth: 220 }}>
            <span style={{ fontSize: ".8rem", opacity: 0.75 }}>Hotel / Grupo</span>
            <select className="select" value={globalHotel} onChange={(e) => setGlobalHotel(e.target.value as GlobalHotel)}>
              {globalHotelsOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* ====== 1) Carrouseles JCR (grandes) ====== */}
      <div style={{ marginTop: "1rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Grupo JCR — KPIs {year} (vs {baseYear})
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Habitaciones ocupadas, Room Revenue, Huéspedes y ADR anual.
        </div>

        <div
          style={{
            marginTop: ".85rem",
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0,1fr))",
            gap: "1rem",
          }}
          className="kpiGrid4"
        >
          <KPIChip
            label="Rooms occupied"
            value={hfLoading ? "…" : formatInt(jcrAgg.cur.rooms)}
            delta={hfLoading ? undefined : jcrAgg.dRooms}
          />
          <KPIChip
            label="Room Revenue (USD)"
            value={hfLoading ? "…" : formatMoneyUSD(jcrAgg.cur.revenue)}
            delta={hfLoading ? undefined : jcrAgg.dRevenue}
          />
          <KPIChip
            label="Huéspedes"
            value={hfLoading ? "…" : formatInt(jcrAgg.cur.guests)}
            delta={hfLoading ? undefined : jcrAgg.dGuests}
          />
          <KPIChip
            label="ADR anual"
            value={hfLoading ? "…" : formatMoneyUSD(jcrAgg.cur.adr)}
            delta={hfLoading ? undefined : jcrAgg.dAdr}
          />
        </div>
      </div>

      {/* ====== 2) Comparativa ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <Card title={`Comparativa ${year} vs ${baseYear}`} subtitle="Resumen por hotel (Rooms / Revenue / Guests / ADR)">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.85 }}>
                  <th style={{ padding: ".6rem .5rem" }}>Hotel</th>
                  <th style={{ padding: ".6rem .5rem" }}>Rooms</th>
                  <th style={{ padding: ".6rem .5rem" }}>Δ</th>
                  <th style={{ padding: ".6rem .5rem" }}>Revenue</th>
                  <th style={{ padding: ".6rem .5rem" }}>Δ</th>
                  <th style={{ padding: ".6rem .5rem" }}>Guests</th>
                  <th style={{ padding: ".6rem .5rem" }}>Δ</th>
                  <th style={{ padding: ".6rem .5rem" }}>ADR</th>
                  <th style={{ padding: ".6rem .5rem" }}>Δ</th>
                </tr>
              </thead>
              <tbody>
                {comparativaByHotel.map((it) => {
                  const dColor = (d: number) => (d >= 0 ? "rgba(102,255,198,.95)" : "rgba(255,155,155,.95)");
                  const fmtD = (d: number) => `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;

                  return (
                    <tr key={it.hotel} style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                      <td style={{ padding: ".6rem .5rem", fontWeight: 900 }}>{it.hotel}</td>

                      <td style={{ padding: ".6rem .5rem" }}>{formatInt(it.cur.rooms)}</td>
                      <td style={{ padding: ".6rem .5rem", color: dColor(it.dRooms), fontWeight: 850 }}>{fmtD(it.dRooms)}</td>

                      <td style={{ padding: ".6rem .5rem" }}>{formatMoneyUSD(it.cur.revenue)}</td>
                      <td style={{ padding: ".6rem .5rem", color: dColor(it.dRevenue), fontWeight: 850 }}>{fmtD(it.dRevenue)}</td>

                      <td style={{ padding: ".6rem .5rem" }}>{formatInt(it.cur.guests)}</td>
                      <td style={{ padding: ".6rem .5rem", color: dColor(it.dGuests), fontWeight: 850 }}>{fmtD(it.dGuests)}</td>

                      <td style={{ padding: ".6rem .5rem" }}>{formatMoneyUSD(it.cur.adr)}</td>
                      <td style={{ padding: ".6rem .5rem", color: dColor(it.dAdr), fontWeight: 850 }}>{fmtD(it.dAdr)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ====== 3) H&F – Explorador (JCR) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          H&F – Explorador (Grupo JCR)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Filtros por hotel JCR + año/mes/trimestre. Ranking mensual por hotel.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <HofExplorer filePath={HF_PATH} allowedHotels={Array.from(JCR_HOTELS)} title="H&F – Grupo JCR" defaultYear={year} />
        </div>
      </div>

      {/* ====== 4) Membership (JCR) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Membership (JCR)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Cantidades + composición. Usa filtros globales de año + hotel (JCR / Marriott / Sheratons).
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
            {/* Importante: membership solo JCR. Si globalHotel es MAITEI, mostramos JCR. */}
            <MembershipSummary
              year={year}
              baseYear={baseYear}
              allowedHotels={Array.from(JCR_HOTELS)}
              filePath={MEMBERSHIP_PATH}
              hotelFilter={membershipHotelFilter}
              compactCharts={true}
            />
          </div>
        </div>
      </div>

      {/* ====== 5) Nacionalidades (Marriott-only) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Nacionalidades
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Ranking por país + distribución por continente. (Archivo Marriott). Usa filtro global de año.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <CountryRanking year={year} filePath={NACIONALIDADES_PATH} hotelFilter={""} />
        </div>
      </div>

      {/* ====== 6) Maitei – Gotel Management ====== */}
      <div style={{ marginTop: "1.5rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Maitei — Gotel Management
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          KPIs + H&F para Maitei (bloque separado).
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <HofExplorer filePath={HF_PATH} allowedHotels={["MAITEI"]} title="H&F – Maitei" defaultYear={year} />
        </div>
      </div>

      {/* ====== CSS responsive puntual (para que no se rompa en celu) ====== */}
      <style jsx>{`
        .kpiGrid4 {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        @media (max-width: 980px) {
          .kpiGrid4 {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 520px) {
          .kpiGrid4 {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>
    </section>
  );
}
