import type { ReactNode } from "react";

/**
 * Shared primitives. Radius appears on controls only, by role: tiles and bands
 * are flat colour fields, not cards (docs/agent/DESIGN.md).
 */

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const BUTTON_VARIANTS = {
  primary: "bg-cobalt text-white hover:bg-cobalt-deep",
  secondary: "bg-ink/10 text-ink hover:bg-ink/20",
  danger: "bg-danger text-white hover:bg-danger/85",
} as const;

const BUTTON_SIZES = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2.5",
  lg: "px-6 py-3.5 text-lg",
} as const;

export function buttonClass({
  variant = "primary",
  size = "md",
  className = "",
}: {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  className?: string;
} = {}): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`.trim();
}

export const INPUT_CLASS =
  "w-full rounded-md bg-white px-3 py-2.5 text-ink shadow-[inset_0_0_0_1.5px_var(--color-ink-soft)] outline-none placeholder:text-ink-soft focus:shadow-[inset_0_0_0_2px_var(--color-cobalt)] aria-[invalid=true]:shadow-[inset_0_0_0_2px_var(--color-danger)]";

export const LINK_CLASS =
  "font-medium text-cobalt underline underline-offset-4 hover:text-cobalt-deep";

export function PageTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h1 className={`display text-3xl sm:text-5xl ${className}`}>{children}</h1>
  );
}

export function Notice({
  tone = "danger",
  children,
}: {
  tone?: "danger" | "success";
  children: ReactNode;
}) {
  const tones = {
    danger: "bg-danger-wash text-danger",
    success: "bg-success-wash text-success",
  };

  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={`rounded-md px-4 py-3 text-sm font-medium ${tones[tone]}`}
    >
      {children}
    </p>
  );
}
