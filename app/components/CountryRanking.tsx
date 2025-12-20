"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Props = {
  year: number;
  filePath: string; // requerido por tu YearComparator
  hotelFilter?: string; // "JCR" | "MARRIOTT" | "SHERATON MDQ" | "SHERATON BCR" | "MAITEI" | etc
  limit?: number; // top países
};

type RawRow = Record<string, any>;

type ParsedRow = {
  hotel: string;
  membership: string;
  qty: number;
  date: Date | null;
  year: number | null;
  country: string;
  continent: string;
};

type ReadResult = {
  rows: RawRow[];
  sheetName: string;
  sheetNames: string[];
};

/* =========================
   Helpers básicos (robustos)
   ========================= */
function normStr(v: any) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function safeNum(v: any): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  // soporta "1.234,56" o "1234.56"
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function tryParseDate(v: any): Date | null {
  if (v instanceof Date && Number.isFinite(v.getTime())) return v;

  const s = String(v ?? "").trim();
  if (!s) return null;

  // Excel a veces trae serial
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    // Heurística simple: serial de Excel suele ser > 20000
    if (Number.isFinite(n) && n > 20000) {
      // XLSX tiene util para esto pero acá lo hacemos simple:
      // Excel serial: días desde 1899-12-30
      const base = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(base.getTime() + Math.round(n) * 86400000);
      return Number.isFinite(d.getTime()) ? d : null;
    }
  }

  // Intento directo
  const d1 = new Date(s);
  if (Number.isFinite(d1.getTime())) return d1;

  // Intento dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    const d2 = new Date(yy, mm - 1, dd);
    return Number.isFinite(d2.getTime()) ? d2 : null;
  }

  return null;
}

function getYearFromDate(d: Date | null): number | null {
  if (!d) return null;
  const y = d.getFullYear();
  return Number.isFinite(y) ? y : null;
}

/* =========================
   Lectura XLSX desde /public
   (elige mejor hoja por score)
   ========================= */
function scoreRows(rows: RawRow[]) {
  if (!rows || rows.length === 0) return 0;
  const keys = Object.keys(rows[0] ?? {});
  const keySet = new Set(keys.map((k) => String(k).trim().toLowerCase()));

  const hasEmpresa = keySet.has("empresa") || keySet.has("hotel");
  const hasPais = keySet.has("pais") || keySet.has("país") || keySet.has("country");
  const hasContinente = keySet.has("continente") || keySet.has("continent");
  const hasCantidad = keySet.has("cantidad") || keySet.has("qty") || keySet.has("quantity");
  const hasFecha = keySet.has("fecha") || keySet.has("date");

  let score = keys.length;
  if (hasEmpresa) score += 50;
  if (hasPais) score += 40;
  if (hasContinente) score += 25;
  if (hasCantidad) score += 25;
  if (hasFecha) score += 15;
  score += Math.min(rows.length, 200) / 10;

  return score;
}

