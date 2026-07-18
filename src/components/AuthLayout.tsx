import type { ReactNode } from "react";
import { loadWorkspaceTheme } from "../theme";
import logo from "../assets/logo.png";

// Colores fijos secundarios, solo decorativos (no vienen del tema del usuario)
const DECORATIVE = ["#6366F1", "#10B981"];

export default function AuthLayout({ children }: { children: ReactNode }) {
  const theme = loadWorkspaceTheme();
  const accent = theme.accentColor;

  return (
    <div style={{ minHeight: "100vh", display: "flex", fontFamily: "'Onest', system-ui, sans-serif", background: "#F4F2EE" }}>
      {/* ===== Panel izquierdo decorativo (oculto en pantallas chicas) ===== */}
      <div
        className="auth-left"
        style={{
          display: "none",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "46%",
          position: "relative",
          overflow: "hidden",
          padding: "56px 64px",
          background: "linear-gradient(145deg, #1A1917 0%, #2C2A27 60%, #1A1917 100%)",
          boxSizing: "border-box",
        }}
      >
        <div style={{ position: "absolute", top: "-120px", left: "-120px", width: "380px", height: "380px", borderRadius: "50%", background: accent, opacity: 0.25, filter: "blur(80px)" }} />
        <div style={{ position: "absolute", bottom: "40px", right: "-40px", width: "290px", height: "290px", borderRadius: "50%", background: DECORATIVE[0], opacity: 0.15, filter: "blur(80px)" }} />
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "220px", height: "220px", borderRadius: "50%", background: DECORATIVE[1], opacity: 0.1, filter: "blur(60px)" }} />

        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: "12px" }}>
          <img src={logo} alt="Logo" style={{ width: "34px", height: "34px", objectFit: "contain" }} />
          <span style={{ color: "#fff", fontWeight: 700, fontSize: "17px" }}>TodoFlow</span>
        </div>

        <div style={{ position: "relative", zIndex: 1 }}>
          <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: accent, margin: "0 0 16px" }}>
            Tu workspace
          </p>
          <h2 style={{ fontSize: "38px", fontWeight: 700, color: "#fff", lineHeight: 1.15, margin: "0 0 20px" }}>
            Cada gran día
            <br />
            empieza con una lista.
          </h2>
          <p style={{ color: "#ffffff80", fontSize: "14px", lineHeight: 1.6, maxWidth: "320px", margin: 0 }}>
            Mantente enfocado y organizado con un gestor de tareas hecho a tu medida.
          </p>

          <div style={{ marginTop: "36px", display: "flex", flexDirection: "column", gap: "14px" }}>
            {[
              { c: accent, t: "Personaliza cada tarea a tu gusto" },
              { c: DECORATIVE[0], t: "Un tema para todo tu workspace" },
              { c: DECORATIVE[1], t: "Funciona incluso sin conexión" },
            ].map((f) => (
              <div key={f.t} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: f.c, flexShrink: 0 }} />
                <span style={{ color: "#ffffff99", fontSize: "13px" }}>{f.t}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
          {[
            { title: "Sincronizar con el equipo", color: accent, done: true },
            { title: "Definir el roadmap", color: DECORATIVE[0], done: false },
            { title: "Revisar pull requests", color: DECORATIVE[1], done: false },
          ].map((t) => (
            <div key={t.title} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "10px", background: "#ffffff0d", border: "1px solid #ffffff14" }}>
              <span style={{ width: "14px", height: "14px", borderRadius: "50%", border: `2px solid ${t.done ? t.color : "#ffffff40"}`, background: t.done ? t.color : "transparent", flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: "12px", color: "#ffffffb3", textDecoration: t.done ? "line-through" : "none", opacity: t.done ? 0.5 : 1 }}>{t.title}</span>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: t.color, opacity: t.done ? 0.3 : 1 }} />
            </div>
          ))}
        </div>
      </div>

      {/* ===== Panel derecho: formulario ===== */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "56px 24px", position: "relative", boxSizing: "border-box" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: `linear-gradient(90deg, ${accent}, ${DECORATIVE[0]}, ${DECORATIVE[1]})` }} />

        <div className="auth-mobile-logo" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "36px" }}>
          <img src={logo} alt="Logo" style={{ width: "28px", height: "28px", objectFit: "contain" }} />
          <span style={{ fontWeight: 700, fontSize: "15px", color: "#1a1917" }}>TodoFlow</span>
        </div>

        <div style={{ width: "100%", maxWidth: "400px" }}>{children}</div>
      </div>

      <style>{`
        @media (min-width: 1024px) {
          .auth-left { display: flex !important; }
          .auth-mobile-logo { display: none !important; }
        }
      `}</style>
    </div>
  );
}

export function AuthField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label style={{ fontSize: "11px", fontWeight: 700, color: "#8a8578", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: "6px" }}>
        {label}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "13px 16px", background: "#fff", border: `1.5px solid ${error ? "#dc2626" : "#e5e0d5"}`, borderRadius: "10px", boxSizing: "border-box" }}>
        {children}
      </div>
      {error && <p style={{ fontSize: "11px", color: "#dc2626", margin: "6px 0 0 2px" }}>{error}</p>}
    </div>
  );
}
