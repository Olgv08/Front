import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setAuth } from "../api";
import { loadWorkspaceTheme } from "../theme";
import AuthLayout, { AuthField } from "../components/AuthLayout";

export default function Register() {
  const nav = useNavigate();
  const accent = loadWorkspaceTheme().accentColor;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", { name, email, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("userName", data.user?.name ?? name);
      setAuth(data.token);
      nav("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.message || "Error al registrarte, inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <div style={{ display: "flex", gap: "4px", background: "#ece7dd", borderRadius: "12px", padding: "4px", marginBottom: "32px" }}>
        <Link
          to="/"
          style={{ flex: 1, textAlign: "center", padding: "10px 0", borderRadius: "8px", color: "#6B6860", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}
        >
          Iniciar sesión
        </Link>
        <div style={{ flex: 1, textAlign: "center", padding: "10px 0", borderRadius: "8px", background: "#1a1917", color: "#fff", fontSize: "13px", fontWeight: 600 }}>
          Crear cuenta
        </div>
      </div>

      <h1 style={{ fontSize: "28px", fontWeight: 700, margin: "0 0 6px", color: "#1a1917" }}>Crea tu cuenta</h1>
      <p style={{ fontSize: "13px", color: "#8a8578", margin: "0 0 28px" }}>Regístrate para empezar a organizar tus tareas.</p>

      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <AuthField label="Nombre completo">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            required
            style={{ flex: 1, border: "none", outline: "none", fontSize: "14px", background: "transparent" }}
          />
        </AuthField>

        <AuthField label="Correo electrónico">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            required
            style={{ flex: 1, border: "none", outline: "none", fontSize: "14px", background: "transparent" }}
          />
        </AuthField>

        <AuthField label="Contraseña">
          <input
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            required
            minLength={6}
            style={{ flex: 1, border: "none", outline: "none", fontSize: "14px", background: "transparent" }}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label="Mostrar/ocultar contraseña"
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: "#8a8578", fontWeight: 600, flexShrink: 0 }}
          >
            {show ? "Ocultar" : "Mostrar"}
          </button>
        </AuthField>

        {error && (
          <div style={{ background: "#dc262614", color: "#dc2626", padding: "10px 14px", borderRadius: "8px", fontSize: "13px" }}>
            ⚠️ {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: "6px",
            padding: "14px",
            borderRadius: "10px",
            border: "none",
            background: accent,
            color: "#fff",
            fontWeight: 700,
            fontSize: "14px",
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Creando cuenta…" : "Crear cuenta →"}
        </button>
      </form>

      <p style={{ textAlign: "center", fontSize: "12px", color: "#8a8578", marginTop: "28px" }}>
        ¿Ya tienes una cuenta?{" "}
        <Link to="/" style={{ color: accent, fontWeight: 700, textDecoration: "underline" }}>
          Inicia sesión
        </Link>
      </p>
    </AuthLayout>
  );
}
