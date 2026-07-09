# Canteen App — Project State

**Repo:** `szv770/canteenApp` | **Prod:** `main` → canteen.szvtech.org  
**Dev branch:** `claude/practical-meitner-je2psm`  
**Supabase project:** `hlseiqquxspdfunrclfv`  
**Stack:** Next.js 14 App Router · Supabase JS v2 · Tailwind CSS · recharts

---

## CLAUDE INSTRUCTIONS (read every session)

1. **Read this entire file before doing anything.**
2. **After every fix or feature — no matter how small — update this file** (mark items done, add new gotchas, update the changelog) and include `CLAUDE.md` in the same commit as the code change.
3. Always push to `claude/practical-meitner-je2psm`, create a PR, and merge to `main` when work is complete. Merging is Claude's job.
4. When user reports a bug, check "Known Issues / Gotchas" first — it may already be documented.

---

## Architecture

```
app/
  (admin)/
    dashboard/       # Quick-glance stats cards
    products/        # Product editor (variants, add-ons, sale prices, icon picker)
    categories/      # Category management
    bochurim/        # Student accounts + BochurProfileModal (click any row)
    cashiers/        # Cashier accounts
    transactions/    # Order history + void
    reports/         # Full analytics (charts, heatmaps, tables)
    bundles/         # Combo deal bundles admin
    settings/        # App-wide settings (tax, cc fee, out-of-stock behavior)
    inventory/       # Stock management
    topups/          # Balance top-up log
  (pos)/
    page.tsx         # Main POS terminal
  api/pos/
    checkout/        # POST: validate cart, write order, deduct balance, block frozen accounts
    apply-discount/  # POST: validate coupon (does NOT increment uses_count)

components/
  admin/
    Sidebar.tsx      # Nav links
    TableSkeleton.tsx
  pos/
    ProductGrid.tsx  # Name-first cards, icon optional, SALE badge, "From $X" for variants
    Cart.tsx         # Clear button, type-in qty, addon subtotals
    BochurSearch.tsx # Student lookup — red frozen warning banner when is_frozen=true
    CategoryTabs.tsx # Category filter + "Deals" tab
    CheckoutModal.tsx# Payment flow (balance/cash/card) + tip section
    VariantModal.tsx # Size/option picker
    AddonModal.tsx   # Extras/toppings picker (toggle chips, running total)
    BundleGrid.tsx   # Combo deal cards on "Deals" tab

types/database.ts    # All TS interfaces — update here when adding DB columns
lib/utils.ts         # formatCurrency, cn
```

---

## Database (Supabase)

| Table | Key columns / notes |
|---|---|
| `bochurim` | `is_frozen bool DEFAULT false`, `freeze_reason text` — added 2026-06-26 |
| `cashier_profiles` | FK: `orders.cashier_id → cashier_profiles.id` |
| `products` | `sale_price`, `sale_active`, `sale_label`, `sale_ends_at`, `has_variants`, `icon` |
| `product_variants` | `label`, `price`, `stock_quantity`, `sort_order`, `is_active` |
| `product_addons` | `name`, `price_addition`, `is_active`, `sort_order` |
| `orders` | `cashier_id`, `bochur_id`, `discount_amount`, `status` |
| `order_items` | Snapshot of name/price at sale time |
| `payments` | `method`: balance / cash / credit_card / zelle / mixed |
| `balance_ledger` | Full audit trail for every balance change |
| `discount_codes` | `type` percent/fixed, `value`, `max_uses`, `uses_count`, `expires_at` |
| `product_bundles` | `price`, `original_price` |
| `bundle_items` | `bundle_id`, `product_id`, `quantity` |
| `app_settings` | Key/value: tax_rate, cc_fee_percent, out_of_stock_behavior, etc. |
| `account_types` | `is_active bool DEFAULT true` — added 2026-07-07 (was missing from schema) |
| `cashier_notifications` | `message`, `type` (info/warning/urgent), `is_active`, `expires_at`, `created_by` |
| `expense_entries` | `amount`, `description`, `expense_type` (equipment/tax/supply/other), `entered_by`, `date` |
| `wastage_log` | `product_id`, `product_name`, `quantity`, `reason`, `unit_cost`, `unit_price`, `cashier_id` |
| `refund_requests` | `order_id`, `requested_by`, `reason`, `amount`, `status` (pending/approved/rejected), `resolved_by`, `resolution_note` |
| `bochurim` | Also has `banned_until timestamptz`, `ban_reason text`, `allow_negative bool`, `max_negative_balance numeric` |
| `products` | Also has `image_url text` for Supabase Storage (bucket: `product-images`) |

