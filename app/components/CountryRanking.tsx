"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  filePath: string;
};

type Row = Record<string, any>;

type NormRow = {
  date: Date | null;
  year: number;
  country: string;
  continent: string;
  qty: number;
};

function parseNum(x: any) {
  if (typeof x === "number") return x;
  const s = String(x ?? "").trim();
  if (!s) return 0;
  const norm = s.includes(",") && s.includes(".")
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(",", ".");
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

function parseDateAny(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(v).trim();
  if (!s) return null;

  const d1 = new Date(s);
  if (!isNaN(d1.getTime())) return d1;

  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    const d2 = new Date(yy, mm - 1, dd);
    return isNaN(d2.getTime()) ? null : d2;
  }

  return null;
}

function pickColumn(keys: string[], wanted: string[]) {
  const lower = keys.map((k) => k.toLowerCase());
  for (let i = 0; i < wanted.length; i++) {
    const w = wanted[i].toLowerCase();
    const idx = lower.indexOf(w);
    if (idx >= 0) return keys[idx];
  }
  // fallback contains
  for (let i = 0; i < wanted.length; i++) {
    const w = wanted[i].toLowerCase();
    for (let j = 0; j < keys.length; j++) {
      if (keys[j].toLowerCase().includes(w)) return keys[j];
    }
  }
  return "";
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("es-AR").format(Math.round(n || 0));
}

// bandera desde ISO2 (sin spread de string)
function flagFromIso2(iso2: string) {
  const s = String(iso2 || "").toUpperCase().trim();
  if (s.length !== 2) return "";
  const A = 0x1f1e6;
  const c0 = s.charCodeAt(0) - 65;
  const c1 = s.charCodeAt(1) - 65;
  if (c0 < 0 || c0 > 25 || c1 < 0 || c1 > 25) return "";
  return String.fromCodePoint(A + c0, A + c1);
}

