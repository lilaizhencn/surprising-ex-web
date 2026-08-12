import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type UiButtonVariant = "primary" | "secondary" | "quiet" | "danger";
type UiStatusTone = "positive" | "warning" | "negative" | "neutral" | "info";
type UiAlertTone = "success" | "error" | "info";
type UiSurfaceTone = "base" | "raised" | "focus" | "disabled";

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

export function UiButton({
  variant = "secondary",
  busy = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: UiButtonVariant; busy?: boolean }) {
  return (
    <button
      {...props}
      className={joinClassNames("ui-button", `ui-button-${variant}`, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? <span className="ui-button-progress" aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}

export function UiCard({ surface = "base", className, children, ...props }: HTMLAttributes<HTMLElement> & { surface?: UiSurfaceTone }) {
  return <section {...props} className={joinClassNames("ui-card", `ui-card-${surface}`, className)}>{children}</section>;
}

export function UiField({
  label,
  hint,
  error,
  required = false,
  children,
  className
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={joinClassNames("ui-field", className)}>
      <span className="ui-field-label">{label}{required ? <em aria-hidden="true"> *</em> : null}</span>
      {children}
      {error ? <span className="ui-field-message ui-field-error" role="alert">{error}</span> : hint ? <span className="ui-field-message">{hint}</span> : null}
    </label>
  );
}

export function UiStatusBadge({ tone = "neutral", children }: { tone?: UiStatusTone; children: ReactNode }) {
  return <span className={`ui-status-badge ui-status-${tone}`}><span aria-hidden="true" />{children}</span>;
}

export function UiEmptyState({ icon, title, description, action }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return <div className="ui-state ui-empty-state">{icon ? <span className="ui-state-icon" aria-hidden="true">{icon}</span> : null}<strong>{title}</strong>{description ? <p>{description}</p> : null}{action ? <div className="ui-state-action">{action}</div> : null}</div>;
}

export function UiLoadingState({ label }: { label: ReactNode }) {
  return <div className="ui-state ui-loading-state" role="status" aria-live="polite" aria-busy="true"><span className="ui-loading-orb" aria-hidden="true" /><span>{label}</span></div>;
}

export function UiSkeleton({ className }: { className?: string }) {
  return <span className={joinClassNames("ui-skeleton", className)} aria-hidden="true" />;
}

export function UiErrorState({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return <div className="ui-state ui-error-state" role="alert"><span className="ui-state-icon" aria-hidden="true">!</span><strong>{title}</strong>{description ? <p>{description}</p> : null}{action ? <div className="ui-state-action">{action}</div> : null}</div>;
}

export function UiAlert({ tone = "info", className, children }: { tone?: UiAlertTone; className?: string; children: ReactNode }) {
  return <div className={joinClassNames(`ui-alert ui-alert-${tone}`, className)} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}
