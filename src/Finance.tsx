import { useEffect, useState, type ReactNode } from "react";
import { addDays, api, dayNumber, downloadFile, errorText, money, monthName, todayISO, weekdayShort } from "./api";
import { Button, ErrorNote, Icon, useConfirm, useToast, type IconName } from "./ui";

type Summary = {
  period: { from: string; to: string; days: number };
  appointments: { total: number; confirmed: number; completed: number; cancelled: number; no_show: number; upcoming: number; cancellation_rate: number; no_show_rate: number };
  revenue: { received: number; paid_count: number; receivable_upcoming: number; overdue: number; overdue_count: number; expected_total: number; average_ticket: number; lost_no_show: number; cancelled_value: number; by_method: Record<string, number> };
  expenses: { total: number; count: number };
  net_result: number;
  occupancy: { booked_slots: number; open_slots: number; blocked_slots: number; rate: number };
  previous: { period: { from: string; to: string }; received: number; appointments: number; received_change_pct: number | null; appointments_change_pct: number | null };
};
type Month = { month: string; booked: number; completed: number; cancelled: number; no_show: number; received: number; pending: number; expenses: number; net: number };
type Tx = { id: number; code: string; date: string; start_time: string; status: "confirmed" | "completed" | "cancelled" | "no_show"; client: { id: number; name: string; email: string }; price: number | null; payment_status: "paid" | "pending"; payment_method: string | null; paid_amount: number | null; paid_at: string | null };
type Expense = { id: number; description: string; category: string; amount: number; date: string };
type TopClient = { id: number; name: string; email: string; appointments: number; active_appointments: number; received: number };

const METHODS: Record<string, string> = { pix: "Pix", cash: "Dinheiro", card: "Cartão", transfer: "Transferência" };
const CATEGORIES = ["Aluguel", "Material", "Marketing", "Impostos", "Equipamentos", "Software", "Outros"];
const STATUS: Record<Tx["status"], { label: string; cls: string }> = {
  confirmed: { label: "Confirmada", cls: "info" }, completed: { label: "Realizada", cls: "ok" },
  cancelled: { label: "Cancelada", cls: "bad" }, no_show: { label: "Faltou", cls: "warn" },
};

