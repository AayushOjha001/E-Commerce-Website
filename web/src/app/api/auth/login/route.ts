import { readJsonBody, jsonOk, withErrorHandling } from "@/server/api/respond";
import { loginSchema } from "@/server/auth/schemas";
import { setSessionCookie } from "@/server/auth/session";
import { ServiceError } from "@/server/services/errors";
import { findUserForLogin, toPublicUser } from "@/server/services/users";

// Ports POST /api/users/login (audit R3).
export const POST = withErrorHandling(async (request: Request) => {
  const body = await readJsonBody(request);
  const { email, password } = loginSchema.parse(body);

  const user = await findUserForLogin(email);

  // One message and one code for "no such user" and "wrong password" alike, so
  // the endpoint cannot be used to enumerate which emails have accounts.
  // (Also fixes the legacy typo: "Invalid credintials".)
  const invalid = new ServiceError("forbidden", "Invalid email or password");

  if (!user) {
    throw invalid;
  }
  if (!(await user.matchPassword(password))) {
    throw invalid;
  }

  const publicUser = toPublicUser(user);
  await setSessionCookie({ userId: publicUser.id, role: publicUser.role });

  return jsonOk({ user: publicUser });
});
