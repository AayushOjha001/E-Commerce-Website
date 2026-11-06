/**
 * Upper bound per line, so one request cannot reserve the whole catalog.
 *
 * In its own module because the cart page needs it too, and the cart service
 * imports Mongoose, which must not reach the browser.
 */
export const MAX_QTY_PER_ITEM = 99;
