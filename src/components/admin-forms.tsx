"use client";

import { useActionState } from "react";

import { INPUT_CLASS, Notice, buttonClass } from "@/components/ui";
import type { AdminFormState } from "@/server/admin/actions";
import {
  createCategoryAction,
  createProductAction,
  deleteCategoryAction,
  setProductActiveAction,
  updateCategoryAction,
  updateOrderStatusAction,
  updateProductAction,
} from "@/server/admin/actions";
import type { OrderStatus } from "@/server/models/order";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;

  return (
    <p id={id} className="mt-1 text-sm font-medium text-danger">
      {message}
    </p>
  );
}

function TextField({
  name,
  label,
  state,
  defaultValue,
  hint,
  type = "text",
  step,
}: {
  name: string;
  label: string;
  state: AdminFormState;
  defaultValue?: string | number;
  hint?: string;
  type?: "text" | "number";
  step?: string;
}) {
  const error = state.fieldErrors?.[name];
  const describedBy = [error ? `${name}-error` : null, hint ? `${name}-hint` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <label htmlFor={name} className="mb-1 block font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        step={step}
        min={type === "number" ? "0" : undefined}
        defaultValue={state.values?.[name] ?? defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={INPUT_CLASS}
      />
      {hint ? (
        <p id={`${name}-hint`} className="mt-1 text-sm text-ink-soft">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${name}-error`} message={error} />
    </div>
  );
}

export type ProductFormValues = {
  id: string;
  name: string;
  slug: string;
  brand: string;
  description: string;
  image: string;
  category: string;
  price: number;
  countInStock: number;
};

export function ProductForm({
  product,
  categories,
}: {
  product?: ProductFormValues;
  categories: { id: string; name: string }[];
}) {
  const action = product
    ? updateProductAction.bind(null, product.id)
    : createProductAction;
  const [state, formAction, isPending] = useActionState<AdminFormState, FormData>(
    action,
    {},
  );
  const categoryError = state.fieldErrors?.category;
  const descriptionError = state.fieldErrors?.description;

  return (
    <form action={formAction} className="max-w-2xl space-y-4" noValidate>
      {state.error ? <Notice>{state.error}</Notice> : null}
      {state.saved ? <Notice tone="success">{state.saved}</Notice> : null}

      <TextField name="name" label="Name" state={state} defaultValue={product?.name} />
      <TextField
        name="slug"
        label="Slug"
        state={state}
        defaultValue={product?.slug}
        hint="The product's address in the shop. Leave blank to build it from the name."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="brand" label="Brand" state={state} defaultValue={product?.brand} />

        <div>
          <label htmlFor="category" className="mb-1 block font-medium">
            Department
          </label>
          <select
            id="category"
            name="category"
            defaultValue={state.values?.category ?? product?.category ?? ""}
            aria-invalid={categoryError ? true : undefined}
            aria-describedby={categoryError ? "category-error" : undefined}
            className={INPUT_CLASS}
          >
            <option value="">Choose a department</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <FieldError id="category-error" message={categoryError} />
        </div>

        <TextField
          name="price"
          label="Price (USD)"
          type="number"
          step="0.01"
          state={state}
          defaultValue={product?.price}
        />
        <TextField
          name="countInStock"
          label="Stock"
          type="number"
          step="1"
          state={state}
          defaultValue={product?.countInStock}
        />
      </div>

      <TextField
        name="image"
        label="Image"
        state={state}
        defaultValue={product?.image}
        hint="A path like /images/products/name.svg, or an https:// URL."
      />

      <div>
        <label htmlFor="description" className="mb-1 block font-medium">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          defaultValue={state.values?.description ?? product?.description}
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={descriptionError ? "description-error" : undefined}
          className={INPUT_CLASS}
        />
        <FieldError id="description-error" message={descriptionError} />
      </div>

      <button type="submit" disabled={isPending} className={buttonClass()}>
        {isPending ? "Saving…" : product ? "Save product" : "Add product"}
      </button>
    </form>
  );
}

export function ProductActiveToggle({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  return (
    <form action={() => setProductActiveAction(id, !isActive)}>
      <button
        type="submit"
        className={buttonClass({ variant: "secondary", size: "sm" })}
      >
        {isActive ? "Withdraw" : "Return to sale"}
      </button>
    </form>
  );
}

export function NewCategoryForm() {
  const [state, formAction, isPending] = useActionState(createCategoryAction, {});

  return (
    <form action={formAction} className="max-w-md space-y-4" noValidate>
      <h2 className="text-xl font-bold">Add a department</h2>
      {state.error ? <Notice>{state.error}</Notice> : null}
      {state.saved ? <Notice tone="success">{state.saved}</Notice> : null}

      <TextField name="name" label="Name" state={state} />
      <TextField name="description" label="Description (optional)" state={state} />

      <button type="submit" disabled={isPending} className={buttonClass()}>
        {isPending ? "Adding…" : "Add department"}
      </button>
    </form>
  );
}

export function CategoryRow({
  id,
  name,
  slug,
  description,
  productCount,
  swatchClass,
}: {
  id: string;
  name: string;
  slug: string;
  description?: string;
  productCount: number;
  swatchClass: string;
}) {
  const [saveState, saveAction, saving] = useActionState(
    updateCategoryAction.bind(null, id),
    {},
  );
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteCategoryAction.bind(null, id),
    {},
  );
  const nameError = saveState.fieldErrors?.name;
  const slugError = saveState.fieldErrors?.slug;

  return (
    <li className="space-y-2 py-4">
      <form action={saveAction} className="grid items-start gap-3 sm:grid-cols-[auto_1fr_1fr_1fr_auto]" noValidate>
        <span aria-hidden className={`mt-3 size-5 ${swatchClass}`} />

        <div>
          <label htmlFor={`name-${id}`} className="sr-only">
            Name of {name}
          </label>
          <input
            id={`name-${id}`}
            name="name"
            defaultValue={name}
            aria-invalid={nameError ? true : undefined}
            className={INPUT_CLASS}
          />
          <FieldError id={`name-${id}-error`} message={nameError} />
        </div>

        <div>
          <label htmlFor={`slug-${id}`} className="sr-only">
            Slug of {name}
          </label>
          <input
            id={`slug-${id}`}
            name="slug"
            defaultValue={slug}
            aria-invalid={slugError ? true : undefined}
            className={INPUT_CLASS}
          />
          <FieldError id={`slug-${id}-error`} message={slugError} />
        </div>

        <div>
          <label htmlFor={`description-${id}`} className="sr-only">
            Description of {name}
          </label>
          <input
            id={`description-${id}`}
            name="description"
            defaultValue={description}
            className={INPUT_CLASS}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className={buttonClass({ variant: "secondary" })}
        >
          {saving ? "Saving…" : "Save"}
          <span className="sr-only"> {name}</span>
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-4 text-sm text-ink-soft">
        <span className="price">
          {productCount} product{productCount === 1 ? "" : "s"}
        </span>
        <form action={deleteAction}>
          <button
            type="submit"
            disabled={deleting}
            className="font-medium text-danger underline underline-offset-4"
          >
            {deleting ? "Deleting…" : "Delete"}
            <span className="sr-only"> {name}</span>
          </button>
        </form>
      </div>

      {saveState.error ? <Notice>{saveState.error}</Notice> : null}
      {saveState.saved ? <Notice tone="success">{saveState.saved}</Notice> : null}
      {deleteState.error ? <Notice>{deleteState.error}</Notice> : null}
    </li>
  );
}

const ACTION_LABELS: Record<OrderStatus, string> = {
  pending: "Reopen",
  paid: "Mark paid",
  shipped: "Mark shipped",
  delivered: "Mark delivered",
  cancelled: "Cancel order",
};

/** One button per allowed next status, so an invalid move cannot be offered. */
export function OrderActions({
  id,
  number,
  nextStatuses,
}: {
  id: string;
  number: string;
  nextStatuses: readonly OrderStatus[];
}) {
  const [state, formAction, isPending] = useActionState(
    updateOrderStatusAction.bind(null, id),
    {},
  );

  if (nextStatuses.length === 0) {
    return <span className="text-ink-soft">No actions</span>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {nextStatuses.map((status) => (
        <button
          key={status}
          type="submit"
          name="status"
          value={status}
          disabled={isPending}
          aria-label={`${ACTION_LABELS[status]}: order ${number}`}
          className={buttonClass({
            variant: status === "cancelled" ? "secondary" : "primary",
            size: "sm",
          })}
        >
          {ACTION_LABELS[status]}
        </button>
      ))}
      {state.error ? <Notice>{state.error}</Notice> : null}
    </form>
  );
}
