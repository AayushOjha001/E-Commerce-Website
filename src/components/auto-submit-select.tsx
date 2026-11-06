"use client";

import type { ComponentProps } from "react";

/**
 * A select that submits its form on change.
 *
 * The form still has a real submit button, so filtering works before this
 * hydrates or with scripts off. This only saves the extra click.
 */
export function AutoSubmitSelect(props: ComponentProps<"select">) {
  return (
    <select
      {...props}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
    />
  );
}
