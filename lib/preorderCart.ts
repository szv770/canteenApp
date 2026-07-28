// Cart-line model shared by the two Preorders ordering surfaces
// (components/pos/PreorderModal.tsx and app/preorder/page.tsx).
//
// A flat `Record<productId, qty>` can't express "2 plain burgers + 1 with extra
// cheese", and can't express a bundle at all — so a cart is a list of lines,
// each one either a product (optionally with add-ons) or a bundle. Two lines
// for the same product with different add-on sets are genuinely different
// lines; two with the *same* add-on set merge into one.

export interface CartLine {
  /** Stable per-line identity — two lines for the same product must not collide. */
  key: string
  kind: 'product' | 'bundle'
  /** product id or bundle id, per `kind`. */
  refId: string
  quantity: number
  /** Always empty for bundles — bundles have no add-ons in this schema. */
  addonIds: string[]
  /** Display only; the server re-derives names/prices from the ids. */
  addonNames: string[]
}

// crypto.randomUUID is unavailable on http:// origins in some mobile browsers,
// so fall back rather than throwing mid-tap.
export function newLineKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** Set equality on add-on ids — order must not matter. */
export function sameAddonSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((id, i) => id === sortedB[i])
}

/**
 * Adds `quantity` of a line, merging into an existing line of the same kind +
 * refId + identical add-on set instead of creating a duplicate.
 */
export function addCartLine(
  lines: CartLine[],
  entry: { kind: 'product' | 'bundle'; refId: string; addonIds?: string[]; addonNames?: string[]; quantity?: number }
): CartLine[] {
  const addonIds = entry.addonIds ?? []
  const addonNames = entry.addonNames ?? []
  const quantity = entry.quantity ?? 1
  const existing = lines.find(l => l.kind === entry.kind && l.refId === entry.refId && sameAddonSet(l.addonIds, addonIds))
  if (existing) {
    return lines.map(l => l.key === existing.key ? { ...l, quantity: l.quantity + quantity } : l)
  }
  return [...lines, { key: newLineKey(), kind: entry.kind, refId: entry.refId, quantity, addonIds, addonNames }]
}

/** Sets a line's quantity, dropping the line entirely at zero. */
export function setLineQuantity(lines: CartLine[], key: string, quantity: number): CartLine[] {
  if (quantity <= 0) return lines.filter(l => l.key !== key)
  return lines.map(l => l.key === key ? { ...l, quantity } : l)
}

/** The wire shape both /api/pos/preorder-place and /api/preorders/public/place accept. */
export function cartLinesToApiItems(lines: CartLine[]) {
  return lines.map(l => l.kind === 'bundle'
    ? { bundle_id: l.refId, quantity: l.quantity }
    : { product_id: l.refId, quantity: l.quantity, addon_ids: l.addonIds.length > 0 ? l.addonIds : undefined }
  )
}

export interface ExistingPreorderItem {
  product_id: string | null
  bundle_id?: string | null
  product_name?: string
  quantity: number
  is_bundle_component?: boolean
  addon_ids?: string[] | null
  addon_names?: string[] | null
}

/**
 * Rebuilds cart lines from a saved order (edit-in-place, or the public link's
 * "same as last time" prefill). Bundle *component* rows are skipped — they're
 * zero-revenue rollup rows, not real cart lines; the bundle's parent row is the
 * line. A row with neither id (its product was deleted) can't be re-ordered and
 * is dropped rather than silently sent as an invalid line.
 */
export function cartLinesFromExistingOrder(items: ExistingPreorderItem[]): CartLine[] {
  const lines: CartLine[] = []
  for (const it of items || []) {
    if (it.is_bundle_component) continue
    const quantity = Number(it.quantity) || 0
    if (quantity <= 0) continue
    if (it.bundle_id) {
      lines.push({ key: newLineKey(), kind: 'bundle', refId: it.bundle_id, quantity, addonIds: [], addonNames: [] })
    } else if (it.product_id) {
      lines.push({
        key: newLineKey(),
        kind: 'product',
        refId: it.product_id,
        quantity,
        addonIds: it.addon_ids || [],
        addonNames: it.addon_names || [],
      })
    }
  }
  return lines
}
