"use client";

import React, { useEffect, useMemo, useState } from "react";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";
import {
  readCsvFromPublic,
  toNumberSmart,
  formatPct,
  formatMoney,
} from "./csvClient";

type JcrHotel = "MARRIOTT" | "SHERATON MDQ" | "SHERATON BCR";
type MaiteiHotel = "MAITEI";
type GlobalHotel = JcrHotel | MaiteiHotel;

const MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

/**
 * Ajustá inventario real por hotel si cambia.
 * (Se usa para ocupación y RevPAR)
 */
const ROOMS_PER_DAY: Record<GlobalHotel, number> = {
  MARRIOTT: 300,
  "SHERATON MDQ": 194,
  "SHERATON BCR": 161,
  MAITEI: 98,
};

function normHotel(v: any): string {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function parseAnyDate(v: any): Date | null {
  if (v === null || v === undefined) return null;

  // Excel serial
  if (typeof v === "number" && Number.isFinite(v)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + v * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }

  if (v instanceof Date && !isNaN(v.getTime())) return v;

  const s = String(v).trim();
  if (!s) return null;

  // "01-06-22 We" => tomamos la parte de fecha
  const firstToken = s.split(" ")[0]?.trim() ?? s;

  // dd/mm/yyyy
  const m1 = firstToken.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    let yy = Number(m1[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // dd-mm-yy o dd-mm-yyyy
  const m2 = firstToken.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (m2) {
    const dd = Number(m2[1]);
    const mm = Number(m2[2]);
    let yy = Number(m2[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}

function pickKey(keys: string[], candidates: string[]): string | null {
  const lower = new Map(keys.map((k) => [k.toLowerCase(), k]));
  for (const c of candidates) {
    const hit = lower.get(c.toLowerCase());
    if (hit) return hit;
  }
  // fallback parcial
  for (const c of candidates) {
    const cLow = c.toLowerCase();
    const found = keys.find((k) => k.toLowerCase().includes(cLow));
    if (found) return found;
  }
  return null;
}

type HfRow = {
  date: Date;
  year: number;
  month: number;
  hotel: GlobalHotel;
  roomsOcc: number;   // Total Occ.
  revenue: number;    // Room Revenue
  guests: number;     // Adl. & Chl.
};

type Agg = {
  days: number;
  availableRooms: number;
  roomsOcc: number;
  revenue: number;
  guests: number;
  occ01: number;   // 0..1
  adr: number;
  revpar: number;
  dblOcc: number;
};

function aggregate(list: HfRow[], hotel: GlobalHotel): Agg | null {
  if (!list.length) return null;

  const days = list.length;
  const availableRooms = (ROOMS_PER_DAY[hotel] ?? 0) * days;

  const roomsOcc = list.reduce((a, r) => a + (Number.isFinite(r.roomsOcc) ? r.roomsOcc : 0), 0);
  const revenue  = list.reduce((a, r) => a + (Number.isFinite(r.revenue)  ? r.revenue  : 0), 0);
  const guests   = list.reduce((a, r) => a + (Number.isFinite(r.guests)   ? r.guests   : 0), 0);

  const occ01 = availableRooms > 0 ? roomsOcc / availableRooms : 0;    // 0..1
  const adr   = roomsOcc > 0 ? revenue / roomsOcc : 0;
  const revpar = availableRooms > 0 ? revenue / availableRooms : 0;
  const dblOcc = roomsOcc > 0 ? guests / roomsOcc : 0;

  return { days, availableRooms, roomsOcc, revenue, guests, occ01, adr, revpar, dblOcc };
}

function kpiCard(label: string, value: string, sub?: string) {
  return (
    <div
      className="card"
      style={{
        padding: "1rem",
        borderRadius: 18,
        minWidth: 220,
        border: "1px solid rgba(255,255,255,.10)",
        background: "rgba(255,255,255,.03)",
      }}
    >
      <div style={{ fontSize: ".85rem", opacity: 0.85 }}>{label}</div>
      <div style={{ fontSize: "1.35rem", fontWeight: 950, marginTop: ".2rem" }}>{value}</div>
      {sub ? <div style={{ marginTop: ".25rem", fontSize: ".85rem", opacity: 0.75 }}>{sub}</div> : null}
    </div>
  );
}

function deltaPP(d01: number): string {
  // puntos porcentuales
  const pp = d01 * 100;
  const s = pp.toFixed(1).replace(".", ",");
  return `${pp >= 0 ? "+" : ""}${s} pp`;
}

export default function YearComparator() {
  // ===== BLOQUE JCR =====
  const [jcrHotel, setJcrHotel] = useState<JcrHotel>("MARRIOTT");
  const [jcrYear, setJcrYear] = useState<number>(new Date().getFullYear());
  const [jcrBaseYear, setJcrBaseYear] = useState<number>(new Date().getFullYear() - 1);

  // ===== BLOQUE MAITEI =====
  const [maiteiYear, setMaiteiYear] = useState<number>(new Date().getFullYear());
  const [maiteiBaseYear, setMaiteiBaseYear] = useState<number>(new Date().getFullYear() - 1);

  // ===== H&F CSV =====
  const [hfRows, setHfRows] = useState<HfRow[]>([]);
  const [hfLoading, setHfLoading] = useState(true);
  const [hfErr, setHfErr] = useState("");

  useEffect(() => {
    let alive = true;

    setHfLoading(true);
    setHfErr("");

    readCsvFromPublic(HF_PATH)
      .then((rows) => {
        if (!alive) return;

        const keys = rows?.[0] ? Object.keys(rows[0]) : [];

        const kHotel = pickKey(keys, ["Empresa", "Hotel"]);
        // preferimos Fecha (dd/mm/yyyy) antes que Date ("01-06-22 We")
        const kDate = pickKey(keys, ["Fecha", "Date"]);
        const kRoomsOcc = pickKey(keys, [
          "Total Occ.",
          "Total Occ",
          "Total\nOcc.",
          "Total\nOcc",
          "Occupied",
          "Rooms Occ",
          "RoomsOcc",
        ]);
        const kRevenue = pickKey(keys, [
          "Room Revenue",
          "Room\nRevenue",
          "RoomRevenue",
          "Revenue",
          "Room Rev",
        ]);
        const kGuests = pickKey(keys, [
          "Adl. & Chl.",
          "Adl.\n&\nChl.",
          "Guests",
          "Pax",
          "Personas",
        ]);

        const parsed: HfRow[] = (rows ?? [])
          .map((r: any) => {
            const rawHotel = kHotel ? r[kHotel] : (r.Empresa ?? r.Hotel);
            const h = normHotel(rawHotel) as GlobalHotel;

            if (!["MARRIOTT", "SHERATON MDQ", "SHERATON BCR", "MAITEI"].includes(h)) return null;

            const d = parseAnyDate(kDate ? r[kDate] : (r.Fecha ?? r.Date));
            if (!d) return null;

            const roomsOcc = toNumberSmart(kRoomsOcc ? r[kRoomsOcc] : r["Total Occ."]);
            const revenue  = toNumberSmart(kRevenue ? r[kRevenue] : r["Room Revenue"]);
            const guests   = toNumberSmart(kGuests ? r[kGuests] : r["Adl. & Chl."]);

            return {
              date: d,
              year: d.getFullYear(),
              month: d.getMonth() + 1,
              hotel: h,
              roomsOcc,
              revenue,
              guests,
            } as HfRow;
          })
          .filter(Boolean) as HfRow[];

        setHfRows(parsed);

        // default años según data real
        const yearsJcr = Array.from(new Set(parsed.filter(x => x.hotel === "MARRIOTT").map(x => x.year))).sort((a,b)=>a-b);
        const yearsMai = Array.from(new Set(parsed.filter(x => x.hotel === "MAITEI").map(x => x.year))).sort((a,b)=>a-b);

        if (yearsJcr.length) {
          const maxY = yearsJcr[yearsJcr.length - 1];
          if (!yearsJcr.includes(jcrYear)) setJcrYear(maxY);
          if (!yearsJcr.includes(jcrBaseYear)) setJcrBaseYear(Math.max(yearsJcr[0], maxY - 1));
        }
        if (yearsMai.length) {
          const maxY = yearsMai[yearsMai.length - 1];
          if (!yearsMai.includes(maiteiYear)) setMaiteiYear(maxY);
          if (!yearsMai.includes(maiteiBaseYear)) setMaiteiBaseYear(Math.max(yearsMai[0], maxY - 1));
        }
      })
      .catch((e) => {
        console.error(e);
        setHfErr(String(e?.message ?? e));
        setHfRows([]);
      })
      .finally(() => setHfLoading(false));

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ====== YEARS DISPONIBLES ======
  const yearsForHotel = (hotel: GlobalHotel) =>
    Array.from(new Set(hfRows.filter(r => r.hotel === hotel).map(r => r.year))).sort((a,b)=>a-b);

  const yearsJcrAvailable = useMemo(() => {
    // unión de años de los 3 hoteles JCR
    const set = new Set<number>();
    (["MARRIOTT","SHERATON MDQ","SHERATON BCR"] as JcrHotel[]).forEach(h => {
      yearsForHotel(h as GlobalHotel).forEach(y => set.add(y));
    });
    return Array.from(set).sort((a,b)=>a-b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hfRows]);

  const yearsMaiteiAvailable = useMemo(() => yearsForHotel("MAITEI"), [hfRows]);

  // ====== HELPERS DE FILTRADO ======
  const rowsHotelYear = (hotel: GlobalHotel, year: number) =>
    hfRows.filter(r => r.hotel === hotel && r.year === year);

  const jcrRowsYear = useMemo(() => rowsHotelYear(jcrHotel, jcrYear), [hfRows, jcrHotel, jcrYear]);
  const jcrRowsBase = useMemo(() => rowsHotelYear(jcrHotel, jcrBaseYear), [hfRows, jcrHotel, jcrBaseYear]);

  const maiRowsYear = useMemo(() => rowsHotelYear("MAITEI", maiteiYear), [hfRows, maiteiYear]);
  const maiRowsBase = useMemo(() => rowsHotelYear("MAITEI", maiteiBaseYear), [hfRows, maiteiBaseYear]);

  const jcrAggYear = useMemo(() => aggregate(jcrRowsYear, jcrHotel), [jcrRowsYear, jcrHotel]);
  const jcrAggBase = useMemo(() => aggregate(jcrRowsBase, jcrHotel), [jcrRowsBase, jcrHotel]);

  const maiAggYear = useMemo(() => aggregate(maiRowsYear, "MAITEI"), [maiRowsYear]);
  const maiAggBase = useMemo(() => aggregate(maiRowsBase, "MAITEI"), [maiRowsBase]);

  // ===== Ranking mensual =====
  const monthAgg = (hotel: GlobalHotel, year: number) => {
    const list = rowsHotelYear(hotel, year);
    const map = new Map<number, HfRow[]>();
    for (const r of list) {
      if (!map.has(r.month)) map.set(r.month, []);
      map.get(r.month)!.push(r);
    }
    return Array.from({ length: 12 }).map((_, idx) => {
      const m = idx + 1;
      const a = aggregate(map.get(m) ?? [], hotel);
      return {
        month: m,
        label: MONTHS_ES[idx],
        roomsOcc: a?.roomsOcc ?? 0,
        revenue: a?.revenue ?? 0,
        occ01: a?.occ01 ?? 0,
        adr: a?.adr ?? 0,
        revpar: a?.revpar ?? 0,
      };
    });
  };

  const jcrByMonth = useMemo(() => monthAgg(jcrHotel, jcrYear), [hfRows, jcrHotel, jcrYear]);
  const maiByMonth = useMemo(() => monthAgg("MAITEI", maiteiYear), [hfRows, maiteiYear]);

  // ===== Comparativa mensual =====
  const compareMonth = (hotel: GlobalHotel, year: number, base: number) => {
    const mk = (list: HfRow[]) => {
      const m = new Map<number, HfRow[]>();
      for (const r of list) {
        if (!m.has(r.month)) m.set(r.month, []);
        m.get(r.month)!.push(r);
      }
      return m;
    };
    const cur = mk(rowsHotelYear(hotel, year));
    const bas = mk(rowsHotelYear(hotel, base));

    return Array.from({ length: 12 }).map((_, idx) => {
      const month = idx + 1;
      const aCur = aggregate(cur.get(month) ?? [], hotel);
      const aBas = aggregate(bas.get(month) ?? [], hotel);

      const occCur = aCur?.occ01 ?? 0;
      const occBas = aBas?.occ01 ?? 0;

      const adrCur = aCur?.adr ?? 0;
      const adrBas = aBas?.adr ?? 0;

      const revparCur = aCur?.revpar ?? 0;
      const revparBas = aBas?.revpar ?? 0;

      const roomsCur = aCur?.roomsOcc ?? 0;
      const roomsBas = aBas?.roomsOcc ?? 0;

      const revCur = aCur?.revenue ?? 0;
      const revBas = aBas?.revenue ?? 0;

      return {
        label: MONTHS_ES[idx],
        occCur, occBas, occDelta: occCur - occBas,
        adrDelta: adrCur - adrBas,
        revparDelta: revparCur - revparBas,
        roomsDelta: roomsCur - roomsBas,
        revDelta: revCur - revBas,
      };
    });
  };

  const jcrCompare = useMemo(() => compareMonth(jcrHotel, jcrYear, jcrBaseYear), [hfRows, jcrHotel, jcrYear, jcrBaseYear]);
  const maiCompare = useMemo(() => compareMonth("MAITEI", maiteiYear, maiteiBaseYear), [hfRows, maiteiYear, maiteiBaseYear]);

  // ====== UI ======
  const stickyBase: React.CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 20,
    backdropFilter: "blur(10px)",
    padding: ".75rem",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,.14)",
  };

  const selectStyle: React.CSSProperties = {
    padding: ".55rem .65rem",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,.20)",
    background: "rgba(0,0,0,.18)",
    color: "white",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = { fontSize: ".85rem", opacity: 0.9, marginBottom: ".25rem" };

  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: ".6rem",
    overflow: "hidden",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,.12)",
  };

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    fontSize: ".85rem",
    opacity: 0.85,
    padding: ".6rem .7rem",
    borderBottom: "1px solid rgba(255,255,255,.10)",
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: ".55rem .7rem",
    borderBottom: "1px solid rgba(255,255,255,.08)",
    whiteSpace: "nowrap",
    fontSize: ".92rem",
  };

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      {/* ==============================
          BLOQUE JCR (STICKY ROJO)
      ============================== */}
      <section className="section" id="jcr">
        <div className="sectionTitle" style={{ fontSize: "1.35rem", fontWeight: 950 }}>
          Informe Hoteles — History & Forecast
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Bloque JCR (Marriott + Sheraton MDQ + Sheraton BCR). Filtros globales sticky.
        </div>

        <div
          style={{
            ...stickyBase,
            background: "linear-gradient(180deg, rgba(255,0,0,.18), rgba(0,0,0,.25))",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: ".75rem",
            }}
          >
            <div>
              <div style={labelStyle}>Hotel (JCR)</div>
              <select value={jcrHotel} onChange={(e) => setJcrHotel(e.target.value as JcrHotel)} style={selectStyle}>
                <option value="MARRIOTT">MARRIOTT</option>
                <option value="SHERATON MDQ">SHERATON MDQ</option>
                <option value="SHERATON BCR">SHERATON BCR</option>
              </select>
            </div>

            <div>
              <div style={labelStyle}>Año</div>
              <select value={jcrYear} onChange={(e) => setJcrYear(Number(e.target.value))} style={selectStyle}>
                {(yearsJcrAvailable.length ? yearsJcrAvailable : [jcrYear]).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div>
              <div style={labelStyle}>Base (comparativa)</div>
              <select value={jcrBaseYear} onChange={(e) => setJcrBaseYear(Number(e.target.value))} style={selectStyle}>
                {(yearsJcrAvailable.length ? yearsJcrAvailable : [jcrBaseYear]).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", alignContent: "end" }}>
              {hfLoading ? <div style={{ opacity: 0.85 }}>Cargando H&F…</div> : null}
              {hfErr ? <div style={{ color: "#ffb4b4" }}>Error: {hfErr}</div> : null}
            </div>
          </div>
        </div>

        {/* KPIs (carrousel horizontal responsive) */}
        <div style={{ marginTop: "1rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            KPIs principales ({jcrHotel} · {jcrYear})
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Ocupación, ADR, RevPAR, doble ocupación, rooms y revenue.
          </div>

          {jcrAggYear ? (
            <div style={{ display: "flex", gap: ".8rem", overflowX: "auto", paddingBottom: ".35rem", marginTop: ".85rem" }}>
              {kpiCard("Ocupación", formatPct(jcrAggYear.occ01), `Rooms occ: ${Math.round(jcrAggYear.roomsOcc).toLocaleString("es-AR")}`)}
              {kpiCard("ADR", formatMoney(jcrAggYear.adr), `Revenue: ${formatMoney(jcrAggYear.revenue)}`)}
              {kpiCard("RevPAR", formatMoney(jcrAggYear.revpar), `Avail rooms: ${Math.round(jcrAggYear.availableRooms).toLocaleString("es-AR")}`)}
              {kpiCard("Doble ocupación", jcrAggYear.dblOcc.toFixed(2).replace(".", ","), `Guests: ${Math.round(jcrAggYear.guests).toLocaleString("es-AR")}`)}
            </div>
          ) : (
            <div className="card" style={{ padding: "1rem", borderRadius: 18, marginTop: ".85rem" }}>
              Sin filas H&F para <b>{jcrHotel}</b> en <b>{jcrYear}</b>.
            </div>
          )}
        </div>

        {/* Ranking por mes */}
        <div style={{ marginTop: "1.1rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            Ranking por mes (H&F)
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Mes</th>
                  <th style={thStyle}>Occ%</th>
                  <th style={thStyle}>ADR</th>
                  <th style={thStyle}>RevPAR</th>
                  <th style={thStyle}>Rooms Occ</th>
                  <th style={thStyle}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {jcrByMonth.map((m) => (
                  <tr key={m.month}>
                    <td style={tdStyle}>{m.label}</td>
                    <td style={tdStyle}>{formatPct(m.occ01)}</td>
                    <td style={tdStyle}>{formatMoney(m.adr)}</td>
                    <td style={tdStyle}>{formatMoney(m.revpar)}</td>
                    <td style={tdStyle}>{Math.round(m.roomsOcc).toLocaleString("es-AR")}</td>
                    <td style={tdStyle}>{formatMoney(m.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Comparativa */}
        <div style={{ marginTop: "1.1rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            Comparativa {jcrYear} vs {jcrBaseYear}
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Δ Occ en puntos porcentuales, el resto en valores nominales.
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Mes</th>
                  <th style={thStyle}>Occ {jcrYear}</th>
                  <th style={thStyle}>Occ {jcrBaseYear}</th>
                  <th style={thStyle}>Δ Occ</th>
                  <th style={thStyle}>Δ ADR</th>
                  <th style={thStyle}>Δ RevPAR</th>
                  <th style={thStyle}>Δ Rooms</th>
                  <th style={thStyle}>Δ Revenue</th>
                </tr>
              </thead>
              <tbody>
                {jcrCompare.map((m, idx) => (
                  <tr key={idx}>
                    <td style={tdStyle}>{m.label}</td>
                    <td style={tdStyle}>{formatPct(m.occCur)}</td>
                    <td style={tdStyle}>{formatPct(m.occBas)}</td>
                    <td style={tdStyle}>{deltaPP(m.occDelta)}</td>
                    <td style={tdStyle}>{formatMoney(m.adrDelta)}</td>
                    <td style={tdStyle}>{formatMoney(m.revparDelta)}</td>
                    <td style={tdStyle}>{Math.round(m.roomsDelta).toLocaleString("es-AR")}</td>
                    <td style={tdStyle}>{formatMoney(m.revDelta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Membership (JCR) */}
        <div style={{ marginTop: "1.25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            Membership (JCR)
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Usa filtro global de año + hotel (JCR).
          </div>

          <div style={{ marginTop: ".85rem" }}>
            <MembershipSummary
              year={jcrYear}
              baseYear={jcrBaseYear}
              filePath={MEMBERSHIP_PATH}
              title="Membership (JCR)"
              hotelFilter={jcrHotel}
              allowedHotels={["MARRIOTT","SHERATON MDQ","SHERATON BCR"]}
              compactCharts={false}
            />
          </div>
        </div>

        {/* Nacionalidades (solo Marriott, sin filtro hotel) */}
        <div style={{ marginTop: "1.25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            Nacionalidades (Marriott)
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Ranking por país + distribución por continente. Usa filtro de año (sin hotel).
          </div>

          <div style={{ marginTop: ".85rem" }}>
            <CountryRanking year={jcrYear} filePath={NACIONALIDADES_PATH} />
          </div>
        </div>
      </section>

      {/* ==============================
          BLOQUE MAITEI (STICKY CELESTE)
      ============================== */}
      <section className="section" id="maitei">
        <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
          MAITEI — Management (Gotel)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Bloque separado con filtros propios (no afecta al bloque JCR).
        </div>

        <div
          style={{
            ...stickyBase,
            background: "linear-gradient(180deg, rgba(0,150,255,.20), rgba(0,0,0,.25))",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: ".75rem",
            }}
          >
            <div>
              <div style={labelStyle}>Hotel</div>
              <div style={{ ...selectStyle, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 900 }}>MAITEI</span>
                <span style={{ opacity: 0.8, fontSize: ".9rem" }}>Management</span>
              </div>
            </div>

            <div>
              <div style={labelStyle}>Año</div>
              <select value={maiteiYear} onChange={(e) => setMaiteiYear(Number(e.target.value))} style={selectStyle}>
                {(yearsMaiteiAvailable.length ? yearsMaiteiAvailable : [maiteiYear]).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div>
              <div style={labelStyle}>Base (comparativa)</div>
              <select value={maiteiBaseYear} onChange={(e) => setMaiteiBaseYear(Number(e.target.value))} style={selectStyle}>
                {(yearsMaiteiAvailable.length ? yearsMaiteiAvailable : [maiteiBaseYear]).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* KPIs MAITEI */}
        <div style={{ marginTop: "1rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.1rem", fontWeight: 950 }}>
            KPIs principales (MAITEI · {maiteiYear})
          </div>

          {maiAggYear ? (
            <div style={{ display: "flex", gap: ".8rem", overflowX: "auto", paddingBottom: ".35rem", marginTop: ".85rem" }}>
              {kpiCard("Ocupación", formatPct(maiAggYear.occ01), `Rooms occ: ${Math.round(maiAggYear.roomsOcc).toLocaleString("es-AR")}`)}
              {kpiCard("ADR", formatMoney(maiAggYear.adr), `Revenue: ${formatMoney(maiAggYear.revenue)}`)}
              {kpiCard("RevPAR", formatMoney(maiAggYear.revpar), `Avail rooms: ${Math.round(maiAggYear.availableRooms).toLocaleString("es-AR")}`)}
              {kpiCard("Doble ocupación", maiAggYear.dblOcc.toFixed(2).replace(".", ","), `Guests: ${Math.round(maiAggYear.guests).toLocaleString("es-AR")}`)}
            </div>
          ) : (
            <div className="card" style={{ padding: "1rem", borderRadius: 18, marginTop: ".85rem" }}>
              Sin filas H&F para <b>MAITEI</b> en <b>{maiteiYear}</b>.
            </div>
          )}
        </div>

        {/* Ranking MAITEI */}
        <div style={{ marginTop: "1.1rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.1rem", fontWeight: 950 }}>
            Ranking por mes (MAITEI)
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Mes</th>
                  <th style={thStyle}>Occ%</th>
                  <th style={thStyle}>ADR</th>
                  <th style={thStyle}>RevPAR</th>
                  <th style={thStyle}>Rooms Occ</th>
                  <th style={thStyle}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {maiByMonth.map((m) => (
                  <tr key={m.month}>
                    <td style={tdStyle}>{m.label}</td>
                    <td style={tdStyle}>{formatPct(m.occ01)}</td>
                    <td style={tdStyle}>{formatMoney(m.adr)}</td>
                    <td style={tdStyle}>{formatMoney(m.revpar)}</td>
                    <td style={tdStyle}>{Math.round(m.roomsOcc).toLocaleString("es-AR")}</td>
                    <td style={tdStyle}>{formatMoney(m.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Comparativa MAITEI */}
        <div style={{ marginTop: "1.1rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.1rem", fontWeight: 950 }}>
            Comparativa MAITEI {maiteiYear} vs {maiteiBaseYear}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Mes</th>
                  <th style={thStyle}>Occ {maiteiYear}</th>
                  <th style={thStyle}>Occ {maiteiBaseYear}</th>
                  <th style={thStyle}>Δ Occ</th>
                  <th style={thStyle}>Δ ADR</th>
                  <th style={thStyle}>Δ RevPAR</th>
                  <th style={thStyle}>Δ Rooms</th>
                  <th style={thStyle}>Δ Revenue</th>
                </tr>
              </thead>
              <tbody>
                {maiCompare.map((m, idx) => (
                  <tr key={idx}>
                    <td style={tdStyle}>{m.label}</td>
                    <td style={tdStyle}>{formatPct(m.occCur)}</td>
                    <td style={tdStyle}>{formatPct(m.occBas)}</td>
                    <td style={tdStyle}>{deltaPP(m.occDelta)}</td>
                    <td style={tdStyle}>{formatMoney(m.adrDelta)}</td>
                    <td style={tdStyle}>{formatMoney(m.revparDelta)}</td>
                    <td style={tdStyle}>{Math.round(m.roomsDelta).toLocaleString("es-AR")}</td>
                    <td style={tdStyle}>{formatMoney(m.revDelta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
