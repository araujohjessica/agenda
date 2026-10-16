// Backend simulado da versão de demonstração.
// Ligado por padrão; para usar a API real: VITE_DEMO=false VITE_API_URL=http://localhost:4100/api npm run dev
// Responde às mesmas rotas da agenda-api, com dados fictícios gerados a partir da data de hoje.

export const IS_DEMO = import.meta.env.VITE_DEMO !== "false";

type Row = Record<string, any>;
type Ctx = { params: string[]; query: URLSearchParams; body: Row; user: Row | null };

// ---------- datas (horário de Brasília) ----------
const DAY = 86_400_000;
const today = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const instant = (d: string, t: string) => Date.parse(`${d}T${t}:00-03:00`);
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const monthEnd = (d: string) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0)).toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;
const byTime = (x: Row, y: Row) => (x.date + x.start_time).localeCompare(y.date + y.start_time);

// ---------- erros e respostas ----------
class DemoError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
function fail(status: number, message: string): never {
  throw new DemoError(status, message);
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const created = (data: unknown) => json(data, 201);

// ---------- banco em memória ----------
const db = {
  users: [] as Row[], pro: {} as Row, locations: [] as Row[], periods: [] as Row[],
  slots: [] as Row[], appointments: [] as Row[], expenses: [] as Row[],
};
let lastId = 0;
const nextId = () => ++lastId;
const PRO_ID = 1;
const ORIGINAL_SLUG = "ana-beatriz-lima";
const METHODS = ["pix", "pix", "pix", "card", "cash", "transfer"];

let seedState = 7;
const rand = () => (seedState = (seedState * 16807) % 2147483647) / 2147483647;
const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
const newCode = () => `AG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const findUser = (id: number) => db.users.find((u) => u.id === id);
const findSlot = (id: number) => db.slots.find((s) => s.id === id);
const findLocation = (id: number) => db.locations.find((l) => l.id === id);
const pro = () => findUser(PRO_ID)!;
const publicUser = (u: Row) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone ?? null, role: u.role });

function book(slot: Row, clientId: number, o: { status: string; paid: boolean; createdAt: string; notes?: string | null }) {
  const price = db.pro.session_price;
  const a: Row = {
    id: nextId(), code: newCode(), slot_id: slot.id, client_id: clientId, location_id: slot.location_id,
    status: o.status, client_notes: o.notes || null, created_at: o.createdAt, cancelled_by: null, price,
    payment_status: o.paid ? "paid" : "pending", payment_method: o.paid ? pick(METHODS) : null,
    paid_amount: o.paid ? price : null, paid_at: o.paid ? (slot.date < today() ? slot.date : today()) : null,
  };
  if (o.status === "cancelled") {
    a.cancelled_by = "client";
    slot.status = "open";
  } else slot.status = "booked";
  db.appointments.push(a);
  return a;
}

function seed() {
  const t = today();
  const now = Date.now();
  db.users.push({ id: nextId(), name: "Ana Beatriz Lima", email: "profissional@exemplo.com", phone: "(31) 99999-0000", role: "professional" });
  const clients = [
    ["Carla Mendes", "cliente@exemplo.com", "(31) 98888-1111"],
    ["Rafael Souza", "rafael@exemplo.com", "(31) 98888-2222"],
    ["Beatriz Rocha", "beatriz@exemplo.com", "(11) 97777-3333"],
    ["Lucas Ferreira", "lucas@exemplo.com", "(21) 96666-4444"],
    ["Mariana Alves", "mariana@exemplo.com", "(31) 95555-5555"],
    ["Thiago Martins", "thiago@exemplo.com", "(35) 94444-6666"],
    ["Fernanda Lopes", "fernanda@exemplo.com", "(19) 93333-7777"],
    ["Gustavo Ribeiro", "gustavo@exemplo.com", "(31) 92222-8888"],
  ].map(([name, email, phone]) => {
    const u: Row = { id: nextId(), name, email, phone, role: "client", has_password: true };
    db.users.push(u);
    return u;
  });

  db.pro = {
    slug: ORIGINAL_SLUG, headline: "Psicóloga clínica · Terapia cognitivo-comportamental",
    bio: "Atendimento para adultos, online e presencial. Sessões de 50 minutos com foco em ansiedade, estresse e organização da rotina.",
    accepting_bookings: true, min_notice_hours: 4, cancel_limit_hours: 4, session_minutes: 50,
    office_address: "Rua das Acácias, 120, sala 304", office_city: "Belo Horizonte - MG", session_price: 180,
  };

  const online = { id: nextId(), kind: "online", name: "Online", detail: "Videochamada, link enviado por e-mail", is_default: 1, active: 1 };
  const office = { id: nextId(), kind: "in_person", name: "Consultório", detail: "Rua das Acácias, 120, sala 304", is_default: 0, active: 1 };
  db.locations.push(online, office);

  const start = addDays(t, -75), end = addDays(t, 28);
  for (const shift of [
    { location: online, start_time: "09:00", end_time: "12:00" },
    { location: office, start_time: "14:00", end_time: "18:00" },
  ]) {
    const period = {
      id: nextId(), start_date: start, end_date: end, weekdays: [1, 2, 3, 4, 5], start_time: shift.start_time,
      end_time: shift.end_time, interval_minutes: 60, duration_minutes: 50, location_id: shift.location.id, created_at: start,
    };
    db.periods.push(period);
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (!period.weekdays.includes(weekday(d))) continue;
      for (let m = toMin(shift.start_time); m + 50 <= toMin(shift.end_time); m += 60)
        db.slots.push({ id: nextId(), period_id: period.id, location_id: shift.location.id, date: d, start_time: fromMin(m), end_time: fromMin(m + 50), status: "open" });
    }
  }

  for (const slot of db.slots) {
    const past = instant(slot.date, slot.start_time) < now;
    const r = rand();
    if (!past && r > 0.92) {
      slot.status = "blocked";
      continue;
    }
    if (r > (past ? 0.6 : 0.42)) continue;
    const s = rand();
    const status = !past ? "confirmed" : s < 0.8 ? "completed" : s < 0.9 ? "no_show" : "cancelled";
    const paid = status === "completed" ? rand() < 0.85 : status === "confirmed" ? rand() < 0.15 : false;
    const createdAt = past ? addDays(slot.date, -1 - Math.floor(rand() * 10)) : addDays(t, -Math.floor(rand() * 12));
    book(slot, pick(clients).id, { status, paid, createdAt });
  }

  // Garante consultas para o login de cliente da demonstração
  const carla = clients[0];
  const future = db.slots.find((s) => s.status === "open" && s.date >= addDays(t, 2));
  if (future) book(future, carla.id, { status: "confirmed", paid: false, createdAt: addDays(t, -1), notes: "Primeira consulta." });
  const past = [...db.slots].reverse().find((s) => s.status === "open" && instant(s.date, s.start_time) < now);
  if (past) book(past, carla.id, { status: "completed", paid: true, createdAt: addDays(past.date, -5) });

  // Despesas dos últimos 3 meses
  let month = monthStart(t);
  for (let i = 0; i < 3; i++) {
    const day = (n: number) => {
      const d = `${month.slice(0, 8)}${String(n).padStart(2, "0")}`;
      return d > t ? t : d;
    };
    db.expenses.push(
      { id: nextId(), description: "Aluguel da sala", category: "aluguel", amount: 1200, date: day(5) },
      { id: nextId(), description: "Plataforma de videochamada", category: "software", amount: 89.9, date: day(10) },
      { id: nextId(), description: "Supervisão clínica", category: "formação", amount: 350, date: day(15) },
    );
    if (i === 0) db.expenses.push({ id: nextId(), description: "Anúncio em rede social", category: "marketing", amount: 150, date: day(20) });
    month = monthStart(addDays(month, -1));
  }
}

// ---------- regras de agendamento ----------
function view(a: Row) {
  const s = findSlot(a.slot_id)!, l = findLocation(a.location_id), c = findUser(a.client_id)!;
  return {
    id: a.id, code: a.code, status: a.status, client_notes: a.client_notes, slot_id: s.id,
    date: s.date, start_time: s.start_time, end_time: s.end_time,
    location_id: l?.id ?? null, location_kind: l?.kind ?? null, location_name: l?.name ?? null, location_detail: l?.detail ?? null,
    professional_id: PRO_ID, professional_name: pro().name, office_address: db.pro.office_address, office_city: db.pro.office_city,
    session_price: db.pro.session_price, client_id: c.id, client_name: c.name, client_email: c.email, client_phone: c.phone ?? null,
    cancelled_by: a.cancelled_by, created_at: a.created_at,
  };
}
const withSlot = (a: Row) => ({ a, s: findSlot(a.slot_id)! });

function listAppointments(f: { clientId?: number; status?: string | null; from?: string | null; to?: string | null }) {
  return db.appointments.map(view)
    .filter((v) => (f.clientId == null || v.client_id === f.clientId) && (!f.status || v.status === f.status)
      && (!f.from || v.date >= f.from) && (!f.to || v.date <= f.to))
    .sort(byTime);
}

const isEmail = (v: unknown) => typeof v === "string" && /^\S+@\S+\.\S+$/.test(v.trim());

function findOrCreateClient(b: Row) {
  if (!b.name || String(b.name).trim().length < 2) fail(400, "Informe seu nome.");
  if (!isEmail(b.email)) fail(400, "Informe um e-mail válido.");
  const email = String(b.email).trim().toLowerCase();
  let u = db.users.find((x) => x.email === email);
  if (u && u.role !== "client") fail(409, "Este e-mail pertence a uma conta profissional.");
  if (!u) {
    u = { id: nextId(), name: String(b.name).trim(), email, phone: b.phone || null, role: "client", has_password: false };
    db.users.push(u);
  }
  return u;
}

function bookSlot(slotId: unknown, clientId: number, notes: unknown, byPro = false) {
  const s = findSlot(Number(slotId)) ?? fail(404, "Horário não encontrado.");
  const start = instant(s.date, s.start_time);
  if (!byPro && !db.pro.accepting_bookings) fail(409, "A agenda não está recebendo novos agendamentos no momento.");
  if (s.status !== "open") fail(409, "Este horário acabou de ser reservado. Escolha outro horário.");
  if (start <= Date.now()) fail(409, "Este horário já passou. Escolha outro horário.");
  if (!byPro && start < Date.now() + db.pro.min_notice_hours * 3600e3)
    fail(409, `Os agendamentos precisam ser feitos com pelo menos ${db.pro.min_notice_hours}h de antecedência.`);
  return view(book(s, clientId, { status: "confirmed", paid: false, createdAt: new Date().toISOString(), notes: notes ? String(notes) : null }));
}

function cancel(a: Row, role: string) {
  if (a.status !== "confirmed") fail(409, "Esta consulta já foi cancelada ou finalizada.");
  const s = findSlot(a.slot_id)!;
  if (role === "client" && instant(s.date, s.start_time) - Date.now() < db.pro.cancel_limit_hours * 3600e3)
    fail(409, `Cancelamentos precisam ser feitos com pelo menos ${db.pro.cancel_limit_hours}h de antecedência.`);
  a.status = "cancelled";
  a.cancelled_by = role;
  if (instant(s.date, s.start_time) > Date.now()) s.status = "open";
  return view(a);
}

function reschedule(a: Row, slotId: unknown, role: string) {
  if (a.status !== "confirmed") fail(409, "Só é possível remarcar consultas confirmadas.");
  const old = findSlot(a.slot_id)!;
  if (role === "client" && instant(old.date, old.start_time) - Date.now() < db.pro.cancel_limit_hours * 3600e3)
    fail(409, `Remarcações precisam ser feitas com pelo menos ${db.pro.cancel_limit_hours}h de antecedência.`);
  const next = findSlot(Number(slotId)) ?? fail(404, "Horário não encontrado.");
  if (next.status !== "open" || instant(next.date, next.start_time) <= Date.now()) fail(409, "Este horário não está mais disponível.");
  if (role === "client" && instant(next.date, next.start_time) < Date.now() + db.pro.min_notice_hours * 3600e3)
    fail(409, `Escolha um horário com pelo menos ${db.pro.min_notice_hours}h de antecedência.`);
  old.status = "open";
  next.status = "booked";
  a.slot_id = next.id;
  a.location_id = next.location_id;
  return view(a);
}

function freeSlots(from: string, to: string) {
  if (!db.pro.accepting_bookings) return [];
  const limit = Date.now() + db.pro.min_notice_hours * 3600e3;
  return db.slots
    .filter((s) => s.status === "open" && s.date >= from && s.date <= to && instant(s.date, s.start_time) >= limit)
    .sort(byTime)
    .map((s) => {
      const l = findLocation(s.location_id);
      return { id: s.id, date: s.date, start_time: s.start_time, end_time: s.end_time,
        location_id: l?.id ?? null, location_kind: l?.kind ?? null, location_name: l?.name ?? null, location_detail: l?.detail ?? null };
    });
}

function ics(v: Row) {
  const stamp = (d: string, t: string) => `${d.replaceAll("-", "")}T${t.replace(":", "")}00`;
  const where = [v.location_name, v.location_detail].filter(Boolean).join(" - ");
  const text = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Agenda Demo//PT-BR", "BEGIN:VEVENT", `UID:${v.code}@agenda-demo`,
    `DTSTART;TZID=America/Sao_Paulo:${stamp(v.date, v.start_time)}`, `DTEND;TZID=America/Sao_Paulo:${stamp(v.date, v.end_time)}`,
    `SUMMARY:Consulta com ${v.professional_name}`, `LOCATION:${where}`, "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return new Response(text, { headers: { "Content-Type": "text/calendar" } });
}

// ---------- autenticação ----------
const currentUser = (token: string | null) => {
  const m = token?.match(/^demo:(\d+)$/);
  return m ? findUser(Number(m[1])) ?? null : null;
};
const needUser = (c: Ctx) => c.user ?? fail(401, "Sua sessão expirou. Entre novamente.");
const needPro = (c: Ctx) => {
  const u = needUser(c);
  if (u.role !== "professional") fail(403, "Esta área é exclusiva da profissional.");
  return u;
};
const session = (u: Row) => ({ user: publicUser(u), token: `demo:${u.id}` });
const checkSlug = (slug: string) => {
  if (slug !== db.pro.slug && slug !== ORIGINAL_SLUG) fail(404, "Profissional não encontrada.");
};

// ---------- roteador ----------
type Handler = (c: Ctx) => unknown;
const routes: { method: string; re: RegExp; handler: Handler }[] = [];
function on(method: string, pattern: string, handler: Handler) {
  routes.push({ method, re: new RegExp(`^${pattern.replace(/\./g, "\\.").replace(/:\w+/g, "([^/]+)")}$`), handler });
}

// Auth
on("POST", "/auth/login", (c) => {
  const u = db.users.find((x) => x.email === String(c.body.email ?? "").trim().toLowerCase());
  if (!u || !c.body.password) fail(401, "E-mail ou senha incorretos. Na demonstração, use profissional@exemplo.com com qualquer senha.");
  return session(u);
});
on("POST", "/auth/register", (c) => {
  const b = c.body;
  if (!b.password || String(b.password).length < 6) fail(400, "A senha deve ter pelo menos 6 caracteres.");
  const existing = db.users.find((x) => x.email === String(b.email ?? "").trim().toLowerCase());
  if (existing && (existing.role !== "client" || existing.has_password)) fail(409, "Este e-mail já possui cadastro.");
  const u = findOrCreateClient(b);
  u.name = String(b.name).trim();
  if (b.phone) u.phone = b.phone;
  u.has_password = true;
  return created(session(u));
});
on("POST", "/auth/client/request-code", (c) => {
  const email = String(c.body.email ?? "").trim().toLowerCase();
  if (!isEmail(email)) fail(400, "Informe um e-mail válido.");
  if (!db.users.some((x) => x.email === email && x.role === "client"))
    fail(404, "Não encontramos agendamentos para este e-mail. Na demonstração, use cliente@exemplo.com.");
  return { message: "Código enviado", expires_in_minutes: 10, resend_after_seconds: 60 };
});
on("POST", "/auth/client/verify-code", (c) => {
  const u = db.users.find((x) => x.email === String(c.body.email ?? "").trim().toLowerCase() && x.role === "client");
  if (!u || !/^\d{6}$/.test(String(c.body.code ?? ""))) fail(401, "Código incorreto. Na demonstração, qualquer código de 6 números funciona.");
  return session(u);
});
on("GET", "/auth/me", (c) => {
  const u = needUser(c);
  return { ...publicUser(u), professional: u.role === "professional" ? { slug: db.pro.slug, headline: db.pro.headline, bio: db.pro.bio } : null };
});
on("PUT", "/auth/me", (c) => {
  const u = needUser(c);
  if (c.body.name) u.name = String(c.body.name).trim();
  if ("phone" in c.body) u.phone = c.body.phone || null;
  return publicUser(u);
});
on("PUT", "/auth/password", (c) => {
  needUser(c);
  if (!c.body.current_password) fail(401, "A senha atual está incorreta.");
  if (!c.body.new_password || String(c.body.new_password).length < 6) fail(400, "A nova senha deve ter pelo menos 6 caracteres.");
  return { message: "Senha alterada" };
});

// Página pública
on("GET", "/public/professionals/:slug", (c) => {
  checkSlug(c.params[0]);
  return {
    name: pro().name, ...db.pro, timezone: "America/Sao_Paulo",
    locations: db.locations.filter((l) => l.active).sort((a, b) => b.is_default - a.is_default || a.id - b.id),
  };
});
on("GET", "/public/professionals/:slug/slots", (c) => {
  checkSlug(c.params[0]);
  const from = c.query.get("from") || today();
  const to = c.query.get("to") || addDays(from, 30);
  const days: Record<string, Row[]> = {};
  for (const s of freeSlots(from, to)) (days[s.date] ||= []).push(s);
  return { from, to, days: Object.entries(days).map(([date, slots]) => ({ date, slots })) };
});
on("GET", "/public/professionals/:slug/dates", (c) => {
  checkSlug(c.params[0]);
  const month = c.query.get("month") ?? today().slice(0, 7);
  const counts: Record<string, number> = {};
  for (const s of freeSlots(`${month}-01`, `${month}-31`)) counts[s.date] = (counts[s.date] ?? 0) + 1;
  return { month, dates: Object.entries(counts).map(([date, available]) => ({ date, available })) };
});
on("POST", "/public/professionals/:slug/appointments", (c) => {
  checkSlug(c.params[0]);
  if (c.body.consent !== true) fail(400, "É necessário aceitar a política de privacidade.");
  const client = findOrCreateClient(c.body);
  return created(bookSlot(c.body.slot_id, client.id, c.body.notes));
});
function lookup(c: Ctx) {
  const email = (c.query.get("email") ?? "").toLowerCase();
  const a = db.appointments.find((x) => x.code === c.params[0].toUpperCase());
  if (!a || findUser(a.client_id)!.email !== email) fail(404, "Agendamento não encontrado.");
  return a;
}
on("GET", "/public/appointments/:code", (c) => view(lookup(c)));
on("GET", "/public/appointments/:code/ics", (c) => ics(view(lookup(c))));

// Agendamentos (cliente ou profissional logados)
function ownAppointment(c: Ctx) {
  const u = needUser(c);
  const a = db.appointments.find((x) => x.id === Number(c.params[0]));
  if (!a || (u.role === "client" && a.client_id !== u.id)) fail(404, "Agendamento não encontrado.");
  return a;
}
on("GET", "/appointments", (c) => {
  const u = needUser(c);
  return listAppointments({ clientId: u.role === "client" ? u.id : undefined, status: c.query.get("status"), from: c.query.get("from"), to: c.query.get("to") });
});
on("POST", "/appointments", (c) => {
  const u = needUser(c);
  if (u.role !== "client") fail(403, "Contas profissionais não agendam por aqui. Use o painel da agenda.");
  if (c.body.consent !== true) fail(400, "É necessário aceitar a política de privacidade.");
  return created(bookSlot(c.body.slot_id, u.id, c.body.notes));
});
on("GET", "/appointments/:id", (c) => view(ownAppointment(c)));
on("GET", "/appointments/:id/ics", (c) => ics(view(ownAppointment(c))));
on("POST", "/appointments/:id/cancel", (c) => cancel(ownAppointment(c), c.user!.role));
on("POST", "/appointments/:id/reschedule", (c) => reschedule(ownAppointment(c), c.body.slot_id, c.user!.role));

// Painel da profissional: configurações
on("GET", "/professional/settings", (c) => {
  needPro(c);
  return { ...db.pro };
});
on("PUT", "/professional/settings", (c) => {
  needPro(c);
  const b = c.body;
  if ("slug" in b && !/^[a-z0-9-]{3,60}$/.test(String(b.slug))) fail(400, "O endereço deve ter de 3 a 60 letras minúsculas, números ou hífens.");
  for (const k of ["min_notice_hours", "cancel_limit_hours"])
    if (k in b && (b[k] < 0 || b[k] > 720)) fail(400, "Informe um número de horas entre 0 e 720.");
  if ("session_minutes" in b && (b.session_minutes < 10 || b.session_minutes > 480)) fail(400, "A duração da sessão deve ficar entre 10 e 480 minutos.");
  if ("session_price" in b && b.session_price != null && b.session_price < 0) fail(400, "O valor da sessão não pode ser negativo.");
  const texts = ["headline", "bio", "office_address", "office_city"];
  for (const k of ["slug", "accepting_bookings", "min_notice_hours", "cancel_limit_hours", "session_minutes", "session_price", ...texts])
    if (k in b) db.pro[k] = k === "accepting_bookings" ? !!b[k] : texts.includes(k) ? b[k] || null : b[k];
  return { ...db.pro };
});

// Locais
on("GET", "/professional/locations", (c) => {
  needPro(c);
  return [...db.locations].sort((a, b) => b.active - a.active || b.is_default - a.is_default || a.id - b.id);
});
on("POST", "/professional/locations", (c) => {
  needPro(c);
  const b = c.body;
  if (!["online", "in_person"].includes(b.kind)) fail(400, "Escolha se o local é online ou presencial.");
  if (!b.name || String(b.name).trim().length < 2) fail(400, "Informe o nome do local.");
  const makeDefault = !!b.is_default || !db.locations.some((l) => l.active);
  if (makeDefault) db.locations.forEach((l) => (l.is_default = 0));
  const l = { id: nextId(), kind: b.kind, name: String(b.name).trim(), detail: b.detail || null, is_default: makeDefault ? 1 : 0, active: 1 };
  db.locations.push(l);
  return created(l);
});
on("PUT", "/professional/locations/:id", (c) => {
  needPro(c);
  const l = findLocation(Number(c.params[0])) ?? fail(404, "Local não encontrado.");
  const b = c.body;
  if (b.is_default) db.locations.forEach((x) => (x.is_default = 0));
  if (b.kind) l.kind = b.kind;
  if (b.name) l.name = String(b.name).trim();
  if ("detail" in b) l.detail = b.detail || null;
  if ("is_default" in b) l.is_default = b.is_default ? 1 : 0;
  if ("active" in b) l.active = b.active ? 1 : 0;
  return l;
});
on("DELETE", "/professional/locations/:id", (c) => {
  needPro(c);
  const l = findLocation(Number(c.params[0])) ?? fail(404, "Local não encontrado.");
  if (db.appointments.some((a) => a.location_id === l.id)) {
    l.active = 0;
    l.is_default = 0;
    return { message: "Local desativado (possui agendamentos no histórico)", deactivated: true };
  }
  db.locations.splice(db.locations.indexOf(l), 1);
  return { message: "Local removido", deactivated: false };
});

// Períodos (geram horários automaticamente)
const activeLocation = (id?: unknown) =>
  id
    ? db.locations.find((l) => l.id === Number(id) && l.active)
    : db.locations.filter((l) => l.active).sort((a, b) => b.is_default - a.is_default || a.id - b.id)[0];

on("GET", "/professional/periods", (c) => {
  needPro(c);
  return [...db.periods].sort((a, b) => b.start_date.localeCompare(a.start_date) || b.id - a.id).map((p) => {
    const slots = db.slots.filter((s) => s.period_id === p.id);
    return { ...p, slots_total: slots.length, slots_booked: slots.filter((s) => s.status === "booked").length };
  });
});
on("POST", "/professional/periods", (c) => {
  needPro(c);
  const b = c.body;
  if (!b.start_date || !b.end_date || !b.start_time || !b.end_time || !b.interval_minutes || !Array.isArray(b.weekdays) || !b.weekdays.length)
    fail(400, "Preencha as datas, os dias da semana, os horários e o intervalo.");
  if (b.end_date < b.start_date) fail(400, "A data final deve ser igual ou posterior à data inicial.");
  if (b.start_time >= b.end_time) fail(400, "O horário final deve ser depois do horário inicial.");
  if ((Date.parse(b.end_date) - Date.parse(b.start_date)) / DAY > 366) fail(400, "O período pode ter no máximo 1 ano.");
  const location = activeLocation(b.location_id) ?? fail(400, b.location_id ? "Escolha um local válido." : "Cadastre um local antes de criar períodos.");
  const duration = Number(b.duration_minutes ?? db.pro.session_minutes);
  const interval = Number(b.interval_minutes);
  const weekdays = b.weekdays.map(Number);
  const period = {
    id: nextId(), start_date: b.start_date, end_date: b.end_date, weekdays, start_time: b.start_time, end_time: b.end_time,
    interval_minutes: interval, duration_minutes: duration, location_id: location.id, created_at: new Date().toISOString(),
  };
  const fresh: Row[] = [];
  let skipped = 0;
  for (let d = period.start_date; d <= period.end_date; d = addDays(d, 1)) {
    if (!weekdays.includes(weekday(d))) continue;
    for (let m = toMin(b.start_time); m + duration <= toMin(b.end_time); m += interval) {
      const start = fromMin(m);
      if (instant(d, start) <= Date.now() || db.slots.some((s) => s.date === d && s.start_time === start)) {
        skipped++;
        continue;
      }
      fresh.push({ id: nextId(), period_id: period.id, location_id: location.id, date: d, start_time: start, end_time: fromMin(m + duration), status: "open" });
    }
  }
  if (!fresh.length) fail(409, "Nenhum horário novo foi criado: os horários desse período já existem ou já passaram.");
  db.periods.push(period);
  db.slots.push(...fresh);
  return created({ id: period.id, slots_created: fresh.length, slots_skipped: skipped });
});
on("DELETE", "/professional/periods/:id", (c) => {
  needPro(c);
  const p = db.periods.find((x) => x.id === Number(c.params[0])) ?? fail(404, "Período não encontrado.");
  const history = (s: Row) => db.appointments.some((a) => a.slot_id === s.id);
  const before = db.slots.length;
  db.slots = db.slots.filter((s) => !(s.period_id === p.id && s.status !== "booked" && !history(s)));
  db.slots.forEach((s) => {
    if (s.period_id !== p.id) return;
    if (s.status === "open") s.status = "blocked";
    s.period_id = null;
  });
  db.periods.splice(db.periods.indexOf(p), 1);
  return { message: "Período removido", slots_removed: before - db.slots.length };
});

// Horários avulsos
function slotRow(s: Row) {
  const l = findLocation(s.location_id);
  const a = db.appointments.find((x) => x.slot_id === s.id && x.status === "confirmed");
  return {
    id: s.id, date: s.date, start_time: s.start_time, end_time: s.end_time, status: s.status, period_id: s.period_id ?? null,
    location_id: l?.id ?? null, location_name: l?.name ?? null, appointment_id: a?.id ?? null, appointment_code: a?.code ?? null,
    client_name: a ? findUser(a.client_id)!.name : null,
  };
}
on("GET", "/professional/slots", (c) => {
  needPro(c);
  const from = c.query.get("from") ?? today(), to = c.query.get("to") ?? from, status = c.query.get("status");
  return db.slots.filter((s) => s.date >= from && s.date <= to && (!status || s.status === status)).sort(byTime).map(slotRow);
});
on("POST", "/professional/slots", (c) => {
  needPro(c);
  const b = c.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date ?? "")) || !/^\d{2}:\d{2}$/.test(String(b.start_time ?? ""))) fail(400, "Informe a data e o horário.");
  const end = b.end_time ?? fromMin(toMin(b.start_time) + db.pro.session_minutes);
  if (end <= b.start_time) fail(400, "O horário final deve ser depois do horário inicial.");
  if (instant(b.date, b.start_time) <= Date.now()) fail(400, "Não é possível criar horários em datas ou horas que já passaram.");
  if (db.slots.some((s) => s.date === b.date && s.start_time === b.start_time)) fail(409, "Já existe um horário neste dia e hora.");
  const location = activeLocation(b.location_id) ?? fail(400, "Escolha um local válido para o horário.");
  const s = { id: nextId(), period_id: null, location_id: location.id, date: b.date, start_time: b.start_time, end_time: end, status: "open" };
  db.slots.push(s);
  return created(s);
});
const ownSlot = (c: Ctx) => {
  needPro(c);
  return findSlot(Number(c.params[0])) ?? fail(404, "Horário não encontrado.");
};
on("PATCH", "/professional/slots/:id", (c) => {
  const s = ownSlot(c);
  if (!["open", "blocked"].includes(c.body.status)) fail(400, "Situação inválida.");
  if (s.status === "booked") fail(409, "Este horário tem uma consulta marcada. Cancele a consulta primeiro.");
  s.status = c.body.status;
  return s;
});
on("DELETE", "/professional/slots/:id", (c) => {
  const s = ownSlot(c);
  if (s.status === "booked") fail(409, "Este horário tem uma consulta marcada. Cancele a consulta primeiro.");
  if (db.appointments.some((a) => a.slot_id === s.id)) {
    s.status = "blocked";
    return { message: "Horário já teve consulta; foi bloqueado para preservar o histórico", blocked: true };
  }
  db.slots.splice(db.slots.indexOf(s), 1);
  return { message: "Horário removido" };
});

// Consultas pela profissional
on("POST", "/professional/appointments", (c) => {
  needPro(c);
  const client = findOrCreateClient(c.body);
  return created(bookSlot(c.body.slot_id, client.id, c.body.notes, true));
});
on("PATCH", "/professional/appointments/:id/status", (c) => {
  needPro(c);
  const a = db.appointments.find((x) => x.id === Number(c.params[0])) ?? fail(404, "Agendamento não encontrado.");
  if (!["completed", "no_show"].includes(c.body.status)) fail(400, "Situação inválida.");
  if (a.status !== "confirmed") fail(409, "Só é possível finalizar consultas confirmadas.");
  const s = findSlot(a.slot_id)!;
  if (instant(s.date, s.start_time) > Date.now()) fail(409, "A consulta ainda não aconteceu.");
  a.status = c.body.status;
  return view(a);
});
on("GET", "/professional/clients", (c) => {
  needPro(c);
  const map = new Map<number, Row>();
  for (const { a, s } of db.appointments.map(withSlot)) {
    const u = findUser(a.client_id)!;
    const r = map.get(u.id) ?? { id: u.id, name: u.name, email: u.email, phone: u.phone ?? null, appointments_total: 0, completed: 0, last_date: null };
    r.appointments_total++;
    if (a.status === "completed") r.completed++;
    if (!r.last_date || s.date > r.last_date) r.last_date = s.date;
    map.set(u.id, r);
  }
  return [...map.values()].sort((x, y) => x.name.localeCompare(y.name));
});
on("GET", "/professional/dashboard", (c) => {
  needPro(c);
  const t = today(), monday = addDays(t, -((weekday(t) + 6) % 7)), sunday = addDays(monday, 6);
  const week = listAppointments({ status: "confirmed", from: monday, to: sunday });
  const weekAgo = Date.now() - 7 * DAY;
  return {
    week: { from: monday, to: sunday },
    appointments_this_week: week.length,
    new_appointments_7d: db.appointments.filter((a) => a.status !== "cancelled" && Date.parse(a.created_at) >= weekAgo).length,
    free_slots_this_week: db.slots.filter((s) => s.status === "open" && s.date >= monday && s.date <= sunday && s.date >= t).length,
    accepting_bookings: db.pro.accepting_bookings,
    today: week.filter((a) => a.date === t),
    next_appointment: listAppointments({ status: "confirmed", from: t }).find((a) => instant(a.date, a.start_time) > Date.now()) ?? null,
  };
});

// Financeiro
const PAYMENT_METHODS = ["pix", "cash", "card", "transfer"];
function period(c: Ctx) {
  const t = today();
  const from = c.query.get("from") ?? monthStart(t), to = c.query.get("to") ?? monthEnd(t);
  if (to < from) fail(400, "A data final deve ser igual ou posterior à data inicial.");
  return { from, to };
}
const inRange = (from: string, to: string) => db.appointments.map(withSlot).filter(({ s }) => s.date >= from && s.date <= to);

function metrics(from: string, to: string) {
  const now = Date.now();
  const m: Row = {
    total: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0, received: 0, paid_count: 0, receivable_upcoming: 0,
    overdue: 0, overdue_count: 0, upcoming_count: 0, lost_no_show: 0, cancelled_value: 0, by_method: {} as Record<string, number>,
  };
  for (const { a, s } of inRange(from, to)) {
    m.total++;
    m[a.status]++;
    const price = a.price ?? 0;
    if (a.payment_status === "paid") {
      const paid = a.paid_amount ?? price;
      const k = a.payment_method ?? "pix";
      m.received += paid;
      m.paid_count++;
      m.by_method[k] = (m.by_method[k] ?? 0) + paid;
      continue;
    }
    if (a.status === "cancelled") m.cancelled_value += price;
    else if (a.status === "no_show") m.lost_no_show += price;
    else if (instant(s.date, s.start_time) > now) {
      m.receivable_upcoming += price;
      m.upcoming_count++;
    } else {
      m.overdue += price;
      m.overdue_count++;
    }
  }
  const exp = db.expenses.filter((e) => e.date >= from && e.date <= to);
  const slots = db.slots.filter((s) => s.date >= from && s.date <= to);
  const count = (st: string) => slots.filter((s) => s.status === st).length;
  return {
    m, expenses: { total: exp.reduce((t, e) => t + e.amount, 0), count: exp.length },
    slots: { booked: count("booked"), open: count("open"), blocked: count("blocked") },
  };
}

on("GET", "/professional/finance/summary", (c) => {
  needPro(c);
  const { from, to } = period(c);
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
  const prevTo = addDays(from, -1), prevFrom = addDays(prevTo, -(days - 1));
  const cur = metrics(from, to), prev = metrics(prevFrom, prevTo), m = cur.m;
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);
  const done = m.completed + m.no_show;
  const bookable = cur.slots.open + cur.slots.booked;
  return {
    period: { from, to, days },
    appointments: {
      total: m.total, confirmed: m.confirmed, completed: m.completed, cancelled: m.cancelled, no_show: m.no_show, upcoming: m.upcoming_count,
      cancellation_rate: m.total ? Math.round((m.cancelled / m.total) * 1000) / 10 : 0,
      no_show_rate: done ? Math.round((m.no_show / done) * 1000) / 10 : 0,
    },
    revenue: {
      received: round2(m.received), paid_count: m.paid_count, receivable_upcoming: round2(m.receivable_upcoming),
      overdue: round2(m.overdue), overdue_count: m.overdue_count, expected_total: round2(m.received + m.receivable_upcoming + m.overdue),
      average_ticket: m.paid_count ? round2(m.received / m.paid_count) : 0, lost_no_show: round2(m.lost_no_show),
      cancelled_value: round2(m.cancelled_value),
      by_method: Object.fromEntries(Object.entries(m.by_method as Record<string, number>).map(([k, v]) => [k, round2(v)])),
    },
    expenses: { total: round2(cur.expenses.total), count: cur.expenses.count },
    net_result: round2(m.received - cur.expenses.total),
    occupancy: {
      booked_slots: cur.slots.booked, open_slots: cur.slots.open, blocked_slots: cur.slots.blocked,
      rate: bookable ? Math.round((cur.slots.booked / bookable) * 1000) / 10 : 0,
    },
    previous: {
      period: { from: prevFrom, to: prevTo }, received: round2(prev.m.received), appointments: prev.m.total,
      received_change_pct: pct(m.received, prev.m.received), appointments_change_pct: pct(m.total, prev.m.total),
    },
  };
});
on("GET", "/professional/finance/monthly", (c) => {
  needPro(c);
  const months = Math.min(36, Math.max(1, Number(c.query.get("months") ?? 12)));
  const list: string[] = [];
  let m = monthStart(today());
  for (let i = 0; i < months; i++) {
    list.unshift(m.slice(0, 7));
    m = monthStart(addDays(m, -1));
  }
  return list.map((month) => {
    const rows = inRange(`${month}-01`, monthEnd(`${month}-01`)).map(({ a }) => a);
    const received = rows.filter((a) => a.payment_status === "paid").reduce((t, a) => t + (a.paid_amount ?? a.price ?? 0), 0);
    const pending = rows.filter((a) => ["confirmed", "completed"].includes(a.status) && a.payment_status !== "paid").reduce((t, a) => t + (a.price ?? 0), 0);
    const expenses = db.expenses.filter((e) => e.date.startsWith(month)).reduce((t, e) => t + e.amount, 0);
    const n = (st: string) => rows.filter((a) => a.status === st).length;
    return {
      month, booked: rows.length, completed: n("completed"), cancelled: n("cancelled"), no_show: n("no_show"),
      received: round2(received), pending: round2(pending), expenses: round2(expenses), net: round2(received - expenses),
    };
  });
});
on("GET", "/professional/finance/top-clients", (c) => {
  needPro(c);
  const { from, to } = period(c);
  const map = new Map<number, Row>();
  for (const { a } of inRange(from, to)) {
    const u = findUser(a.client_id)!;
    const r = map.get(u.id) ?? { id: u.id, name: u.name, email: u.email, appointments: 0, active_appointments: 0, received: 0 };
    r.appointments++;
    if (["confirmed", "completed"].includes(a.status)) r.active_appointments++;
    if (a.payment_status === "paid") r.received = round2(r.received + (a.paid_amount ?? a.price ?? 0));
    map.set(u.id, r);
  }
  return [...map.values()].sort((x, y) => y.received - x.received || y.appointments - x.appointments).slice(0, 10);
});

const tx = (a: Row) => {
  const s = findSlot(a.slot_id)!, u = findUser(a.client_id)!;
  return {
    id: a.id, code: a.code, date: s.date, start_time: s.start_time, status: a.status,
    client: { id: u.id, name: u.name, email: u.email }, price: a.price ?? null, payment_status: a.payment_status,
    payment_method: a.payment_method, paid_amount: a.paid_amount ?? null, paid_at: a.paid_at ?? null,
  };
};
function transactions(c: Ctx) {
  const { from, to } = period(c);
  const payment = c.query.get("payment") ?? "all";
  return inRange(from, to)
    .map(({ a }) => a)
    .filter((a) => (payment === "paid" ? a.payment_status === "paid" : payment === "pending" ? a.payment_status !== "paid" && a.status !== "cancelled" : true))
    .map(tx)
    .sort((x, y) => byTime(y, x));
}
on("GET", "/professional/finance/transactions", (c) => {
  needPro(c);
  return transactions(c);
});
on("PATCH", "/professional/finance/payments/:id", (c) => {
  needPro(c);
  const a = db.appointments.find((x) => x.id === Number(c.params[0])) ?? fail(404, "Agendamento não encontrado.");
  const b = c.body;
  if (!["paid", "pending"].includes(b.status)) fail(400, "Situação de pagamento inválida.");
  if (b.method && !PAYMENT_METHODS.includes(b.method)) fail(400, "Forma de pagamento inválida.");
  if (a.status === "cancelled") fail(409, "Consultas canceladas não geram cobrança.");
  if ("price" in b) a.price = b.price == null ? null : round2(Number(b.price));
  if (b.status === "paid")
    Object.assign(a, { payment_status: "paid", payment_method: b.method ?? "pix", paid_amount: "amount" in b ? round2(Number(b.amount)) : a.price ?? 0, paid_at: b.paid_at ?? today() });
  else Object.assign(a, { payment_status: "pending", payment_method: null, paid_amount: null, paid_at: null });
  return tx(a);
});

function validExpense(b: Row, partial = false) {
  if ((!partial || "description" in b) && (!b.description || String(b.description).trim().length < 2)) fail(400, "Informe a descrição da despesa.");
  if ((!partial || "amount" in b) && !(Number(b.amount) > 0)) fail(400, "O valor da despesa deve ser maior que zero.");
  if ((!partial || "date" in b) && !/^\d{4}-\d{2}-\d{2}$/.test(String(b.date ?? ""))) fail(400, "Informe a data da despesa.");
}
const findExpense = (c: Ctx) => db.expenses.find((e) => e.id === Number(c.params[0])) ?? fail(404, "Despesa não encontrada.");
on("GET", "/professional/finance/expenses", (c) => {
  needPro(c);
  const { from, to } = period(c);
  return db.expenses.filter((e) => e.date >= from && e.date <= to).sort((x, y) => y.date.localeCompare(x.date) || y.id - x.id);
});
on("POST", "/professional/finance/expenses", (c) => {
  needPro(c);
  validExpense(c.body);
  const e = { id: nextId(), description: String(c.body.description).trim(), category: c.body.category || "outros", amount: round2(Number(c.body.amount)), date: c.body.date };
  db.expenses.push(e);
  return created(e);
});
on("PUT", "/professional/finance/expenses/:id", (c) => {
  needPro(c);
  const e = findExpense(c);
  validExpense(c.body, true);
  if ("description" in c.body) e.description = String(c.body.description).trim();
  if ("category" in c.body) e.category = c.body.category || "outros";
  if ("amount" in c.body) e.amount = round2(Number(c.body.amount));
  if ("date" in c.body) e.date = c.body.date;
  return e;
});
on("DELETE", "/professional/finance/expenses/:id", (c) => {
  needPro(c);
  const e = findExpense(c);
  db.expenses.splice(db.expenses.indexOf(e), 1);
  return { message: "Despesa removida" };
});

const STATUS_PT: Row = { confirmed: "Confirmada", completed: "Realizada", cancelled: "Cancelada", no_show: "Não compareceu" };
const METHOD_PT: Row = { pix: "Pix", cash: "Dinheiro", card: "Cartão", transfer: "Transferência" };
on("GET", "/professional/finance/export.csv", (c) => {
  needPro(c);
  const { from, to } = period(c);
  const cell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const num = (v: number | null) => (v == null ? "" : v.toFixed(2).replace(".", ","));
  const lines =
    (c.query.get("type") ?? "transactions") === "expenses"
      ? [["Data", "Descrição", "Categoria", "Valor"],
        ...db.expenses.filter((e) => e.date >= from && e.date <= to).sort((x, y) => x.date.localeCompare(y.date))
          .map((e) => [e.date, e.description, e.category, num(e.amount)])]
      : [["Data", "Horário", "Código", "Cliente", "E-mail", "Situação da consulta", "Valor", "Pagamento", "Forma", "Valor recebido", "Data do pagamento"],
        ...transactions(c).map((t) => [t.date, t.start_time, t.code, t.client.name, t.client.email, STATUS_PT[t.status], num(t.price),
          t.payment_status === "paid" ? "Pago" : t.status === "cancelled" ? "—" : "Pendente", METHOD_PT[t.payment_method ?? ""] ?? "",
          num(t.paid_amount), t.paid_at ?? ""])];
  const csv = "\uFEFF" + lines.map((l) => l.map(cell).join(";")).join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8" } });
});

// ---------- ponto de entrada usado pelo api.ts ----------
export async function demoFetch(method: string, path: string, body: unknown, token: string | null): Promise<Response> {
  await new Promise((r) => setTimeout(r, 150));
  const url = new URL(path, "http://demo.local");
  const route = routes.find((r) => r.method === method && r.re.test(url.pathname));
  if (!route) return json({ error: "Recurso não encontrado." }, 404);
  try {
    const params = url.pathname.match(route.re)!.slice(1).map(decodeURIComponent);
    const result = route.handler({ params, query: url.searchParams, body: (body ?? {}) as Row, user: currentUser(token) });
    return result instanceof Response ? result : json(result);
  } catch (e) {
    if (e instanceof DemoError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Algo deu errado na demonstração." }, 500);
  }
}

// ---------- aviso com os acessos de teste ----------
function showBanner() {
  try {
    if (sessionStorage.getItem("agenda-demo-banner") === "hidden") return;
  } catch { /* sem storage */ }
  const box = document.createElement("div");
  box.setAttribute("role", "note");
  box.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:9999;max-width:min(360px,calc(100% - 24px));padding:12px 36px 12px 14px;border-radius:12px;background:#0f172a;color:#f8fafc;font:13px/1.5 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)";
  box.innerHTML = "<strong>Versão de demonstração</strong> · dados fictícios<br>Profissional: profissional@exemplo.com (qualquer senha)<br>Cliente: cliente@exemplo.com (qualquer código de 6 números)";
  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "Fechar aviso");
  close.style.cssText = "position:absolute;top:6px;right:8px;border:0;background:none;color:inherit;font-size:18px;line-height:1;cursor:pointer";
  close.onclick = () => {
    box.remove();
    try { sessionStorage.setItem("agenda-demo-banner", "hidden"); } catch { /* sem storage */ }
  };
  box.append(close);
  document.body.append(box);
}

if (IS_DEMO) {
  seed();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", showBanner);
  else showBanner();
}