const monthBounds = (d: string) => {
  const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7));
  return { from: `${d.slice(0, 7)}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
};
const PRESETS = [
  { id: "month", label: "Este mês" }, { id: "last", label: "Mês passado" }, { id: "30d", label: "Últimos 30 dias" },
  { id: "year", label: "Este ano" }, { id: "custom", label: "Personalizado" },
] as const;
type PresetId = (typeof PRESETS)[number]["id"];

function presetRange(id: PresetId, current: { from: string; to: string }) {
  const today = todayISO();
  if (id === "month") return monthBounds(today);
  if (id === "last") return monthBounds(addDays(monthBounds(today).from, -1));
  if (id === "30d") return { from: addDays(today, -29), to: today };
  if (id === "year") return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
  return current;
}

const shortDate = (d: string) => `${String(dayNumber(d)).padStart(2, "0")}/${d.slice(5, 7)}`;
const fullDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const monthLabel = (m: string) => `${monthName(`${m}-01`).slice(0, 3)}/${m.slice(2, 4)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const parseMoney = (text: string) => Number(text.trim().replace(/\./g, "").replace(",", "."));
const numberToInput = (n: number | null | undefined) => (n == null ? "" : n.toFixed(2).replace(".", ","));

function Kpi({ label, value, hint, icon, tone, children }: { label: string; value: string; hint?: ReactNode; icon: IconName; tone: "teal" | "rose" | "amber" | "green" | "slate"; children?: ReactNode }) {
  return (
    <div className="fin-kpi">
      <span className={`fin-kpi__icon fin-tone--${tone}`}><Icon name={icon} size={19} /></span>
      <p><small>{label}</small><strong>{value}</strong>{hint && <em>{hint}</em>}</p>
      {children}
    </div>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="fin-delta fin-delta--flat">sem período anterior para comparar</span>;
  const up = value >= 0;
  return <span className={`fin-delta ${up ? "fin-delta--up" : "fin-delta--down"}`}>{up ? "▲ +" : "▼ "}{pct(value)} vs. período anterior</span>;
}

// ---------- Gráfico mensal (SVG, um eixo, duas séries) ----------
function MonthlyChart({ data }: { data: Month[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const W = 760, H = 270, L = 58, R = 12, T = 14, B = 30;
  const plotW = W - L - R, plotH = H - T - B;
  const rawMax = Math.max(1, ...data.flatMap((d) => [d.received, d.expenses]));
  // Escala "redonda": passo de 1, 2, 2,5 ou 5 × 10^n, com no máximo 4 divisões.
  const mag = Math.pow(10, Math.floor(Math.log10(rawMax / 4)));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((c) => rawMax / c <= 4) ?? mag * 10;
  const niceMax = Math.max(1, Math.ceil(rawMax / step)) * step;
  const ticks = Array.from({ length: Math.round(niceMax / step) + 1 }, (_, i) => i * step);
  const y = (v: number) => T + plotH - (v / niceMax) * plotH;
  const group = plotW / data.length;
  const bar = Math.min(18, group * 0.3);
  const roundedTop = (x: number, top: number, w: number, base: number) => {
    const h = base - top;
    if (h <= 0) return "";
    const r = Math.min(4, h, w / 2);
    return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
  };
  const compact = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
  const empty = data.every((d) => d.received === 0 && d.expenses === 0);
  const hovered = hover !== null ? data[hover] : null;

  return (
    <section className="fin-card fin-card--wide">
      <div className="fin-card__head">
        <div><h3>Evolução mensal</h3><p>Recebido e despesas nos últimos {data.length} meses</p></div>
        <div className="fin-legend">
          <span><i style={{ background: "var(--fin-income)" }} /> Recebido</span>
          <span><i style={{ background: "var(--fin-expense)" }} /> Despesas</span>
          <button className="fin-link" onClick={() => setTable(!table)}>{table ? "Ver gráfico" : "Ver tabela"}</button>
        </div>
      </div>
      {table ? (
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead><tr><th>Mês</th><th>Consultas</th><th>Realizadas</th><th>Canceladas</th><th>Recebido</th><th>Despesas</th><th>Resultado</th></tr></thead>
            <tbody>{data.map((d) => <tr key={d.month}><td>{monthLabel(d.month)}</td><td>{d.booked}</td><td>{d.completed}</td><td>{d.cancelled}</td><td>{money(d.received)}</td><td>{money(d.expenses)}</td><td>{money(d.net)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="fin-chart" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gráfico de barras: recebido e despesas por mês">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="fin-grid" />
                <text x={L - 8} y={y(t) + 4} textAnchor="end" className="fin-axis">{t === 0 ? "0" : `R$ ${compact(t)}`}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = L + group * i + group / 2;
              return (
                <g key={d.month} opacity={hover === null || hover === i ? 1 : 0.45}>
                  <path d={roundedTop(cx - bar - 1, y(d.received), bar, y(0))} fill="var(--fin-income)" />
                  <path d={roundedTop(cx + 1, y(d.expenses), bar, y(0))} fill="var(--fin-expense)" />
                  <text x={cx} y={H - 10} textAnchor="middle" className="fin-axis">{monthLabel(d.month)}</text>
                  <rect x={L + group * i} y={T} width={group} height={plotH + B} fill="transparent" onMouseEnter={() => setHover(i)} />
                </g>
              );
            })}
          </svg>
          {empty && <p className="fin-empty fin-empty--chart">Ainda não há valores recebidos ou despesas neste intervalo.</p>}
          {hovered && (
            <div className="fin-tooltip" style={{ left: `${((L + group * (hover! + 0.5)) / W) * 100}%` }}>
              <strong>{monthLabel(hovered.month)}</strong>
              <span><i style={{ background: "var(--fin-income)" }} /> Recebido <b>{money(hovered.received)}</b></span>
              <span><i style={{ background: "var(--fin-expense)" }} /> Despesas <b>{money(hovered.expenses)}</b></span>
              <span>Resultado <b>{money(hovered.net)}</b></span>
              <small>{hovered.booked} consultas · {hovered.completed} realizadas</small>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------- Modais ----------
function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="login-modal fin-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button>
        <h2>{title}</h2>
        <p>{subtitle}</p>
        {children}
      </section>
    </div>
  );
}

function PaymentModal({ tx, onClose, onSaved, onError }: { tx: Tx; onClose: () => void; onSaved: () => void; onError: (e: unknown) => void }) {
  const [method, setMethod] = useState("pix");
  const [amount, setAmount] = useState(numberToInput(tx.price));
  const [paidAt, setPaidAt] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const value = parseMoney(amount);
    if (amount.trim() === "" || Number.isNaN(value) || value < 0) { setError("Informe o valor recebido, por exemplo 150,00."); return; }
    setSaving(true);
    try {
      await api.patch(`/professional/finance/payments/${tx.id}`, { status: "paid", method, amount: value, ...(tx.price == null ? { price: value } : {}), paid_at: paidAt });
      onSaved();
    } catch (e) { onError(e); setSaving(false); }
  }

  return (
    <Modal title="Registrar recebimento" subtitle={`${tx.client.name} · ${fullDate(tx.date)} às ${tx.start_time}`} onClose={onClose}>
      <div className="inline-form">
        <label>Forma de pagamento<select value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Valor recebido (R$)<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="150,00" autoFocus /></label>
        <label>Data do recebimento<input type="date" value={paidAt} max={todayISO()} onChange={(e) => setPaidAt(e.target.value)} /></label>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="fin-modal__actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => void save()} disabled={saving}>{saving ? "Salvando…" : "Confirmar"}</Button></div>
      </div>
    </Modal>
  );
}

function ExpenseModal({ onClose, onSaved, onError }: { onClose: () => void; onSaved: () => void; onError: (e: unknown) => void }) {
  const [form, setForm] = useState({ description: "", category: "Aluguel", amount: "", date: todayISO() });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const amount = parseMoney(form.amount);
    if (form.description.trim().length < 2) { setError("Descreva a despesa."); return; }
    if (form.amount.trim() === "" || Number.isNaN(amount) || amount <= 0) { setError("Informe um valor maior que zero, por exemplo 80,00."); return; }
    setSaving(true);
    try {
      await api.post("/professional/finance/expenses", { description: form.description, category: form.category.toLowerCase(), amount, date: form.date });
      onSaved();
    } catch (e) { onError(e); setSaving(false); }
  }

  return (
    <Modal title="Registrar despesa" subtitle="Lance custos do consultório para calcular o seu resultado líquido." onClose={onClose}>
      <div className="inline-form">
        <label>Descrição<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex.: Aluguel da sala" autoFocus /></label>
        <label>Categoria<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Valor (R$)<input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="80,00" /></label>
        <label>Data<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="fin-modal__actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => void save()} disabled={saving}>{saving ? "Salvando…" : "Salvar despesa"}</Button></div>
      </div>
    </Modal>
  );
}

// ---------- Tela ----------
export default function FinanceView() {
  const initial = presetRange("month", { from: "", to: "" });
  const [preset, setPreset] = useState<PresetId>("month");
  const [range, setRange] = useState(initial);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [monthly, setMonthly] = useState<Month[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [top, setTop] = useState<TopClient[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "paid">("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [paying, setPaying] = useState<Tx | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const { node: toastNode, notify, fail } = useToast();
  const { node: confirmNode, confirm } = useConfirm();

  async function load() {
    setLoadError("");
    const q = `from=${range.from}&to=${range.to}`;
    try {
      const [s, m, t, e, c] = await Promise.all([
        api.get<Summary>(`/professional/finance/summary?${q}`),
        api.get<Month[]>("/professional/finance/monthly?months=12"),
        api.get<Tx[]>(`/professional/finance/transactions?${q}`),
        api.get<Expense[]>(`/professional/finance/expenses?${q}`),
        api.get<TopClient[]>(`/professional/finance/top-clients?${q}`),
      ]);
      setSummary(s); setMonthly(m); setTxs(t); setExpenses(e); setTop(c);
    } catch (e) { setLoadError(errorText(e, "Não foi possível carregar o financeiro.")); } finally { setLoading(false); }
  }
  useEffect(() => { if (range.from && range.to && range.from <= range.to) void load(); }, [range.from, range.to]);

  function choose(id: PresetId) {
    setPreset(id);
    if (id !== "custom") setRange(presetRange(id, range));
  }

  const visible = txs.filter((t) => filter === "all" || (filter === "paid" ? t.payment_status === "paid" : t.payment_status !== "paid" && t.status !== "cancelled"));
  const s = summary;
  const maxMethod = s ? Math.max(1, ...Object.values(s.revenue.by_method)) : 1;
  const methodRows = s ? Object.entries(s.revenue.by_method).sort((a, b) => b[1] - a[1]) : [];
  const collectRate = s && s.revenue.expected_total > 0 ? (s.revenue.received / s.revenue.expected_total) * 100 : 0;

  return (
    <main className="admin-page fin-page">
      <div className="admin-heading">
        <div><span className="eyebrow">FINANCEIRO</span><h1>Controle financeiro</h1><p>Consultas, recebimentos, despesas e resultado do seu consultório.</p></div>
        <div className="fin-actions">
          <Button variant="secondary" onClick={() => void downloadFile(`/professional/finance/export.csv?type=transactions&from=${range.from}&to=${range.to}`, `lancamentos-${range.from}-a-${range.to}.csv`).catch(fail)}><Icon name="download" size={17} /> Exportar CSV</Button>
          <Button onClick={() => setExpenseOpen(true)}><Icon name="plus" size={18} /> Registrar despesa</Button>
        </div>
      </div>

      <div className="fin-period">
        <div className="fin-chips" role="tablist" aria-label="Período">
          {PRESETS.map((p) => <button key={p.id} role="tab" aria-selected={preset === p.id} className={preset === p.id ? "active" : ""} onClick={() => choose(p.id)}>{p.label}</button>)}
        </div>
        <div className="fin-range">
          <label>De<input type="date" value={range.from} onChange={(e) => { setPreset("custom"); setRange({ ...range, from: e.target.value }); }} /></label>
          <label>Até<input type="date" value={range.to} onChange={(e) => { setPreset("custom"); setRange({ ...range, to: e.target.value }); }} /></label>
        </div>
      </div>

      {loadError && <ErrorNote action={<button className="text-action" onClick={() => void load()}>Tentar novamente</button>}>{loadError}</ErrorNote>}
      {loading && !s && <p className="state-note">Carregando financeiro…</p>}

      {s && (
        <>
          <div className="fin-kpis">
            <div className="fin-kpi fin-kpi--hero">
              <span className="fin-kpi__icon fin-tone--teal"><Icon name="wallet" size={21} /></span>
              <p><small>RECEBIDO NO PERÍODO</small><strong>{money(s.revenue.received)}</strong><Delta value={s.previous.received_change_pct} /></p>
              <div className="fin-meter" aria-label={`Recebido ${pct(collectRate)} do total previsto`}>
                <div><i style={{ width: `${Math.min(100, collectRate)}%` }} /></div>
                <small>{pct(collectRate)} do previsto de {money(s.revenue.expected_total)}</small>
              </div>
            </div>
            <Kpi label="A RECEBER (CONSULTAS FUTURAS)" value={money(s.revenue.receivable_upcoming)} hint={plural(s.appointments.upcoming, "consulta confirmada", "consultas confirmadas")} icon="clock" tone="slate" />
            <Kpi label="PENDENTE (JÁ REALIZADAS)" value={money(s.revenue.overdue)} hint={s.revenue.overdue_count ? `${plural(s.revenue.overdue_count, "consulta", "consultas")} sem pagamento registrado` : "Nada pendente"} icon="check" tone="amber" />
            <Kpi label="DESPESAS" value={money(s.expenses.total)} hint={plural(s.expenses.count, "lançamento", "lançamentos")} icon="trash" tone="rose" />
            <Kpi label="RESULTADO LÍQUIDO" value={money(s.net_result)} hint="recebido − despesas" icon="sparkle" tone={s.net_result >= 0 ? "green" : "rose"} />
            <Kpi label="PREVISTO NO PERÍODO" value={money(s.revenue.expected_total)} hint="recebido + a receber + pendente" icon="calendar" tone="slate" />
            <Kpi label="TICKET MÉDIO" value={money(s.revenue.average_ticket)} hint={plural(s.revenue.paid_count, "pagamento recebido", "pagamentos recebidos")} icon="chart" tone="teal" />
          </div>

          <div className="fin-counts">
            <div><small>Consultas marcadas</small><strong>{s.appointments.total}</strong><em><Delta value={s.previous.appointments_change_pct} /></em></div>
            <div><small>Realizadas</small><strong>{s.appointments.completed}</strong></div>
            <div><small>Confirmadas (futuras)</small><strong>{s.appointments.confirmed}</strong></div>
            <div><small>Canceladas</small><strong>{s.appointments.cancelled}</strong><em>{pct(s.appointments.cancellation_rate)} do total{s.revenue.cancelled_value > 0 ? ` · ${money(s.revenue.cancelled_value)} liberados` : ""}</em></div>
            <div><small>Faltas</small><strong>{s.appointments.no_show}</strong><em>{pct(s.appointments.no_show_rate)} das atendidas{s.revenue.lost_no_show > 0 ? ` · ${money(s.revenue.lost_no_show)} perdidos` : ""}</em></div>
            <div><small>Ocupação da agenda</small><strong>{pct(s.occupancy.rate)}</strong><em>{s.occupancy.booked_slots} ocupados · {s.occupancy.open_slots} livres</em></div>
          </div>

          <div className="fin-grid">
            <MonthlyChart data={monthly} />
            <aside className="fin-side">
              <section className="fin-card">
                <div className="fin-card__head"><div><h3>Formas de pagamento</h3><p>Recebido no período</p></div></div>
                {methodRows.length === 0 ? <p className="fin-empty">Nenhum recebimento registrado no período.</p> : (
                  <ul className="fin-bars">
                    {methodRows.map(([k, v]) => <li key={k}><span>{METHODS[k] ?? k}</span><div><i style={{ width: `${(v / maxMethod) * 100}%` }} /></div><b>{money(v)}</b></li>)}
                  </ul>
                )}
              </section>
              <section className="fin-card">
                <div className="fin-card__head"><div><h3>Principais clientes</h3><p>Por valor recebido</p></div></div>
                {top.length === 0 ? <p className="fin-empty">Sem consultas no período.</p> : (
                  <ol className="fin-top">
                    {top.slice(0, 5).map((c, i) => <li key={c.id}><span>{i + 1}</span><p><strong>{c.name}</strong><small>{plural(c.active_appointments, "consulta válida", "consultas válidas")}</small></p><b>{money(c.received)}</b></li>)}
                  </ol>
                )}
              </section>
            </aside>
          </div>

          <section className="fin-card fin-card--wide">
            <div className="fin-card__head">
              <div><h3>Lançamentos</h3><p>Cada consulta do período e o status do pagamento</p></div>
              <div className="fin-chips fin-chips--small">
                {([["all", "Todos"], ["pending", "Pendentes"], ["paid", "Pagos"]] as const).map(([id, label]) => <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>)}
              </div>
            </div>
            {visible.length === 0 ? <p className="fin-empty">Nenhum lançamento para este filtro.</p> : (
              <div className="fin-table-wrap">
                <table className="fin-table">
                  <thead><tr><th>Data</th><th>Cliente</th><th>Consulta</th><th className="num">Valor</th><th>Pagamento</th><th /></tr></thead>
                  <tbody>
                    {visible.map((t) => (
                      <tr key={t.id}>
                        <td>{weekdayShort(t.date)}, {shortDate(t.date)} · {t.start_time}</td>
                        <td><strong>{t.client.name}</strong><small>{t.code}</small></td>
                        <td><span className={`fin-chip fin-chip--${STATUS[t.status].cls}`}>{STATUS[t.status].label}</span></td>
                        <td className="num">{t.price == null ? "—" : money(t.price)}</td>
                        <td>
                          {t.status === "cancelled" ? <span className="fin-muted">—</span> : t.payment_status === "paid"
                            ? <span className="fin-chip fin-chip--ok"><Icon name="check" size={12} /> Pago · {METHODS[t.payment_method ?? "pix"]}{t.paid_amount != null && t.paid_amount !== t.price ? ` · ${money(t.paid_amount)}` : ""}</span>
                            : <span className="fin-chip fin-chip--warn"><Icon name="clock" size={12} /> Pendente</span>}
                        </td>
                        <td className="act">
                          {t.status !== "cancelled" && (t.payment_status === "paid"
                            ? <button className="fin-link" onClick={async () => { if (await confirm({ title: "Desfazer recebimento?", text: `O pagamento de ${t.client.name} voltará a ficar pendente.`, confirmLabel: "Sim, desfazer", cancelLabel: "Manter" })) { try { await api.patch(`/professional/finance/payments/${t.id}`, { status: "pending" }); notify("Recebimento desfeito"); await load(); } catch (e) { fail(e); } } }}>Desfazer</button>
                            : <Button variant="secondary" onClick={() => setPaying(t)}>Receber</Button>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="fin-card fin-card--wide">
            <div className="fin-card__head">
              <div><h3>Despesas</h3><p>Custos lançados no período · total {money(s.expenses.total)}</p></div>
              <Button variant="secondary" onClick={() => setExpenseOpen(true)}><Icon name="plus" size={16} /> Nova despesa</Button>
            </div>
            {expenses.length === 0 ? <p className="fin-empty">Nenhuma despesa lançada neste período.</p> : (
              <div className="fin-table-wrap">
                <table className="fin-table">
                  <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th className="num">Valor</th><th /></tr></thead>
                  <tbody>
                    {expenses.map((x) => (
                      <tr key={x.id}>
                        <td>{fullDate(x.date)}</td><td><strong>{x.description}</strong></td><td><span className="fin-chip fin-chip--info">{x.category.charAt(0).toUpperCase() + x.category.slice(1)}</span></td>
                        <td className="num">{money(x.amount)}</td>
                        <td className="act"><button className="fin-icon" aria-label={`Remover ${x.description}`} onClick={async () => { if (await confirm({ title: "Remover despesa?", text: `${x.description} (${money(x.amount)}) será removida do seu financeiro.`, confirmLabel: "Sim, remover", cancelLabel: "Manter" })) { try { await api.del(`/professional/finance/expenses/${x.id}`); notify("Despesa removida"); await load(); } catch (e) { fail(e); } } }}><Icon name="trash" size={16} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {paying && <PaymentModal tx={paying} onClose={() => setPaying(null)} onError={fail} onSaved={() => { setPaying(null); notify("Recebimento registrado"); void load(); }} />}
      {expenseOpen && <ExpenseModal onClose={() => setExpenseOpen(false)} onError={fail} onSaved={() => { setExpenseOpen(false); notify("Despesa registrada"); void load(); }} />}
      {toastNode}
      {confirmNode}
    </main>
  );
}
