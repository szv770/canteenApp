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
