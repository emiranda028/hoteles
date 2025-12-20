"use client";

import { useEffect, useMemo, useState } from "react";

import HofExplorer from "./HofExplorer";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";

/**
 * AJUSTES CLAVE:
 * - Filtros globales (AÑO + HOTEL) que aplican a:
 *   - Comparativa
 *   - Membership
 *   - H&F
 * - Nacionalidades: NO usa filtro hotel (solo Marriott)
 */

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

const JCR_HOTELS = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];
const GOTEL_HOTELS = ["MAITEI"];
const HOTEL_GROUPS: Record<string, string[]> = {
  JCR: JCR_HOTELS,
  GOTEL: GOTEL_HOTELS,
};

type HofRow = {
  empresa: string;
  year: number;
  month: number; // 1-12
  occRooms: number; // occupied rooms (Total Occ.)
  roomRevenue: number;
  adr: number;
  persons: number; // guests (Adl.&Chl.)
  // ...otros si existen
};

function normHotel(x: any) {
  const s = String(x ?? "")
    .trim()
    .toUpperCase();

  if (!s) return "";

  // Normalizaciones típicas
  if (s.includes("MARRIOTT")) return "MARRIOTT";
  if (s.includes("BARILOCHE") || s.includes("BCR")) return "SHERATON BCR";
  if (s.includes("MAR DEL PLATA") || s.includes("MDQ")) return "SHERATON MDQ";
  if (s.includes("MAITEI")) return "MAITEI";

  // Si ya viene ok:
  if (JCR_HOTELS.includes(s)) return s;
  if (GOTEL_HOTELS.includes(s)) return s;

  return s;
}

function parseNumberES(v: any) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  let s = String(v).trim();
  if (!s) return 0;

  // Quitar separadores de miles y normalizar decimal
  // Ej: "5.251.930,33" -> "5251930.33"
  s = s.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseYearFromAny(d: any): number {
  // Si ya es un año
  if (typeof d === "number" && d > 1900 && d < 2100) return Math.floor(d);

  const s = String(d ?? "").trim();
  if (!s) return 0;

  // Formatos posibles: "1/6/2022", "01-06-22 Wed", "2022-06-01"
  // Buscamos 4 dígitos
  const m4 = s.match(/(19|20)\d{2}/);
  if (m4) return Number(m4[0]);

  // Dos dígitos al final: "01-06-22"
  const m2 = s.match(/(\D|^)(\d{2})(\D|$)/g);
  // no confiable, devolvemos 0
  return 0;
}

function parseMonthFromAny(d: any): number {
  // busco dd/mm/yyyy o d/m/yyyy
  const s = String(d ?? "").trim();
  if (!s) return 0;

  // 1/6/2022 -> month=6
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-]((19|20)\d{2}|\d{2})/);
  if (m) {
    const mm = Number(m[2]);
    if (mm >= 1 && mm <= 12) return mm;
  }

  return 0;
}

