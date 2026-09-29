import {
  readJsonBody,
  jsonOk,
  withErrorHandling,
} from "@/server/api/respond";
import { updateProfileSchema } from "@/server/auth/schemas";
import { requireUser, setSessionCookie } from "@/server/auth/session";
import { updateUserProfile } from "@/server/services/users";

// Ports GET /api/users/profile (audit R4).
export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  return jsonOk({ user });
});

// New: the legacy app had no way to update a profile at all.
export const PATCH = withErrorHandling(async (request: Request) => {
  const current = await requireUser();
  const body = await readJsonBody(request);
  const input = updateProfileSchema.parse(body);

  const user = await updateUserProfile(current.id, input);

  // Reissue the cookie so its claims match the updated user. The role cannot
  // change here, but reissuing keeps token and record from drifting apart.
  await setSessionCookie({ userId: user.id, role: user.role });

  return jsonOk({ user });
});
