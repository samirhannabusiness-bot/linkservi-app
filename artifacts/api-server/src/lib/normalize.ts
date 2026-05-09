import { logger } from "./logger";

const IS_DEV = process.env.NODE_ENV !== "production";

type ProductLike = {
  id?: number | null;
  listingType?: string | null;
  rentalType?: string | null;
  productType?: string | null;
  [key: string]: unknown;
};

/**
 * Ensure rentalType / productType always have safe defaults before sending to
 * any client. Treats null / undefined as "missing" and applies:
 *   - rental products → rentalType defaults to "tool"
 *   - sale products   → productType defaults to "general"
 *
 * Returns a new object (does not mutate the input).
 * In development, logs a warning when a value is backfilled.
 */
export function normalizeProduct<T extends ProductLike>(p: T): T {
  const isRental = p.listingType === "rental";

  if (isRental && !p.rentalType) {
    if (IS_DEV) logger.warn({ productId: p.id }, "[normalizeProduct] Missing rentalType — defaulting to 'tool'");
    return { ...p, rentalType: "tool" };
  }

  if (!isRental && !p.productType) {
    if (IS_DEV) logger.warn({ productId: p.id }, "[normalizeProduct] Missing productType — defaulting to 'general'");
    return { ...p, productType: "general" };
  }

  return p;
}
