import { readJsonBody, jsonOk, withErrorHandling } from "@/server/api/respond";
import { loginSchema } from "@/server/auth/schemas";
import { startSession } from "@/server/auth/session";
import { attemptLogin } from "@/server/auth/login";
import { clientIp } from "@/server/auth/rate-limit";
import { ServiceError } from "@/server/services/errors";
import { toPublicUser } from "@/server/services/users";

// Ports POST /api/users/login (audit R3).
export const POST = withErrorHandling(async (request: Request) => {
  const body = await readJsonBody(request);
  const { email, password } = loginSchema.parse(body);

  // One message, one code and the same amount of work for "no such user" and
  // "wrong password" alike, so the endpoint cannot be used to enumerate which
  // emails have accounts. (Also fixes the legacy typo: "Invalid credintials".)
  const user = await attemptLogin(email, password, clientIp(request.headers));

  if (!user) {
    throw new ServiceError("unauthenticated", "Invalid email or password");
  }

  const publicUser = toPublicUser(user);
  await startSession(publicUser.id);

  return jsonOk({ user: publicUser });
});