async function readXlsxFromPublic(path: string): Promise<ReadResult> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (status ${res.status})`);

  const buffer = await res.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  const sheetNames = wb.SheetNames ?? [];
  if (sheetNames.length === 0) return { rows: [], sheetName: "", sheetNames: [] };

  let bestSheet = sheetNames[0];
  let bestRows: RawRow[] = [];
  let bestScore = -1;

  for (const name of sheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as RawRow[];
    const s = scoreRows(rows);
    if (s > bestScore) {
      bestScore = s;
      bestSheet = name;
      bestRows = rows;
    }
  }

  return { rows: bestRows, sheetName: bestSheet, sheetNames };
}

/* =========================
   Mapeo headers flexible
   ========================= */
function detectColumns(sample: RawRow) {
  const keys = Object.keys(sample ?? {});
  const norm = keys.map((k) => ({ raw: k, n: String(k).trim().toLowerCase() }));

  const pick = (candidates: string[]) => {
    for (const cand of candidates) {
      const found = norm.find((x) => x.n === cand);
      if (found) return found.raw;
    }
    // fallback: contiene
    for (const cand of candidates) {
      const found = norm.find((x) => x.n.includes(cand));
      if (found) return found.raw;
    }
    return "";
  };

  const hotel = pick(["empresa", "hotel"]);
  const membership = pick(["bonboy", "membership", "membresia", "membresía", "programa"]);
  const qty = pick(["cantidad", "qty", "quantity", "count", "cant"]);
  const date = pick(["fecha", "date", "day", "día"]);
  const country = pick(["pais", "país", "country", "nacionalidad", "nationality"]);
  const continent = pick(["continente", "continent", "region"]);

  return { hotel, membership, qty, date, country, continent, keys };
}

/* =========================
   Bandera ISO2 sin downlevel issues
   ========================= */
const COUNTRY_TO_ISO2: Record<string, string> = {
  "ARGENTINA": "AR",
  "BRASIL": "BR",
  "BRAZIL": "BR",
  "URUGUAY": "UY",
  "CHILE": "CL",
  "PARAGUAY": "PY",
  "BOLIVIA": "BO",
  "PERU": "PE",
  "PERÚ": "PE",
  "COLOMBIA": "CO",
  "MEXICO": "MX",
  "MÉXICO": "MX",
  "UNITED STATES": "US",
  "ESTADOS UNIDOS": "US",
  "USA": "US",
  "SPAIN": "ES",
  "ESPAÑA": "ES",
  "ITALY": "IT",
  "ITALIA": "IT",
  "FRANCE": "FR",
  "FRANCIA": "FR",
  "GERMANY": "DE",
  "ALEMANIA": "DE",
  "UNITED KINGDOM": "GB",
  "REINO UNIDO": "GB",
  "CANADA": "CA",
  "CANADÁ": "CA",
};

function countryToIso2(country: string) {
  return COUNTRY_TO_ISO2[normStr(country)] ?? "";
}

function iso2ToFlag(iso2: string) {
  const s = String(iso2 ?? "").toUpperCase();
  if (s.length !== 2) return "🏳️";
  const A = 0x1f1e6;
  const c1 = s.charCodeAt(0) - 65;
  const c2 = s.charCodeAt(1) - 65;
  if (c1 < 0 || c1 > 25 || c2 < 0 || c2 > 25) return "🏳️";
  return String.fromCodePoint(A + c1, A + c2);
}

/* =========================
   Constantes de hoteles JCR
   ========================= */
const JCR_HOTELS = ["MARRIOTT", "SHERATON MDQ", "SHERATON BCR"];

function isJcrHotel(h: string) {
  const x = normStr(h);
  return JCR_HOTELS.includes(x);
}

/* =========================
   UI helpers
   ========================= */
function fmtInt(n: number) {
  return (n ?? 0).toLocaleString("es-AR");
}

function pct(n: number) {
  return `${(n * 100).toFixed(1).replace(".", ",")}%`;
}

/* =========================
   COMPONENTE
   ========================= */
export default function CountryRanking({
  year,
  filePath,
  hotelFilter = "JCR",
  limit = 12,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [meta, setMeta] = useState<{ sheet: string; sheets: string[]; detected: any } | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        const rr = await readXlsxFromPublic(filePath);
        if (!mounted) return;

        const detected = detectColumns(rr.rows[0] ?? {});
        setMeta({ sheet: rr.sheetName, sheets: rr.sheetNames, detected });
        setRawRows(rr.rows ?? []);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message ?? "Error desconocido cargando nacionalidades.");
        setRawRows([]);
        setMeta(null);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [filePath]);

  const parsed: ParsedRow[] = useMemo(() => {
    if (!rawRows || rawRows.length === 0) return [];
    const detected = detectColumns(rawRows[0] ?? {});
    const colHotel = detected.hotel;
    const colMembership = detected.membership;
    const colQty = detected.qty;
    const colDate = detected.date;
    const colCountry = detected.country;
    const colCont = detected.continent;

    const out: ParsedRow[] = [];

    for (const r of rawRows) {
      const hotel = normStr(colHotel ? r[colHotel] : r["Empresa"] ?? r["HOTEL"] ?? "");
      const membership = String(colMembership ? r[colMembership] : "").trim();
      const qty = safeNum(colQty ? r[colQty] : r["Cantidad"]);
      const d = tryParseDate(colDate ? r[colDate] : r["Fecha"]);
      const y = getYearFromDate(d);

      const country = String(colCountry ? r[colCountry] : r["Pais"] ?? r["País"] ?? "").trim();
      const continent = String(colCont ? r[colCont] : r["Continente"] ?? "").trim();

      // Si no hay país ni continente ni qty, ignoramos
      if (!country && !continent && qty === 0) continue;

      out.push({
        hotel,
        membership,
        qty,
        date: d,
        year: y,
        country,
        continent,
      });
    }

    return out;
  }, [rawRows]);

  // Filtro por hotelFilter + year
  const filtered = useMemo(() => {
    const y = Number(year);
    const hf = normStr(hotelFilter);

    return parsed.filter((r) => {
      const ry = r.year;
      if (ry !== y) return false;

      if (hf === "JCR") {
        return isJcrHotel(r.hotel);
      }

      return normStr(r.hotel) === hf;
    });
  }, [parsed, year, hotelFilter]);

  // Agregaciones
  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      const k = String(r.country ?? "").trim();
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + (r.qty ?? 0));
    }
    return m;
  }, [filtered]);

  const byContinent = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      const k = String(r.continent ?? "").trim();
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + (r.qty ?? 0));
    }
    return m;
  }, [filtered]);

  const total = useMemo(() => {
    let t = 0;
    for (const v of byCountry.values()) t += v;
    // si no hay país pero sí continente, usamos continente
    if (t === 0) {
      for (const v of byContinent.values()) t += v;
    }
    return t;
  }, [byCountry, byContinent]);

  const topCountries = useMemo(() => {
    const list = Array.from(byCountry.entries())
      .map(([country, qty]) => ({ country, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, Math.max(1, limit));

    return list;
  }, [byCountry, limit]);

  const contList = useMemo(() => {
    return Array.from(byContinent.entries())
      .map(([continent, qty]) => ({ continent, qty }))
      .sort((a, b) => b.qty - a.qty);
  }, [byContinent]);

  // Responsivo simple: cards en grid que colapsa
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "baseline" }}>
        <div style={{ fontSize: "1.05rem", fontWeight: 900 }}>Nacionalidades</div>
        <div style={{ fontSize: ".9rem", opacity: 0.75 }}>
          {normStr(hotelFilter) === "JCR" ? "Grupo JCR" : hotelFilter} · Año {year}
          {meta?.sheet ? ` · Hoja: ${meta.sheet}` : ""}
        </div>
      </div>

      {loading && (
        <div style={{ marginTop: ".75rem", opacity: 0.75 }}>Cargando nacionalidades…</div>
      )}

      {!loading && err && (
        <div
          style={{
            marginTop: ".75rem",
            padding: ".75rem",
            borderRadius: 14,
            background: "rgba(255,0,0,.08)",
            border: "1px solid rgba(255,0,0,.15)",
            color: "rgba(255,255,255,.9)",
          }}
        >
          {err}
        </div>
      )}

      {!loading && !err && (
        <>
          {/* RESUMEN */}
          <div
            style={{
              marginTop: ".85rem",
              padding: "1rem",
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,.08)",
              background: "rgba(255,255,255,.03)",
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: ".82rem", opacity: 0.7 }}>Total huéspedes con nacionalidad</div>
              <div style={{ fontSize: "1.55rem", fontWeight: 950, letterSpacing: "-0.02em" }}>
                {fmtInt(total)}
              </div>
            </div>

            <div style={{ fontSize: ".85rem", opacity: 0.75 }}>
              {topCountries.length > 0
                ? `Top ${Math.min(limit, topCountries.length)} países`
                : "Sin datos por país (revisá columna País/Nacionalidad en el Excel)."}
            </div>
          </div>

          {/* LAYOUT: País grande + Continente chico */}
          <div
            style={{
              marginTop: "1rem",
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, .75fr)",
              gap: "1rem",
            }}
          >
            {/* TOP PAÍSES (card GRANDE) */}
            <div
              style={{
                padding: "1rem",
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,.08)",
                background: "rgba(255,255,255,.03)",
                overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900 }}>Ranking por país</div>
                <div style={{ fontSize: ".85rem", opacity: 0.75 }}>Participación sobre el total</div>
              </div>

              {topCountries.length === 0 ? (
                <div style={{ marginTop: ".8rem", opacity: 0.75 }}>
                  Sin datos para {year}. Verificá que el Excel tenga columna <b>Fecha</b> (fecha real) y columna{" "}
                  <b>País/Nacionalidad</b>.
                </div>
              ) : (
                <div style={{ marginTop: ".9rem", display: "grid", gap: ".6rem" }}>
                  {topCountries.map((it, idx) => {
                    const share = total > 0 ? it.qty / total : 0;
                    const iso2 = countryToIso2(it.country);
                    const flag = iso2 ? iso2ToFlag(iso2) : "🏳️";

                    return (
                      <div
                        key={`${it.country}-${idx}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "auto minmax(0, 1fr) auto",
                          alignItems: "center",
                          gap: ".75rem",
                          padding: ".7rem .75rem",
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,.07)",
                          background: "rgba(0,0,0,.12)",
                        }}
                      >
                        <div style={{ width: 34, textAlign: "center", fontSize: "1.15rem" }}>{flag}</div>

                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem" }}>
                            <div style={{ fontWeight: 850, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {idx + 1}. {it.country}
                            </div>
                            <div style={{ fontSize: ".9rem", opacity: 0.9 }}>{fmtInt(it.qty)}</div>
                          </div>

                          <div
                            style={{
                              marginTop: ".35rem",
                              height: 8,
                              borderRadius: 99,
                              background: "rgba(255,255,255,.07)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.max(0, Math.min(100, share * 100))}%`,
                                height: "100%",
                                borderRadius: 99,
                                background: "linear-gradient(90deg, rgba(105,223,255,.95), rgba(160,120,255,.95))",
                              }}
                            />
                          </div>

                          <div style={{ marginTop: ".25rem", fontSize: ".8rem", opacity: 0.7 }}>
                            {pct(share)}
                          </div>
                        </div>

                        <div style={{ width: 62, textAlign: "right", fontSize: ".85rem", opacity: 0.8 }}>
                          {iso2 || "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* CONTINENTES (card más chica) */}
            <div
              style={{
                padding: "1rem",
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,.08)",
                background: "rgba(255,255,255,.03)",
              }}
            >
              <div style={{ fontWeight: 900 }}>Continentes</div>
              <div style={{ marginTop: ".25rem", fontSize: ".85rem", opacity: 0.75 }}>
                Resumen compacto
              </div>

              {contList.length === 0 ? (
                <div style={{ marginTop: ".8rem", opacity: 0.75 }}>
                  Sin datos por continente.
                </div>
              ) : (
                <div style={{ marginTop: ".9rem", display: "grid", gap: ".55rem" }}>
                  {contList.map((c) => {
                    const share = total > 0 ? c.qty / total : 0;
                    return (
                      <div
                        key={c.continent}
                        style={{
                          padding: ".65rem .7rem",
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,.07)",
                          background: "rgba(0,0,0,.12)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem" }}>
                          <div style={{ fontWeight: 850 }}>{c.continent}</div>
                          <div style={{ fontSize: ".9rem", opacity: 0.9 }}>{fmtInt(c.qty)}</div>
                        </div>

                        <div
                          style={{
                            marginTop: ".35rem",
                            height: 8,
                            borderRadius: 99,
                            background: "rgba(255,255,255,.07)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.max(0, Math.min(100, share * 100))}%`,
                              height: "100%",
                              borderRadius: 99,
                              background: "linear-gradient(90deg, rgba(255,198,0,.95), rgba(255,120,180,.95))",
                            }}
                          />
                        </div>

                        <div style={{ marginTop: ".25rem", fontSize: ".8rem", opacity: 0.7 }}>
                          {pct(share)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Responsivo: colapsa a 1 columna en móvil */}
          <style jsx>{`
            @media (max-width: 900px) {
              div[style*="grid-template-columns: minmax(0, 1.25fr) minmax(0, .75fr)"] {
                grid-template-columns: minmax(0, 1fr) !important;
              }
            }
          `}</style>

          {/* DEBUG suave si te vuelve a pasar “sin datos” */}
          <div style={{ marginTop: ".9rem", fontSize: ".82rem", opacity: 0.6 }}>
            Detectado (headers):{" "}
            {meta?.detected
              ? `hotel=${meta.detected.hotel || "—"} · país=${meta.detected.country || "—"} · continente=${
                  meta.detected.continent || "—"
                } · qty=${meta.detected.qty || "—"} · fecha=${meta.detected.date || "—"}`
              : "—"}
          </div>
        </>
      )}
    </div>
  );
}
