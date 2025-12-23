"use client";

import React from "react";

type ToggleOption = { value: string; label: string };

function TogglePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pill ${active ? "active" : ""}`}
    >
      {children}
    </button>
  );
}

export function JcrStickyFilters(props: {
  year: number;
  baseYear: number;
  onYear: (y: number) => void;
  onBaseYear: (y: number) => void;

  hotel: string; // "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "ALL"
  onHotel: (h: string) => void;

  years: number[];
  hotels: ToggleOption[];
}) {
  return (
    <div className="stickyWrap stickyJcr">
      <div className="bar">
        <div className="title">
          <div className="kicker">Grupo JCR</div>
          <div className="heading">Filtros globales</div>
        </div>

        <div className="controls">
          <div className="block">
            <div className="label">Año</div>
            <div className="pillRow">
              {props.years.map((y) => (
                <TogglePill key={y} active={props.year === y} onClick={() => props.onYear(y)}>
                  {y}
                </TogglePill>
              ))}
            </div>
          </div>

          <div className="block">
            <div className="label">Base</div>
            <div className="pillRow">
              {props.years.map((y) => (
                <TogglePill key={y} active={props.baseYear === y} onClick={() => props.onBaseYear(y)}>
                  {y}
                </TogglePill>
              ))}
            </div>
          </div>

          <div className="block">
            <div className="label">Hotel</div>
            <div className="pillRow">
              {props.hotels.map((h) => (
                <TogglePill
                  key={h.value}
                  active={props.hotel === h.value}
                  onClick={() => props.onHotel(h.value)}
                >
                  {h.label}
                </TogglePill>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .stickyWrap {
          position: sticky;
          top: 0;
          z-index: 50;
          padding: 10px 0;
          backdrop-filter: blur(10px);
        }

        .stickyJcr {
          background: linear-gradient(
            180deg,
            rgba(15, 16, 20, 0.92),
            rgba(15, 16, 20, 0.55)
          );
        }

        .bar {
          border-radius: 18px;
          padding: 14px 14px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.04);
          display: grid;
          gap: 10px;
        }

        .title {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
        }
        .kicker {
          font-weight: 900;
          letter-spacing: 0.02em;
          color: rgba(255, 255, 255, 0.70);
          font-size: 0.85rem;
        }
        .heading {
          font-weight: 950;
          font-size: 1.05rem;
        }

        .controls {
          display: grid;
          gap: 10px;
        }

        .block {
          display: grid;
          gap: 6px;
        }
        .label {
          font-size: 0.88rem;
          color: rgba(255, 255, 255, 0.75);
          font-weight: 800;
        }

        .pillRow {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .pill {
          cursor: pointer;
          border-radius: 999px;
          padding: 8px 12px;
          font-weight: 900;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.90);
        }

        /* === ESTILO “MARriott” rojo === */
        .pill.active {
          border-color: rgba(255, 70, 70, 0.55);
          background: rgba(255, 70, 70, 0.22);
          color: rgba(255, 255, 255, 0.98);
          box-shadow: 0 0 0 2px rgba(255, 70, 70, 0.12) inset;
        }
      `}</style>
    </div>
  );
}

export function MaiteiStickyFilters(props: {
  year: number;
  baseYear: number;
  onYear: (y: number) => void;
  onBaseYear: (y: number) => void;
  years: number[];
}) {
  return (
    <div className="stickyWrap stickyMai">
      <div className="bar">
        <div className="title">
          <div className="kicker">Management Gotel</div>
          <div className="heading">Filtros Maitei</div>
        </div>

        <div className="controls">
          <div className="block">
            <div className="label">Año</div>
            <div className="pillRow">
              {props.years.map((y) => (
                <button
                  type="button"
                  key={y}
                  onClick={() => props.onYear(y)}
                  className={`pill ${props.year === y ? "active" : ""}`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          <div className="block">
            <div className="label">Base</div>
            <div className="pillRow">
              {props.years.map((y) => (
                <button
                  type="button"
                  key={y}
                  onClick={() => props.onBaseYear(y)}
                  className={`pill ${props.baseYear === y ? "active" : ""}`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .stickyWrap {
          position: sticky;
          top: 0;
          z-index: 50;
          padding: 10px 0;
          backdrop-filter: blur(10px);
        }

        .stickyMai {
          background: linear-gradient(
            180deg,
            rgba(15, 16, 20, 0.92),
            rgba(15, 16, 20, 0.55)
          );
        }

        .bar {
          border-radius: 18px;
          padding: 14px 14px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.04);
          display: grid;
          gap: 10px;
        }

        .title {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
        }
        .kicker {
          font-weight: 900;
          letter-spacing: 0.02em;
          color: rgba(255, 255, 255, 0.70);
          font-size: 0.85rem;
        }
        .heading {
          font-weight: 950;
          font-size: 1.05rem;
        }

        .controls {
          display: grid;
          gap: 10px;
        }

        .block {
          display: grid;
          gap: 6px;
        }
        .label {
          font-size: 0.88rem;
          color: rgba(255, 255, 255, 0.75);
          font-weight: 800;
        }

        .pillRow {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .pill {
          cursor: pointer;
          border-radius: 999px;
          padding: 8px 12px;
          font-weight: 900;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.90);
        }

        /* === ESTILO “celeste Maitei” === */
        .pill.active {
          border-color: rgba(90, 190, 255, 0.60);
          background: rgba(90, 190, 255, 0.22);
          color: rgba(255, 255, 255, 0.98);
          box-shadow: 0 0 0 2px rgba(90, 190, 255, 0.12) inset;
        }
      `}</style>
    </div>
  );
}
