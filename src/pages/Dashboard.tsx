import { useEffect, useMemo, useState, useRef } from "react";
import { api, setAuth } from "../api";
import {
  cacheTasks,
  getAllTasksLocal,
  putTaskLocal,
  removeTaskLocal,
  queue,
  type OutboxOp,
} from "../offline/db";
import { syncNow } from "../offline/sync";
import {
  type FontSize,
  type Shape,
  type WorkspaceTheme,
  DEFAULT_WORKSPACE_THEME,
  WORKSPACE_THEME_KEY,
  loadWorkspaceTheme,
  shapeRadius,
  isDark,
} from "../theme";

// ============================================================
// Tipos
// ============================================================
type Status = "Pendiente" | "En Progreso" | "Completada";

type TaskStyle = {
  fontFamily: string;
  color: string;
  fontSize: FontSize;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

type Task = {
  _id: string;
  title: string;
  description?: string;
  status: Status;
  clienteId?: string;
  createdAt?: string;
  deleted?: boolean;
  pending?: boolean;
  style?: TaskStyle;
};

const isLocalId = (id: string) => !/^[a-f0-9]{24}$/i.test(id);

// ============================================================
// Personalización POR TAREA (fuente / color / tamaño individual)
// ============================================================
const FONT_OPTIONS: { label: string; value: string; sample: string }[] = [
  { label: "Onest", value: "'Onest', system-ui, sans-serif", sample: "Aa" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', ui-monospace, monospace", sample: "Aa" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif", sample: "Aa" },
  { label: "DM Mono", value: "'DM Mono', ui-monospace, monospace", sample: "Aa" },
  { label: "Playfair Display", value: "'Playfair Display', serif", sample: "Aa" },
];

const FONT_SIZE_PX: Record<FontSize, string> = { sm: "14px", md: "18px", lg: "24px" };
const FONT_SIZE_LABEL: Record<FontSize, string> = { sm: "Pequeño", md: "Mediano", lg: "Grande" };

const DEFAULT_TASK_STYLE: TaskStyle = {
  fontFamily: FONT_OPTIONS[0].value,
  color: "#1a1917",
  fontSize: "md",
  bold: false,
  italic: false,
  underline: false,
};

const QUICK_THEMES: { name: string; style: TaskStyle }[] = [
  { name: "Consola", style: { fontFamily: FONT_OPTIONS[1].value, color: "#0f9d58", fontSize: "md", bold: false, italic: false, underline: false } },
  { name: "Elegante", style: { fontFamily: FONT_OPTIONS[4].value, color: "#7c3aed", fontSize: "lg", bold: false, italic: true, underline: false } },
  { name: "Urgente", style: { fontFamily: FONT_OPTIONS[0].value, color: "#dc2626", fontSize: "lg", bold: true, italic: false, underline: true } },
  { name: "Código", style: { fontFamily: FONT_OPTIONS[3].value, color: "#0369a1", fontSize: "sm", bold: false, italic: false, underline: false } },
];

function normalizeStyle(x: any): TaskStyle {
  if (!x || typeof x !== "object") return DEFAULT_TASK_STYLE;
  return {
    fontFamily: typeof x.fontFamily === "string" && x.fontFamily ? x.fontFamily : DEFAULT_TASK_STYLE.fontFamily,
    color: typeof x.color === "string" && x.color ? x.color : DEFAULT_TASK_STYLE.color,
    fontSize: x.fontSize === "sm" || x.fontSize === "lg" ? x.fontSize : "md",
    bold: !!x.bold,
    italic: !!x.italic,
    underline: !!x.underline,
  };
}

function normalizeTask(x: any): Task {
  return {
    _id: String(x?._id ?? x?.id),
    title: String(x?.title ?? "(sin título)"),
    description: x?.description ?? "",
    status:
      x?.status === "Completada" || x?.status === "En Progreso" || x?.status === "Pendiente"
        ? x.status
        : "Pendiente",
    clienteId: x?.clienteId,
    createdAt: x?.createdAt,
    deleted: !!x?.deleted,
    pending: !!x?.pending,
    style: normalizeStyle(x?.style),
  };
}

// ============================================================
// Tema GENERAL del workspace (afecta a toda la app)
// ============================================================
const ACCENT_OPTIONS: { value: string; label: string }[] = [
  { value: "#E8541A", label: "Ember" },
  { value: "#6366F1", label: "Indigo" },
  { value: "#10B981", label: "Sage" },
  { value: "#F59E0B", label: "Amber" },
  { value: "#EC4899", label: "Rose" },
  { value: "#3B82F6", label: "Sky" },
];

const TASK_BG_OPTIONS: { value: string; label: string }[] = [
  { value: "#FDFCFA", label: "Ivory" },
  { value: "#F0F4FF", label: "Ice" },
  { value: "#F0FFF4", label: "Mint" },
  { value: "#FFF5F5", label: "Blush" },
  { value: "#1A1917", label: "Night" },
];

const SHAPE_OPTIONS: { value: Shape; label: string; radius: string }[] = [
  { value: "sharp", label: "Sharp", radius: "4px" },
  { value: "rounded", label: "Rounded", radius: "14px" },
  { value: "pill", label: "Pill", radius: "28px" },
];

function getStatusMeta(accentColor: string): Record<Status, { label: string; color: string; bg: string }> {
  return {
    Pendiente: { label: "Pendiente", color: accentColor, bg: accentColor + "1f" },
    "En Progreso": { label: "En Progreso", color: "#E8A030", bg: "#E8A0301f" },
    Completada: { label: "Completada", color: "#6B9E78", bg: "#6B9E781f" },
  };
}

type CustomizeSection = "type" | "color" | "shape" | "layout";

// ============================================================
// Componente
// ============================================================
export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState("");
  const [editError, setEditError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [editingStyle, setEditingStyle] = useState<TaskStyle>(DEFAULT_TASK_STYLE);
  const [online, setOnline] = useState<boolean>(navigator.onLine);

  const [userName, setUserName] = useState<string>("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  // ---- Tema general (persistido en este dispositivo) ----
  const [theme, setTheme] = useState<WorkspaceTheme>(() => loadWorkspaceTheme());
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<CustomizeSection>("type");

  // ---- Formulario de nueva tarea (colapsable, con personalización propia) ----
  const [formOpen, setFormOpen] = useState(false);
  const [newTaskStyle, setNewTaskStyle] = useState<TaskStyle>(() => ({
    ...DEFAULT_TASK_STYLE,
    fontFamily: theme.defaultFontFamily,
    fontSize: theme.defaultFontSize,
  }));

  const dropdownRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(WORKSPACE_THEME_KEY, JSON.stringify(theme));
    } catch {
      // si localStorage no está disponible, simplemente no persistimos el tema
    }
  }, [theme]);

  useEffect(() => {
    setAuth(localStorage.getItem("token"));

    const name = localStorage.getItem("userName") || "Usuario";
    setUserName(name);

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    const on = async () => {
      setOnline(true);
      await syncNow();
      await loadFromServer();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);

    (async () => {
      const local = await getAllTasksLocal();
      if (local?.length) setTasks(local.map(normalizeTask));
      await loadFromServer();
      await syncNow();
      await loadFromServer();
    })();

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  async function loadFromServer() {
    try {
      const { data } = await api.get("/tasks");
      const raw = Array.isArray(data?.items) ? data.items : [];
      const list = raw.map(normalizeTask);
      setTasks(list);
      await cacheTasks(list);
    } catch {
      // si falla, nos quedamos con lo local
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setModalError("");
    setModalSuccess("");

    if (newPassword !== confirmPassword) {
      setModalError("La nueva contraseña y la confirmación no coinciden.");
      return;
    }

    if (!navigator.onLine) {
      setModalError("Debes estar online para cambiar tu contraseña.");
      return;
    }

    setPasswordLoading(true);
    try {
      await api.put("/auth/change-password", { currentPassword, newPassword });
      setModalSuccess("¡Contraseña actualizada correctamente!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setModalOpen(false), 2000);
    } catch (err: any) {
      setModalError(err.response?.data?.message || "Error al cambiar la contraseña.");
    } finally {
      setPasswordLoading(false);
    }
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    const d = description.trim();

    if (!t) {
      setFormError("Escribe un título para la tarea antes de guardarla.");
      titleRef.current?.focus();
      return;
    }
    if (t.length > 120) {
      setFormError("El título es muy largo (máximo 120 caracteres).");
      return;
    }
    if (!d) {
      setFormError("Agrega una descripción para la tarea antes de guardarla.");
      return;
    }
    setFormError("");

    const clienteId = crypto.randomUUID();
    const localTask = normalizeTask({
      _id: clienteId,
      title: t,
      description: d,
      status: "Pendiente" as Status,
      pending: !navigator.onLine,
      style: newTaskStyle,
    });

    setTasks((prev) => [localTask, ...prev]);
    await putTaskLocal(localTask);
    setTitle("");
    setDescription("");
    setNewTaskStyle({ ...DEFAULT_TASK_STYLE, fontFamily: theme.defaultFontFamily, fontSize: theme.defaultFontSize });
    setFormOpen(false);

    if (!navigator.onLine) {
      const op: OutboxOp = {
        id: "op-" + clienteId,
        op: "create",
        clienteId,
        data: localTask,
        ts: Date.now(),
      } as any;
      await queue(op);
      return;
    }

    try {
      const { data } = await api.post("/tasks", { title: t, description: d, style: newTaskStyle });
      const created = normalizeTask(data?.task ?? data);
      setTasks((prev) => prev.map((x) => (x._id === clienteId ? created : x)));
      await putTaskLocal(created);
    } catch {
      const op: OutboxOp = {
        id: "op-" + clienteId,
        op: "create",
        clienteId,
        data: localTask,
        ts: Date.now(),
      } as any;
      await queue(op);
    }
  }

  function startEdit(task: Task) {
    setEditingId(task._id);
    setEditingTitle(task.title);
    setEditingDescription(task.description ?? "");
    setEditingStyle(task.style ?? DEFAULT_TASK_STYLE);
    setEditError("");
  }

  async function saveEdit(taskId: string) {
    const newTitle = editingTitle.trim();
    const newDesc = editingDescription.trim();

    if (!newTitle) {
      setEditError("Escribe un título para la tarea antes de guardarla.");
      return;
    }
    if (newTitle.length > 120) {
      setEditError("El título es muy largo (máximo 120 caracteres).");
      return;
    }
    if (!newDesc) {
      setEditError("Agrega una descripción para la tarea antes de guardarla.");
      return;
    }
    setEditError("");

    const before = tasks.find((t) => t._id === taskId);
    const patched = { ...before, title: newTitle, description: newDesc, style: editingStyle } as Task;

    setTasks((prev) => prev.map((t) => (t._id === taskId ? patched : t)));
    await putTaskLocal(patched);
    setEditingId(null);

    const cId = isLocalId(taskId) ? taskId : (before?.clienteId ?? "");

    if (!navigator.onLine) {
      await queue({
        id: "upd-" + taskId,
        op: "update",
        clienteId: cId || undefined,
        serverId: isLocalId(taskId) ? undefined : taskId,
        data: { title: newTitle, description: newDesc, style: editingStyle },
        ts: Date.now(),
      } as OutboxOp);
      return;
    }

    try {
      await api.put(`/tasks/${taskId}`, { title: newTitle, description: newDesc, style: editingStyle });
    } catch {
      await queue({
        id: "upd-" + taskId,
        op: "update",
        clienteId: cId || undefined,
        serverId: taskId,
        data: { title: newTitle, description: newDesc, style: editingStyle },
        ts: Date.now(),
      } as OutboxOp);
    }
  }

  async function handleStatusChange(task: Task, newStatus: Status) {
    const updated = { ...task, status: newStatus };
    setTasks((prev) => prev.map((x) => (x._id === task._id ? updated : x)));
    await putTaskLocal(updated);

    const cId = task.clienteId ?? "";

    if (!navigator.onLine) {
      await queue({
        id: "upd-" + task._id,
        op: "update",
        serverId: isLocalId(task._id) ? undefined : task._id,
        clienteId: cId || undefined,
        data: { status: newStatus },
        ts: Date.now(),
      } as OutboxOp);
      return;
    }

    try {
      await api.put(`/tasks/${task._id}`, { status: newStatus });
    } catch {
      await queue({
        id: "upd-" + task._id,
        op: "update",
        serverId: task._id,
        clienteId: cId || undefined,
        data: { status: newStatus },
        ts: Date.now(),
      } as OutboxOp);
    }
  }

  async function removeTask(taskId: string) {
    const backup = tasks;
    const taskToDelete = tasks.find((t) => t._id === taskId);
    const cId = taskToDelete?.clienteId ?? "";

    setTasks((prev) => prev.filter((t) => t._id !== taskId));
    await removeTaskLocal(taskId);

    if (!navigator.onLine) {
      await queue({
        id: "del-" + taskId,
        op: "delete",
        serverId: isLocalId(taskId) ? undefined : taskId,
        clienteId: cId || undefined,
        ts: Date.now(),
      } as OutboxOp);
      return;
    }

    try {
      await api.delete(`/tasks/${taskId}`);
    } catch {
      setTasks(backup);
      for (const t of backup) await putTaskLocal(t);
      await queue({
        id: "del-" + taskId,
        op: "delete",
        serverId: taskId,
        clienteId: cId || undefined,
        ts: Date.now(),
      } as OutboxOp);
    }
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userName");
    setAuth(null);
    window.location.href = "/";
  }

  const filtered = useMemo(() => {
    let list = tasks;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (t) => (t.title || "").toLowerCase().includes(s) || (t.description || "").toLowerCase().includes(s)
      );
    }
    if (filter === "all") return list;
    if (filter === "active") list = list.filter((t) => t.status !== "Completada");
    if (filter === "completed") list = list.filter((t) => t.status === "Completada");
    return list;
  }, [tasks, search, filter]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "Completada").length;
    return { total, done, pending: total - done };
  }, [tasks]);

  const progress = tasks.length > 0 ? (stats.done / tasks.length) * 100 : 0;
  const userInitial = userName.charAt(0).toUpperCase();
  const taskDark = isDark(theme.taskBg);
  const todayLabel = useMemo(() => {
    const now = new Date();
    const weekday = new Intl.DateTimeFormat("es-ES", { weekday: "long" }).format(now).toUpperCase();
    const date = new Intl.DateTimeFormat("es-ES", { month: "long", day: "numeric", year: "numeric" }).format(now);
    return { weekday, date };
  }, []);

  const radius = shapeRadius(theme.shape);
  const statusMeta = getStatusMeta(theme.accentColor);

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#F3F1EC", fontFamily: "'Onest', system-ui, sans-serif", color: "#1a1917", paddingTop: "env(safe-area-inset-top)" }}>
      <div style={{ marginRight: panelOpen ? "min(380px, 100vw)" : 0, transition: "margin-right 0.25s ease" }}>
        {/* ===== Header ===== */}
        <header
          style={{
            background: `linear-gradient(135deg, ${theme.accentColor}26, ${theme.accentColor}08 55%, transparent)`,
            borderBottom: "1px solid #eae5da",
            padding: "28px clamp(20px, 4vw, 56px) 30px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "14px", marginBottom: "18px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.5px",
                padding: "6px 12px",
                borderRadius: "999px",
                background: theme.accentColor + "20",
                color: theme.accentColor,
              }}
            >
              {todayLabel.weekday} <span style={{ fontWeight: 400, color: "#57534e" }}>· {todayLabel.date}</span>
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "5px 10px",
                  borderRadius: "999px",
                  background: online ? "#10b98122" : "#00000014",
                  color: online ? "#0d7a4f" : "#57534e",
                }}
              >
                {online ? "Online" : "Offline"}
              </span>

              <button
                onClick={() => setPanelOpen((o) => !o)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 18px",
                  borderRadius: "10px",
                  border: "1px solid #e5e0d5",
                  background: panelOpen ? "#1a1917" : "#ffffff",
                  color: panelOpen ? "#ffffff" : "#1a1917",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                }}
              >
                🎨 Customize
              </button>

              <div ref={dropdownRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    background: "#ffffff",
                    padding: "8px 14px 8px 8px",
                    borderRadius: "10px",
                    border: "1px solid #e5e0d5",
                    cursor: "pointer",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                  }}
                >
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "8px",
                      background: theme.accentColor,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    {userInitial}
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: 600 }}>{userName} ▾</span>
                </button>

                {dropdownOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "48px",
                      right: 0,
                      background: "#ffffff",
                      border: "1px solid #e5e0d5",
                      borderRadius: "10px",
                      boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15)",
                      width: "190px",
                      zIndex: 150,
                      overflow: "hidden",
                    }}
                  >
                    <button
                      onClick={() => {
                        setModalOpen(true);
                        setDropdownOpen(false);
                      }}
                      style={{ width: "100%", padding: "12px 14px", background: "none", border: "none", color: "#1a1917", textAlign: "left", cursor: "pointer", fontSize: "13px" }}
                    >
                      🔑 Cambiar Contraseña
                    </button>
                    <button
                      onClick={logout}
                      style={{ width: "100%", padding: "12px 14px", background: "none", border: "none", borderTop: "1px solid #eee", color: "#dc2626", textAlign: "left", cursor: "pointer", fontSize: "13px" }}
                    >
                      🚪 Cerrar Sesión
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <h1 style={{ fontSize: "clamp(32px, 4vw, 44px)", fontWeight: 800, margin: 0, letterSpacing: "-1px" }}>TodoFlow</h1>

          <div style={{ display: "flex", gap: "20px", marginTop: "10px", fontSize: "14px", color: "#57534e", flexWrap: "wrap" }}>
            <span><strong style={{ color: "#1a1917" }}>{stats.pending}</strong> pendientes</span>
            <span><strong style={{ color: "#1a1917" }}>{stats.done}</strong> hechas</span>
            <span><strong style={{ color: "#1a1917" }}>{stats.total}</strong> total</span>
          </div>

          <div style={{ marginTop: "14px", height: "6px", borderRadius: "999px", background: "#e7e2d8", maxWidth: "420px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: theme.accentColor, borderRadius: "999px", transition: "width 0.3s ease" }} />
          </div>
        </header>

        {/* ===== Contenido ===== */}
        <main style={{ maxWidth: "900px", margin: "0 auto", padding: "28px clamp(20px, 4vw, 56px) 64px" }}>
          {/* ===== Agregar tarea ===== */}
          {!formOpen ? (
            <button
              onClick={() => {
                setNewTaskStyle((s) => ({ ...s, fontFamily: theme.defaultFontFamily, fontSize: theme.defaultFontSize }));
                setFormOpen(true);
              }}
              style={{
                width: "100%",
                padding: "18px 24px",
                borderRadius: radius === "28px" ? "28px" : "12px",
                border: `1.5px dashed ${theme.accentColor}66`,
                background: "#ffffffaa",
                color: theme.accentColor,
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer",
                marginBottom: "28px",
              }}
            >
              + Agregar tarea
            </button>
          ) : (
            <form
              onSubmit={addTask}
              style={{
                background: "#ffffff",
                borderTop: `3px solid ${theme.accentColor}`,
                borderRadius: "12px",
                padding: "22px 24px",
                marginBottom: "28px",
                boxShadow: "0 10px 25px -8px rgba(0,0,0,0.12)",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <input
                ref={titleRef}
                autoFocus
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (formError) setFormError("");
                }}
                placeholder="Título de la tarea…"
                style={{
                  border: formError && !title.trim() ? "1.5px solid #dc2626" : "none",
                  outline: "none",
                  fontSize: "18px",
                  fontWeight: 600,
                  padding: "4px 0",
                  borderRadius: formError && !title.trim() ? "6px" : 0,
                  paddingLeft: formError && !title.trim() ? "8px" : 0,
                }}
              />
              {formError && (
                <div style={{ background: "#dc262614", color: "#dc2626", padding: "8px 12px", borderRadius: "8px", fontSize: "13px", marginTop: "-8px" }}>
                  ⚠️ {formError}
                </div>
              )}
              <textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (formError) setFormError("");
                }}
                placeholder="Agrega una descripción…"
                rows={2}
                style={{
                  border: formError && !description.trim() ? "1.5px solid #dc2626" : "none",
                  outline: "none",
                  resize: "vertical",
                  fontSize: "14px",
                  color: "#57534e",
                  padding: "4px 0",
                  fontFamily: "inherit",
                  borderRadius: formError && !description.trim() ? "6px" : 0,
                  paddingLeft: formError && !description.trim() ? "8px" : 0,
                }}
              />

              {/* Personalización de ESTA tarea */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "14px",
                  alignItems: "flex-end",
                  padding: "14px",
                  borderRadius: "10px",
                  border: "1px dashed #e5e0d5",
                  background: "#faf9f6",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "11px", color: "#8a8578", fontWeight: 600 }}>TIPOGRAFÍA</label>
                  <select
                    value={newTaskStyle.fontFamily}
                    onChange={(e) => setNewTaskStyle((s) => ({ ...s, fontFamily: e.target.value }))}
                    style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #e5e0d5", fontFamily: newTaskStyle.fontFamily, fontSize: "13px" }}
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "11px", color: "#8a8578", fontWeight: 600 }}>COLOR</label>
                  <input
                    type="color"
                    value={newTaskStyle.color}
                    onChange={(e) => setNewTaskStyle((s) => ({ ...s, color: e.target.value }))}
                    style={{ width: "40px", height: "34px", padding: "2px", borderRadius: "8px", border: "1px solid #e5e0d5", cursor: "pointer", background: "none" }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "11px", color: "#8a8578", fontWeight: 600 }}>TAMAÑO</label>
                  <select
                    value={newTaskStyle.fontSize}
                    onChange={(e) => setNewTaskStyle((s) => ({ ...s, fontSize: e.target.value as FontSize }))}
                    style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #e5e0d5", fontSize: "13px" }}
                  >
                    <option value="sm">Pequeño</option>
                    <option value="md">Mediano</option>
                    <option value="lg">Grande</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "11px", color: "#8a8578", fontWeight: 600 }}>FORMATO</label>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {(
                      [
                        { key: "bold" as const, label: "B", style: { fontWeight: 800 } },
                        { key: "italic" as const, label: "I", style: { fontStyle: "italic" } },
                        { key: "underline" as const, label: "U", style: { textDecoration: "underline" } },
                      ]
                    ).map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setNewTaskStyle((s) => ({ ...s, [f.key]: !s[f.key] }))}
                        style={{
                          width: "34px",
                          height: "34px",
                          borderRadius: "8px",
                          border: `1px solid ${newTaskStyle[f.key] ? "#1a1917" : "#e5e0d5"}`,
                          background: newTaskStyle[f.key] ? "#1a1917" : "#fff",
                          color: newTaskStyle[f.key] ? "#fff" : "#1a1917",
                          cursor: "pointer",
                          fontSize: "14px",
                          ...f.style,
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {QUICK_THEMES.map((qt) => (
                    <button
                      key={qt.name}
                      type="button"
                      onClick={() => setNewTaskStyle(qt.style)}
                      style={{
                        padding: "7px 12px",
                        borderRadius: "999px",
                        border: `1px solid ${qt.style.color}`,
                        background: "transparent",
                        color: qt.style.color,
                        fontFamily: qt.style.fontFamily,
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      {qt.name}
                    </button>
                  ))}
                </div>

                <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "11px", color: "#8a8578", fontWeight: 600 }}>VISTA PREVIA</label>
                  <div
                    style={{
                      padding: "8px 14px",
                      borderRadius: "8px",
                      background: "#ffffff",
                      border: "1px solid #e5e0d5",
                      fontFamily: newTaskStyle.fontFamily,
                      color: newTaskStyle.color,
                      fontSize: FONT_SIZE_PX[newTaskStyle.fontSize],
                      fontWeight: newTaskStyle.bold ? 800 : 400,
                      fontStyle: newTaskStyle.italic ? "italic" : "normal",
                      textDecoration: newTaskStyle.underline ? "underline" : "none",
                      minWidth: "140px",
                    }}
                  >
                    {title.trim() || "Tu tarea"}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "4px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setFormOpen(false);
                    setTitle("");
                    setDescription("");
                    setFormError("");
                  }}
                  style={{ padding: "11px 20px", borderRadius: "10px", border: "none", background: "transparent", color: "#57534e", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "11px 22px",
                    borderRadius: "10px",
                    border: "none",
                    background: theme.accentColor,
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Agregar tarea
                </button>
              </div>
            </form>
          )}

          {/* ===== Toolbar: búsqueda + filtros ===== */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <div style={{ display: "flex", gap: "6px", background: "#ece7dd", padding: "4px", borderRadius: "10px" }}>
              {(["all", "active", "completed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "none",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: filter === f ? "#1a1917" : "transparent",
                    color: filter === f ? "#ffffff" : "#57534e",
                  }}
                >
                  {f === "all" ? "Todas" : f === "active" ? "Activas" : "Hechas"}
                </button>
              ))}
            </div>

            <input
              placeholder="Buscar por título o descripción…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flexGrow: 1, minWidth: "200px", padding: "10px 16px", borderRadius: "10px", border: "1px solid #e5e0d5", fontSize: "13px", background: "#ffffff" }}
            />

            {stats.done > 0 && (
              <button
                onClick={() => setTasks((prev) => prev.filter((t) => t.status !== "Completada"))}
                style={{ background: "none", border: "none", textDecoration: "underline", fontSize: "12px", color: "#57534e", cursor: "pointer", whiteSpace: "nowrap" }}
                title="Solo oculta las completadas de la vista local"
              >
                Ocultar completadas
              </button>
            )}
          </div>

          {/* ===== Lista de tareas ===== */}
          {loading ? (
            <p style={{ textAlign: "center", padding: "40px", color: "#8a8578" }}>Cargando…</p>
          ) : filtered.length === 0 ? (
            <p style={{ textAlign: "center", padding: "60px", background: "#ffffff", borderRadius: "12px", color: "#8a8578" }}>Sin tareas</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: theme.compact ? "10px" : "16px" }}>
              {filtered.map((t) => {
                const meta = statusMeta[t.status];
                const isEditing = editingId === t._id;
                return (
                  <li
                    key={t._id}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: isEditing ? "stretch" : "flex-start",
                      gap: "12px 16px",
                      background: theme.taskBg,
                      color: taskDark ? "#f5f3ef" : "#1a1917",
                      borderRadius: radius,
                      padding: theme.compact ? "14px 18px" : "22px 26px",
                      borderLeft: `4px solid ${meta.color}`,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    }}
                  >
                    {!isEditing && (
                      <button
                        onClick={() => handleStatusChange(t, t.status === "Completada" ? "Pendiente" : "Completada")}
                        title="Marcar como completada"
                        style={{
                          flexShrink: 0,
                          width: "26px",
                          height: "26px",
                          borderRadius: "50%",
                          border: `2px solid ${t.status === "Completada" ? meta.color : (taskDark ? "#ffffff55" : "#00000033")}`,
                          background: t.status === "Completada" ? meta.color : "transparent",
                          color: "#ffffff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          fontSize: "13px",
                          marginTop: "2px",
                        }}
                      >
                        {t.status === "Completada" ? "✓" : ""}
                      </button>
                    )}

                    <div style={{ flex: "1 1 220px", minWidth: "220px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      {isEditing ? (
                        <>
                          <input
                            autoFocus
                            value={editingTitle}
                            onChange={(e) => {
                              setEditingTitle(e.target.value);
                              if (editError) setEditError("");
                            }}
                            placeholder="Título"
                            style={{ padding: "10px 14px", borderRadius: "8px", border: `1px solid ${editError && !editingTitle.trim() ? "#dc2626" : theme.accentColor}`, fontSize: "16px", width: "100%", boxSizing: "border-box" }}
                          />
                          {editError && (
                            <div style={{ background: "#dc262614", color: "#dc2626", padding: "8px 12px", borderRadius: "8px", fontSize: "13px" }}>
                              ⚠️ {editError}
                            </div>
                          )}
                          <textarea
                            value={editingDescription}
                            onChange={(e) => {
                              setEditingDescription(e.target.value);
                              if (editError) setEditError("");
                            }}
                            placeholder="Descripción"
                            rows={2}
                            style={{ padding: "10px 14px", borderRadius: "8px", border: `1px solid ${editError && !editingDescription.trim() ? "#dc2626" : theme.accentColor}`, fontSize: "14px", resize: "vertical", width: "100%", boxSizing: "border-box" }}
                          />

                          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "flex-end", padding: "10px", borderRadius: "8px", border: `1px dashed ${theme.accentColor}` }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <label style={{ fontSize: "10px", color: "#8a8578" }}>Tipografía</label>
                              <select
                                value={editingStyle.fontFamily}
                                onChange={(e) => setEditingStyle((s) => ({ ...s, fontFamily: e.target.value }))}
                                style={{ padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontFamily: editingStyle.fontFamily, fontSize: "12px" }}
                              >
                                {FONT_OPTIONS.map((f) => (
                                  <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                                    {f.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <label style={{ fontSize: "10px", color: "#8a8578" }}>Color</label>
                              <input
                                type="color"
                                value={editingStyle.color}
                                onChange={(e) => setEditingStyle((s) => ({ ...s, color: e.target.value }))}
                                style={{ width: "36px", height: "30px", padding: "2px", borderRadius: "6px", border: "1px solid #cbd5e1", cursor: "pointer" }}
                              />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <label style={{ fontSize: "10px", color: "#8a8578" }}>Tamaño</label>
                              <select
                                value={editingStyle.fontSize}
                                onChange={(e) => setEditingStyle((s) => ({ ...s, fontSize: e.target.value as FontSize }))}
                                style={{ padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px" }}
                              >
                                <option value="sm">Pequeño</option>
                                <option value="md">Mediano</option>
                                <option value="lg">Grande</option>
                              </select>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <label style={{ fontSize: "10px", color: "#8a8578" }}>Formato</label>
                              <div style={{ display: "flex", gap: "3px" }}>
                                {(
                                  [
                                    { key: "bold" as const, label: "B", style: { fontWeight: 800 } },
                                    { key: "italic" as const, label: "I", style: { fontStyle: "italic" } },
                                    { key: "underline" as const, label: "U", style: { textDecoration: "underline" } },
                                  ]
                                ).map((f) => (
                                  <button
                                    key={f.key}
                                    type="button"
                                    onClick={() => setEditingStyle((s) => ({ ...s, [f.key]: !s[f.key] }))}
                                    style={{
                                      width: "28px",
                                      height: "28px",
                                      borderRadius: "6px",
                                      border: `1px solid ${editingStyle[f.key] ? "#1a1917" : "#cbd5e1"}`,
                                      background: editingStyle[f.key] ? "#1a1917" : "#fff",
                                      color: editingStyle[f.key] ? "#fff" : "#1a1917",
                                      cursor: "pointer",
                                      fontSize: "12px",
                                      ...f.style,
                                    }}
                                  >
                                    {f.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              {QUICK_THEMES.map((qt) => (
                                <button
                                  key={qt.name}
                                  type="button"
                                  onClick={() => setEditingStyle(qt.style)}
                                  style={{ padding: "6px 10px", borderRadius: "999px", border: `1px solid ${qt.style.color}`, background: "transparent", color: qt.style.color, fontFamily: qt.style.fontFamily, cursor: "pointer", fontSize: "11px" }}
                                >
                                  {qt.name}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button
                              onClick={() => saveEdit(t._id)}
                              style={{ padding: "9px 18px", background: theme.accentColor, color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}
                            >
                              Guardar
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span
                            onDoubleClick={() => startEdit(t)}
                            style={{
                              fontFamily: t.style?.fontFamily ?? DEFAULT_TASK_STYLE.fontFamily,
                              fontSize: FONT_SIZE_PX[t.style?.fontSize ?? "md"],
                              fontWeight: t.style?.bold ? 800 : 600,
                              fontStyle: t.style?.italic ? "italic" : "normal",
                              color: t.status === "Completada" ? (taskDark ? "#ffffff77" : "#00000066") : t.style?.color ?? DEFAULT_TASK_STYLE.color,
                              textDecoration: [
                                t.status === "Completada" ? "line-through" : "",
                                t.style?.underline ? "underline" : "",
                              ].filter(Boolean).join(" ") || "none",
                              overflowWrap: "break-word",
                              cursor: "text",
                            }}
                          >
                            {t.title}
                          </span>
                          {t.description && (
                            <p
                              style={{
                                margin: 0,
                                fontFamily: t.style?.fontFamily ?? DEFAULT_TASK_STYLE.fontFamily,
                                fontSize: "14px",
                                fontWeight: t.style?.bold ? 700 : 400,
                                fontStyle: t.style?.italic ? "italic" : "normal",
                                textDecoration: t.style?.underline ? "underline" : "none",
                                color: taskDark ? "#f5f3efaa" : "#57534e",
                                lineHeight: 1.5,
                                overflowWrap: "break-word",
                              }}
                            >
                              {t.description}
                            </p>
                          )}
                          {(t.pending || isLocalId(t._id)) && (
                            <span style={{ background: "#d97706", color: "#ffffff", width: "fit-content", padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 600 }}>
                              Falta sincronizar
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {!isEditing && (
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, marginLeft: "auto" }}>
                        {theme.showStatusBadge && (
                          <select
                            value={t.status}
                            onChange={(e) => handleStatusChange(t, e.target.value as Status)}
                            title="Cambiar estado"
                            style={{
                              appearance: "none",
                              padding: "6px 26px 6px 12px",
                              borderRadius: "999px",
                              border: "none",
                              background: meta.bg,
                              color: meta.color,
                              fontSize: "12px",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            <option value="Pendiente">Pendiente</option>
                            <option value="En Progreso">En Progreso</option>
                            <option value="Completada">Completada</option>
                          </select>
                        )}
                        <button
                          onClick={() => startEdit(t)}
                          title="Editar"
                          style={{ background: "none", border: `1px solid ${taskDark ? "#ffffff33" : "#00000022"}`, padding: "8px 10px", borderRadius: "8px", cursor: "pointer", fontSize: "14px" }}
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => removeTask(t._id)}
                          title="Eliminar"
                          style={{ background: "none", border: `1px solid ${taskDark ? "#ffffff33" : "#00000022"}`, padding: "8px 10px", borderRadius: "8px", cursor: "pointer", fontSize: "14px" }}
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </main>
      </div>

      {/* ===== Panel Customize (tema general del workspace) ===== */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: panelOpen ? 0 : "-380px",
          width: "min(360px, 100vw)",
          height: "100vh",
          background: "#ffffff",
          borderLeft: "1px solid #eae5da",
          padding: "24px",
          paddingTop: "calc(24px + env(safe-area-inset-top))",
          paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
          overflowY: "auto",
          zIndex: 200,
          transition: "right 0.25s ease",
          boxShadow: panelOpen ? "-8px 0 24px rgba(0,0,0,0.1)" : "none",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "17px" }}>Customize</h3>
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#8a8578" }}>Personaliza tu workspace</p>
          </div>
          <button onClick={() => setPanelOpen(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#8a8578" }}>
            ✕
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px", marginBottom: "22px" }}>
          {([
            { key: "type", label: "Type", icon: "T" },
            { key: "color", label: "Color", icon: "🎨" },
            { key: "shape", label: "Shape", icon: "◧" },
            { key: "layout", label: "Layout", icon: "≡" },
          ] as { key: CustomizeSection; label: string; icon: string }[]).map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
                padding: "10px 4px",
                borderRadius: "10px",
                border: "1px solid #eae5da",
                background: activeSection === s.key ? "#1a1917" : "#faf9f6",
                color: activeSection === s.key ? "#ffffff" : "#57534e",
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: 600,
              }}
            >
              <span style={{ fontSize: "14px" }}>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>

        {activeSection === "type" && (
          <>
            <p style={{ fontSize: "11px", color: "#8a8578", background: "#faf9f6", padding: "10px 12px", borderRadius: "8px", marginBottom: "18px" }}>
              ℹ️ Esto define la fuente/tamaño de las tareas <strong>nuevas</strong>. Las tareas que ya existen conservan su propio estilo.
            </p>
            <PanelSection label="Fuente por defecto (tareas nuevas)">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {FONT_OPTIONS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setTheme((th) => ({ ...th, defaultFontFamily: f.value }))}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px",
                      padding: "14px 8px",
                      borderRadius: "10px",
                      border: `2px solid ${theme.defaultFontFamily === f.value ? theme.accentColor : "#eae5da"}`,
                      background: theme.defaultFontFamily === f.value ? theme.accentColor + "12" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: "20px", fontFamily: f.value }}>{f.sample}</span>
                    <span style={{ fontSize: "11px", color: "#57534e" }}>{f.label}</span>
                  </button>
                ))}
              </div>
            </PanelSection>

            <PanelSection label="Tamaño por defecto">
              <div style={{ display: "flex", gap: "8px" }}>
                {(["sm", "md", "lg"] as FontSize[]).map((sz) => (
                  <button
                    key={sz}
                    onClick={() => setTheme((th) => ({ ...th, defaultFontSize: sz }))}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: "8px",
                      border: `2px solid ${theme.defaultFontSize === sz ? theme.accentColor : "#eae5da"}`,
                      background: theme.defaultFontSize === sz ? theme.accentColor + "12" : "transparent",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#1a1917",
                    }}
                  >
                    {FONT_SIZE_LABEL[sz]}
                  </button>
                ))}
              </div>
              <p style={{ marginTop: "10px", padding: "10px", background: "#faf9f6", borderRadius: "8px", fontSize: FONT_SIZE_PX[theme.defaultFontSize], fontFamily: theme.defaultFontFamily }}>
                Así se ven tus tareas nuevas.
              </p>
            </PanelSection>
          </>
        )}

        {activeSection === "color" && (
          <>
            <p style={{ fontSize: "11px", color: "#8a8578", background: "#faf9f6", padding: "10px 12px", borderRadius: "8px", marginBottom: "18px" }}>
              ℹ️ El accent color pinta la línea/insignia de las tareas <strong>Pendiente</strong> y los acentos de la app. "En Progreso" y "Completada" mantienen su color fijo (ámbar/verde) para que el estado siga siendo reconocible de un vistazo.
            </p>
            <PanelSection label="Accent Color">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                {ACCENT_OPTIONS.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => setTheme((th) => ({ ...th, accentColor: a.value }))}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "6px",
                      padding: "10px",
                      borderRadius: "10px",
                      border: `2px solid ${theme.accentColor === a.value ? a.value : "#eae5da"}`,
                      background: theme.accentColor === a.value ? a.value + "12" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ width: "30px", height: "30px", borderRadius: "50%", background: a.value, display: "block" }} />
                    <span style={{ fontSize: "11px", color: "#57534e" }}>{a.label}</span>
                  </button>
                ))}
              </div>
            </PanelSection>

            <PanelSection label="Task Background">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "6px" }}>
                {TASK_BG_OPTIONS.map((bg) => (
                  <button key={bg.value} onClick={() => setTheme((th) => ({ ...th, taskBg: bg.value }))} title={bg.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", background: "none", border: "none", cursor: "pointer" }}>
                    <span style={{ width: "36px", height: "36px", borderRadius: "10px", background: bg.value, border: `2px solid ${theme.taskBg === bg.value ? theme.accentColor : "#eae5da"}`, display: "block" }} />
                    <span style={{ fontSize: "10px", color: "#8a8578" }}>{bg.label}</span>
                  </button>
                ))}
              </div>
            </PanelSection>

            {/* Vista previa completa del cuadro de tarea, con el tema actual */}
            <PanelSection label="Vista previa">
              <div
                style={{
                  borderRadius: radius,
                  background: theme.taskBg,
                  color: taskDark ? "#f5f3ef" : "#1a1917",
                  padding: "16px 18px",
                  borderLeft: `4px solid ${theme.accentColor}`,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                }}
              >
                <div style={{ fontFamily: theme.defaultFontFamily, fontSize: FONT_SIZE_PX[theme.defaultFontSize], fontWeight: 600 }}>
                  Así se ve una tarjeta de tarea
                </div>
                <div style={{ fontSize: "13px", marginTop: "4px", color: taskDark ? "#f5f3efaa" : "#57534e" }}>
                  Vista previa en vivo con tu accent color y fondo elegidos.
                </div>
                <span
                  style={{
                    display: "inline-block",
                    marginTop: "10px",
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: "999px",
                    background: theme.accentColor + "22",
                    color: theme.accentColor,
                  }}
                >
                  Pendiente
                </span>
              </div>
            </PanelSection>
          </>
        )}

        {activeSection === "shape" && (
          <PanelSection label="Forma de la tarjeta">
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {SHAPE_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setTheme((th) => ({ ...th, shape: s.value }))}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    padding: "14px",
                    border: `2px solid ${theme.shape === s.value ? theme.accentColor : "#eae5da"}`,
                    borderRadius: s.value === "pill" ? "14px" : s.radius === "0px" ? "4px" : "10px",
                    background: theme.shape === s.value ? theme.accentColor + "10" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ width: "44px", height: "26px", border: `2px solid ${theme.shape === s.value ? theme.accentColor : "#c9c3b5"}`, borderRadius: s.radius, flexShrink: 0 }} />
                  <div style={{ textAlign: "left" }}>
                    <p style={{ margin: 0, fontSize: "13px", fontWeight: 700 }}>{s.label}</p>
                    <p style={{ margin: 0, fontSize: "11px", color: "#8a8578" }}>border-radius: {s.radius}</p>
                  </div>
                  {theme.shape === s.value && (
                    <span style={{ marginLeft: "auto", fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "999px", background: theme.accentColor, color: "#fff" }}>
                      Activo
                    </span>
                  )}
                </button>
              ))}
            </div>
          </PanelSection>
        )}

        {activeSection === "layout" && (
          <>
            <PanelSection label="Densidad">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {[
                  { label: "Cómoda", value: false, desc: "Espaciado amplio" },
                  { label: "Compacta", value: true, desc: "Ajustada y densa" },
                ].map((d) => (
                  <button
                    key={String(d.value)}
                    onClick={() => setTheme((th) => ({ ...th, compact: d.value }))}
                    style={{
                      textAlign: "left",
                      padding: "14px",
                      borderRadius: "10px",
                      border: `2px solid ${theme.compact === d.value ? theme.accentColor : "#eae5da"}`,
                      background: theme.compact === d.value ? theme.accentColor + "10" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <p style={{ margin: 0, fontSize: "13px", fontWeight: 700 }}>{d.label}</p>
                    <p style={{ margin: 0, fontSize: "11px", color: "#8a8578" }}>{d.desc}</p>
                  </button>
                ))}
              </div>
            </PanelSection>

            <PanelSection label="Insignia de estado">
              <button
                onClick={() => setTheme((th) => ({ ...th, showStatusBadge: !th.showStatusBadge }))}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "14px",
                  borderRadius: "10px",
                  border: `2px solid ${theme.showStatusBadge ? theme.accentColor : "#eae5da"}`,
                  background: theme.showStatusBadge ? theme.accentColor + "10" : "transparent",
                  cursor: "pointer",
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <p style={{ margin: 0, fontSize: "13px", fontWeight: 700 }}>Mostrar estado</p>
                  <p style={{ margin: 0, fontSize: "11px", color: "#8a8578" }}>{theme.showStatusBadge ? "Visible en cada tarea" : "Oculto"}</p>
                </div>
                <span style={{ width: "40px", height: "22px", borderRadius: "999px", background: theme.showStatusBadge ? theme.accentColor : "#e2dfd9", position: "relative", flexShrink: 0 }}>
                  <span style={{ position: "absolute", top: "3px", left: theme.showStatusBadge ? "21px" : "3px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", transition: "left 0.15s ease" }} />
                </span>
              </button>
            </PanelSection>
          </>
        )}

        <button
          onClick={() => setTheme(DEFAULT_WORKSPACE_THEME)}
          style={{ width: "100%", marginTop: "8px", padding: "10px", background: "none", border: "none", fontSize: "12px", color: "#8a8578", textDecoration: "underline", cursor: "pointer" }}
        >
          Restablecer valores por defecto
        </button>
      </aside>

      {/* ===== Modal Cambiar Contraseña ===== */}
      {modalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 300,
            padding: "20px",
            boxSizing: "border-box",
          }}
        >
          <div style={{ background: "#ffffff", padding: "28px", borderRadius: "14px", width: "100%", maxWidth: "420px", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
            <h3 style={{ marginTop: 0, marginBottom: "16px" }}>Cambiar Contraseña</h3>

            <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", marginBottom: "6px", color: "#57534e" }}>Contraseña Actual</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  style={{ width: "100%", padding: "12px 14px", borderRadius: "8px", border: "1px solid #e5e0d5", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", marginBottom: "6px", color: "#57534e" }}>Nueva Contraseña</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  style={{ width: "100%", padding: "12px 14px", borderRadius: "8px", border: "1px solid #e5e0d5", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", marginBottom: "6px", color: "#57534e" }}>Confirmar Nueva Contraseña</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{ width: "100%", padding: "12px 14px", borderRadius: "8px", border: "1px solid #e5e0d5", boxSizing: "border-box" }}
                />
              </div>

              {modalError && <div style={{ color: "#dc2626", fontSize: "13px" }}>⚠️ {modalError}</div>}
              {modalSuccess && <div style={{ color: "#0d7a4f", fontSize: "13px" }}>🎉 {modalSuccess}</div>}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button type="button" onClick={() => setModalOpen(false)} style={{ background: "#f3f1ec", color: "#57534e", border: "none", padding: "10px 18px", borderRadius: "8px", cursor: "pointer" }}>
                  Cancelar
                </button>
                <button type="submit" disabled={passwordLoading} style={{ background: theme.accentColor, color: "#fff", border: "none", padding: "10px 18px", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}>
                  {passwordLoading ? "Actualizando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function PanelSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "26px" }}>
      <p style={{ fontSize: "11px", fontWeight: 700, color: "#8a8578", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "10px" }}>{label}</p>
      {children}
    </div>
  );
}
