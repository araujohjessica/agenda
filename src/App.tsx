import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button, ErrorNote, Icon, useConfirm, useToast } from "./ui";
import FinanceView from "./Finance";
import { ApiError, PROFESSIONAL_SLUG, errorText, addDays, parseDate, api, dayLabel, dayNumber, downloadIcs, duration, getToken, locationText, mondayOf, monthName, monthYear, money, officeText, setToken, todayISO, weekdayLong, weekdayShort, type AdminSlot, type Appointment, type Dashboard, type FreeSlot, type Location, type PublicProfessional, type Settings, type SlotDay, type User } from "./api";
import logoSource from "./logo.svg";

function Logo({ compact = false }: { compact?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const image = new Image();
    image.src = logoSource;
    image.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const r = pixels.data[i];
        const g = pixels.data[i + 1];
        const b = pixels.data[i + 2];
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        const alpha = Math.max(0, Math.min(255, (chroma - 4) * 7));
        pixels.data[i + 3] = alpha;
      }
      context.clearRect(0, 0, image.width, image.height);
      context.putImageData(pixels, 0, 0);
    };
  }, []);

  return (
    <div className={`logo-lockup ${compact ? "logo-lockup--compact" : ""}`}>
      <canvas ref={canvasRef} className="logo-mark" aria-label="Logo Agenda" />
      <div className="logo-type">
        <strong>agenda</strong>
        {!compact && <span>seu tempo, bem cuidado</span>}
      </div>
    </div>
  );
}

function Stepper({ activeStep }: { activeStep: 2 | 3 | 4 }) {
  const stepClass = (step: number) => activeStep > step ? "step step--done" : activeStep === step ? "step step--active" : "step";
  return (
    <div className="stepper">
      <div className="step step--done"><span><Icon name="check" size={14} /></span><p>Serviço</p></div>
      <i />
      <div className={stepClass(2)}><span>{activeStep > 2 ? <Icon name="check" size={14} /> : "2"}</span><p>Data e hora</p></div>
      <i />
      <div className={stepClass(3)}><span>{activeStep > 3 ? <Icon name="check" size={14} /> : "3"}</span><p>Seus dados</p></div>
    </div>
  );
}

const SLOTS_WINDOW_DAYS = 365;