---

## Feature Status

### ✅ Working (merged to main)

| Feature | Files | Notes |
|---|---|---|
| Core POS (product grid, cart, checkout) | `app/(pos)/page.tsx`, `components/pos/*` | Balance/cash/card/mixed payment |
| Admin CRUD (products, categories, cashiers, bochurim) | `app/(admin)/*/page.tsx` | Full management |
| Dashboard stats | `app/(admin)/dashboard/page.tsx` | Daily revenue, orders, low stock, top product |
| Transactions page | `app/(admin)/transactions/page.tsx` | Fixed PostgREST join error (FK hints) |
| Product variants (sizes) | `components/pos/VariantModal.tsx` | Stock lives on variants, not product |
| Product add-ons (toppings/extras) | `components/pos/AddonModal.tsx`, `app/(admin)/products/page.tsx` | Toggle chips, price additions |
| SALE badge + sale prices | `components/pos/ProductGrid.tsx` | Strikethrough + red price, set per product |
| Combo bundles | `app/(admin)/bundles/page.tsx`, `components/pos/BundleGrid.tsx` | "Deals" tab in POS |
| Discount/coupon codes | `app/(admin)/discount-codes/` (if missing, verify), `app/api/pos/apply-discount/` | Applied at checkout |
| Full reports/analytics | `app/(admin)/reports/page.tsx` | Hourly heatmap, top sellers, payment breakdown, cashier stats, low stock donut, FBT, unspent credit |
| Bochur profile modal | `app/(admin)/bochurim/BochurProfileModal.tsx` | Click any row — stats, chart, transactions, ledger, freeze/unfreeze, add funds, edit |
| Freeze/unfreeze accounts | `bochurim` table, `app/api/pos/checkout/route.ts`, `components/pos/BochurSearch.tsx` | Checkout returns 403; POS shows red warning |
| Clear cart button | `components/pos/Cart.tsx` | Confirm dialog before clear |
| Type-in cart quantity | `components/pos/Cart.tsx` (CartRow) | Tap number → input, Enter commits |
| Better icon picker | `app/(admin)/products/page.tsx` | Any emoji input, Clear button, collapsible quick grid |
| Name-first POS cards | `components/pos/ProductGrid.tsx` | Icon is compact/optional |
| Settings input focus fix | `app/(admin)/settings/page.tsx` | SettingControl at top-level (not inside page fn) |
| Bulk CSV import (bochurim) | `app/(admin)/bochurim/page.tsx` (BulkImportModal) | Download template → upload → preview/validate → confirm import |
| Multi-select + bulk archive (bochurim) | `app/(admin)/bochurim/page.tsx` | Checkboxes, select-all per page, bulk archive with confirm |
| Variant analytics in reports | `app/(admin)/reports/page.tsx` | Top sellers, bottom sellers, FBT grouped by product+variant; shows "Soda (Coke)" etc. |
| Null stock = unlimited | `types/database.ts`, `ProductGrid`, `checkout/route.ts`, `products/page.tsx` | Leave stock blank in admin = no tracking, ∞ badge, never blocked |
| Categories inline in products page | `app/(admin)/products/page.tsx` | Collapsible category manager at top; no separate nav needed |
| Payment link copy + deep links | `app/LandingClient.tsx` | Copy button for all methods; "Open" deep link for Venmo/PayPal |
| Tips at checkout | `components/pos/CheckoutModal.tsx`, `app/api/pos/checkout/route.ts` | Quick-select + custom tip; routing to cashier balance via settings |
| Bochur profile refund | `app/(admin)/bochurim/BochurProfileModal.tsx` | Cash/Zelle/CC refund flow with confirmation |
| Account Types admin | `app/(admin)/account-types/page.tsx` | CRUD with discount rules, category exclusions, color tags |
| Add-ons charged at checkout | `app/api/pos/checkout/route.ts` | Server validates addon_ids, adds price_addition to unit_price |
| Bundles in POS | `app/(pos)/pos/page.tsx`, `components/pos/BundleGrid.tsx` | Deals tab wired, addBundleToCart handler |
| Account type discounts | `app/api/pos/checkout/route.ts` | Per-item: %, cost price, fixed; category exclusions |
| Checkout mobile layout | `components/pos/CheckoutModal.tsx` | Tip row wraps, cash 3-col, addon sub-line, button cleaner |
| Timed ban | `BochurProfileModal.tsx`, `checkout/route.ts`, `BochurSearch.tsx` | Preset (1d/3d/1w) or custom date; orange warning in POS; 403 at checkout |
| COGS / Wastage page | `app/(admin)/cogs/page.tsx` | Two tabs: Wastage Log + Expenses; monthly totals |
| Wastage logging (POS) | `components/pos/WastageModal.tsx` | Cashiers log waste; notifies admin; deducts stock optionally |
| Top-up from POS | `components/pos/TopUpModal.tsx` | Cashier adds balance from POS header |
| Quick charge | `components/pos/QuickChargeModal.tsx` | Fast balance charge without full checkout |
| Admin notifications → cashiers | `app/(admin)/notifications/page.tsx`, POS realtime | Admin composes; POS receives as styled toasts via Supabase Realtime |
| Refund requests | `app/(admin)/refund-requests/page.tsx`, transactions page | Cashier files from transactions; admin approves/rejects + triggers refund |
| Cashier dashboard | `app/cashier-dashboard/page.tsx` | Orders/students/top item today + recent orders; no revenue shown |
| Category hierarchy (POS) | `components/pos/CategoryTabs.tsx` | Top-level tabs + subcategory pills; filter cascades |
| Product image upload | `app/(admin)/products/page.tsx` | Upload to `product-images` Storage bucket; shown in POS grid |
| Printable menu | `app/(admin)/menu/page.tsx` | Grouped by category; CSV export; cashier-accessible |
| Account types in bochurim tab | `app/(admin)/bochurim/page.tsx`, `AccountTypesPanel.tsx` | Moved from sidebar into Students/Account Types tabs |
| Negative balance support | BochurProfileModal, checkout API | allow_negative + max_negative_balance per student; enforced at checkout |
| Manual CC checkout | `components/pos/CheckoutModal.tsx` | Shows "Charge $X on your reader" + enables Complete Order |
| COGS in reports | `app/(admin)/reports/page.tsx` | 5-card strip: Gross / Product COGS / Expenses / Wastage / Net Profit |
| Supabase Storage bucket | Migration | `product-images` bucket (public, 5MB, image/* types) with RLS |

### ❌ Not Yet Built

| Feature | Notes |
|---|---|
| Inventory burn-rate trendline | Projects stock-out date from sales velocity — no DB support yet |
| Daily revenue vs target gauge | Need target_revenue in app_settings |
| Declined/low-balance alert log | Would need a new `failed_transactions` table or column |
| Checkout discount display on client | Server applies account type discount correctly; client-side preview not yet computed |
| Stripe / card reader integration | User still deciding between Stripe Terminal vs manual phone reader |

---

## Known Issues / Gotchas

1. **PostgREST joins with mismatched FK column names** — always use explicit FK hint:
   ```ts
   // WRONG → "Could not find a relationship" error
   .select('*, cashier_profiles(name)')
   // CORRECT
   .select('*, cashier_profiles!cashier_id(name), bochurim!bochur_id(name)')
   ```

2. **Variant products + stock** — `stock_quantity` is NULL at the product level when variants exist (real stock is per-variant). `ProductGrid` guards with `tracked = !has_variants && stock_quantity !== null`. Never add stock check for has_variants products. NULL also means "unlimited" for non-variant products.

3. **SettingControl must be top-level** — defining it inside `SettingsPage` causes inputs to lose focus on every keystroke because React remounts the DOM node.

4. **Category pill buttons, not checkboxes** — `<label>` wrapping `<input type="checkbox">` double-fires onChange on mobile. Use `<button>` tap-to-toggle pills instead.

5. **recharts already installed** — import from `recharts`. Use `ResponsiveContainer` wrapping `BarChart`/`LineChart`/`PieChart`.

6. **RLS** — all admin tables require `auth.role() = 'authenticated'` for all operations. No public reads.

7. **TypeScript Set spread** — `[...new Set(...)]` fails without `downlevelIteration`. Use `Array.from(new Set(...))`.  

8. **inventory/page.tsx null stock** — `stock_quantity` is `number | null`; guard with `?? 0` before arithmetic and `?? '∞'` for display. Null = unlimited tracking.

9. **account_types.is_active** — column was missing from initial schema; added via Supabase migration 2026-07-07. If getting "column not found in schema cache" errors on account_types, check this column exists.

---

## Deployment

- Vercel auto-deploys `main` → canteen.szvtech.org
- Dev branch: `claude/practical-meitner-je2psm`
- Workflow: code on dev branch → push → create PR → merge to main (Claude does this)

---

## Changelog

| Date | Change |
|---|---|
| 2026-06-26 | Initial full build: core POS, admin, dashboard, variants |
| 2026-06-26 | Fix: transactions PostgREST join error (FK hints for cashier_profiles, bochurim) |
| 2026-06-26 | Feat: clear cart, type-in quantity, emoji icon picker, name-first POS cards |
| 2026-06-26 | Feat: product add-ons (AddonModal), SALE badges, variant out-of-stock fix |
| 2026-06-26 | Feat: full reports/analytics page with recharts |
| 2026-06-26 | Feat: discount/coupon codes system (admin + checkout) |
| 2026-06-26 | Feat: combo bundles (admin + Deals tab in POS) |
| 2026-06-26 | Feat: bochur profile modal — stats, spending chart, transactions, ledger, freeze/unfreeze |
| 2026-06-26 | Fix: settings inputs losing focus (SettingControl moved to top-level) |
| 2026-06-26 | Docs: CLAUDE.md created for auto-load context at session start |
| 2026-06-26 | Fix: build TS errors — bundles page Product type mismatch, reports Set iteration, recharts Tooltip formatter |
| 2026-07-07 | Fix: voiding an order now refunds balance — new /api/pos/void-order route handles refund + ledger entry |
| 2026-07-07 | Feat: bochurim page — multi-select checkboxes + bulk archive; bulk CSV import with template download, parse preview, and validation |
| 2026-07-07 | Fix: block credit card checkout — button disabled + warning shown until CC processing is set up |
| 2026-07-07 | Fix: product deletion FK constraint errors — stock_entries/bundle_items CASCADE, order_items SET NULL |
| 2026-07-07 | Fix: POS grid — revert variant expansion; restore VariantModal with preloaded variants (no per-tap DB fetch) |
| 2026-07-07 | Feat: variant-level analytics — reports group top sellers / bottom sellers / FBT by product+variant label |
| 2026-07-07 | Feat: null stock = unlimited — blank stock qty means no tracking; ∞ badge in admin, no block at checkout |
| 2026-07-07 | Feat: categories inline in products admin — collapsible panel, no separate nav needed |
| 2026-07-07 | Feat: landing page payment deep links + copy-to-clipboard for Zelle/Venmo/PayPal handles |
| 2026-07-07 | Perf: preload all variants in POS loadData() — eliminates per-tap DB fetch |
| 2026-07-07 | Feat: variants show as individual cards in POS grid — no modal needed, tap directly adds to cart |
| 2026-07-07 | Feat: variant price defaults to product main price if left blank in admin editor |
| 2026-07-07 | Feat: cashier tip at checkout — quick amounts ($0.25/$0.50/$1/$2) + custom, configurable routing (Settings → tip_routing) |
| 2026-07-07 | Feat: refund balance from bochur profile — cash/zelle/cc with method-specific guidance; Zelle requires checkbox confirm |
| 2026-07-07 | Feat: Account Types admin CRUD page (/account-types) — discount rules (%, cost price, fixed), category exclusions, color tags, sidebar link |
| 2026-07-07 | Fix: add-ons now charged at checkout — server validates addon_ids against DB, adds price_addition to unit_price |
| 2026-07-07 | Fix: Bundles/Deals tab now wired into POS — BundleGrid shown when Deals selected, bundles fetch on load, addBundleToCart handler |
| 2026-07-07 | Fix: sale_ends_at now enforced in checkout API — expired sales revert to regular price |
| 2026-07-07 | Fix: dashboard payments card no longer empty — removed invalid .eq('status','completed') on payments table |
| 2026-07-07 | Fix: deleting product variants no longer throws FK error — order_items_variant_id_fkey changed to ON DELETE SET NULL |
| 2026-07-07 | Fix: low stock dashboard widget ignores null-stock (unlimited) products |
| 2026-07-07 | Fix: inventory page TS build error — null-guard stock_quantity for comparisons, arithmetic, and display (∞ for unlimited) |
| 2026-07-07 | Feat: account type discount applied per-item at checkout — percentage/cost_price/fixed with category exclusion support |
| 2026-07-07 | Fix: checkout order summary shows addon price in line item total (price + addon_total) |
| 2026-07-07 | Fix: account_types missing is_active column — added via Supabase migration |
| 2026-07-07 | Fix: checkout modal mobile layout — tip row wraps on small screens, cash buttons 3-col on mobile, addon names on own line, Complete Order button cleaner |
| 2026-07-09 | Fix: BochurSearch now trims whitespace before query so "Moshe " finds "Moshe Cohen" correctly |
| 2026-07-09 | Fix: transactions page uses LEFT JOIN for bochurim so anonymous (walk-in) orders appear; default filter changed to "all"; label updated to "Walk-in / No account" |
| 2026-07-09 | Fix: transactions page default status filter is now "all" so voided orders are visible by default and show the "Voided" badge |
| 2026-07-09 | Fix: account type creation no longer fails — slug auto-generated from name + timestamp before insert |
| 2026-07-09 | Fix: reports/page.tsx TS error — recharts LabelFormatter formatter typed as (v: any) |
| 2026-07-09 | Feat: manual CC checkout enabled — shows "Charge $X on your reader" prompt; Complete Order button unblocked |
| 2026-07-09 | Feat: reports COGS expanded — expense_entries + wastage_log included; 5-card strip (Gross/COGS/Expenses/Wastage/Net) |
| 2026-07-09 | Feat: WastageModal — cashier logs waste from POS header button; looks up session internally |
| 2026-07-09 | Feat: POS subscribes to cashier_notifications via Supabase Realtime → styled toast by type (info/warning/urgent) |
| 2026-07-09 | Feat: cashier-dashboard page — today's orders, students served, top item, recent 10 orders (no revenue) |
| 2026-07-09 | Infra: created product-images Supabase Storage bucket (public, 5MB limit, RLS policies) |
| 2026-07-09 | Feat: timed ban on bochurim — preset durations + custom date; orange warning in POS; 403 at checkout |
| 2026-07-09 | Feat: COGS page (/cogs) — wastage log + expense entry form; sidebar link |
| 2026-07-09 | Feat: admin notifications page — compose info/warning/urgent messages; cashiers receive as POS toasts |
| 2026-07-09 | Feat: refund requests — cashier submits from transactions page; admin approves/rejects + refunds balance |
| 2026-07-09 | Feat: quick charge modal + top-up modal in POS header |
| 2026-07-09 | Feat: category hierarchy in POS — top-level tabs + subcategory pills |
| 2026-07-09 | Feat: product image upload (Supabase Storage) + shown in POS grid |
| 2026-07-09 | Feat: printable menu page (/menu) — grouped by category, CSV export |
| 2026-07-09 | Feat: account types moved to bochurim page tab (Students / Account Types) |
| 2026-07-09 | Feat: negative balance allowed per student (allow_negative + max_negative_balance), enforced at checkout |
