export type Rates = Record<string, number>
export interface LandedCost {
  /** "commission": lot in Brazil (price + commission); "import": lot abroad. Absent on old saved lots. */
  kind?: 'commission' | 'import'
  premiumRate?: number
  total: number
  lines: { label: string; value: number }[]
  notes: string[]
}
export const BUYER_PREMIUM: Record<string, number>
export function toBRL(price: { value: string; currency: string } | null, rates: Rates | null | undefined): number | null
export function landedCostText(cost: LandedCost): { suffix: string; heading: string; disclaimer: string }
export function landedCost(
  item: { source: string; price: { value: string; currency: string } | null; priceType?: string | null },
  rates: Rates | null | undefined
): LandedCost | null
