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
import { syncNow } from "../offline/sync"; // ⬅️ SOLO syncNow

type Status = "Pendiente" | "En Progreso" | "Completada";

type Task = {
  _id: string;
  title: string;
  description?: string;
  status: Status;
  clienteId?: string;
  createdAt?: string;
  deleted?: boolean;
  pending?: boolean;
};

const isLocalId = (id: string) => !/^[a-f0-9]{24}$/i.test(id);

function normalizeTask(x: any): Task {
  return {
    _id: String(x?._id ?? x?.id),
    title: String(x?.title ?? "(sin título)"),
    description: x?.description ?? "",
    status:
      x?.status === "Completada" ||
      x?.status === "En Progreso" ||
      x?.status === "Pendiente"
        ? x.status
        : "Pendiente",
    clienteId: x?.clienteId,
    createdAt: x?.createdAt,
    deleted: !!x?.deleted,
    pending: !!x?.pending,
  };
}

// ===== Estilos reutilizables (más amplios / más aire) =====
const PAGE_MAX = "clamp(1100px, 94vw, 1800px)";
const SIDE_PAD = "clamp(20px, 4vw, 64px)";

const inputBase: React.CSSProperties = {
  width: "100%",
  padding: "18px 22px",
  borderRadius: "6px",
  border: "1px solid #334155",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  fontSize: "16px",
  boxSizing: "border-box",
};

