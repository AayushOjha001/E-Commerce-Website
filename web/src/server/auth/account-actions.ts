"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { registerSchema } from "@/server/auth/schemas";
import { getCurrentUser, startSession } from "@/server/auth/session";
import { verifyCredentials } from "@/server/auth/verify-credentials";
import { isServiceError } from "@/server/services/errors";
import { updateUserProfile } from "@/server/services/users";

export type AccountFormState = {
  error?: string;
  saved?: string;
  fieldErrors?: Record<string, string>;
};

function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    errors[String(issue.path[0] ?? "_")] ??= issue.message;
  }
  return errors;
}

const profileSchema = registerSchema.pick({ name: true, email: true });

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: registerSchema.shape.password,
});

export async function updateProfileAction(
  _previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Faccount");

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields",
      fieldErrors: fieldErrors(parsed.error),
    };
  }

  try {
    await updateUserProfile(user.id, parsed.data);
  } catch (error) {
    if (isServiceError(error)) return { error: error.message };
    throw error;
  }

  // The header shows the name.
  revalidatePath("/", "layout");
  return { saved: "Profile saved" };
}

/**
 * Changes the password, after proving knowledge of the current one.
 *
 * A live session is not proof enough: this is the one change that locks everyone
 * else out, so a borrowed laptop or a stolen cookie must not be able to make it.
 */
export async function changePasswordAction(
  _previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Faccount");

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields",
      fieldErrors: fieldErrors(parsed.error),
    };
  }

  const verified = await verifyCredentials(
    user.email,
    parsed.data.currentPassword,
  );
  if (!verified) {
    return {
      error: "Check the highlighted fields",
      fieldErrors: { currentPassword: "That password is not correct" },
    };
  }

  await updateUserProfile(user.id, { password: parsed.data.newPassword });

  // A password change bumps the token version, ending every session. Reissue
  // this one so the person making the change stays signed in.
  await startSession(user.id);

  return { saved: "Password changed. Other devices have been signed out." };
}
