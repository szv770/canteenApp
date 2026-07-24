// Shared pricing logic for the Preorders feature (vendor + in-house pre-made
// items ordered ahead of time — see CLAUDE.md). Used by both the POS and
// public-link order-placement routes so price computation only lives in one
// place and can never be dictated by the client.

export interface PreorderPricingProduct {
  price: number
  cost_price: number | null
  staff_price: number | null
}

export interface PreorderPricingAccountType {
  is_staff_pricing_tier: boolean
  discount_type: 'none' | 'percentage' | 'cost_price' | 'fixed'
  discount_value: number
}

export interface PreorderUnitPriceResult {
  unitPrice: number
  staffPricingApplied: boolean
}

// Resolution order per item:
//   1. Explicit staff_price override on the product (only for staff-tier account
//      types) — can be 0 for donated/free items.
//   2. Otherwise fall back to the bochur's account type discount rule
//      (percentage / cost_price), same engine as regular POS checkout.
//   3. Otherwise the plain product price.
// 'fixed' account-type discounts are order-level elsewhere in the app and
// don't apply per preorder line item.
export function computePreorderUnitPrice(
  product: PreorderPricingProduct,
  accountType: PreorderPricingAccountType | null
): PreorderUnitPriceResult {
  const isStaff = !!accountType?.is_staff_pricing_tier

  if (isStaff && product.staff_price != null) {
    return { unitPrice: Math.max(0, Math.round(product.staff_price * 100) / 100), staffPricingApplied: true }
  }

  if (accountType && accountType.discount_type !== 'none') {
    if (accountType.discount_type === 'percentage' && accountType.discount_value > 0) {
      const discounted = Math.round(product.price * (1 - accountType.discount_value / 100) * 100) / 100
      return { unitPrice: Math.max(0, discounted), staffPricingApplied: isStaff }
    }
    if (accountType.discount_type === 'cost_price') {
      if (product.cost_price != null && product.cost_price > 0) {
        return { unitPrice: product.cost_price, staffPricingApplied: isStaff }
      }
      if (accountType.discount_value > 0) {
        const discounted = Math.round(product.price * (1 - accountType.discount_value / 100) * 100) / 100
        return { unitPrice: Math.max(0, discounted), staffPricingApplied: isStaff }
      }
    }
  }

  return { unitPrice: product.price, staffPricingApplied: false }
}
