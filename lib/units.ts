/**
 * Per-unit pricing for a product.
 *
 * A product is stocked in a base unit (factor 1, price = selling_price). It can
 * also be sold in larger units (e.g. a Box of 12) at their own price. `factor`
 * is how many BASE stock units one of this unit consumes - selling 1 Box with
 * factor 12 decrements stock by 12.
 */
export interface ProductUnit {
  name: string;
  price: number;
  factor: number;
}

/**
 * Parse the product's stored `units` JSON into structured pricing.
 * Backwards-compatible: a legacy array of plain unit-name strings is upgraded
 * to base-priced entries. Always guarantees at least the base unit.
 */
export function parseProductUnits(json: string | null | undefined, basePrice: number, baseUnit: string): ProductUnit[] {
  const base: ProductUnit = { name: baseUnit || 'Unit', price: basePrice, factor: 1 };
  if (!json) return [base];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr) || arr.length === 0) return [base];
    const parsed: ProductUnit[] = arr.map((e: unknown) =>
      typeof e === 'string'
        ? { name: e, price: basePrice, factor: 1 }
        : {
            name: String((e as ProductUnit).name ?? baseUnit),
            price: Number((e as ProductUnit).price) || basePrice,
            factor: Number((e as ProductUnit).factor) || 1,
          }
    );
    // Ensure a factor-1 base unit exists
    if (!parsed.some((u) => u.factor === 1)) parsed.unshift(base);
    return parsed;
  } catch {
    return [base];
  }
}

export function serializeProductUnits(units: ProductUnit[]): string | null {
  if (!units.length) return null;
  return JSON.stringify(units.map((u) => ({ name: u.name, price: u.price, factor: u.factor })));
}
