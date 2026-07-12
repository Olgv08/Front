// ============================================================
// Tema del workspace — compartido entre Login, Register y Dashboard
// Se guarda en localStorage (preferencia de este dispositivo/navegador)
// ============================================================

export type FontSize = "sm" | "md" | "lg";
export type Shape = "sharp" | "rounded" | "pill";

export type WorkspaceTheme = {
  accentColor: string;
  taskBg: string;
  shape: Shape;
  compact: boolean;
  showStatusBadge: boolean;
  defaultFontFamily: string;
  defaultFontSize: FontSize;
};

export const DEFAULT_WORKSPACE_THEME: WorkspaceTheme = {
  accentColor: "#E8541A",
  taskBg: "#FDFCFA",
  shape: "rounded",
  compact: false,
  showStatusBadge: true,
  defaultFontFamily: "'Onest', system-ui, sans-serif",
  defaultFontSize: "md",
};

export const WORKSPACE_THEME_KEY = "workspaceTheme:v1";

export function loadWorkspaceTheme(): WorkspaceTheme {
  try {
    const raw = localStorage.getItem(WORKSPACE_THEME_KEY);
    if (!raw) return DEFAULT_WORKSPACE_THEME;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_WORKSPACE_THEME, ...parsed };
  } catch {
    return DEFAULT_WORKSPACE_THEME;
  }
}

const SHAPE_RADIUS: Record<Shape, string> = { sharp: "4px", rounded: "14px", pill: "28px" };

export function shapeRadius(shape: Shape): string {
  return SHAPE_RADIUS[shape] ?? "14px";
}

export function isDark(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length < 6) return false;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}
