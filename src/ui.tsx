import { useEffect, useState, type ReactNode } from "react";
import { errorText } from "./api";

export type IconName =
  | "arrow"
  | "calendar"
  | "check"
  | "chevron"
  | "clock"
  | "close"
  | "location"
  | "lock"
  | "wallet"
  | "download"
  | "trash"
  | "chart"
  | "pix"
  | "mail"
  | "plus"
  | "settings"
  | "sparkle"
  | "user";

const icons: Record<IconName, ReactNode> = {
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M3 10h18M16 15h2" /></>,
  download: <><path d="M12 4v11M7 11l5 5 5-5" /><path d="M4 20h16" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="3" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  pix: <path d="m12 3 9 9-9 9-9-9 9-9Zm0 5-4 4 4 4 4-4-4-4Z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.82 2.82-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.96 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.82-2.82.06-.06A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88L4.2 7.06l2.82-2.82.06.06A1.7 1.7 0 0 0 8.96 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15.04 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.82 2.82-.06.06A1.7 1.7 0 0 0 19.4 9c.15.63.75 1 1.52 1H21v4h-.08c-.77 0-1.37.37-1.52 1Z" /></>,
  sparkle: <><path d="M12 3c.4 4.6 2.4 6.6 7 7-4.6.4-6.6 2.4-7 7-.4-4.6-2.4-6.6-7-7 4.6-.4 6.6-2.4 7-7Z" /><path d="M19 16c.16 1.84.96 2.64 2.8 2.8-1.84.16-2.64.96-2.8 2.8-.16-1.84-.96-2.64-2.8-2.8 1.84-.16 2.64-.96 2.8-2.8Z" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.7-4.2 3.3-6 8-6s7.3 1.8 8 6" /></>,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  );
}


export function Button({
  children,
  variant = "primary",
  onClick,
  className = "",
  type = "button",
  disabled = false,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`button button--${variant} ${className}`}>{children}</button>;
}


export function ErrorNote({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="error-note" role="alert">
      <span><Icon name="close" size={13} /></span>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ title: string; text?: string; error?: boolean } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const node = toast && (
    <div className="toast period-toast" style={toast.error ? { background: "#7a2e48" } : undefined}>
      <span><Icon name={toast.error ? "close" : "check"} /></span>
      <div><strong>{toast.title}</strong>{toast.text && <p>{toast.text}</p>}</div>
      <button onClick={() => setToast(null)} aria-label="Fechar"><Icon name="close" /></button>
    </div>
  );
  return { node, notify: (title: string, text?: string) => setToast({ title, text }), fail: (e: unknown) => setToast({ title: "Não foi possível concluir a ação", text: errorText(e, "Algo deu errado. Tente novamente."), error: true }) };
}

export type ConfirmOptions = { title: string; text: string; confirmLabel: string; cancelLabel: string };

// Diálogo de confirmação do próprio app (substitui window.confirm).
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const answer = (ok: boolean) => { state?.resolve(ok); setState(null); };

  useEffect(() => {
    if (!state) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { state.resolve(false); setState(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  const node = state && (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => answer(false)}>
      <section className="login-modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-symbol"><Icon name="close" /></div>
        <h2 id="confirm-title">{state.title}</h2>
        <p>{state.text}</p>
        <div className="confirm-actions">
          <Button variant="secondary" onClick={() => answer(false)}>{state.cancelLabel}</Button>
          <Button className="button--danger" onClick={() => answer(true)}>{state.confirmLabel}</Button>
        </div>
      </section>
    </div>
  );
  return { node, confirm: (options: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...options, resolve })) };
}