function BookingView({ onManage, user }: { onManage: () => void; user: User | null }) {
  const [pro, setPro] = useState<PublicProfessional | null>(null);
  const [days, setDays] = useState<SlotDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [viewMonth, setViewMonth] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<FreeSlot | null>(null);
  const [step, setStep] = useState<2 | 3 | 4>(2);
  const [client, setClient] = useState({ name: user?.name ?? "", email: user?.email ?? "", phone: user?.phone ?? "", notes: "" });
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [booked, setBooked] = useState<Appointment | null>(null);

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const from = todayISO();
      const [profile, slots] = await Promise.all([
        api.get<PublicProfessional>(`/public/professionals/${PROFESSIONAL_SLUG}`),
        api.get<{ days: SlotDay[] }>(`/public/professionals/${PROFESSIONAL_SLUG}/slots?from=${from}&to=${addDays(from, SLOTS_WINDOW_DAYS)}`),
      ]);
      setPro(profile);
      setDays(slots.days);
      const first = slots.days[0]?.date ?? "";
      setSelectedDate(first);
      setViewMonth(first.slice(0, 7));
      setSelectedSlot(null);
    } catch (e) {
      setLoadError(errorText(e, "Não foi possível carregar os horários agora."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (user) setClient((c) => ({ ...c, name: c.name || user.name, email: c.email || user.email, phone: c.phone || user.phone || "" }));
  }, [user]);

  const daySlots = days.find((d) => d.date === selectedDate)?.slots ?? [];
  const slotsByDate = new Map(days.map((d) => [d.date, d.slots.length]));
  const months = [...new Set(days.map((d) => d.date.slice(0, 7)))];
  const monthIndex = months.indexOf(viewMonth);
  const firstOfMonth = parseDate(`${viewMonth || todayISO().slice(0, 7)}-01`);
  const monthCells: (string | null)[] = [
    ...Array<null>(firstOfMonth.getDay()).fill(null),
    ...Array.from({ length: new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0).getDate() }, (_, i) => `${viewMonth}-${String(i + 1).padStart(2, "0")}`),
  ];

  function goToMonth(month: string | undefined) {
    if (!month) return;
    setViewMonth(month);
    setSelectedDate(days.find((d) => d.date.startsWith(month))?.date ?? "");
    setSelectedSlot(null);
  }

  async function confirm() {
    if (!selectedSlot) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const appointment = await api.post<Appointment>(`/public/professionals/${PROFESSIONAL_SLUG}/appointments`, {
        slot_id: selectedSlot.id, name: client.name, email: client.email, phone: client.phone, notes: client.notes, consent: accepted,
      });
      setBooked(appointment);
      setStep(4);
    } catch (e) {
      setSubmitError(errorText(e, "Não foi possível concluir o agendamento. Tente novamente."));
      if (e instanceof ApiError && e.status === 409) { setStep(2); void load(); }
    } finally {
      setSubmitting(false);
    }
  }

  const summary = selectedSlot && (
    <div>
      <Icon name="calendar" />
      <p><span>{dayLabel(selectedSlot.date)}</span><strong>{selectedSlot.start_time} · {duration(selectedSlot.start_time, selectedSlot.end_time)} min</strong></p>
    </div>
  );
  const professionalName = pro?.name ?? "Ana Beatriz Lima";

  return (
    <main className="booking-page">
      <section className="booking-intro">
        <div className="professional-chip">
          <span>{professionalName.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
          <p><small>AGENDA DE</small><strong>{professionalName}</strong><em>{pro?.headline ?? "Atendimento individual"}</em></p>
          <i><Icon name="check" size={12} /></i>
        </div>
        <div className="eyebrow"><Icon name="sparkle" size={16} /> Um espaço de escuta e acolhimento</div>
        <h1>Um horário para<br /><em>cuidar de você.</em></h1>
        <p>{pro?.bio ?? `Escolha o melhor momento para conversar com ${professionalName.split(" ")[0]}. Sem ligações, sem espera e no seu ritmo.`}</p>
        <button className="return-link" onClick={onManage}><Icon name="calendar" size={18} /> Já tenho um agendamento</button>
      </section>

      <section className="booking-panel">
        <Stepper activeStep={step} />
        {step !== 4 && <div className="service-summary">
          <div className="service-icon"><Icon name="sparkle" /></div>
          <div><span>SERVIÇO ESCOLHIDO</span><strong>Consulta individual</strong><small>com {professionalName}</small></div>
          {pro?.session_price != null && <div className="service-price"><strong>{money(pro.session_price)}</strong><small>por consulta</small></div>}
        </div>}
        {step !== 4 && officeText(pro) && (
          <div className="info-strip"><Icon name="location" size={17} /><p><strong>Endereço do consultório</strong><span>{officeText(pro)}</span></p></div>
        )}

        {step === 2 && (
          <>
            <div className="calendar-head">
              <div>
                <h2>Escolha quando</h2>
                <p>{viewMonth ? monthYear(`${viewMonth}-01`) : "Sem horários"}</p>
              </div>
              <div className="month-controls">
                <button aria-label="Mês anterior" disabled={monthIndex <= 0} onClick={() => goToMonth(months[monthIndex - 1])}><Icon name="chevron" /></button>
                <button aria-label="Próximo mês" disabled={monthIndex < 0 || monthIndex >= months.length - 1} onClick={() => goToMonth(months[monthIndex + 1])}><Icon name="chevron" /></button>
              </div>
            </div>

            {loading && <p className="state-note">Carregando horários…</p>}
            {loadError && <ErrorNote action={<button className="text-action" onClick={() => void load()}>Tentar novamente</button>}>{loadError}</ErrorNote>}
            {!loading && !loadError && days.length === 0 && (
              <p className="state-note">{pro && !pro.accepting_bookings ? "A agenda está pausada no momento." : "Não há horários disponíveis no momento. Volte em breve."}</p>
            )}

            {days.length > 0 && (
              <>
                <div className="month-grid">
                  {["D", "S", "T", "Q", "Q", "S", "S"].map((w, i) => <span className="month-grid__wd" key={i}>{w}</span>)}
                  {monthCells.map((date, i) => date === null ? <i key={`e${i}`} /> : (
                    <button
                      key={date}
                      disabled={!slotsByDate.has(date)}
                      className={`${selectedDate === date ? "selected" : ""} ${date === todayISO() ? "today" : ""}`}
                      onClick={() => { setSelectedDate(date); setSelectedSlot(null); }}
                      title={slotsByDate.has(date) ? `${slotsByDate.get(date)} horários disponíveis` : "Sem horários"}
                    >
                      <strong>{dayNumber(date)}</strong>{slotsByDate.has(date) && <em />}
                    </button>
                  ))}
                </div>

                <div className="time-heading"><span>{selectedDate ? `Horários em ${dayLabel(selectedDate)}` : "Escolha um dia"}</span><small><i /> Horário de Brasília</small></div>
                <div className="time-grid">
                  {daySlots.map((slot) => (
                    <button key={slot.id} onClick={() => setSelectedSlot(slot)} className={selectedSlot?.id === slot.id ? "selected" : ""}>
                      {slot.start_time}{selectedSlot?.id === slot.id && <Icon name="check" size={15} />}
                    </button>
                  ))}
                </div>
                {selectedSlot && (
                  <div className="slot-place">
                    <p className="state-note"><Icon name="location" size={14} /> {locationText(selectedSlot)}</p>
                    {officeText(pro) && <p className="state-note"><Icon name="location" size={14} /> Endereço do consultório: {officeText(pro)}</p>}
                  </div>
                )}
              </>
            )}
            {submitError && <ErrorNote>{submitError}</ErrorNote>}

            <div className="booking-footer">
              {summary ?? <div><Icon name="calendar" /><p><span>Nenhum horário escolhido</span><strong>Selecione um horário</strong></p></div>}
              <Button disabled={!selectedSlot} onClick={() => setStep(3)}>Continuar <Icon name="arrow" size={18} /></Button>
            </div>
          </>
        )}

        {step === 3 && (
          <form className="client-form" onSubmit={(event) => { event.preventDefault(); if (accepted && client.name && client.email) void confirm(); }}>
            <div className="client-form__heading">
              <button type="button" onClick={() => setStep(2)} aria-label="Voltar"><Icon name="chevron" size={18} /></button>
              <div><h2>Conte um pouco sobre você</h2><p>Usaremos seus dados apenas para confirmar e lembrar sua consulta.</p></div>
            </div>
            <div className="client-form__grid">
              <label className="full-field">Nome completo
                <div className="client-field"><Icon name="user" size={18} /><input required value={client.name} onChange={(event) => setClient({ ...client, name: event.target.value })} placeholder="Como podemos chamar você?" /></div>
              </label>
              <label>E-mail
                <div className="client-field"><Icon name="mail" size={18} /><input required type="email" value={client.email} onChange={(event) => setClient({ ...client, email: event.target.value })} placeholder="voce@email.com" /></div>
              </label>
              <label>Celular
                <div className="client-field"><span>+55</span><input value={client.phone} onChange={(event) => setClient({ ...client, phone: event.target.value })} placeholder="(11) 99999-9999" /></div>
              </label>
              <label className="full-field">Gostaria de contar algo antes da consulta? <small>Opcional</small>
                <textarea value={client.notes} onChange={(event) => setClient({ ...client, notes: event.target.value })} placeholder="Escreva aqui, se você se sentir à vontade..." />
              </label>
            </div>
            <label className="consent-check">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              <i>{accepted && <Icon name="check" size={12} />}</i>
              <span>Concordo com a política de privacidade e autorizo o uso dos meus dados para este agendamento.</span>
            </label>
            {submitError && <ErrorNote>{submitError}</ErrorNote>}
            <div className="booking-footer form-footer">
              {summary}
              <Button type="submit" disabled={!accepted || !client.name || !client.email || submitting}>{submitting ? "Confirmando…" : "Confirmar agendamento"} <Icon name="arrow" size={18} /></Button>
            </div>
          </form>
        )}

        {step === 4 && booked && (
          <div className="booking-success">
            <div className="success-symbol"><Icon name="check" size={28} /></div>
            <span className="eyebrow">AGENDAMENTO CONFIRMADO</span>
            <h2>Está tudo certo, {booked.client_name.split(" ")[0]}.</h2>
            <p>Seu horário foi reservado. Guarde o código abaixo e use o e-mail <strong>{booked.client_email}</strong> para consultar seu agendamento.</p>
            <div className="appointment-ticket">
              <div className="ticket-date"><span>{monthName(booked.date).slice(0, 3).toUpperCase()}</span><strong>{dayNumber(booked.date)}</strong></div>
              <div className="ticket-info"><strong>{weekdayLong(booked.date)}, às {booked.start_time}</strong><span>Consulta com {booked.professional_name} · {duration(booked.start_time, booked.end_time)} minutos</span><small><Icon name="location" size={14} /> {locationText(booked)}</small></div>
              <div className="ticket-code"><span>CÓDIGO</span><strong>{booked.code}</strong></div>
            </div>
            <div className="info-strip info-strip--pix"><Icon name="pix" size={18} /><p><strong>Pagamento via Pix</strong><span>O pagamento é feito via Pix{booked.location_kind === "in_person" ? " no consultório" : ""}, no dia da consulta{booked.session_price != null ? ` · ${money(booked.session_price)}` : ""}.</span></p></div>
            {booked.location_kind === "in_person" && officeText(booked) && (
              <div className="info-strip"><Icon name="location" size={17} /><p><strong>Endereço do consultório</strong><span>{officeText(booked)}</span></p></div>
            )}
            <div className="success-actions">
              <Button onClick={() => void downloadIcs(`/public/appointments/${booked.code}/ics?email=${encodeURIComponent(booked.client_email)}`, booked.code)}><Icon name="plus" size={17} /> Adicionar ao calendário</Button>
              <Button variant="secondary" onClick={() => { setStep(2); setBooked(null); setAccepted(false); setClient({ name: user?.name ?? "", email: user?.email ?? "", phone: user?.phone ?? "", notes: "" }); void load(); }}>Fazer outro agendamento</Button>
            </div>
            <button className="manage-booking" onClick={onManage}>Gerenciar meu agendamento <Icon name="arrow" size={15} /></button>
          </div>
        )}
      </section>
    </main>
  );
}