function normCountryName(x: any) {
  return String(x ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // saca tildes
}

function iso2FromCountry(countryRaw: string) {
  const c = normCountryName(countryRaw);

  const MAP: Record<string, string> = {
    "ARGENTINA": "AR",
    "BRASIL": "BR",
    "BRAZIL": "BR",
    "CHILE": "CL",
    "URUGUAY": "UY",
    "PARAGUAY": "PY",
    "BOLIVIA": "BO",
    "PERU": "PE",
    "COLOMBIA": "CO",
    "MEXICO": "MX",
    "UNITED STATES": "US",
    "ESTADOS UNIDOS": "US",
    "USA": "US",
    "SPAIN": "ES",
    "ESPANA": "ES",
    "ESPAÑA": "ES",
    "FRANCE": "FR",
    "ITALY": "IT",
    "GERMANY": "DE",
    "UK": "GB",
    "UNITED KINGDOM": "GB",
    "REINO UNIDO": "GB",
    "CHINA": "CN",
    "JAPAN": "JP",
    "JAPON": "JP",
    "JAPÓN": "JP",
    "CANADA": "CA",
    "AUSTRALIA": "AU",
    "ISRAEL": "IL",
    "RUSSIA": "RU",
  };

  if (MAP[c]) return MAP[c];
  // si viene ISO2 ya
  if (/^[A-Z]{2}$/.test(c)) return c;
  return "";
}

export default function CountryRanking({ year, filePath }: Props) {
  const [rows, setRows] = useState<NormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let ok = true;
    setLoading(true);
    setErr("");

    readXlsxFromPublic(filePath)
      .then(({ rows }) => {
        if (!ok) return;

        const first = rows?.[0] ?? {};
        const keys = Object.keys(first);

        const colDate = pickColumn(keys, ["fecha", "date"]);
        const colCountry = pickColumn(keys, ["pais", "país", "country", "nacionalidad", "nationality"]);
        const colCont = pickColumn(keys, ["continente", "continent"]);
        const colQty = pickColumn(keys, ["cantidad", "qty", "quantity", "huespedes", "huéspedes", "guests"]);

        const out: NormRow[] = (rows as Row[]).map((r) => {
          const date = parseDateAny(r[colDate]);
          const yy = date ? date.getFullYear() : 0;

          return {
            date,
            year: yy,
            country: String(r[colCountry] ?? "").trim(),
            continent: String(r[colCont] ?? "").trim(),
            qty: parseNum(r[colQty]),
          };
        });

        setRows(out);
        setLoading(false);
      })
      .catch((e) => {
        if (!ok) return;
        setErr(String(e?.message ?? e));
        setRows([]);
        setLoading(false);
      });

    return () => {
      ok = false;
    };
  }, [filePath]);

  const yearRows = useMemo(() => rows.filter((r) => r.year === year), [rows, year]);

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < yearRows.length; i++) {
      const c = yearRows[i].country || "";
      if (!c) continue;
      m.set(c, (m.get(c) || 0) + (yearRows[i].qty || 0));
    }
    return m;
  }, [yearRows]);

  const byContinent = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < yearRows.length; i++) {
      const c = yearRows[i].continent || "";
      if (!c) continue;
      m.set(c, (m.get(c) || 0) + (yearRows[i].qty || 0));
    }
    return m;
  }, [yearRows]);

  const total = useMemo(() => {
    // ES5 safe: Array.from(values).reduce
    const valsCountry = Array.from(byCountry.values());
    let t = valsCountry.reduce((a, v) => a + (v || 0), 0);

    if (t === 0) {
      const valsCont = Array.from(byContinent.values());
      t = valsCont.reduce((a, v) => a + (v || 0), 0);
    }
    return t;
  }, [byCountry, byContinent]);

  const countryList = useMemo(() => {
    const list = Array.from(byCountry.entries())
      .map(([country, qty]) => ({ country, qty }))
      .sort((a, b) => b.qty - a.qty);
    return list;
  }, [byCountry]);

  const contList = useMemo(() => {
    const list = Array.from(byContinent.entries())
      .map(([continent, qty]) => ({ continent, qty }))
      .sort((a, b) => b.qty - a.qty);
    return list;
  }, [byContinent]);

  return (
    <div className="crWrap">
      <div className="crGrid">
        {/* tarjeta grande países */}
        <div className="crCard big">
          <div className="crHead">
            <div>
              <div className="crTitle">Ranking por país</div>
              <div className="crSub">Año {year} · Total {fmtInt(total)}</div>
            </div>
            <span className="pill">{year}</span>
          </div>

          {loading ? (
            <div className="crEmpty">Cargando nacionalidades…</div>
          ) : err ? (
            <div className="crEmpty">Error: {err}</div>
          ) : yearRows.length === 0 ? (
            <div className="crEmpty">No hay filas para {year}. (Archivo: {filePath})</div>
          ) : (
            <div className="crList">
              {countryList.slice(0, 12).map((x, idx) => {
                const iso2 = iso2FromCountry(x.country);
                const flag = iso2 ? flagFromIso2(iso2) : "🏳️";
                const pct = total > 0 ? (x.qty / total) * 100 : 0;

                return (
                  <div className="crItem" key={`${x.country}-${idx}`}>
                    <div className="crIdx">{idx + 1}</div>
                    <div className="crFlag">{flag}</div>
                    <div className="crName">{x.country}</div>
                    <div className="crQty">{fmtInt(x.qty)}</div>
                    <div className="crPct">{Math.round(pct)}%</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* tarjeta chica continentes */}
        <div className="crCard small">
          <div className="crHead">
            <div>
              <div className="crTitle">Continentes</div>
              <div className="crSub">Distribución {year}</div>
            </div>
            <span className="pill ghost">Chico</span>
          </div>

          {loading ? (
            <div className="crEmpty">…</div>
          ) : err ? (
            <div className="crEmpty">Error</div>
          ) : contList.length === 0 ? (
            <div className="crEmpty">Sin datos de continente.</div>
          ) : (
            <div className="contBars">
              {contList.slice(0, 8).map((x) => {
                const pct = total > 0 ? (x.qty / total) * 100 : 0;
                return (
                  <div className="barRow" key={x.continent}>
                    <div className="barLabel">{x.continent}</div>
                    <div className="barTrack">
                      <div className="barFill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="barVal">{Math.round(pct)}%</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .crWrap{ width:100%; }
        .crGrid{
          display:grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(0, .75fr);
          gap: 12px;
          align-items: stretch;
        }

        .crCard{
          border-radius:22px;
          padding:16px;
          background:rgba(255,255,255,.05);
          border:1px solid rgba(255,255,255,.08);
        }
        .crCard.big{ min-height: 420px; }
        .crCard.small{ min-height: 220px; }

        .crHead{
          display:flex;
          justify-content:space-between;
          gap:12px;
          flex-wrap:wrap;
          align-items:flex-end;
          margin-bottom:12px;
        }
        .crTitle{ font-weight:950; font-size:1.1rem; }
        .crSub{ opacity:.8; margin-top:3px; font-size:.92rem; }

        .pill{
          font-size:.85rem;
          font-weight:850;
          padding:6px 10px;
          border-radius:999px;
          background:rgba(255,255,255,.10);
          border:1px solid rgba(255,255,255,.12);
        }
        .pill.ghost{ background:transparent; }

        .crEmpty{ opacity:.85; padding:10px 2px; }

        .crList{ display:grid; gap:8px; margin-top:6px; }
        .crItem{
          display:grid;
          grid-template-columns: 28px 34px 1fr auto auto;
          gap:10px;
          align-items:center;
          padding:12px 12px;
          border-radius:16px;
          background:rgba(0,0,0,.20);
          border:1px solid rgba(255,255,255,.06);
        }
        .crIdx{ font-weight:950; opacity:.9; }
        .crFlag{ font-size:1.15rem; }
        .crName{ font-weight:900; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .crQty{ font-weight:950; }
        .crPct{ font-weight:900; opacity:.85; }

        .contBars{ display:grid; gap:10px; margin-top:6px; }
        .barRow{
          display:grid;
          grid-template-columns: 110px 1fr 44px;
          gap:8px;
          align-items:center;
        }
        .barLabel{
          font-weight:850;
          font-size:.86rem;
          opacity:.9;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .barTrack{
          height:10px;
          border-radius:999px;
          background:rgba(255,255,255,.08);
          overflow:hidden;
        }
        .barFill{
          height:100%;
          border-radius:999px;
          background:linear-gradient(90deg, rgba(94,232,255,.9), rgba(210,160,255,.9));
        }
        .barVal{ font-weight:900; font-size:.86rem; text-align:right; opacity:.9; }

        @media (max-width: 980px){
          .crGrid{ grid-template-columns: 1fr; }
          .crCard.big{ min-height: auto; }
          .crCard.small{ min-height: auto; }
        }
        @media (max-width: 520px){
          .crItem{
            grid-template-columns: 24px 30px 1fr auto;
          }
          .crPct{ display:none; }
          .barRow{ grid-template-columns: 90px 1fr 40px; }
        }
      `}</style>
    </div>
  );
}
