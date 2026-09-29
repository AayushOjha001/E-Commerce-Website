import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthForm } from "./auth-form";
import type { AuthFormState } from "@/server/auth/actions";

const FIELDS = [
  { name: "email", label: "Email", type: "email" as const, autoComplete: "email" },
  {
    name: "password",
    label: "Password",
    type: "password" as const,
    autoComplete: "current-password",
  },
];

function renderForm(
  action: (state: AuthFormState, data: FormData) => Promise<AuthFormState>,
  next = "/",
) {
  return render(
    <AuthForm
      title="Sign in"
      submitLabel="Sign in"
      pendingLabel="Signing in…"
      fields={FIELDS}
      action={action}
      next={next}
      footer={{ prompt: "New here?", linkLabel: "Register", href: "/register" }}
    />,
  );
}

describe("AuthForm", () => {
  it("renders the title, inputs and submit button", () => {
    renderForm(async () => ({}));

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("carries the redirect destination in a hidden field", () => {
    const { container } = renderForm(async () => ({}), "/checkout");

    const hidden = container.querySelector<HTMLInputElement>(
      'input[name="next"]',
    );
    expect(hidden).toHaveValue("/checkout");
  });

  it("shows a form-level error as an alert", async () => {
    // useActionState surfaces the returned state after the action resolves.
    const action = vi.fn(async () => ({ error: "Invalid email or password" }));
    const { container } = renderForm(action);

    container.querySelector("form")!.requestSubmit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Invalid email or password");
  });

  it("shows per-field errors and links them to the input for screen readers", async () => {
    const action = vi.fn(async () => ({
      error: "Please check the form",
      fieldErrors: { email: "Enter a valid email address" },
    }));
    const { container } = renderForm(action);

    container.querySelector("form")!.requestSubmit();

    await screen.findByText("Enter a valid email address");

    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("aria-invalid", "true");
    const describedBy = email.getAttribute("aria-describedby");
    expect(describedBy).toBe("email-error");
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      "Enter a valid email address",
    );
  });

  it("keeps what was typed after a failed submit", async () => {
    const action = vi.fn(async () => ({
      error: "Invalid email or password",
      values: { email: "ada@example.com" },
    }));
    const { container } = renderForm(action);

    container.querySelector("form")!.requestSubmit();

    await screen.findByRole("alert");
    // Re-query: the input is re-rendered with the echoed value.
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
  });

  it("never echoes the password back into the DOM", async () => {
    const action = vi.fn(async () => ({
      error: "Invalid email or password",
      values: { email: "ada@example.com" },
    }));
    const { container } = renderForm(action);

    container.querySelector("form")!.requestSubmit();
    await screen.findByRole("alert");

    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(container.innerHTML).not.toMatch(/correct-horse/);
  });

  it("disables the button and shows the pending label while submitting", async () => {
    let resolve!: (state: AuthFormState) => void;
    const action = vi.fn(
      () => new Promise<AuthFormState>((r) => (resolve = r)),
    );
    const { container } = renderForm(action);

    container.querySelector("form")!.requestSubmit();

    const pending = await screen.findByRole("button", { name: "Signing in…" });
    expect(pending).toBeDisabled();

    resolve({});
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled(),
    );
  });

  it("renders the footer link", () => {
    renderForm(async () => ({}));

    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute(
      "href",
      "/register",
    );
  });
});
