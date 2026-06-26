# Canteen App — Project State

**Repo:** `szv770/canteenApp` | **Prod:** `main` → canteen.szvtech.org  
**Dev branch:** `claude/transaction-history-relationship-wgvdhw`  
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
    topup-requests/  # Admin review/approve/reject parent topup requests
    preorders/       # Pre-order management + printable view
    purchase-orders/ # Purchase order log (supplier stock-in)
  topup-request/
    page.tsx         # Generic public topup form (no bochur)
    [id]/page.tsx    # Personal parent topup form for a specific bochur
  api/
    topup-request/submit/  # Public POST endpoint — inserts topup_requests row
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
    CheckoutModal.tsx# Payment flow (balance/cash/card/mixed) + coupon field
    VariantModal.tsx # Size/option picker
    AddonModal.tsx   # Extras/toppings picker (toggle chips, running total)
    BundleGrid.tsx   # Combo deal cards on "Deals" tab
    BochurSearch.tsx # Also shows "Usuals" amber pill buttons for quick reorder (top 5 frequent items)

types/database.ts    # All TS interfaces — update here when adding DB columns
lib/utils.ts         # formatCurrency, cn
```

---

## Database (Supabase)

| Table | Key columns / notes |
|---|---|
| `bochurim` | `is_frozen bool DEFAULT false`, `freeze_reason text` — added 2026-06-26 |
| `cashier_profiles` | FK: `orders.cashier_id → cashier_profiles.id` |
| `products` | `sale_price`, `sale_active`, `sale_label`, `sale_starts_at`, `sale_ends_at`, `has_variants`, `icon`, `allow_preorder bool` |
| `product_variants` | `label`, `price`, `stock_quantity`, `sort_order`, `is_active` |
| `product_addons` | `name`, `price_addition`, `is_active`, `sort_order` |
| `orders` | `cashier_id`, `bochur_id`, `discount_amount`, `status`, `void_reason text`, `voided_by uuid` |
| `topup_requests` | `bochur_id` (nullable), `parent_name`, `amount`, `method`, `parent_notes`, `status` (pending/approved/rejected), `admin_notes` |
| `pre_orders` | `bochur_id`, `date`, `meal_period`, `status` (pending/ready/collected), `notes`, `total` |
| `pre_order_items` | `pre_order_id`, `product_id`, `product_name`, `quantity`, `unit_price` |
| `purchase_orders` | `supplier`, `notes`, `total_cost`, `created_by` |
| `purchase_order_items` | `po_id`, `product_id`, `product_name`, `quantity_added`, `unit_cost` |
| `order_items` | Snapshot of name/price at sale time |
| `payments` | `method`: balance / cash / credit_card / zelle / mixed |
| `balance_ledger` | Full audit trail for every balance change |
| `discount_codes` | `type` percent/fixed, `value`, `max_uses`, `uses_count`, `expires_at` |
| `product_bundles` | `price`, `original_price` |
| `bundle_items` | `bundle_id`, `product_id`, `quantity` |
| `app_settings` | Key/value: tax_rate, cc_fee_percent, out_of_stock_behavior, etc. |

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
| Full reports/analytics | `app/(admin)/reports/page.tsx` | Hourly heatmap, top sellers, payment breakdown, cashier stats, low stock donut, FBT, ABC analysis, unspent credit |
| Bochur profile modal | `app/(admin)/bochurim/BochurProfileModal.tsx` | Click any row — stats, chart, transactions, ledger, freeze/unfreeze, add funds, edit |
| Freeze/unfreeze accounts | `bochurim` table, `app/api/pos/checkout/route.ts`, `components/pos/BochurSearch.tsx` | Checkout returns 403; POS shows red warning |
| Clear cart button | `components/pos/Cart.tsx` | Confirm dialog before clear |
| Type-in cart quantity | `components/pos/Cart.tsx` (CartRow) | Tap number → input, Enter commits |
| Better icon picker | `app/(admin)/products/page.tsx` | Any emoji input, Clear button, collapsible quick grid |
| Name-first POS cards | `components/pos/ProductGrid.tsx` | Icon is compact/optional |
| Settings input focus fix | `app/(admin)/settings/page.tsx` | SettingControl at top-level (not inside page fn) |
| Quick Reorder "Usuals" | `components/pos/BochurSearch.tsx` | Amber pill buttons for top 5 frequent products; tap to add to cart |
| Void reason selection | `app/(admin)/transactions/page.tsx` | Chip selector + free-text Other; stored in `void_reason` column |
| Parent top-up links | `app/(admin)/topup-requests/page.tsx`, `app/topup-request/[id]/page.tsx`, `app/api/topup-request/submit/route.ts` | Personal link per bochur; public form; admin review/approve/reject/edit |
| Pre-orders | `app/(admin)/preorders/page.tsx` | Date + meal period filters, status workflow, printable view, per-product allow toggle |
| Bochurim CSV import/export | `app/(admin)/bochurim/page.tsx` | Export all as CSV; import with preview table, batch insert, auto column detection |
| Sale scheduler | `app/(admin)/products/page.tsx`, `app/api/pos/checkout/route.ts` | `sale_starts_at` + `sale_ends_at`; server evaluates active window at checkout |
| ABC Product Analysis | `app/(admin)/reports/page.tsx` | Color-coded A/B/C tier table; A=top 70% revenue, B=next 20%, C=bottom 10% |
| Purchase Order Log | `app/(admin)/purchase-orders/page.tsx` | Log supplier purchases; auto-updates product stock on save |

### ❌ Not Yet Built

| Feature | Notes |
|---|---|
| Inventory burn-rate trendline | Projects stock-out date from sales velocity — no DB support yet |
| Daily revenue vs target gauge | Need target_revenue in app_settings |
| Wastage/spoilage tracking | No DB table yet |
| Declined/low-balance alert log | Would need a new `failed_transactions` table or column |
| Bochur-level spending limits / discounts | Per-account rules, not yet designed |

---

## Known Issues / Gotchas

1. **PostgREST joins with mismatched FK column names** — always use explicit FK hint:
   ```ts
   // WRONG → "Could not find a relationship" error
   .select('*, cashier_profiles(name)')
   // CORRECT
   .select('*, cashier_profiles!cashier_id(name), bochurim!bochur_id(name)')
   ```

2. **Variant products + stock** — `stock_quantity` is 0 at the product level when variants exist (real stock is per-variant). `ProductGrid` guards with `!product.has_variants`. Never add stock check for has_variants products.

3. **SettingControl must be top-level** — defining it inside `SettingsPage` causes inputs to lose focus on every keystroke because React remounts the DOM node.

4. **Category pill buttons, not checkboxes** — `<label>` wrapping `<input type="checkbox">` double-fires onChange on mobile. Use `<button>` tap-to-toggle pills instead.

5. **recharts already installed** — import from `recharts`. Use `ResponsiveContainer` wrapping `BarChart`/`LineChart`/`PieChart`.

6. **RLS** — all admin tables require `auth.role() = 'authenticated'` for all operations. No public reads.

7. **TypeScript Set spread** — `[...new Set(...)]` fails without `downlevelIteration`. Use `Array.from(new Set(...))`.

---

## Deployment

- Vercel auto-deploys `main` → canteen.szvtech.org
- Dev branch: `claude/practical-meitner-je2psm`
- Workflow: code on dev branch → push → create PR → merge to main (Claude does this)

---

## Public Routes (No Auth Required)

- `/topup-request` — generic parent topup form
- `/topup-request/[bochur-id]` — personal topup form linked to a specific student
- `POST /api/topup-request/submit` — inserts into `topup_requests`; uses admin client to bypass RLS

These pages intentionally have no auth guard — parents access them from a QR code or shared link.

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
| 2026-06-26 | Fix: transactions/dashboard/reports PostgREST join failure — orders.cashier_id FK pointed to auth.users not cashier_profiles; added orders_cashier_id_cashier_profiles_fkey to DB and !cashier_id hints to dashboard/reports queries |
| 2026-06-26 | Feat: Quick Reorder "Usuals" in POS — BochurSearch shows top 5 frequent items as amber pill buttons |
| 2026-06-26 | Feat: Void reason modal — chip picker + free-text "Other", stored in orders.void_reason |
| 2026-06-26 | Feat: Parent top-up links — personal QR-ready URLs per bochur, public form, admin review page |
| 2026-06-26 | Feat: Pre-orders — date/meal filter, status workflow (pending→ready→collected), printable view |
| 2026-06-26 | Feat: Bochurim CSV import/export — sortable columns, export all, import with preview & batch insert |
| 2026-06-26 | Feat: Sale scheduler — sale_starts_at + sale_ends_at on products; server-side evaluation at checkout |
| 2026-06-26 | Feat: ABC Product Analysis in reports — A/B/C tier table with cumulative revenue percentile |
| 2026-06-26 | Feat: Purchase Order Log — log stock-in from suppliers, auto-update product stock_quantity |
