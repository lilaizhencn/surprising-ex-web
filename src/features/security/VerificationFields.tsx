import { Button, Field } from "../../components/ui/Primitives"
import { t } from "../../i18n"
export function VerificationFields({
  email,
  totp,
  onEmail,
  onTotp,
  mfaEnabled,
  sending,
  disabled,
  onSend,
}: {
  readonly email: string
  readonly totp: string
  readonly onEmail: (value: string) => void
  readonly onTotp: (value: string) => void
  readonly mfaEnabled: boolean
  readonly sending: boolean
  readonly disabled: boolean
  readonly onSend: () => void
}) {
  return (
    <>
      <div className="security-dialog-code">
        <Field label={t("Email code")}>
          <input
            aria-label={t("Email code")}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={email}
            disabled={disabled}
            onChange={(event) => onEmail(event.target.value)}
          />
        </Field>
        <Button tone="outline" disabled={disabled} loading={sending} onClick={onSend}>
          {t("Send code")}
        </Button>
      </div>
      {mfaEnabled ? (
        <Field label={t("Authenticator code")}>
          <input
            aria-label={t("Authenticator code")}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={totp}
            disabled={disabled}
            onChange={(event) => onTotp(event.target.value)}
          />
        </Field>
      ) : null}
    </>
  )
}
