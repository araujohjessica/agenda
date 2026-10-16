import { IS_DEMO, demoFetch } from "./demo";
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4100/api";
export const PROFESSIONAL_SLUG = "ana-beatriz-lima";
const TOKEN_KEY = "agenda-token";

export type User = { id: number; name: string; email: string; phone: string | null; role: "professional" | "client" };
export type Location = { id: number; kind: "online" | "in_person"; name: string; detail: string | null; is_default: number; active: number };
export type PublicProfessional = {
  name: string; slug: string; headline: string | null; bio: string | null; accepting_bookings: boolean;
  min_notice_hours: number; cancel_limit_hours: number; session_minutes: number; office_address: string | null; office_city: string | null; session_price: number | null; locations: Location[];
};
export type FreeSlot = { id: number; date: string; start_time: string; end_time: string; location_name: string | null; location_kind: string | null; location_detail: string | null };
export type SlotDay = { date: string; slots: FreeSlot[] };
export type Appointment = {
  id: number; code: string; status: "confirmed" | "cancelled" | "completed" | "no_show"; client_notes: string | null;
  slot_id: number; date: string; start_time: string; end_time: string;
  location_kind: string | null; location_name: string | null; location_detail: string | null;
  professional_name: string; office_address: string | null; office_city: string | null; session_price: number | null; client_name: string; client_email: string; client_phone: string | null;
};
export type AdminSlot = { id: number; date: string; start_time: string; end_time: string; status: "open" | "blocked" | "booked"; client_name: string | null };
export type Settings = { slug: string; accepting_bookings: boolean; min_notice_hours: number; cancel_limit_hours: number; session_minutes: number; office_address: string | null; office_city: string | null; session_price: number | null };
export type Dashboard = { appointments_this_week: number; new_appointments_7d: number; free_slots_this_week: number; accepting_bookings: boolean };

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: string[]) {
    super(details?.length ? details.join(" ") : message);
  }
}

export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (token: string | null) => {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage indisponível */ }
};

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  const token = getToken();
  let res: Response;
  try {
    res = IS_DEMO ? await demoFetch(method, path, body, token) : await fetch(BASE + path, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Não conseguimos conectar ao servidor. Verifique sua conexão com a internet e tente novamente.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    // Sessão expirada em área logada: o App volta para o login.
    if (res.status === 401 && token && !path.startsWith("/auth/")) window.dispatchEvent(new Event("agenda:session-expired"));
    throw new ApiError(res.status, data.error ?? "Algo deu errado. Tente novamente em instantes.", data.details);
  }
  return res;
}

const json = async <T,>(method: string, path: string, body?: unknown) => (await send(method, path, body)).json() as Promise<T>;

export const api = {
  get: <T,>(path: string) => json<T>("GET", path),
  post: <T,>(path: string, body?: unknown) => json<T>("POST", path, body ?? {}),
  put: <T,>(path: string, body: unknown) => json<T>("PUT", path, body),
  patch: <T,>(path: string, body: unknown) => json<T>("PATCH", path, body),
  del: <T,>(path: string) => json<T>("DELETE", path),
};

export async function downloadIcs(path: string, code: string) {
  const blob = await (await send("GET", path)).blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `consulta-${code}.ics`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ---- datas (horário de Brasília) ----
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEKDAYS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
export const parseDate = (d: string) => new Date(`${d}T12:00:00`);
export const todayISO = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => new Date(parseDate(d).getTime() + n * 86400e3).toISOString().slice(0, 10);
export const weekdayShort = (d: string) => WEEKDAYS[parseDate(d).getDay()].slice(0, 3);
export const weekdayLong = (d: string) => WEEKDAYS[parseDate(d).getDay()];
export const dayNumber = (d: string) => parseDate(d).getDate();
export const monthName = (d: string) => MONTHS[parseDate(d).getMonth()];
export const monthYear = (d: string) => `${monthName(d)[0].toUpperCase()}${monthName(d).slice(1)} de ${parseDate(d).getFullYear()}`;
export const dayLabel = (d: string) => `${weekdayLong(d)}, ${dayNumber(d)} de ${monthName(d)}`;
export const mondayOf = (d: string) => addDays(d, -((parseDate(d).getDay() + 6) % 7));
export const duration = (start: string, end: string) => {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  return m(end) - m(start);
};
export const locationText = (a: { location_name: string | null; location_detail: string | null }) =>
  [a.location_name, a.location_detail].filter(Boolean).join(" · ") || "Local a confirmar";

// Texto amigável para exibir ao usuário a partir de qualquer erro.
export const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

// Endereço completo do consultório (rua + cidade), ou vazio se nada foi cadastrado.
export const officeText = (o?: { office_address: string | null; office_city: string | null } | null) =>
  [o?.office_address, o?.office_city].filter(Boolean).join(", ");

// Baixa um arquivo autenticado (ex.: CSV) e dispara o download no navegador.
export async function downloadFile(path: string, filename: string) {
  const blob = await (await send("GET", path)).blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