function fmtInt(n: number) {
  return (n ?? 0).toLocaleString("es-AR");
}
function fmtMoney(n: number) {
  return (n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtPct(n: number) {
  return (n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

function availabilityPerDay(hotel: string) {
  const h = normHotel(hotel);
  if (h === "MARRIOTT") return 300;
  if (h === "SHERATON MDQ") return 194;
  if (h === "SHERATON BCR") return 161;
  if (h === "MAITEI") return 98;
  return 0;
}

// CSV simple reader (public/)
async function readCsv(path: string): Promise<any[]> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar CSV ${path} (status ${res.status})`);
  const text = await res.text();

  // Separador probable ; (tus datos vienen con ;)
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0].split(";").map((h) => h.replace(/^"|"$/g, "").trim());
  const rows: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const cols = raw.split(";");

    const obj: any = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = (cols[c] ?? "").replace(/^"|"$/g, "").trim();
    }
    rows.push(obj);
  }
  return rows;
}

function toHofRow(r: any): HofRow | null {
  // Keys típicas del H&F diario:
  // Empresa, Fecha, Total Occ., Room Revenue, Average Rate, Adl.&Chl., etc.

  const empresa = normHotel(r["Empresa"] ?? r["empresa"] ?? r["HOTEL"] ?? r["Hotel"]);
  const fecha = r["Fecha"] ?? r["fecha"] ?? r["Date"] ?? r["date"];

  const year = parseYearFromAny(fecha);
  const month = parseMonthFromAny(fecha);

  if (!empresa || !year || !month) return null;

  const occRooms = parseNumberES(r["Total Occ."] ?? r["Total\nOcc."] ?? r["Total Occ"] ?? r["TotalOcc"] ?? r["Occupied"]);
  const roomRevenue = parseNumberES(r["Room Revenue"] ?? r["RoomRevenue"] ?? r["Revenue"]);
  const adr = parseNumberES(r["Average Rate"] ?? r["Average\nRate"] ?? r["ADR"] ?? r["AverageRate"]);
  const persons = parseNumberES(r["Adl. & Chl."] ?? r["Adl.\n&\nChl."] ?? r["Guests"] ?? r["Pax"]);

  return { empresa, year, month, occRooms, roomRevenue, adr, persons };
}

export default function YearComparator() {
  // ======= filtros globales =======
  const [group, setGroup] = useState<keyof typeof HOTEL_GROUPS>("JCR");
  const [globalHotel, setGlobalHotel] = useState<string>("JCR"); // JCR o hotel
  const [year, setYear] = useState<number>(2025);
  const baseYear = year - 1;

  // ======= data H&F =======
  const [hofRows, setHofRows] = useState<HofRow[]>([]);
  const [hofLoading, setHofLoading] = useState(true);
  const [hofErr, setHofErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        setHofLoading(true);
        setHofErr("");
        const raw = await readCsv(HF_PATH);
        const parsed: HofRow[] = [];
        for (const r of raw) {
          const row = toHofRow(r);
          if (row) parsed.push(row);
        }
        setHofRows(parsed);
      } catch (e: any) {
        setHofErr(String(e?.message ?? e));
        setHofRows([]);
      } finally {
        setHofLoading(false);
      }
    })();
  }, []);

  const yearsAvailable = useMemo(() => {
    const set = new Set<number>();
    for (const r of hofRows) set.add(r.year);
    return Array.from(set).sort((a, b) => b - a);
  }, [hofRows]);

  // default year: si 2025 no existe, toma el máximo
  useEffect(() => {
    if (hofRows.length === 0) return;
    if (yearsAvailable.includes(2025)) return;
    if (yearsAvailable.length > 0) setYear(yearsAvailable[0]);
  }, [hofRows, yearsAvailable]);

  // hoteles disponibles por grupo
  const hotelsForGroup = useMemo(() => HOTEL_GROUPS[group], [group]);

  // si cambia de grupo, reseteo hotel global
  useEffect(() => {
    setGlobalHotel(group === "JCR" ? "JCR" : "MAITEI");
  }, [group]);

  // ======= KPI agregados para carruseles y comparativa =======
  function filterForHotelScope(list: HofRow[], scope: string) {
    // scope puede ser "JCR" o "MARRIOTT" etc.
    if (scope === "JCR") {
      const set = new Set(JCR_HOTELS);
      return list.filter((r) => set.has(normHotel(r.empresa)));
    }
    if (scope === "GOTEL") {
      const set = new Set(GOTEL_HOTELS);
      return list.filter((r) => set.has(normHotel(r.empresa)));
    }
    // hotel específico
    const h = normHotel(scope);
    return list.filter((r) => normHotel(r.empresa) === h);
  }

  function aggYear(list: HofRow[], y: number, scope: string) {
    const rows = filterForHotelScope(list, scope).filter((r) => r.year === y);
    if (rows.length === 0) {
      return {
        y,
        rows: 0,
        roomsOcc: 0,
        revenue: 0,
        guests: 0,
        adr: 0,
        occPct: 0,
      };
    }

    let roomsOcc = 0;
    let revenue = 0;
    let guests = 0;
    let adrW = 0; // ADR ponderada por roomsOcc
    let occPctW = 0; // ocupación ponderada por disponibilidad mensual
    let denomOcc = 0;

    // disponibilidad mensual: suma(availPerDay * daysInMonth)
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    // para JCR: disponibilidad por hotel sumada por mes
    for (const r of rows) {
      roomsOcc += r.occRooms;
      revenue += r.roomRevenue;
      guests += r.persons;

      // ADR ponderada por rooms
      adrW += r.adr * r.occRooms;

      // ocupación: roomsOcc / disponibilidad
      const availDay =
        scope === "JCR"
          ? availabilityPerDay(r.empresa)
          : availabilityPerDay(scope);

      const availMonth = availDay * (daysInMonth[(r.month ?? 1) - 1] ?? 30);
      denomOcc += availMonth;
    }

    const adr = roomsOcc > 0 ? adrW / roomsOcc : 0;
    const occPct = denomOcc > 0 ? (roomsOcc / denomOcc) * 100 : 0;

    return {
      y,
      rows: rows.length,
      roomsOcc,
      revenue,
      guests,
      adr,
      occPct,
    };
  }

  const jcrCur = useMemo(() => aggYear(hofRows, year, "JCR"), [hofRows, year]);
  const jcrBase = useMemo(() => aggYear(hofRows, baseYear, "JCR"), [hofRows, baseYear]);

  const gotelCur = useMemo(() => aggYear(hofRows, year, "MAITEI"), [hofRows, year]);
  const gotelBase = useMemo(() => aggYear(hofRows, baseYear, "MAITEI"), [hofRows, baseYear]);

  function deltaPct(cur: number, base: number) {
    if (!base) return 0;
    return ((cur - base) / base) * 100;
  }
  function deltaPP(curPct: number, basePct: number) {
    return curPct - basePct;
  }

  // ======= UI =======
  return (
    <section className="section" id="comparador">
      {/* ====== Filtros globales ====== */}
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: 900 }}>Filtros globales</div>

          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            <button
              className={group === "JCR" ? "btnPrimary" : "btnOutline"}
              type="button"
              onClick={() => setGroup("JCR")}
            >
              Grupo JCR
            </button>
            <button
              className={group === "GOTEL" ? "btnPrimary" : "btnOutline"}
              type="button"
              onClick={() => setGroup("GOTEL")}
            >
              Gotel (Maitei)
            </button>
          </div>

          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ opacity: 0.8 }}>Año:</span>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ padding: ".45rem .6rem", borderRadius: 10 }}
            >
              {yearsAvailable.length === 0 ? (
                <>
                  <option value={2025}>2025</option>
                  <option value={2024}>2024</option>
                </>
              ) : (
                yearsAvailable.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))
              )}
            </select>
          </div>

          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ opacity: 0.8 }}>Hotel:</span>
            <select
              value={globalHotel}
              onChange={(e) => setGlobalHotel(e.target.value)}
              style={{ padding: ".45rem .6rem", borderRadius: 10, minWidth: 220 }}
            >
              {group === "JCR" ? (
                <>
                  <option value="JCR">JCR (Consolidado)</option>
                  {JCR_HOTELS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </>
              ) : (
                <>
                  <option value="MAITEI">MAITEI</option>
                </>
              )}
            </select>
          </div>

          <div style={{ marginLeft: "auto", opacity: 0.8, fontSize: ".9rem" }}>
            Año base: <b>{baseYear}</b>
          </div>
        </div>

        {hofLoading ? (
          <div style={{ marginTop: ".75rem", opacity: 0.75 }}>Cargando H&F…</div>
        ) : hofErr ? (
          <div style={{ marginTop: ".75rem", color: "crimson" }}>Error H&F: {hofErr}</div>
        ) : (
          <div style={{ marginTop: ".75rem", opacity: 0.75, fontSize: ".9rem" }}>
            H&F rows: <b>{hofRows.length}</b> · Años:{" "}
            <b>{yearsAvailable.length ? yearsAvailable.join(", ") : "—"}</b>
          </div>
        )}
      </div>

      {/* ====== 1) Carruseles (solo JCR al inicio) ====== */}
      {group === "JCR" && (
        <div style={{ marginTop: "1rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
            Vista ejecutiva — Grupo JCR
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            KPIs {year} vs {baseYear} (auto).
          </div>

          <div
            style={{
              marginTop: "1rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "1rem",
            }}
          >
            <div className="kpiCard" style={{ padding: "1.1rem", borderRadius: 22 }}>
              <div className="kpiLabel">Rooms occupied</div>
              <div className="kpiBig">{fmtInt(jcrCur.roomsOcc)}</div>
              <div className="kpiDelta">
                {deltaPct(jcrCur.roomsOcc, jcrBase.roomsOcc).toFixed(1).replace(".", ",")}%
                <span style={{ opacity: 0.8 }}> vs {baseYear}</span>
              </div>
            </div>

            <div className="kpiCard" style={{ padding: "1.1rem", borderRadius: 22 }}>
              <div className="kpiLabel">Room Revenue</div>
              <div className="kpiBig">{fmtMoney(jcrCur.revenue)}</div>
              <div className="kpiDelta">
                {deltaPct(jcrCur.revenue, jcrBase.revenue).toFixed(1).replace(".", ",")}%
                <span style={{ opacity: 0.8 }}> vs {baseYear}</span>
              </div>
            </div>

            <div className="kpiCard" style={{ padding: "1.1rem", borderRadius: 22 }}>
              <div className="kpiLabel">Huéspedes</div>
              <div className="kpiBig">{fmtInt(jcrCur.guests)}</div>
              <div className="kpiDelta">
                {deltaPct(jcrCur.guests, jcrBase.guests).toFixed(1).replace(".", ",")}%
                <span style={{ opacity: 0.8 }}> vs {baseYear}</span>
              </div>
            </div>

            <div className="kpiCard" style={{ padding: "1.1rem", borderRadius: 22 }}>
              <div className="kpiLabel">Ocupación</div>
              <div className="kpiBig">{fmtPct(jcrCur.occPct)}</div>
              <div className="kpiDelta">
                {deltaPP(jcrCur.occPct, jcrBase.occPct).toFixed(1).replace(".", ",")} p.p.
                <span style={{ opacity: 0.8 }}> vs {baseYear}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== 2) Comparativa (usa filtros globales) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
          Comparativa {year} vs {baseYear}
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Se calcula según el hotel seleccionado (Consolidado si elegís “JCR”).
        </div>

        <div className="card" style={{ marginTop: "1rem", padding: "1rem", borderRadius: 22 }}>
          {(() => {
            const cur = aggYear(hofRows, year, globalHotel);
            const base = aggYear(hofRows, baseYear, globalHotel);

            if (!cur.rows && !base.rows) {
              return <div style={{ opacity: 0.75 }}>Sin datos para {globalHotel} en {year}/{baseYear}.</div>;
            }

            return (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "1rem",
                }}
              >
                <div className="kpi">
                  <div className="kpiLabel">Rooms occupied</div>
                  <div className="kpiValue">{fmtInt(cur.roomsOcc)}</div>
                  <div className="kpiCap">
                    vs {baseYear}: {fmtInt(base.roomsOcc)} (
                    {deltaPct(cur.roomsOcc, base.roomsOcc).toFixed(1).replace(".", ",")}%)
                  </div>
                </div>

                <div className="kpi">
                  <div className="kpiLabel">Room Revenue</div>
                  <div className="kpiValue">{fmtMoney(cur.revenue)}</div>
                  <div className="kpiCap">
                    vs {baseYear}: {fmtMoney(base.revenue)} (
                    {deltaPct(cur.revenue, base.revenue).toFixed(1).replace(".", ",")}%)
                  </div>
                </div>

                <div className="kpi">
                  <div className="kpiLabel">ADR</div>
                  <div className="kpiValue">{fmtMoney(cur.adr)}</div>
                  <div className="kpiCap">
                    vs {baseYear}: {fmtMoney(base.adr)} (
                    {deltaPct(cur.adr, base.adr).toFixed(1).replace(".", ",")}%)
                  </div>
                </div>

                <div className="kpi">
                  <div className="kpiLabel">Ocupación</div>
                  <div className="kpiValue">{fmtPct(cur.occPct)}</div>
                  <div className="kpiCap">
                    vs {baseYear}: {fmtPct(base.occPct)} (
                    {deltaPP(cur.occPct, base.occPct).toFixed(1).replace(".", ",")} p.p.)
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ====== 3) H&F Explorador (usa filtro global hotel como default) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
          H&amp;F — Explorador
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Diario → mensual / trimestral / anual. Ranking por mes. Usa filtro global como valor inicial.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <HofExplorer
            filePath={HF_PATH}
            allowedHotels={group === "JCR" ? JCR_HOTELS : GOTEL_HOTELS}
            title={group === "JCR" ? "Grupo JCR" : "Gotel Management — Maitei"}
            defaultYear={year}
            defaultHotel={globalHotel === "JCR" ? (group === "JCR" ? "MARRIOTT" : "MAITEI") : globalHotel}
          />
        </div>
      </div>

      {/* ====== 4) Membership (usa filtros globales AÑO + HOTEL) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
          Membership
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Cantidades + gráficos. Usa filtro global de año y hotel.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <MembershipSummary
            filePath={MEMBERSHIP_PATH}
            year={year}
            baseYear={baseYear}
            allowedHotels={group === "JCR" ? ["JCR", ...JCR_HOTELS] : ["MAITEI"]}
            hotelFilter={globalHotel}
          />
        </div>
      </div>

      {/* ====== 5) Nacionalidades (SOLO Marriott) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
          Nacionalidades (Marriott)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Ranking por país + distribución por continente. Usa filtro global de año. (Hotel fijo: Marriott)
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <CountryRanking year={year} filePath={NACIONALIDADES_PATH} />
        </div>
      </div>

      {/* ====== 6) Carrusel Maitei (si estás en GOTEL) ====== */}
      {group === "GOTEL" && (
        <div style={{ marginTop: "1.25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
            Vista ejecutiva — Maitei (Gotel)
          </div>

          <div
            style={{
              marginTop: "1rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "1rem",
            }}
          >
            <div className="kpiCard" style={{ padding: "1.1rem", borderRadius: 22 }}>
              <div className="kpiLabel">Rooms occupied</div>
              <div className="kpiBig">{fmtInt(gotelCur.roomsOcc)}</div>
              <div className="kpiDelta">
                {deltaPct(gotelCur.roomsOcc, gotelBase.roomsOcc).toFixed(1).replace(".", ",")}%
                <span style={{ opacity: 0.8 }}> vs {baseYear}</span>
              </div>
            </div>

            <div className="kpiCard" style={{ padding: "1.1rem", borderRadius: 22 }}>
              <div className="kpiLabel">Room Revenue</div>
              <div className="kpiBig">{fmtMoney(gotelCur.revenue)}</div>
              <div className="kpiDelta">
                {deltaPct(gotelCur.revenue, gotelBase.revenue).toFixed(1).replace(".", ",")}%
                <span style={{ opacity: 0.8 }}> vs {baseYear}</span>
              </div>
            </div>

            <div className="kpiCard" style={{ padding: "1.1rem", borderRadius: 22 }}>
              <div className="kpiLabel">Huéspedes</div>
              <div className="kpiBig">{fmtInt(gotelCur.guests)}</div>
              <div className="kpiDelta">
                {deltaPct(gotelCur.guests, gotelBase.guests).toFixed(1).replace(".", ",")}%
                <span style={{ opacity: 0.8 }}> vs {baseYear}</span>
              </div>
            </div>

            <div className="kpiCard" style={{ padding: "1.1rem", borderRadius: 22 }}>
              <div className="kpiLabel">Ocupación</div>
              <div className="kpiBig">{fmtPct(gotelCur.occPct)}</div>
              <div className="kpiDelta">
                {deltaPP(gotelCur.occPct, gotelBase.occPct).toFixed(1).replace(".", ",")} p.p.
                <span style={{ opacity: 0.8 }}> vs {baseYear}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
