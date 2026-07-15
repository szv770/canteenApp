import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

export function roundCash(amount: number): number {
  return Math.ceil(amount / 0.05) * 0.05
}

export function calcCCFee(subtotal: number, feePercent: number): number {
  return Math.round(subtotal * (feePercent / 100) * 100) / 100
}

export function bochurIdFromNumber(n: number): string {
  return `B${String(n).padStart(3, '0')}`
}

export function calcChange(tendered: number, total: number): number {
  return Math.max(0, Math.round((tendered - total) * 100) / 100)
}

// Contextual cash-tendered quick buttons: the exact total, the next whole
// dollar, and round-ups to common bill sizes — instead of a fixed
// $1/$5/$10/$20/$50/$100 row that rarely matches the actual total.
export function quickCashOptions(total: number): number[] {
  const t = Math.max(0.01, Math.round(total * 100) / 100)
  const opts = new Set<number>()
  opts.add(t)
  opts.add(Math.ceil(t))
  ;[5, 10, 20, 50, 100].forEach(mult => opts.add(Math.ceil(t / mult) * mult))
  return Array.from(opts)
    .filter(v => v > 0)
    .sort((a, b) => a - b)
    .slice(0, 6)
}

export function applyDiscount(
  price: number,
  discountType: 'percentage' | 'cost_price' | 'fixed' | 'none',
  discountValue: number,
  costPrice?: number
): number {
  switch (discountType) {
    case 'percentage':
      return Math.max(0, price * (1 - discountValue / 100))
    case 'cost_price':
      return costPrice ?? price
    case 'fixed':
      return Math.max(0, price - discountValue)
    case 'none':
    default:
      return price
  }
}
