import {
  assertLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
} from "./rate-limit";
import { verifyCredentials } from "./verify-credentials";

/**
 * Checks a login, within the rate limit. Returns the user, or null.
 *
 * The one path every login takes, so the form and the API cannot end up with
 * different limits. Throws `rate_limited` before doing any password work, which
 * also stops a flood of attempts from burning bcrypt time.
 */
export async function attemptLogin(
  email: string,
  password: string,
  ip: string,
) {
  assertLoginAllowed(email, ip);

  const user = await verifyCredentials(email, password);

  if (user) {
    recordLoginSuccess(email, ip);
  } else {
    recordLoginFailure(email, ip);
  }

  return user;
}
