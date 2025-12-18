import YearComparator from "./components/YearComparator";

export default function Page() {
  return (
    <>
      <header className="header">
        <div className="nav">
          <div className="brandBar" style={{ width: "100%" }}>
            <div className="brandGroup">
              <img className="brandImg" src="/logos/jcr.png" alt="JCR S.A." />
              <div className="brandDivider" />
              <div style={{ fontWeight: 700, color: "var(--primary)" }}>
                Informe de Gestión · Hoteles
                <div className="hotelSubtitle">Comparativo interanual</div>
              </div>
            </div>

            <div className="brandGroup">
              <div className="hotelSubtitle" style={{ textAlign: "right" }}>
                Consultoría
              </div>
              <img className="brandImg" src="/logos/ltelc.jpg" alt="LTELC Consultoría" />
            </div>
          </div>

          <div className="actions" style={{ marginLeft: "1rem" }}>
            <a className="btnOutline" href="#comparador">
              Comparativo
            </a>

            {/* ✅ CONTACTO (mail) */}
            <a
              className="btnPrimary"
              href="mailto:agencialtelc@gmail.com?subject=Consulta%20-%20Informe%20de%20Gesti%C3%B3n%20Grupo%20Hoteles&body=Hola%20LTELC%2C%0A%0AQuiero%20hacer%20una%20consulta%20sobre%20el%20Informe%20de%20Gesti%C3%B3n%20y%2Fo%20tableros%20de%20datos.%0A%0A%2D%20Nombre%3A%0A%2D%20Empresa%3A%0A%2D%20Mensaje%3A%0A%0AGracias."
              title="Escribinos por email"
            >
              Contacto
            </a>
          </div>
        </div>
      </header>

      <main className="main">
        <section className="hero">
          <div>
            <div className="kicker">Informe de Gestión</div>
            <h1 className="h1"> Hoteles – Comparativo interanual</h1>
            <p className="sub">
              Reporte ejecutivo con indicadores clave y comparaciones interanuales.
              Elaborado por <strong>LTELC</strong> para <strong>JCR S.A.</strong>
            </p>
            <p className="meta">
              Alcance: Grupo JCR (Marriott BA, Sheraton MDQ, Sheraton Bariloche) + GOTEL Management (Maitei). Contiene información parcial a octubre de nacionalidades y está sujeto a ajustes finales de diciembre en H&F.
            </p>
          </div>

          {/* ✅ Panel prolijo: link + mail 1 sola vez */}
          <aside className="panel">
            <div className="panelTitle">Contacto LTELC</div>

            <div
              style={{
                display: "grid",
                gap: ".75rem",
                marginTop: ".75rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: ".65rem",
                  padding: ".75rem .85rem",
                  borderRadius: "14px",
                  border: "1px solid rgba(255,255,255,.08)",
                  background: "rgba(255,255,255,.03)",
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    display: "grid",
                    placeItems: "center",
                    background: "rgba(255,255,255,.06)",
                    flex: "0 0 auto",
                  }}
                  aria-hidden="true"
                >
                  🔗
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: ".78rem", color: "var(--muted)" }}>Web</div>
                  <a
                    href="https://www.lotengoenlacabeza.com.ar"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-block",
                      fontWeight: 700,
                      textDecoration: "none",
                      color: "var(--primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "100%",
                    }}
                  >
                    www.lotengoenlacabeza.com.ar
                  </a>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: ".65rem",
                  padding: ".75rem .85rem",
                  borderRadius: "14px",
                  border: "1px solid rgba(255,255,255,.08)",
                  background: "rgba(255,255,255,.03)",
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    display: "grid",
                    placeItems: "center",
                    background: "rgba(255,255,255,.06)",
                    flex: "0 0 auto",
                  }}
                  aria-hidden="true"
                >
                  ✉️
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: ".78rem", color: "var(--muted)" }}>Email</div>
                  <a
                    href="mailto:agencialtelc@gmail.com"
                    style={{
                      display: "inline-block",
                      fontWeight: 700,
                      textDecoration: "none",
                      color: "var(--primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "100%",
                    }}
                  >
                    agencialtelc@gmail.com
                  </a>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <YearComparator />
      </main>

      <footer className="footer">
        © 2025 LTELC · Informe de Gestión – Grupo Hoteles · JCR S.A. + Maitei
      </footer>
    </>
  );
}