const WEEKDAY_BUTTONS = [
  { label: "Seg", value: 1 }, { label: "Ter", value: 2 }, { label: "Qua", value: 3 }, { label: "Qui", value: 4 },
  { label: "Sex", value: 5 }, { label: "Sáb", value: 6 }, { label: "Dom", value: 0 },
];

function NewPeriodModal({ locations, onClose, onSaved, onError }: { locations: Location[]; onClose: () => void; onSaved: (created: number) => void; onError: (message: string) => void }) {
  const [selectedDays, setSelectedDays] = useState([1, 2, 3, 4, 5]);
  const [startDate, setStartDate] = useState(addDays(todayISO(), 1));
  const [endDate, setEndDate] = useState(addDays(todayISO(), 7));
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [interval, setInterval] = useState(60);
  const [locationId, setLocationId] = useState<number | undefined>(locations.find((l) => l.is_default)?.id ?? locations[0]?.id);
  const [saving, setSaving] = useState(false);
  const validPeriod = selectedDays.length > 0 && startTime < endTime && startDate <= endDate && locationId !== undefined;

  function toggleDay(value: number) {
    setSelectedDays((current) => current.includes(value) ? current.filter((day) => day !== value) : [...current, value]);
  }

  async function save() {
    setSaving(true);
    try {
      const result = await api.post<{ slots_created: number }>("/professional/periods", {
        start_date: startDate, end_date: endDate, weekdays: selectedDays, start_time: startTime, end_time: endTime,
        interval_minutes: interval, location_id: locationId,
      });
      onSaved(result.slots_created);
    } catch (e) {
      onError(errorText(e, "Não foi possível criar o período. Tente novamente."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop period-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="period-modal" role="dialog" aria-modal="true" aria-labelledby="period-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="period-modal__header">
          <div className="period-modal__symbol"><Icon name="calendar" /></div>
          <div><span>NOVA DISPONIBILIDADE</span><h2 id="period-title">Criar novo período</h2><p>Defina quando seus clientes poderão agendar.</p></div>
          <button onClick={onClose} aria-label="Fechar"><Icon name="close" /></button>
        </div>

        <div className="period-form">
          <div className="form-section">
            <div className="form-section__title"><span>1</span><div><strong>Período</strong><small>Escolha o intervalo de datas</small></div></div>
            <div className="form-row">
              <label>Data inicial<div className="form-control"><Icon name="calendar" size={17} /><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div></label>
              <label>Data final<div className="form-control"><Icon name="calendar" size={17} /><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div></label>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section__title"><span>2</span><div><strong>Dias de atendimento</strong><small>Selecione os dias que se repetem</small></div></div>
            <div className="weekday-picker" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
              {WEEKDAY_BUTTONS.map((day) => (
                <button key={day.value} className={selectedDays.includes(day.value) ? "selected" : ""} onClick={() => toggleDay(day.value)}>
                  <span>{day.label}</span>{selectedDays.includes(day.value) && <Icon name="check" size={13} />}
                </button>
              ))}
            </div>
          </div>

          <div className="form-section">
            <div className="form-section__title"><span>3</span><div><strong>Horários</strong><small>Configure o início, fim e intervalo</small></div></div>
            <div className="form-row form-row--three">
              <label>Começa às<div className="form-control"><Icon name="clock" size={17} /><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></div></label>
              <label>Termina às<div className="form-control"><Icon name="clock" size={17} /><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></div></label>
              <label>Intervalo<select value={interval} onChange={(event) => setInterval(Number(event.target.value))}><option value={30}>30 minutos</option><option value={50}>50 minutos</option><option value={60}>1 hora</option><option value={90}>1h30</option></select></label>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section__title"><span>4</span><div><strong>Local</strong><small>Onde acontecerão os atendimentos</small></div></div>
            <div className="period-location">
              {locations.map((item) => (
                <button key={item.id} className={locationId === item.id ? "selected" : ""} onClick={() => setLocationId(item.id)}>
                  <span><Icon name={item.kind === "online" ? "calendar" : "location"} size={18} /></span>
                  <p><strong>{item.name}</strong><small>{item.detail}</small></p>
                  <i>{locationId === item.id && <Icon name="check" size={11} />}</i>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="period-modal__footer">
          <div><Icon name="sparkle" size={17} /><p><strong>{selectedDays.length} dias da semana</strong><small>Os horários serão criados automaticamente</small></p></div>
          <div><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={!validPeriod || saving} onClick={() => void save()}>{saving ? "Criando…" : "Criar período"} <Icon name="arrow" size={17} /></Button></div>
        </div>
      </section>
    </div>
  );
}

function AdminView({ user }: { user: User }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [weekStart, setWeekStart] = useState(mondayOf(todayISO()));
  const [slots, setSlots] = useState<AdminSlot[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [rules, setRules] = useState({ min_notice_hours: 4, cancel_limit_hours: 4, session_minutes: 50 });
  const [office, setOffice] = useState({ address: "", city: "", price: "" });
  const [periodOpen, setPeriodOpen] = useState(false);
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [newTime, setNewTime] = useState("09:00");
  const [locationForm, setLocationForm] = useState<{ kind: "online" | "in_person"; name: string; detail: string } | null>(null);
  const { node: toastNode, notify, fail } = useToast();
  const { node: confirmNode, confirm } = useConfirm();

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = todayISO();

  async function refresh() {
    try {
      const [s, d, l, sl, ap] = await Promise.all([
        api.get<Settings>("/professional/settings"),
        api.get<Dashboard>("/professional/dashboard"),
        api.get<Location[]>("/professional/locations"),
        api.get<AdminSlot[]>(`/professional/slots?from=${weekStart}&to=${addDays(weekStart, 6)}`),
        api.get<Appointment[]>(`/appointments?status=confirmed&from=${addDays(today, -30)}`),
      ]);
      setSettings(s); setDashboard(d); setLocations(l.filter((x) => x.active)); setSlots(sl); setAppointments(ap);
      setRules({ min_notice_hours: s.min_notice_hours, cancel_limit_hours: s.cancel_limit_hours, session_minutes: s.session_minutes });
      setOffice({ address: s.office_address ?? "", city: s.office_city ?? "", price: s.session_price == null ? "" : String(s.session_price).replace(".", ",") });
    } catch (e) { fail(e); }
  }
  useEffect(() => { void refresh(); }, [weekStart]);

  async function run(action: () => Promise<unknown>, success?: string) {
    try { await action(); if (success) notify(success); await refresh(); } catch (e) { fail(e); }
  }

  const enabled = settings?.accepting_bookings ?? true;
  const upcoming = appointments.filter((a) => `${a.date} ${a.start_time}` >= nowStamp());
  const toClose = appointments.filter((a) => `${a.date} ${a.start_time}` < nowStamp());

  return (
    <main className="admin-page">
      <div className="admin-heading">
        <div><span className="eyebrow">AGENDA DE {user.name.toUpperCase()}</span><h1>Olá, {user.name.split(" ")[0]}.</h1><p>Libere horários, defina locais e deixe as regras trabalharem por você.</p></div>
        <Button onClick={() => setPeriodOpen(true)} disabled={locations.length === 0}><Icon name="plus" size={18} /> Novo período</Button>
      </div>

      <div className="admin-stats">
        <div><span className="stat-icon pink"><Icon name="calendar" /></span><p><small>CONSULTAS ESTA SEMANA</small><strong>{dashboard?.appointments_this_week ?? "–"}</strong><em>+ {dashboard?.new_appointments_7d ?? 0} novas</em></p></div>
        <div><span className="stat-icon blue"><Icon name="clock" /></span><p><small>HORÁRIOS LIVRES</small><strong>{dashboard?.free_slots_this_week ?? "–"}</strong><em>nesta semana</em></p></div>
        <div className="availability-control">
          <p><small>AGENDA ONLINE</small><strong>{enabled ? "Recebendo agendamentos" : "Agenda pausada"}</strong></p>
          <button onClick={() => void run(() => api.put("/professional/settings", { accepting_bookings: !enabled }))} className={`switch ${enabled ? "on" : ""}`} aria-label="Ativar agenda"><i /></button>
        </div>
      </div>

      <div className="admin-layout">
        <section className="week-card">
          <div className="week-header">
            <div><h2>Disponibilidade</h2><p>{dayNumber(weekDays[0])} {monthName(weekDays[0]).slice(0, 3)} — {dayNumber(weekDays[6])} {monthName(weekDays[6]).slice(0, 3)}</p></div>
            <div className="month-controls">
              <button aria-label="Semana anterior" onClick={() => setWeekStart(addDays(weekStart, -7))}><Icon name="chevron" /></button>
              <button aria-label="Próxima semana" onClick={() => setWeekStart(addDays(weekStart, 7))}><Icon name="chevron" /></button>
            </div>
          </div>
          <div className="week-grid" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
            {weekDays.map((date) => (
              <div className="week-column" key={date}>
                <div className={date === today ? "today" : ""}><span>{weekdayShort(date)}</span><strong>{dayNumber(date)}</strong></div>
                {slots.filter((s) => s.date === date).map((slot) => (
                  <span className="slot-row" key={slot.id}>
                    <button
                      className={slot.status === "booked" ? "booked" : slot.status === "blocked" ? "blocked" : ""}
                      disabled={slot.status === "booked"}
                      title={slot.status === "open" ? "Clique para bloquear" : slot.status === "blocked" ? "Clique para liberar" : slot.client_name ?? ""}
                      onClick={() => void run(() => api.patch(`/professional/slots/${slot.id}`, { status: slot.status === "open" ? "blocked" : "open" }))}
                    >
                      {slot.start_time}
                      {slot.status === "booked" && <small>{slot.client_name?.split(" ")[0]}</small>}
                      {slot.status === "blocked" && <small>Bloqueado</small>}
                    </button>
                    {slot.status !== "booked" && <button className="slot-del" aria-label="Remover horário" onClick={() => void run(() => api.del(`/professional/slots/${slot.id}`))}><Icon name="close" size={12} /></button>}
                  </span>
                ))}
                {addingDate === date ? (
                  <span className="slot-add">
                    <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
                    <button onClick={() => void run(async () => { await api.post("/professional/slots", { date, start_time: newTime }); setAddingDate(null); }, "Horário criado")}><Icon name="check" size={14} /></button>
                  </span>
                ) : (
                  <button className="add-slot" disabled={date < today} onClick={() => setAddingDate(date)}><Icon name="plus" size={16} /> horário</button>
                )}
              </div>
            ))}
          </div>
        </section>

        <aside className="admin-aside">
          <section>
            <div className="aside-title"><span><Icon name="location" /></span><div><h3>Local da consulta</h3><p>Local padrão dos novos horários</p></div></div>
            <div className="option-list">
              {locations.map((item) => (
                <button key={item.id} onClick={() => void run(() => api.put(`/professional/locations/${item.id}`, { is_default: true }))} className={item.is_default ? "selected" : ""}>
                  <span><Icon name={item.kind === "online" ? "calendar" : "location"} size={18} /></span><p><strong>{item.name}</strong><small>{item.detail}</small></p><i />
                </button>
              ))}
            </div>
            {locationForm ? (
              <form className="inline-form" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.post("/professional/locations", locationForm); setLocationForm(null); }, "Local adicionado"); }}>
                <select value={locationForm.kind} onChange={(e) => setLocationForm({ ...locationForm, kind: e.target.value as "online" | "in_person" })}><option value="online">Online</option><option value="in_person">Presencial</option></select>
                <input required placeholder="Nome (ex.: Consultório)" value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} />
                <input placeholder="Detalhe (ex.: Sala 204)" value={locationForm.detail} onChange={(e) => setLocationForm({ ...locationForm, detail: e.target.value })} />
                <div><Button type="submit">Salvar</Button><Button variant="ghost" onClick={() => setLocationForm(null)}>Cancelar</Button></div>
              </form>
            ) : (
              <button className="text-action" onClick={() => setLocationForm({ kind: "in_person", name: "", detail: "" })}><Icon name="plus" size={16} /> Adicionar local</button>
            )}
          </section>

          <section>
            <div className="aside-title"><span><Icon name="sparkle" /></span><div><h3>Consultório e valor</h3><p>Exibidos ao cliente no agendamento</p></div></div>
            <form className="inline-form" onSubmit={(e) => {
              e.preventDefault();
              const price = office.price.trim() === "" ? null : Number(office.price.replace(/\./g, "").replace(",", "."));
              if (price !== null && Number.isNaN(price)) { fail(new Error("Informe um valor válido, por exemplo 150,00.")); return; }
              void run(() => api.put("/professional/settings", { office_address: office.address, office_city: office.city, session_price: price }), "Dados do consultório salvos");
            }}>
              <label>Endereço do consultório<input placeholder="Rua, número, sala" value={office.address} onChange={(e) => setOffice({ ...office, address: e.target.value })} /></label>
              <label>Cidade / UF<input placeholder="Pouso Alegre - MG" value={office.city} onChange={(e) => setOffice({ ...office, city: e.target.value })} /></label>
              <label>Valor da consulta (R$)<input inputMode="decimal" placeholder="150,00" value={office.price} onChange={(e) => setOffice({ ...office, price: e.target.value })} /></label>
              <div><Button type="submit">Salvar</Button></div>
            </form>
          </section>

          <section>
            <div className="aside-title"><span><Icon name="settings" /></span><div><h3>Regras da agenda</h3><p>Aplicadas automaticamente</p></div></div>
            <button className="rule-summary" onClick={() => setRuleOpen(!ruleOpen)}>
              <p><strong>Antecedência mínima</strong><small>{settings?.min_notice_hours ?? "–"} horas para novos agendamentos</small></p><Icon name="chevron" size={18} />
            </button>
            <button className="rule-summary" onClick={() => setRuleOpen(!ruleOpen)}>
              <p><strong>Cancelamentos</strong><small>Até {settings?.cancel_limit_hours ?? "–"} horas antes</small></p><Icon name="chevron" size={18} />
            </button>
            <button className="rule-summary" onClick={() => setRuleOpen(!ruleOpen)}>
              <p><strong>Duração da consulta</strong><small>{settings?.session_minutes ?? "–"} minutos</small></p><Icon name="chevron" size={18} />
            </button>
            {ruleOpen && (
              <form className="inline-form" onSubmit={(e) => { e.preventDefault(); void run(() => api.put("/professional/settings", rules), "Regras salvas"); }}>
                <label>Antecedência mínima (horas)<input type="number" min={0} value={rules.min_notice_hours} onChange={(e) => setRules({ ...rules, min_notice_hours: Number(e.target.value) })} /></label>
                <label>Cancelamento até (horas antes)<input type="number" min={0} value={rules.cancel_limit_hours} onChange={(e) => setRules({ ...rules, cancel_limit_hours: Number(e.target.value) })} /></label>
                <label>Duração (minutos)<input type="number" min={10} value={rules.session_minutes} onChange={(e) => setRules({ ...rules, session_minutes: Number(e.target.value) })} /></label>
                <div><Button type="submit">Salvar regras</Button></div>
              </form>
            )}
          </section>
        </aside>
      </div>

      <section className="appt-section">
        <h2>Próximas consultas</h2>
        {upcoming.length === 0 && <p className="state-note">Nenhuma consulta agendada.</p>}
        {upcoming.map((a) => <AppointmentRow key={a.id} appt={a} onCancel={async () => {
          const ok = await confirm({ title: "Cancelar esta consulta?", text: `A consulta de ${a.client_name} em ${dayLabel(a.date)}, às ${a.start_time}, será cancelada e o horário voltará a ficar disponível.`, confirmLabel: "Sim, cancelar", cancelLabel: "Manter consulta" });
          if (ok) await run(() => api.post(`/appointments/${a.id}/cancel`, {}), "Consulta cancelada");
        }} />)}
        {toClose.length > 0 && <>
          <h2>Finalizar atendimentos</h2>
          {toClose.map((a) => (
            <AppointmentRow key={a.id} appt={a}>
              <Button variant="secondary" onClick={() => void run(() => api.patch(`/professional/appointments/${a.id}/status`, { status: "completed" }), "Consulta marcada como realizada")}>Realizada</Button>
              <Button variant="ghost" onClick={() => void run(() => api.patch(`/professional/appointments/${a.id}/status`, { status: "no_show" }), "Falta registrada")}>Não compareceu</Button>
            </AppointmentRow>
          ))}
        </>}
      </section>

      {periodOpen && <NewPeriodModal locations={locations} onClose={() => setPeriodOpen(false)} onError={(m) => fail(new Error(m))} onSaved={(n) => { setPeriodOpen(false); notify("Período criado com sucesso", `${n} horários já estão disponíveis na agenda.`); void refresh(); }} />}
      {toastNode}
      {confirmNode}
    </main>
  );
}

const nowStamp = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 16).replace("T", " ");

function AppointmentRow({ appt, onCancel, children }: { appt: Appointment; onCancel?: () => void; children?: ReactNode }) {
  return (
    <div className="appt-card">
      <div className="ticket-date"><span>{monthName(appt.date).slice(0, 3).toUpperCase()}</span><strong>{dayNumber(appt.date)}</strong></div>
      <div className="appt-info">
        <strong>{weekdayLong(appt.date)}, {appt.start_time} · {appt.client_name}</strong>
        <span>{appt.client_email}{appt.client_phone ? ` · ${appt.client_phone}` : ""}</span>
        <small>{locationText(appt)} · {appt.code}{appt.client_notes ? ` · “${appt.client_notes}”` : ""}</small>
      </div>
      <div className="appt-actions">{children}{onCancel && <Button variant="secondary" onClick={onCancel}>Cancelar</Button>}</div>
    </div>
  );
}

async function authenticate(path: "/auth/login" | "/auth/register", payload: Record<string, string>) {
  const result = await api.post<{ user: User; token: string }>(path, payload);
  setToken(result.token);
  return result.user;
}

function ProfessionalAccess({ onAuthorized, onBack }: { onAuthorized: (user: User) => void; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const user = await authenticate("/auth/login", { email, password });
      if (user.role !== "professional") { setToken(null); throw new Error("Esta conta não tem acesso à área profissional."); }
      onAuthorized(user);
    } catch (e) {
      setError(errorText(e, "Não foi possível entrar agora. Tente novamente."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="access-page">
      <section className="access-story">
        <div className="access-story__glow" />
        <Logo />
        <div className="access-quote">
          <span><Icon name="sparkle" size={16} /> SEU ESPAÇO DE TRABALHO</span>
          <h1>Sua agenda,<br />mais <em>leve.</em></h1>
          <p>Organize seu tempo com clareza e cuide do que realmente importa: seus atendimentos.</p>
        </div>
        <div className="access-benefits">
          <span><Icon name="check" size={14} /> Acesso seguro</span>
          <span><Icon name="check" size={14} /> Seus dados sempre protegidos</span>
        </div>
      </section>

      <section className="access-form-area">
        <button className="access-back" onClick={onBack}><Icon name="chevron" size={17} /> Voltar</button>
        <form className="access-card" onSubmit={(e) => void submit(e)}>
          <div className="access-icon"><Icon name="user" /></div>
          <span className="eyebrow">ÁREA ADMINISTRATIVA</span>
          <h2>Entre na sua agenda</h2>
          <p>Informe seu e-mail profissional e sua senha para acessar.</p>
          <label htmlFor="professional-email">E-mail profissional</label>
          <div className="email-field"><Icon name="mail" size={19} /><input id="professional-email" type="email" required placeholder="nome@consultorio.com.br" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <label htmlFor="professional-password">Senha</label>
          <div className="email-field"><Icon name="settings" size={19} /><input id="professional-password" type="password" required placeholder="Sua senha" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button className="full" type="submit" disabled={loading}>{loading ? "Entrando…" : "Entrar"} <Icon name="arrow" size={18} /></Button>
        </form>
      </section>
    </main>
  );
}

function LoginModal({ onClose, onAuthorized }: { onClose: () => void; onAuthorized: (user: User) => void }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api.post<{ resend_after_seconds: number }>("/auth/client/request-code", { email });
      setCooldown(res.resend_after_seconds);
      setDigits(["", "", "", "", "", ""]);
      setStep("code");
      window.setTimeout(() => refs.current[0]?.focus(), 50);
    } catch (e) {
      setError(errorText(e, "Não foi possível enviar o código. Tente novamente."));
    } finally {
      setLoading(false);
    }
  }

  async function verify(code: string) {
    setLoading(true);
    setError("");
    try {
      const result = await api.post<{ user: User; token: string }>("/auth/client/verify-code", { email, code });
      setToken(result.token);
      onAuthorized(result.user);
    } catch (e) {
      setError(errorText(e, "Não foi possível validar o código. Tente novamente."));
      setLoading(false);
    }
  }

  function updateDigit(index: number, value: string) {
    const entered = value.replace(/\D/g, "");
    if (entered.length > 1) {
      const next = entered.slice(0, 6).padEnd(6, " ").split("").map((d) => d.trim());
      setDigits(next);
      if (next.every(Boolean)) void verify(next.join(""));
      else refs.current[Math.min(entered.length, 5)]?.focus();
      return;
    }
    const next = [...digits];
    next[index] = entered;
    setDigits(next);
    if (entered && index < 5) refs.current[index + 1]?.focus();
    if (next.every(Boolean)) void verify(next.join(""));
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="login-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button>
        <div className="modal-symbol"><Icon name={step === "code" ? "mail" : "user"} /></div>
        {step === "email" ? (
          <form onSubmit={(e) => void requestCode(e)}>
            <span className="eyebrow">ÁREA DO CLIENTE</span>
            <h2>Que bom ter você de volta.</h2>
            <p>Digite o e-mail usado no agendamento. Vamos enviar um código de acesso seguro — sem senha para lembrar.</p>
            <label>E-mail</label>
            <div className="email-field"><Icon name="mail" size={19} /><input type="email" required autoFocus placeholder="voce@email.com" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button className="full" type="submit" disabled={loading}>{loading ? "Enviando…" : "Enviar código"} <Icon name="arrow" size={18} /></Button>
            <small>Ao continuar, você concorda com os termos de uso e privacidade.</small>
          </form>
        ) : (
          <>
            <span className="eyebrow">CÓDIGO ENVIADO</span>
            <h2>Confira seu e-mail.</h2>
            <p>Enviamos um código de 6 dígitos para <strong>{email}</strong>. Ele vale por 10 minutos.</p>
            <div className="code-fields">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => { refs.current[index] = element; }}
                  value={digit}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-label={`Dígito ${index + 1}`}
                  disabled={loading}
                  onChange={(event) => updateDigit(index, event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Backspace" && !digit && index > 0) refs.current[index - 1]?.focus(); }}
                />
              ))}
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button className="full" disabled={loading || digits.some((d) => !d)} onClick={() => void verify(digits.join(""))}>{loading ? "Validando…" : "Acessar meus horários"} <Icon name="arrow" size={18} /></Button>
            <button className="resend" disabled={cooldown > 0 || loading} onClick={() => void requestCode()}>
              Não recebeu? Reenviar código{cooldown > 0 && <span> · disponível em {cooldown}s</span>}
            </button>
            <button className="change-email" onClick={() => { setStep("email"); setError(""); }}>Usar outro e-mail</button>
          </>
        )}
      </section>
    </div>
  );
}

