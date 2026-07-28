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
//
// `addonTotal` (the summed price_addition of the add-ons this person actually
// picked, already validated against the product server-side) is added on top
// of the resolved base price in EVERY branch — including the staff_price
// override and the at-cost discount. A topping someone explicitly asked for is
// never free just because the base item is subsidized or sold at cost. This is
// a deliberate divergence from regular POS checkout, whose cost_price branch
// collapses add-on revenue into the cost price.
export function computePreorderUnitPrice(
  product: PreorderPricingProduct,
  accountType: PreorderPricingAccountType | null,
  addonTotal: number = 0
): PreorderUnitPriceResult {
  const isStaff = !!accountType?.is_staff_pricing_tier
  const addons = Number.isFinite(addonTotal) && addonTotal > 0 ? addonTotal : 0
  const withAddons = (base: number) => Math.max(0, Math.round((base + addons) * 100) / 100)

  if (isStaff && product.staff_price != null) {
    return { unitPrice: withAddons(Math.max(0, product.staff_price)), staffPricingApplied: true }
  }

  if (accountType && accountType.discount_type !== 'none') {
    if (accountType.discount_type === 'percentage' && accountType.discount_value > 0) {
      const discounted = Math.round(product.price * (1 - accountType.discount_value / 100) * 100) / 100
      return { unitPrice: withAddons(Math.max(0, discounted)), staffPricingApplied: isStaff }
    }
    if (accountType.discount_type === 'cost_price') {
      if (product.cost_price != null && product.cost_price > 0) {
        return { unitPrice: withAddons(product.cost_price), staffPricingApplied: isStaff }
      }
      if (accountType.discount_value > 0) {
        const discounted = Math.round(product.price * (1 - accountType.discount_value / 100) * 100) / 100
        return { unitPrice: withAddons(Math.max(0, discounted)), staffPricingApplied: isStaff }
      }
    }
  }

  return { unitPrice: withAddons(product.price), staffPricingApplied: false }
}
