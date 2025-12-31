"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type KpiItem = {
  label: string;
  value: string;
  /** ejemplo: "+3,2%" o "-1,1%" */
  deltaText?: string;
  /** si lo tenés numérico, mejor: +0.032 o -0.011 (o +3.2 / -1.1, igual sirve) */
  deltaValue?: number;
  sub?: string;
};

type Props = {
  items: KpiItem[];
  /** red = JCR, blue = Gotel */
  tone?: "red" | "blue" | "neutral";
  intervalMs?: number;
  showDots?: boolean;
};

function gradForTone(tone: "red" | "blue" | "neutral", idx: number) {
  // JCR: rojo -> violeta
  const jcr = [
    "linear-gradient(135deg, rgba(220,38,38,.95), rgba(168,85,247,.70))",
    "linear-gradient(135deg, rgba(244,63,94,.95), rgba(124,58,237,.65))",
    "linear-gradient(135deg, rgba(249,115,22,.95), rgba(168,85,247,.55))",
    "linear-gradient(135deg, rgba(190,18,60,.95), rgba(147,51,234,.55))",
  ];

  // Gotel: celeste -> azul
  const gotel = [
    "linear-gradient(135deg, rgba(56,189,248,.95), rgba(37,99,235,.70))",
    "linear-gradient(135deg, rgba(14,165,233,.95), rgba(29,78,216,.65))",
    "linear-gradient(135deg, rgba(34,211,238,.95), rgba(59,130,246,.60))",
    "linear-gradient(135deg, rgba(125,211,252,.95), rgba(37,99,235,.60))",
  ];

  const neutral = [
    "linear-gradient(135deg, rgba(255,255,255,.20), rgba(255,255,255,.06))",
    "linear-gradient(135deg, rgba(255,255,255,.18), rgba(255,255,255,.06))",
    "linear-gradient(135deg, rgba(255,255,255,.16), rgba(255,255,255,.06))",
  ];

  const bank = tone === "red" ? jcr : tone === "blue" ? gotel : neutral;
  return bank[idx % bank.length];
}

function deltaColor(v?: number) {
  if (v === undefined || v === null) return "rgba(255,255,255,.70)";
  if (v > 0) return "rgba(34,197,94,.95)"; // verde
  if (v < 0) return "rgba(239,68,68,.95)"; // rojo
  return "rgba(255,255,255,.70)";
}

function Card({
  children,
  bg,
}: React.PropsWithChildren<{ bg: string }>) {
  return (
    <div
      style={{
        minWidth: 0,
        borderRadius: 18,
        padding: "1rem",
        border: "1px solid rgba(255,255,255,.12)",
        background: "rgba(255,255,255,.05)",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 16px 34px rgba(0,0,0,.18)",
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: bg, opacity: 0.18 }} />
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}

export default function KpiCarousel({
  items,
  tone = "neutral",
  intervalMs = 3600,
  showDots = true,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [idx, setIdx] = useState(0);

  const slides = useMemo(() => items ?? [], [items]);
  const count = slides.length;

  useEffect(() => {
    if (count <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(t);
  }, [count, intervalMs]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const child = el.children[idx] as HTMLElement | undefined;
    if (!child) return;
    child.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }, [idx]);

  if (!count) return null;

  return (
    <div style={{ display: "grid", gap: ".55rem" }}>
      <div
        ref={trackRef}
        style={{
          display: "grid",
          gridAutoFlow: "column",
          gridAutoColumns: "minmax(280px, 1fr)",
          gap: ".85rem",
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          paddingBottom: ".25rem",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {slides.map((it, i) => {
          const dc = deltaColor(it.deltaValue);
          return (
            <div
              key={`${it.label}-${i}`}
              style={{ scrollSnapAlign: "start", minWidth: 0 }}
              onMouseEnter={() => setIdx(i)}
            >
              <Card bg={gradForTone(tone, i)}>
                <div style={{ fontSize: ".92rem", opacity: 0.88, fontWeight: 900 }}>
                  {it.label}
                </div>

                <div style={{ display: "flex", gap: ".6rem", alignItems: "baseline", marginTop: ".25rem", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "1.75rem", fontWeight: 950 }}>
                    {it.value}
                  </div>

                  {(it.deltaText || it.deltaValue !== undefined) ? (
                    <div
                      style={{
                        fontWeight: 950,
                        color: dc,
                        fontSize: "1.05rem",
                      }}
                      title="Variación vs año base"
                    >
                      {it.deltaText ?? ""}
                    </div>
                  ) : null}
                </div>

                {it.sub ? (
                  <div style={{ marginTop: ".35rem", opacity: 0.78, fontSize: ".92rem" }}>
                    {it.sub}
                  </div>
                ) : null}
              </Card>
            </div>
          );
        })}
      </div>

      {showDots && count > 1 ? (
        <div style={{ display: "flex", gap: ".45rem", justifyContent: "center", alignItems: "center" }}>
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Ir a slide ${i + 1}`}
              style={{
                width: i === idx ? 26 : 10,
                height: 10,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,.20)",
                background: i === idx ? gradForTone(tone, i) : "rgba(255,255,255,.10)",
                cursor: "pointer",
                transition: "all .18s ease",
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
