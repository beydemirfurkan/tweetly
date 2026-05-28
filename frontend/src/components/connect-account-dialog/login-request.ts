import type {
  AccountConnectBody,
  AccountReauthBody,
  ApiFetch,
  LoginJobAccepted,
} from '@/lib/api';
import type { FormState, Mode } from './types';

/**
 * Build the connect-vs-reauth payload and POST it. The caller handles
 * status-coded responses (409 already-connected, 429 cooldown) and surfaces
 * everything else as an error message — so we don't translate or wrap
 * ApiError here.
 */
export async function sendLoginRequest(args: {
  form: FormState;
  mode: Mode;
  targetAccountId?: string;
  apiFetch: ApiFetch;
}): Promise<LoginJobAccepted> {
  const payload =
    args.mode === 'connect'
      ? ({
          username: args.form.username.trim(),
          email: args.form.email.trim() || null,
          password: args.form.password,
          totpSecret: args.form.totpSecret.trim() || null,
          saveTotpSecret: args.form.saveTotpSecret,
        } satisfies AccountConnectBody)
      : ({
          password: args.form.password,
          totpSecret: args.form.totpSecret.trim() || null,
          saveTotpSecret: args.form.saveTotpSecret,
          email: args.form.email.trim() || null,
        } satisfies AccountReauthBody);

  const path =
    args.mode === 'connect'
      ? '/api/v1/accounts/connect'
      : `/api/v1/accounts/${encodeURIComponent(args.targetAccountId ?? '')}/reauth`;

  return args.apiFetch<LoginJobAccepted>(path, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
