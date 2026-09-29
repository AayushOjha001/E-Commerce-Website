import bcrypt from "bcryptjs";

import { findUserForLogin } from "@/server/services/users";

/**
 * A real bcrypt hash of a throwaway value.
 *
 * Compared against when no account matches, so an unknown email costs roughly
 * the same as a wrong password. Without it, "no such user" returns in about a
 * millisecond while a wrong password spends ~100ms in bcrypt, and the
 * difference is a reliable oracle for which emails have accounts — the
 * identical *response* bodies would not hide it.
 */
const DUMMY_HASH = bcrypt.hashSync("no-such-account-placeholder", 10);

export type VerifiedLogin = Awaited<ReturnType<typeof findUserForLogin>>;

/**
 * Looks a user up and checks the password, or returns null.
 *
 * Callers must not distinguish the two failure modes in what they return.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<NonNullable<VerifiedLogin> | null> {
  const user = await findUserForLogin(email);

  if (!user) {
    // Burn the same work rather than returning early.
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }

  return (await user.matchPassword(password)) ? user : null;
}