const STATUS_LABEL: Record<Appointment["status"], string> = { confirmed: "Confirmada", cancelled: "Cancelada", completed: "Realizada", no_show: "Não compareceu" };

function ClientView({ user, onBook }: { user: User; onBook: () => void }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [options, setOptions] = useState<FreeSlot[]>([]);
  const [chosen, setChosen] = useState("");
  const [limitHours, setLimitHours] = useState(4);
  const { node: toastNode, notify, fail } = useToast();
  const { node: confirmNode, confirm } = useConfirm();

  async function refresh() {
    try { setAppointments(await api.get<Appointment[]>("/appointments")); } catch (e) { fail(e); } finally { setLoading(false); }
  }
  useEffect(() => {
    void refresh();
    api.get<PublicProfessional>(`/public/professionals/${PROFESSIONAL_SLUG}`).then((p) => setLimitHours(p.cancel_limit_hours)).catch(() => undefined);
  }, []);

  async function openReschedule(appt: Appointment) {
    try {
      const from = todayISO();
      const res = await api.get<{ days: SlotDay[] }>(`/public/professionals/${PROFESSIONAL_SLUG}/slots?from=${from}&to=${addDays(from, SLOTS_WINDOW_DAYS)}`);
      setOptions(res.days.flatMap((d) => d.slots));
      setChosen("");
      setRescheduling(appt);
    } catch (e) { fail(e); }
  }

  async function act(action: () => Promise<unknown>, success: string) {
    try { await action(); notify(success); setRescheduling(null); await refresh(); } catch (e) { fail(e); }
  }

  const stamp = nowStamp();
  const locked = (a: Appointment) => new Date(`${a.date}T${a.start_time}:00-03:00`).getTime() - Date.now() < limitHours * 3600e3;
  const upcoming = appointments.filter((a) => a.status === "confirmed" && `${a.date} ${a.start_time}` >= stamp);
  const history = appointments.filter((a) => !upcoming.includes(a)).reverse();

  return (
    <main className="admin-page client-page">
      <div className="admin-heading">
        <div><span className="eyebrow">MEUS HORÁRIOS</span><h1>Olá, {user.name.split(" ")[0]}.</h1><p>Acompanhe, remarque ou cancele suas consultas — remarcações e cancelamentos até {limitHours} horas antes.</p></div>
        <Button onClick={onBook}><Icon name="plus" size={18} /> Novo agendamento</Button>
      </div>

      <section className="appt-section">
        <h2>Próximas consultas</h2>
        {loading && <p className="state-note">Carregando…</p>}
        {!loading && upcoming.length === 0 && <p className="state-note">Você não tem consultas agendadas.</p>}
        {upcoming.map((a) => (
          <div className="appt-card" key={a.id}>
            <div className="ticket-date"><span>{monthName(a.date).slice(0, 3).toUpperCase()}</span><strong>{dayNumber(a.date)}</strong></div>
            <div className="appt-info">
              <strong>{weekdayLong(a.date)}, {a.start_time} · {a.professional_name}</strong>
              <span>{locationText(a)}{a.location_kind === "in_person" && officeText(a) ? ` · ${officeText(a)}` : ""}</span>
              <small>Código {a.code} · Pagamento via Pix no dia da consulta{a.session_price != null ? ` (${money(a.session_price)})` : ""}</small>
              {locked(a) && <small className="lock-note"><Icon name="clock" size={12} /> Faltam menos de {limitHours} horas: não é mais possível remarcar ou cancelar por aqui.</small>}
              {rescheduling?.id === a.id && (
                <div className="inline-form">
                  <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
                    <option value="">Escolha o novo horário</option>
                    {[...new Set(options.map((s) => s.date))].map((d) => (
                      <optgroup key={d} label={dayLabel(d)}>
                        {options.filter((s) => s.date === d).map((s) => <option key={s.id} value={s.id}>{s.start_time}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <div>
                    <Button disabled={!chosen} onClick={() => void act(() => api.post(`/appointments/${a.id}/reschedule`, { slot_id: Number(chosen) }), "Consulta remarcada")}>Confirmar</Button>
                    <Button variant="ghost" onClick={() => setRescheduling(null)}>Voltar</Button>
                  </div>
                </div>
              )}
            </div>
            <div className="appt-actions">
              <Button variant="secondary" onClick={() => void downloadIcs(`/appointments/${a.id}/ics`, a.code).catch(fail)}>Calendário</Button>
              <Button variant="secondary" disabled={locked(a)} onClick={() => void openReschedule(a)}>Remarcar</Button>
              <Button variant="secondary" disabled={locked(a)} onClick={async () => {
                const ok = await confirm({ title: "Cancelar sua consulta?", text: `Sua consulta de ${dayLabel(a.date)}, às ${a.start_time}, será cancelada. Você poderá agendar um novo horário quando quiser.`, confirmLabel: "Sim, cancelar", cancelLabel: "Manter consulta" });
                if (ok) await act(() => api.post(`/appointments/${a.id}/cancel`, {}), "Consulta cancelada");
              }}>Cancelar</Button>
            </div>
          </div>
        ))}

        {history.length > 0 && <>
          <h2>Histórico</h2>
          {history.map((a) => (
            <div className="appt-card appt-card--past" key={a.id}>
              <div className="ticket-date"><span>{monthName(a.date).slice(0, 3).toUpperCase()}</span><strong>{dayNumber(a.date)}</strong></div>
              <div className="appt-info"><strong>{weekdayLong(a.date)}, {a.start_time} · {a.professional_name}</strong><span>{STATUS_LABEL[a.status]}</span><small>Código {a.code}</small></div>
            </div>
          ))}
        </>}
      </section>
      {toastNode}
      {confirmNode}
    </main>
  );
}

function AdminShell({ user }: { user: User }) {
  const read = () => { try { return localStorage.getItem("agenda-admin-tab") === "finance" ? "finance" : "agenda"; } catch { return "agenda"; } };
  const [tab, setTab] = useState<"agenda" | "finance">(read);
  const choose = (next: "agenda" | "finance") => { setTab(next); try { localStorage.setItem("agenda-admin-tab", next); } catch { /* storage indisponível */ } };
  return (
    <>
      <div className="admin-tabs">
        <div role="tablist" aria-label="Área administrativa">
          <button role="tab" aria-selected={tab === "agenda"} className={tab === "agenda" ? "active" : ""} onClick={() => choose("agenda")}><Icon name="calendar" size={17} /> Agenda</button>
          <button role="tab" aria-selected={tab === "finance"} className={tab === "finance" ? "active" : ""} onClick={() => choose("finance")}><Icon name="wallet" size={17} /> Financeiro</button>
        </div>
      </div>
      {tab === "agenda" ? <AdminView user={user} /> : <FinanceView />}
    </>
  );
}

export default function App() {
  const [view, setView] = useState<"booking" | "access" | "admin" | "mine">("booking");
  const [loginOpen, setLoginOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => { document.title = "Ana Beatriz Lima"; }, []);

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    api.get<User>("/auth/me").then(setUser).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  function authorized(next: User) {
    setUser(next);
    setLoginOpen(false);
    setView(next.role === "professional" ? "admin" : "mine");
  }

  useEffect(() => {
    const expired = () => { setToken(null); setUser(null); setView("booking"); setLoginOpen(true); };
    window.addEventListener("agenda:session-expired", expired);
    return () => window.removeEventListener("agenda:session-expired", expired);
  }, []);

  function logout() {
    setToken(null);
    setUser(null);
    setView("booking");
  }

  const goMine = () => { if (user?.role === "client") setView("mine"); else if (user) setView("admin"); else setLoginOpen(true); };
  const goProfessional = () => setView(user?.role === "professional" ? "admin" : "access");
  const resolved = view === "admin" && user?.role !== "professional" ? "access" : view === "mine" && user?.role !== "client" ? "booking" : view;

  return (
    <div className="app-shell">
      <header>
        <Logo />
        <nav>
          <button className={resolved === "booking" ? "active" : ""} onClick={() => setView("booking")}>Agendar</button>
          <button className={resolved === "mine" ? "active" : ""} onClick={goMine}>Meus horários</button>
        </nav>
        <div className="header-actions">
          {user && <Button variant="secondary" onClick={logout}><Icon name="user" size={18} /> {user.name.split(" ")[0]} · Sair</Button>}
          <button
            className={`admin-link ${resolved === "access" || resolved === "admin" ? "active" : ""}`}
            onClick={goProfessional}
            aria-label="Área administrativa"
            title="Área administrativa"
          ><Icon name="lock" size={16} /></button>
        </div>
      </header>
      {ready && resolved === "booking" && <BookingView user={user} onManage={goMine} />}
      {ready && resolved === "access" && <ProfessionalAccess onAuthorized={authorized} onBack={() => setView("booking")} />}
      {ready && resolved === "admin" && user && <AdminShell user={user} />}
      {ready && resolved === "mine" && user && <ClientView user={user} onBook={() => setView("booking")} />}
      <footer><Logo compact /><p>Agendamentos que respeitam o seu tempo.</p><span>Privacidade · Termos · Ajuda</span></footer>
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} onAuthorized={authorized} />}
    </div>
  );
}
