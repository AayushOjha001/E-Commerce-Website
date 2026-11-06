import {
  readJsonBody,
  jsonOk,
  withErrorHandling,
} from "@/server/api/respond";
import { updateProfileSchema } from "@/server/auth/schemas";
import { requireUser, startSession } from "@/server/auth/session";
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

  // Reissue the cookie so this session carries the new token version. A password
  // change bumps it, invalidating every *other* session, and without this the
  // caller would sign itself out with its own request.
  await startSession(user.id);

  return jsonOk({ user });
});
