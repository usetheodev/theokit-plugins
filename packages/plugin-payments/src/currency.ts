/**
 * @theokit/plugin-payments — currency helpers.
 *
 * Per plan p6-plugin-payments v1.0 § Phase 2 / T2.4.
 * Mirrors `references/next.js/examples/with-stripe-typescript/utils/stripe-helpers.ts:1-30`
 * — currency-aware amount conversion for zero-decimal (JPY) vs decimal (USD/EUR/etc) currencies.
 */

/**
 * Convert an amount to the integer unit Stripe expects.
 *
 * Stripe requires integer cents for decimal currencies (USD 1.50 → 150) but
 * integer units for zero-decimal currencies (JPY 1500 → 1500). This helper
 * uses `Intl.NumberFormat` introspection to detect which mode applies.
 */
export function formatAmountForStripe(amount: number, currency: string): number {
  const numberFormat = new Intl.NumberFormat(["en-US"], {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
  });
  const parts = numberFormat.formatToParts(amount);
  let zeroDecimalCurrency = true;
  for (const part of parts) {
    if (part.type === "decimal") {
      zeroDecimalCurrency = false;
    }
  }
  return zeroDecimalCurrency ? amount : Math.round(amount * 100);
}

/**
 * Format an amount for human display using the consumer's locale + currency.
 *
 * Returns a localized string (e.g., `"$1.50"` for USD, `"¥1,500"` for JPY).
 */
export function formatAmountForDisplay(amount: number, currency: string): string {
  const numberFormat = new Intl.NumberFormat(["en-US"], {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
  });
  return numberFormat.format(amount);
}
