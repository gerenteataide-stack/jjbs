export const hairSizes = ["P", "M", "G", "EX"] as const;

export type HairSize = (typeof hairSizes)[number];
export type HairSizePrices = Partial<Record<HairSize, number | null>>;

export function isHairSize(value: unknown): value is HairSize {
  return typeof value === "string" && hairSizes.some((size) => size === value);
}

export function priceForHairSize(prices: HairSizePrices | null | undefined, size: HairSize, fallback: number | null) {
  return prices && Object.hasOwn(prices, size) ? prices[size] ?? null : fallback;
}

export function formatHairServicePrice(
  service: { sizePrices?: HairSizePrices | null; priceCents: number | null; priceType: string },
  size: HairSize,
) {
  const price = priceForHairSize(service.sizePrices, size, service.priceCents);
  if (price === null) return "Sob consulta";
  const amount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price / 100);
  return service.priceType === "starting_at" ? `A partir de ${amount}` : amount;
}