const chipBase: React.CSSProperties = {
  padding: "14px 28px",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 500,
  fontSize: "14px",
  whiteSpace: "nowrap",
};

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
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

  const dropdownRef = useRef<HTMLDivElement>(null);

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
      await api.put("/auth/change-password", {
        currentPassword,
        newPassword,
      });

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
    if (!t) return;

    const clienteId = crypto.randomUUID();
    const localTask = normalizeTask({
      _id: clienteId,
      title: t,
      description: d,
      status: "Pendiente" as Status,
      pending: !navigator.onLine,
    });

    setTasks((prev) => [localTask, ...prev]);
    await putTaskLocal(localTask);
    setTitle("");
    setDescription("");

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
      const { data } = await api.post("/tasks", { title: t, description: d });
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
  }

  async function saveEdit(taskId: string) {
    const newTitle = editingTitle.trim();
    const newDesc = editingDescription.trim();
    if (!newTitle) return;

    const before = tasks.find((t) => t._id === taskId);
    const patched = { ...before, title: newTitle, description: newDesc } as Task;

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
        data: { title: newTitle, description: newDesc },
        ts: Date.now(),
      } as OutboxOp);
      return;
    }

    try {
      await api.put(`/tasks/${taskId}`, { title: newTitle, description: newDesc });
    } catch {
      await queue({
        id: "upd-" + taskId,
        op: "update",
        clienteId: cId || undefined,
        serverId: taskId,
        data: { title: newTitle, description: newDesc },
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
        (t) =>
          (t.title || "").toLowerCase().includes(s) ||
          (t.description || "").toLowerCase().includes(s)
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

  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <div className="wrap" style={{ backgroundColor: "#0b0f19", color: "#f1f5f9", minHeight: "100vh", width: "100%" }}>
      <header
        className="topbar"
        style={{
          display: "flex",
          alignItems: "center",
          padding: `24px ${SIDE_PAD}`,
          backgroundColor: "#111827",
          borderBottom: "1px solid #1f2937",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
          width: "100%",
          boxSizing: "border-box",
          flexWrap: "wrap",
          rowGap: "16px",
        }}
      >
        <h1 style={{ fontSize: "clamp(20px, 2vw, 26px)", margin: 0 }}>Lista de tareas</h1>
        <div className="spacer" style={{ flexGrow: 1 }} />

        <div className="profile-container" ref={dropdownRef} style={{ position: "relative" }}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="user-profile-box"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              background: dropdownOpen ? "#1e293b" : "#0f172a",
              padding: "10px 18px",
              borderRadius: "6px",
              marginRight: "16px",
              border: "1px solid #334155",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
              transition: "all 0.15s ease",
            }}
          >
            <div
              className="user-avatar"
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "6px",
                background: "#1c6bd9",
                color: "#f8fafc",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.5px",
                flexShrink: 0,
              }}
            >
              {userInitial}
            </div>
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
              <span
                style={{
                  fontSize: "9px",
                  fontWeight: 600,
                  opacity: 0.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                  color: "#ffffff",
                }}
              >
                Bienvenido:
              </span>
              <span style={{ fontSize: "13px", fontWeight: 500, color: "#ffffff" }}>{userName} ▾</span>
            </div>
          </button>

          {dropdownOpen && (
            <div
              className="dropdown-menu"
              style={{
                position: "absolute",
                top: "54px",
                right: "16px",
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "6px",
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
                width: "190px",
                zIndex: 100,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid #1e293b",
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                }}
              >
                Configuraciones
              </div>
              <button
                onClick={() => {
                  setModalOpen(true);
                  setDropdownOpen(false);
                }}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: "13px",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#1e293b";
                  e.currentTarget.style.color = "#f8fafc";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
                  e.currentTarget.style.color = "#94a3b8";
                }}
              >
                🔑 Cambiar Contraseña
              </button>
              <button
                onClick={logout}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "none",
                  border: "none",
                  color: "#f1f5f9",
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: "13px",
                  borderTop: "1px solid #1e293b",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#ef4444";
                  e.currentTarget.style.color = "#ffffff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
                  e.currentTarget.style.color = "#f1f5f9";
                }}
              >
                🚪 Cerrar Sesión
              </button>
            </div>
          )}
        </div>

        <div
          className="stats"
          style={{
            display: "flex",
            gap: "clamp(16px, 2vw, 32px)",
            alignItems: "center",
            color: "#94a3b8",
            fontSize: "14px",
            flexWrap: "wrap",
          }}
        >
          <span>
            Total: <strong style={{ color: "#ffffff" }}>{stats.total}</strong>
          </span>
          <span>
            Hechas: <strong style={{ color: "#10b981" }}>{stats.done}</strong>
          </span>
          <span>
            Pendientes: <strong style={{ color: "#d97706" }}>{stats.pending}</strong>
          </span>
          <span
            className="badge"
            style={{
              marginLeft: 8,
              background: online ? "#075b31" : "#000000",
              borderRadius: "6px",
              fontWeight: 600,
              fontSize: "11px",
              letterSpacing: "0.5px",
              padding: "4px 12px",
            }}
          >
            {online ? "Online" : "Offline"}
          </span>
        </div>
      </header>

      <main
        style={{
          maxWidth: PAGE_MAX,
          margin: "48px auto 0 auto",
          padding: `0 ${SIDE_PAD} 64px`,
          boxSizing: "border-box",
          width: "100%",
        }}
      >
        {/* ===== Crear ===== */}
        <form
          className="add add-grid"
          onSubmit={addTask}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            backgroundColor: "#111827",
            padding: "clamp(24px, 3vw, 40px)",
            borderRadius: "8px",
            border: "1px solid #1f2937",
            marginBottom: "40px",
            boxShadow: "0 10px 25px -5px rgba(0,0,0,0.3)",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título de la tarea…"
            style={{ ...inputBase, fontSize: "17px", padding: "20px 24px" }}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción (opcional)…"
            rows={2}
            style={{ ...inputBase, resize: "vertical", border: "1px solid #a2a7ae" }}
          />
          <button
            className="btn"
            style={{
              alignSelf: "stretch",
              padding: "18px 32px",
              backgroundColor: "#1e3a8a",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Agregar
          </button>
        </form>

        {/* ===== Toolbar ===== */}
        <div
          className="toolbar"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "24px",
            marginBottom: "32px",
            flexWrap: "wrap",
            width: "100%",
          }}
        >
          <input
            className="search"
            placeholder="Buscar por título o descripción…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputBase, flexGrow: 1, minWidth: "260px", padding: "16px 22px" }}
          />
          <div className="filters" style={{ display: "flex", gap: "10px", flexShrink: 0 }}>
            <button
              className={filter === "all" ? "chip active" : "chip"}
              onClick={() => setFilter("all")}
              type="button"
              style={chipBase}
            >
              Todas
            </button>
            <button
              className={filter === "active" ? "chip active" : "chip"}
              onClick={() => setFilter("active")}
              type="button"
              style={chipBase}
            >
              Activas
            </button>
            <button
              className={filter === "completed" ? "chip active" : "chip"}
              onClick={() => setFilter("completed")}
              type="button"
              style={chipBase}
            >
              Hechas
            </button>
          </div>
        </div>

        {/* ===== Lista ===== */}
        {loading ? (
          <p style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Cargando…</p>
        ) : filtered.length === 0 ? (
          <p
            className="empty"
            style={{
              textAlign: "center",
              padding: "60px",
              color: "#edf2f9",
              backgroundColor: "#111827",
              borderRadius: "8px",
              border: "1px solid #1f2937",
            }}
          >
            Sin tareas
          </p>
        ) : (
          <ul
            className="list"
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              width: "100%",
            }}
          >
            {filtered.map((t) => (
              <li
                key={t._id}
                className={t.status === "Completada" ? "item done" : "item"}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  alignItems: "center",
                  gap: "clamp(16px, 2.5vw, 32px)",
                  padding: "24px clamp(20px, 3vw, 36px)",
                  backgroundColor: "#f9f7f7",
                  color: "#0f172a",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
                  borderLeft:
                    t.status === "Completada"
                      ? "12px solid #10b981"
                      : t.status === "En Progreso"
                      ? "12px solid #e17a04"
                      : "12px solid #ed0b0b",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              >
                <select
                  value={t.status}
                  onChange={(e) => handleStatusChange(t, e.target.value as Status)}
                  className="status-select"
                  title="Estado"
                  style={{
                    padding: "12px 18px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#f8fafc",
                    color: "#0f172a",
                    fontSize: "14px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  <option value="Pendiente">Pendiente</option>
                  <option value="En Progreso">En Progreso</option>
                  <option value="Completada">Completada</option>
                </select>

                <div className="content" style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 }}>
                  {editingId === t._id ? (
                    <>
                      <input
                        className="edit"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        placeholder="Título"
                        autoFocus
                        style={{
                          padding: "12px 16px",
                          borderRadius: "6px",
                          border: "1px solid #3b82f6",
                          fontSize: "16px",
                          width: "100%",
                          boxSizing: "border-box",
                        }}
                      />
                      <textarea
                        className="edit"
                        value={editingDescription}
                        onChange={(e) => setEditingDescription(e.target.value)}
                        placeholder="Descripción"
                        rows={2}
                        style={{
                          padding: "12px 16px",
                          borderRadius: "6px",
                          border: "1px solid #3b82f6",
                          fontSize: "14px",
                          resize: "vertical",
                          width: "100%",
                          boxSizing: "border-box",
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <span
                        className="title"
                        onDoubleClick={() => startEdit(t)}
                        style={{
                          fontSize: "18px",
                          fontWeight: 600,
                          color: t.status === "Completada" ? "#060606" : "#000000",
                          textDecoration: t.status === "Completada" ? "line-through" : "none",
                          overflowWrap: "break-word",
                        }}
                      >
                        {t.title}
                      </span>
                      {t.description && (
                        <p
                          className="desc"
                          style={{
                            margin: 0,
                            fontSize: "14px",
                            color: "#475569",
                            lineHeight: 1.5,
                            overflowWrap: "break-word",
                          }}
                        >
                          {t.description}
                        </p>
                      )}
                      {(t.pending || isLocalId(t._id)) && (
                        <span
                          className="badge"
                          title="Aún no sincronizada"
                          style={{
                            background: "#d97706",
                            color: "#ffffff",
                            width: "fit-content",
                            padding: "4px 10px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 500,
                            marginTop: "4px",
                          }}
                        >
                          Falta sincronizar
                        </span>
                      )}
                    </>
                  )}
                </div>

                <div className="actions" style={{ display: "flex", gap: "12px", flexShrink: 0 }}>
                  {editingId === t._id ? (
                    <button
                      className="btn"
                      onClick={() => saveEdit(t._id)}
                      style={{
                        padding: "10px 18px",
                        backgroundColor: "#10b981",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Guardar
                    </button>
                  ) : (
                    <button
                      className="icon"
                      title="Editar"
                      onClick={() => startEdit(t)}
                      style={{
                        background: "none",
                        border: "1px solid #090909",
                        padding: "10px 14px",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "16px",
                      }}
                    >
                      ✏️
                    </button>
                  )}
                  <button
                    className="icon danger"
                    title="Eliminar"
                    onClick={() => removeTask(t._id)}
                    style={{
                      background: "none",
                      border: "1px solid #000000",
                      padding: "10px 14px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "16px",
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* ===== Modal Cambiar Contraseña ===== */}
      {modalOpen && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
            boxSizing: "border-box",
          }}
        >
          <div
            className="modal-content"
            style={{
              background: "#161b22",
              border: "1px solid #30363d",
              padding: "28px",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "440px",
              boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "16px", color: "#f0f6fc" }}>Cambiar Contraseña</h3>

            <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", marginBottom: "6px", color: "#c9d1d9" }}>
                  Contraseña Actual
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: "6px",
                    border: "1px solid #30363d",
                    background: "#0d1117",
                    color: "#fff",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", marginBottom: "6px", color: "#c9d1d9" }}>
                  Nueva Contraseña
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: "6px",
                    border: "1px solid #30363d",
                    background: "#0d1117",
                    color: "#fff",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", marginBottom: "6px", color: "#c9d1d9" }}>
                  Confirmar Nueva Contraseña
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: "6px",
                    border: "1px solid #30363d",
                    background: "#0d1117",
                    color: "#fff",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {modalError && <div style={{ color: "#f85149", fontSize: "13px", marginTop: "4px" }}>⚠️ {modalError}</div>}
              {modalSuccess && (
                <div style={{ color: "#58a6ff", fontSize: "13px", marginTop: "4px" }}>🎉 {modalSuccess}</div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn"
                  style={{ background: "#21262d", color: "#c9d1d9", border: "1px solid #30363d", padding: "10px 18px", borderRadius: "6px", cursor: "pointer" }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="btn primary"
                  style={{ background: "#1e3a8a", color: "#fff", border: "none", padding: "10px 18px", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                >
                  {passwordLoading ? "Actualizando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}