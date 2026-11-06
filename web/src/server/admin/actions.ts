"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";

import { requireAdmin } from "@/server/auth/session";
import { isServiceError } from "@/server/services/errors";
import {
  categoryInputSchema,
  createCategory,
  createProduct,
  deleteCategory,
  productInputSchema,
  setProductActive,
  updateCategory,
  updateProduct,
} from "@/server/services/catalog-admin";
import {
  isOrderStatus,
  updateOrderStatus,
} from "@/server/services/orders-admin";

/**
 * Server actions behind the admin pages.
 *
 * A server action is a public POST endpoint whether or not a page links to it,
 * so every one checks `requireAdmin()` itself. The admin layout and proxy.ts do
 * not protect these.
 */

export type AdminFormState = {
  error?: string;
  saved?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

/** Catalog data shows on the storefront, so a change refreshes everything. */
function refreshShop(): void {
  revalidatePath("/", "layout");
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    errors[String(issue.path[0] ?? "_")] ??= issue.message;
  }
  return errors;
}

function mapServiceError(
  error: unknown,
  values?: Record<string, string>,
): AdminFormState {
  if (isServiceError(error)) {
    return { error: error.message, fieldErrors: error.details, values };
  }
  throw error;
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function productValues(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    ["name", "slug", "brand", "description", "image", "category", "price", "countInStock"].map(
      (name) => [name, text(formData, name)],
    ),
  );
}

/** Blank numbers must fail validation rather than become 0. */
const toNumber = (value: string) => (value === "" ? Number.NaN : Number(value));

function parseProduct(values: Record<string, string>) {
  return productInputSchema.safeParse({
    ...values,
    slug: values.slug || undefined,
    price: toNumber(values.price),
    countInStock: toNumber(values.countInStock),
  });
}

export async function createProductAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const values = productValues(formData);
  const parsed = parseProduct(values);
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields",
      fieldErrors: fieldErrors(parsed.error),
      values,
    };
  }

  try {
    await createProduct(parsed.data);
  } catch (error) {
    return mapServiceError(error, values);
  }

  refreshShop();
  redirect("/admin/products");
}

export async function updateProductAction(
  id: string,
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const values = productValues(formData);
  const parsed = parseProduct(values);
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields",
      fieldErrors: fieldErrors(parsed.error),
      values,
    };
  }

  try {
    await updateProduct(id, parsed.data);
  } catch (error) {
    return mapServiceError(error, values);
  }

  refreshShop();
  return { saved: "Product saved", values };
}

export async function setProductActiveAction(
  id: string,
  isActive: boolean,
): Promise<void> {
  await requireAdmin();

  await setProductActive(id, isActive);
  refreshShop();
}

export async function createCategoryAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = categoryInputSchema.safeParse({
    name: text(formData, "name"),
    slug: text(formData, "slug") || undefined,
    description: text(formData, "description") || undefined,
  });
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields",
      fieldErrors: fieldErrors(parsed.error),
    };
  }

  try {
    await createCategory(parsed.data);
  } catch (error) {
    return mapServiceError(error);
  }

  refreshShop();
  return { saved: "Department added" };
}

export async function updateCategoryAction(
  id: string,
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = categoryInputSchema.safeParse({
    name: text(formData, "name"),
    slug: text(formData, "slug") || undefined,
    description: text(formData, "description") || undefined,
  });
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields",
      fieldErrors: fieldErrors(parsed.error),
    };
  }

  try {
    await updateCategory(id, parsed.data);
  } catch (error) {
    return mapServiceError(error);
  }

  refreshShop();
  return { saved: "Department saved" };
}

export async function deleteCategoryAction(id: string): Promise<AdminFormState> {
  await requireAdmin();

  try {
    await deleteCategory(id);
  } catch (error) {
    return mapServiceError(error);
  }

  refreshShop();
  return {};
}

export async function updateOrderStatusAction(
  id: string,
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const status = formData.get("status");
  if (!isOrderStatus(status)) return { error: "Choose a status" };

  try {
    await updateOrderStatus(id, status);
  } catch (error) {
    return mapServiceError(error);
  }

  // Cancelling returns stock, so the storefront changes too.
  refreshShop();
  return {};
}
