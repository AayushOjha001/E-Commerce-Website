import {
  readJsonBody,
  jsonOk,
  withErrorHandling,
} from "@/server/api/respond";
import { updateProfileSchema } from "@/server/auth/schemas";
import { requireUser, startSession } from "@/server/auth/session";
import { verifyCredentials } from "@/server/auth/verify-credentials";
import { forbidden } from "@/server/services/errors";
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
  const { currentPassword, ...changes } = updateProfileSchema.parse(body);

  // Login is by email and there is no password reset, so either change can lock
  // the owner out. A live session alone must not be able to do that.
  const changesEmail =
    changes.email !== undefined &&
    changes.email.trim().toLowerCase() !== current.email;

  if (changes.password !== undefined || changesEmail) {
    const verified =
      currentPassword !== undefined &&
      (await verifyCredentials(current.email, currentPassword));

    if (!verified) {
      throw forbidden("Your current password is required for this change");
    }
  }

  const user = await updateUserProfile(current.id, changes);

  // Reissue the cookie so this session carries the new token version. A password
  // change bumps it, invalidating every *other* session, and without this the
  // caller would sign itself out with its own request.
  await startSession(user.id);

  return jsonOk({ user });
});
