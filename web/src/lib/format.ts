const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Formats an amount for display, always with cents so prices line up. */
export function formatPrice(amount: number): string {
  return priceFormatter.format(amount);
}

/** Formats an amount for a sentence: "$100", but "$9.99" when it has cents. */
export function formatPriceInText(amount: number): string {
  return Number.isInteger(amount)
    ? `$${amount.toLocaleString("en-US")}`
    : formatPrice(amount);
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** Formats a date. Fixed to UTC so server and client render the same text. */
export function formatDate(date: Date | string): string {
  return dateFormatter.format(new Date(date));
}

/** "1 product", "3 products". */
export function pluralise(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}
