// app/components/HighlightsCarousel.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeHofRows, readCsvFromPublic, HofNormalized } from "./csvClient";

type Props = {
  filePath: string;           // ej: "/data/hf_diario.csv"
  year: number;
  hotelList: string[];        // lista de empresas que se suman en el bloque (ej JCR)
  title: string;
  variant?: "default" | "jcr" | "maitei" | "marriott" | "sheratons";
};

function fmtNumber(n: number | null | undefined, digits = 0) {
  if (!Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("es-AR", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function fmtMoney(n: number | null | undefined) {
  if (!Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function clampPct(p: number) {
  if (!Number.isFinite(p)) return p;
  // Ojo: si por datos raros viene 3800, lo capea visualmente, pero igual te deja debug.
  return Math.max(0, Math.min(100, p));
}

function cardBg(variant: Props["variant"]) {
  // Sin depender de libs, meto gradientes suaves
  switch (variant) {
    case "jcr":
      return "linear-gradient(135deg, rgba(25,95,255,.18), rgba(130,30,255,.10))";
    case "maitei":
      return "linear-gradient(135deg, rgba(0,180,120,.18), rgba(0,140,255,.10))";
    case "marriott":
      return "linear-gradient(135deg, rgba(255,120,0,.18), rgba(255,0,120,.10))";
    case "sheratons":
      return "linear-gradient(135deg, rgba(120,80,255,.18), rgba(20,20,40,.08))";
    default:
      return "linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.04))";
  }
}

function filterRows(rows: HofNormalized[], year: number, hotels: string[]) {
  const hotelSet = new Set(hotels.map((h) => String(h).trim().toUpperCase()));
  return rows.filter((r) => {
    const emp = String(r.empresa ?? "").trim().toUpperCase();
    return r.year === year && hotelSet.has(emp);
  });
}

export default function HighlightsCarousel({ filePath, year, hotelList, title, variant = "default" }: Props) {
  const [rows, setRows] = useState<HofNormalized[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr("");
    readCsvFromPublic(filePath)
      .then((raw) => normalizeHofRows(raw))
      .then((norm) => {
        if (!mounted) return;
        setRows(norm);
        setLoading(false);
      })
      .catch((e: any) => {
        if (!mounted) return;
        setErr(String(e?.message ?? e));
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [filePath]);

  const yearRows = useMemo(() => filterRows(rows, year, hotelList), [rows, year, hotelList]);

  const kpis = useMemo(() => {
    if (yearRows.length === 0) {
      return {
        occAvg: null,
        adrAvg: null,
        revpar: null,
        roomRevSum: null,
        roomsOccSum: null,
      };
    }

    // Promedios "sanos"
    const occValues = yearRows.map((r) => r.occPct).filter((v): v is number => Number.isFinite(v as number));
    const adrValues = yearRows.map((r) => r.adr).filter((v): v is number => Number.isFinite(v as number));
    const roomRevValues = yearRows.map((r) => r.roomRevenue).filter((v): v is number => Number.isFinite(v as number));
    const roomsOccValues = yearRows.map((r) => r.roomsOcc).filter((v): v is number => Number.isFinite(v as number));

    const occAvg = occValues.length ? occValues.reduce((a, b) => a + b, 0) / occValues.length : null;
    const adrAvg = adrValues.length ? adrValues.reduce((a, b) => a + b, 0) / adrValues.length : null;

    const roomRevSum = roomRevValues.length ? roomRevValues.reduce((a, b) => a + b, 0) : null;
    const roomsOccSum = roomsOccValues.length ? roomsOccValues.reduce((a, b) => a + b, 0) : null;

    // RevPAR aproximado: ADR promedio * Ocupación promedio
    const revpar = (adrAvg !== null && occAvg !== null) ? (adrAvg * occAvg) / 100 : null;

    return { occAvg, adrAvg, revpar, roomRevSum, roomsOccSum };
  }, [yearRows]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Cargando {title}…
      </div>
    );
  }

  if (err) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Error cargando {title}: {err}
      </div>
    );
  }

  if (!yearRows.length) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Sin filas para {title} en {year}. (Archivo: {filePath})
      </div>
    );
  }

  const cards = [
    { label: "Ocupación (prom.)", value: kpis.occAvg !== null ? `${fmtNumber(clampPct(kpis.occAvg), 1)}%` : "—" },
    { label: "ADR (prom.)", value: kpis.adrAvg !== null ? fmtMoney(kpis.adrAvg) : "—" },
    { label: "RevPAR (aprox.)", value: kpis.revpar !== null ? fmtMoney(kpis.revpar) : "—" },
    { label: "Room Revenue (sum)", value: kpis.roomRevSum !== null ? fmtMoney(kpis.roomRevSum) : "—" },
    { label: "Rooms Occ (sum)", value: kpis.roomsOccSum !== null ? fmtNumber(kpis.roomsOccSum, 0) : "—" },
  ];

  return (
    <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>{title}</div>
        <div style={{ opacity: 0.75, fontSize: ".9rem" }}>{yearRows.length} filas</div>
      </div>

      <div
        style={{
          marginTop: ".9rem",
          display: "flex",
          gap: ".75rem",
          overflowX: "auto",
          paddingBottom: ".25rem",
          scrollSnapType: "x mandatory",
        }}
      >
        {cards.map((c) => (
          <div
            key={c.label}
            style={{
              minWidth: 220,
              flex: "0 0 auto",
              scrollSnapAlign: "start",
              borderRadius: 18,
              padding: ".9rem",
              background: cardBg(variant),
              border: "1px solid rgba(255,255,255,.10)",
            }}
          >
            <div style={{ fontSize: ".85rem", opacity: 0.75 }}>{c.label}</div>
            <div style={{ fontSize: "1.35rem", fontWeight: 950, marginTop: ".35rem" }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: ".6rem", fontSize: ".85rem", opacity: 0.7 }}>
        *Ocupación/ADR como promedios; Room Revenue y Rooms Occ como sumas.
      </div>
    </div>
  );
}
