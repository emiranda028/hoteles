"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Row = { year: number; country: string; guests: number };

function safeNum(x: any) {
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;
  if (typeof x === "string") {
    const s = x.trim();
    if (!s) return 0;
    if (s.includes(",") && /\d,\d/.test(s)) {
      const norm = s.replace(/\./g, "").replace(",", ".");
      const n = Number(norm);
      return Number.isFinite(n) ? n : 0;
    }
    const n = Number(s.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function getByTrimmedKey(r: any, wanted: string) {
  const w = wanted.trim().toLowerCase();
  for (const k of Object.keys(r || {})) {
    if (k.trim().toLowerCase() === w) return r[k];
  }
  return undefined;
}

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normCountryKey(name: string) {
  return stripAccents(name)
    .toUpperCase()
    .replace(/\u00A0/g, " ")
    .replace(/[().]/g, " ")
    .replace(/[-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function normName(name: string) {
  return name.trim().replace(/\u00A0/g, " ").replace(/\s+/g, " ");
}

function flagEmojiFromISO2(iso2?: string) {
  if (!iso2 || iso2.length !== 2) return "🏳️";
  const codePoints = iso2
    .toUpperCase()
    .split("")
    .map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

const COUNTRY_TO_ISO2: Record<string, string> = {
  ARGENTINA: "AR",
  URUGUAY: "UY",
  BRASIL: "BR",
  CHILE: "CL",
  PARAGUAY: "PY",
  BOLIVIA: "BO",
  PERU: "PE",
  PERÚ: "PE",
  COLOMBIA: "CO",
  ECUADOR: "EC",
  VENEZUELA: "VE",
  MEXICO: "MX",
  MÉXICO: "MX",
  "ESTADOS UNIDOS": "US",
  USA: "US",
  "EE.UU.": "US",
  EEUU: "US",
  CANADA: "CA",
  CANADÁ: "CA",
  ESPAÑA: "ES",
  ESPANA: "ES",
  ITALIA: "IT",
  FRANCIA: "FR",
  ALEMANIA: "DE",
  "REINO UNIDO": "GB",
  INGLATERRA: "GB",
  IRLANDA: "IE",
  PORTUGAL: "PT",
  SUIZA: "CH",
  AUSTRIA: "AT",
  HOLANDA: "NL",
  "PAISES BAJOS": "NL",
  "PAÍSES BAJOS": "NL",
  BÉLGICA: "BE",
  BELGICA: "BE",
  SUECIA: "SE",
  NORUEGA: "NO",
  DINAMARCA: "DK",
  FINLANDIA: "FI",
  POLONIA: "PL",
  RUSIA: "RU",
  UCRANIA: "UA",
  ISRAEL: "IL",
  TURQUIA: "TR",
  TURQUÍA: "TR",
  "EMIRATOS ARABES UNIDOS": "AE",
  "EMIRATOS ÁRABES UNIDOS": "AE",
  EAU: "AE",
  "ARABIA SAUDITA": "SA",
  INDIA: "IN",
  CHINA: "CN",
  JAPON: "JP",
  JAPÓN: "JP",
  COREA: "KR",
  "COREA DEL SUR": "KR",
  AUSTRALIA: "AU",
  "NUEVA ZELANDA": "NZ",
  SUDAFRICA: "ZA",
};

function iso2FromCountry(country: string) {
  const k = normCountryKey(country);

  if (k === "USA" || k === "US" || k === "EE UU" || k === "EEUU" || k.includes("UNITED STATES")) return "US";
  if (k.includes("ESTADOS UNIDOS")) return "US";
  if (k.includes("REINO UNIDO") || k.includes("UNITED KINGDOM") || k === "UK" || k.includes("INGLATERRA")) return "GB";
  if (k.includes("PAISES BAJOS") || k.includes("NETHERLANDS") || k.includes("HOLANDA")) return "NL";
  if (k.includes("COREA DEL SUR") || k.includes("SOUTH KOREA")) return "KR";
  if (k.includes("EMIRATOS") || k.includes("UNITED ARAB EMIRATES") || k === "EAU") return "AE";
  if (k.includes("RUSIA") || k.includes("RUSSIAN FEDERATION")) return "RU";
  if (k.includes("CHINA") || k.includes("PRC")) return "CN";
  if (k.includes("JAPON") || k.includes("JAPAN")) return "JP";
  if (k.includes("BRASIL") || k.includes("BRAZIL")) return "BR";
  if (k.includes("ESPAN") || k.includes("SPAIN")) return "ES";
  if (k.includes("MEXIC")) return "MX";
  if (k.includes("PERU")) return "PE";
  if (k.includes("ARGENTINA")) return "AR";
  if (k.includes("URUGUAY")) return "UY";
  if (k.includes("CHILE")) return "CL";

  const exact = normName(country).toUpperCase();
  return COUNTRY_TO_ISO2[exact];
}

function pctDelta(cur: number, base: number) {
  if (!base || base === 0) return null;
  return ((cur / base) - 1) * 100;
}

function Flag({ iso2, country }: { iso2?: string; country: string }) {
  const src = iso2 ? `https://flagcdn.com/w40/${iso2.toLowerCase()}.png` : "";
  const fallback = flagEmojiFromISO2(iso2);

  if (!iso2) {
    return <span className="flagFallback">{fallback}</span>;
  }

  return (
    <img
      src={src}
      alt={country}
      width={22}
      height={16}
      className="flagImg"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

export default function CountryRanking({
  year,
  filePath,
  baseYear = 2024,
  limit = 12,
}: {
  year: number;
  filePath: string;
  baseYear?: number;
  limit?: number;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    readXlsxFromPublic(filePath)
      .then(({ rows }) => {
        if (!alive) return;

        const normalized: Row[] = rows.map((r: any) => {
          const y = safeNum(r["Año"] ?? r["Ano"] ?? r["Year"] ?? r.year ?? getByTrimmedKey(r, "Año")) || 0;

          const countryRaw =
            r["PAÍS"] ??
            r["PAÍS "] ??
            r["País"] ??
            r["Pais"] ??
            r["Country"] ??
            getByTrimmedKey(r, "PAÍS") ??
            getByTrimmedKey(r, "Pais") ??
            "";

          const guestsRaw =
            r["Importe"] ??
            r["Importe "] ??
            r["Guests"] ??
            r["Cantidad"] ??
            getByTrimmedKey(r, "Importe") ??
            0;

          return { year: Number(y), country: normName(countryRaw.toString()), guests: safeNum(guestsRaw) };
        });

        setRows(normalized.filter((x) => x.year && x.country && x.guests));
      })
      .catch((e) => {
        console.error("CountryRanking:", e);
        setRows([]);
      })
      .finally(() => setLoading(false));

    return () => {
      alive = false;
    };
  }, [filePath]);

  const { ranking, maxGuests, totals } = useMemo(() => {
    const mapYear = new Map<string, number>();
    const mapBase = new Map<string, number>();

    for (const r of rows) {
      const key = normName(r.country);
      if (r.year === year) mapYear.set(key, (mapYear.get(key) ?? 0) + r.guests);
      if (r.year === baseYear) mapBase.set(key, (mapBase.get(key) ?? 0) + r.guests);
    }

    const items = Array.from(mapYear.entries())
      .map(([country, guests]) => {
        const base = mapBase.get(country) ?? 0;
        const d = pctDelta(guests, base);
        return { country, guests, base, deltaPct: d };
      })
      .sort((a, b) => b.guests - a.guests)
      .slice(0, limit);

    const max = items.length ? items[0].guests : 0;

    const totalYear = Array.from(mapYear.values()).reduce((a, b) => a + b, 0);
    const totalBase = Array.from(mapBase.values()).reduce((a, b) => a + b, 0);
    const totalDelta = pctDelta(totalYear, totalBase);

    return { ranking: items, maxGuests: max, totals: { totalYear, totalBase, totalDelta } };
  }, [rows, year, baseYear, limit]);

  if (loading) {
    return (
      <div className="card">
        <div className="cardTitle">Nacionalidades</div>
        <div className="cardNote">Cargando datos…</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ minHeight: 360, overflow: "hidden" }}>
      <div className="rankHeader">
        <div style={{ minWidth: 0 }}>
          <div className="cardTitle">Ranking por país (Marriott)</div>
          <div className="rankSub">
            Año <strong>{year}</strong> vs <strong>{baseYear}</strong>
          </div>
        </div>

        <div className="rankTotal">
          <div className="rankTotalLabel">Total {year}</div>
          <div className="rankTotalValue">{totals.totalYear.toLocaleString("es-AR")}</div>

          {year === baseYear ? (
            <div className="delta">Base</div>
          ) : totals.totalDelta == null ? (
            <div className="delta">Sin base</div>
          ) : (
            <div className={`delta ${totals.totalDelta >= 0 ? "up" : "down"}`}>
              {totals.totalDelta >= 0 ? "▲" : "▼"} {totals.totalDelta >= 0 ? "+" : ""}
              {totals.totalDelta.toFixed(1).replace(".", ",")}% i.a.
            </div>
          )}
        </div>
      </div>

      {ranking.length === 0 ? (
        <div className="cardNote" style={{ marginTop: ".8rem" }}>
          No hay datos para {year}.
        </div>
      ) : (
        <div className="rankListModern">
          {ranking.map((x, i) => {
            const iso2 = iso2FromCountry(x.country);
            const w = maxGuests ? Math.max(6, (x.guests / maxGuests) * 100) : 0;

            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;

            return (
              <div key={x.country} className="rankRowModern">
                <div className="rankLeftModern">
                  <div className="rankPosModern">{i + 1}</div>
                  <div className="rankFlagWrap">
                    <Flag iso2={iso2} country={x.country} />
                    {!iso2 && <span className="flagFallback">{flagEmojiFromISO2(undefined)}</span>}
                  </div>

                  <div className="rankNameBlock">
                    <div className="rankCountryModern">
                      {medal ? <span className="medal">{medal}</span> : null}
                      {x.country}
                    </div>
                    <div className="rankBaseLine">
                      Base {baseYear}: <strong>{x.base > 0 ? x.base.toLocaleString("es-AR") : "—"}</strong>
                    </div>
                  </div>
                </div>

                <div className="rankRightModern">
                  <div className="rankGuestsModern">{x.guests.toLocaleString("es-AR")}</div>

                  {year === baseYear ? (
                    <div className="delta">Base</div>
                  ) : x.deltaPct == null ? (
                    <div className="delta">Sin base</div>
                  ) : (
                    <div className={`delta ${x.deltaPct >= 0 ? "up" : "down"}`}>
                      {x.deltaPct >= 0 ? "▲" : "▼"} {x.deltaPct >= 0 ? "+" : ""}
                      {x.deltaPct.toFixed(1).replace(".", ",")}% i.a.
                    </div>
                  )}

                  {/* Barra premium: dentro del mismo row, contenida, con label adentro */}
                  <div className="barTrack">
                    <div className="barFill" style={{ width: `${Math.min(100, w)}%` }}>
                      <span className="barLabel">{x.guests.toLocaleString("es-AR")}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="cardNote" style={{ marginTop: ".9rem" }}>
        *Banderas por ISO2.
      </div>
    </div>
  );
}



