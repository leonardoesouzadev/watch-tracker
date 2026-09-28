export function suspiciousReasons(
  item: { title: string; price: { value: string; currency: string } | null; priceType?: string | null; buyingOptions?: string[] },
  toBRL?: (price: { value: string; currency: string }) => number | null
): string[]
