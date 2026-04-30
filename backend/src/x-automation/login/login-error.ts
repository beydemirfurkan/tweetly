import type { LoginJobFailureReason } from './login.types';

/**
 * Internal control-flow error thrown by login step methods. Caught at the top
 * level of XLoginService.run() and converted into an XLoginFailure result.
 *
 * `detail` is operator-facing — it MUST NOT contain the password, TOTP secret,
 * email, or anything user-typed beyond the username (which already appears in
 * service logs).
 */
export class LoginFlowError extends Error {
  constructor(
    public readonly reason: LoginJobFailureReason,
    public readonly detail: string,
  ) {
    super(`${reason}: ${detail}`);
    this.name = 'LoginFlowError';
  }
}
