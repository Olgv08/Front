import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setAuth } from "../api";
import { loadWorkspaceTheme } from "../theme";
import AuthLayout, { AuthField } from "../components/AuthLayout";

interface ApiError {
  response?: {
    data?: {
      message?: string;
    };
  };
}

export default function Login() {
  const nav = useNavigate();
  const accent = loadWorkspaceTheme().accentColor;

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
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", data.token);
      setAuth(data.token);
      nav("/dashboard");
    } catch (err: unknown) {
      const serverError = err as ApiError;
      setError(serverError.response?.data?.message || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <div style={{ display: "flex", gap: "4px", background: "#ece7dd", borderRadius: "12px", padding: "4px", marginBottom: "32px" }}>
        <div style={{ flex: 1, textAlign: "center", padding: "10px 0", borderRadius: "8px", background: "#1a1917", color: "#fff", fontSize: "13px", fontWeight: 600 }}>
          Iniciar sesión
        </div>
        <Link
          to="/register"
          style={{ flex: 1, textAlign: "center", padding: "10px 0", borderRadius: "8px", color: "#6B6860", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}
        >
          Crear cuenta
        </Link>
      </div>

      <h1 style={{ fontSize: "28px", fontWeight: 700, margin: "0 0 6px", color: "#1a1917" }}>Bienvenido de nuevo</h1>
      <p style={{ fontSize: "13px", color: "#8a8578", margin: "0 0 28px" }}>Inicia sesión para continuar a tu workspace.</p>

      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
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
            placeholder="Tu contraseña"
            required
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
          {loading ? "Iniciando sesión…" : "Iniciar sesión →"}
        </button>
      </form>

      <p style={{ textAlign: "center", fontSize: "12px", color: "#8a8578", marginTop: "28px" }}>
        ¿No tienes una cuenta?{" "}
        <Link to="/register" style={{ color: accent, fontWeight: 700, textDecoration: "underline" }}>
          Regístrate aquí
        </Link>
      </p>
    </AuthLayout>
  );
}
