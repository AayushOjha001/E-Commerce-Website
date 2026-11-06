import { readJsonBody, jsonOk, withErrorHandling } from "@/server/api/respond";
import { registerSchema } from "@/server/auth/schemas";
import { startSession } from "@/server/auth/session";
import { registerCustomer } from "@/server/services/users";

// Ports POST /api/users/register (audit R2).
export const POST = withErrorHandling(async (request: Request) => {
  const body = await readJsonBody(request);
  const input = registerSchema.parse(body);

  // registerCustomer, not createUser: its type cannot carry a role, so spreading
  // a request body in here can never grant admin.
  const user = await registerCustomer(input);

  // Signed in on success. The legacy endpoint returned the JWT in the JSON body
  // for the client to stash in localStorage (audit B17); it now goes out as an
  // httpOnly cookie the page cannot read.
  await startSession(user.id);

  return jsonOk({ user }, 201);
});
