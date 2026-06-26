# Canteen App — Project State

**Repo:** `szv770/canteenApp` | **Prod branch:** `main` → canteen.szvtech.org  
**Dev branch:** `claude/practical-meitner-je2psm`  
**Supabase project:** `hlseiqquxspdfunrclfv`  
**Stack:** Next.js 14 App Router · Supabase JS v2 · Tailwind CSS · recharts

> **Rule for Claude:** At the start of every session, read this file. After completing any feature or fix, update the relevant section before committing.

---

## Architecture

```
app/
  (admin)/           # Admin panel (authenticated layout)
    dashboard/       # Quick-glance stats cards
    products/        # Full product editor (variants, add-ons, sale prices, icon picker)
    categories/      # Category management
    bochurim/        # Student account management + profile modal
    cashiers/        # Cashier account management
    transactions/    # Order history + void
    reports/         # Full analytics (charts, heatmaps, tables)
    bundles/         # Combo deal bundles
    settings/        # App-wide settings (tax, cc fee, etc.)
    inventory/       # Stock management
    topups/          # Balance top-up log
  (pos)/             # POS terminal (cashier-facing)
    page.tsx         # Main POS page
  api/
    pos/
      checkout/      # POST: validates cart, writes order, deducts balance
      apply-discount/# POST: validates coupon code (does not increment uses_count)

components/
  admin/
    Sidebar.tsx      # Nav: Dashboard, Products, Categories, Bochurim, Cashiers,
                     #      Transactions, Reports, Bundles, Discount Codes, Settings
  pos/
    ProductGrid.tsx  # Product cards — name-first, icon optional, SALE badge, "From $X" for variants
    Cart.tsx         # CartPanel + CartRow — clear button, type-in quantity, addon subtotals
    BochurSearch.tsx # Student lookup — shows frozen warning banner when is_frozen=true
    CategoryTabs.tsx # Category filter + "Deals" tab for bundles
    CheckoutModal.tsx# Payment flow (balance/cash/card/mixed) + discount code entry
    VariantModal.tsx # Size/option picker (fetches product_variants)
    AddonModal.tsx   # Extras/toppings picker (fetches product_addons, toggles)
    BundleGrid.tsx   # Combo deal cards shown on "Deals" tab

types/database.ts    # All TS interfaces
lib/utils.ts         # formatCurrency, cn
```

---

## Database Tables (Supabase)

| Table | Notes |
|---|---|
| `bochurim` | Students. `is_frozen` (bool, default false), `freeze_reason` (text) added via migration |
| `cashier_profiles` | Staff. FK `orders.cashier_id → cashier_profiles.id` |
| `products` | `sale_price`, `sale_active`, `sale_label`, `sale_ends_at`, `has_variants`, `icon` |
| `product_variants` | `label`, `price`, `stock_quantity`, `sort_order`, `is_active` |
| `product_addons` | `name`, `price_addition`, `is_active`, `sort_order` |
| `categories` | Simple name + colour |
| `orders` | `cashier_id` → cashier_profiles, `bochur_id` → bochurim. `discount_amount` column |
| `order_items` | Snapshot of product name/price at time of sale |
| `payments` | `method`: balance / cash / credit_card / zelle / mixed |
| `balance_ledger` | Audit trail for every balance change |
| `discount_codes` | `type` (percent/fixed), `value`, `max_uses`, `uses_count`, `expires_at` |
| `product_bundles` | Combo deals with `price`, `original_price` |
| `bundle_items` | `bundle_id`, `product_id`, `quantity` |
| `app_settings` | Key/value store for tax rate, cc fee, out-of-stock behavior, etc. |

**Critical PostgREST join syntax** (column name ≠ table name):
```ts
// WRONG — causes "Could not find a relationship" error
.select('*, cashier_profiles(name), bochurim(name)')

// CORRECT — use explicit FK hint
.select('*, cashier_profiles!cashier_id(name), bochurim!bochur_id(name,bochur_number)')
```

---

## Features — Status

### ✅ Complete & Merged to Main
- Core POS: product grid, cart, variants, checkout (balance/cash/card/mixed)
- Admin: products CRUD, categories, cashiers, bochurim, inventory, topups, settings
- Dashboard: quick stats cards (daily revenue, orders, low stock, top product)
- **Transactions page** — fixed PostgREST join error with explicit FK hints
- **Clear cart button** — with confirm dialog
- **Type-in cart quantity** — tap number to enter edit mode, Enter commits
- **Better icon picker** — type any emoji or paste, Clear button, optional collapsible grid
- **POS name-first cards** — icon is compact/optional; name and price always shown
- **SALE badge on products** — orange badge, strikethrough original price, red sale price
- **Product add-ons** — admin editor per product, AddonModal in POS after variant selection
- **Reports/Analytics page** — hourly heatmap, top sellers, payment breakdown, cashier table, low stock donut, frequently bought together, unspent credit list
- **Sales & Discounts** — discount codes admin, `apply-discount` API, coupon field at checkout
- **Combo Bundles** — admin editor, BundleGrid in POS "Deals" tab, checkout handles bundle items
- **Settings focus fix** — SettingControl moved to top-level to prevent input losing focus on keystroke

### 🔄 In Progress (agent running)
- **Bochur profile modal** (`app/(admin)/bochurim/BochurProfileModal.tsx`)
  - DB migration: `is_frozen`, `freeze_reason` columns — **DONE** (applied)
  - Checkout blocks frozen accounts — **DONE**
  - BochurSearch shows frozen warning banner — **DONE**
  - BochurProfileModal component — IN PROGRESS
  - Bochurim page — clickable rows — pending
  - Modal contents: spending stats, 30-day chart (recharts), transaction history, balance ledger, freeze/unfreeze controls

### ❌ Not Yet Built
- Inventory burn-rate trendline (projects when stock runs out based on velocity)
- Daily revenue vs target gauge
- Wastage/spoilage tracking (no DB support yet)
- Declined/low-balance transaction alert log
- Discount codes admin page (bundles agent may have left incomplete)
- Bochur-level discount rules or spending limits

---

## Known Issues / Gotchas

1. **Variant products + stock**: `stock_quantity` at product level stays 0 when variants exist. `ProductGrid` already guards this with `!product.has_variants` check. Do not re-add stock check for variant products.
2. **PostgREST join hints**: Always use `table!fk_column(fields)` when the FK column name differs from the table name.
3. **SettingControl component**: Must be defined at module top-level, NOT inside SettingsPage. If moved inside, inputs lose focus on every keystroke.
4. **Category assignment**: Use `<button>` tap-to-toggle pills, NOT `<label>` + `<input type="checkbox">` — the label can double-fire onChange on mobile.
5. **recharts**: Already installed. Use `ResponsiveContainer` → `BarChart`/`LineChart`/`PieChart`.
6. **RLS**: All admin tables use `auth.role() = 'authenticated'` for ALL operations. No public reads.

---

## Deployment

- Vercel auto-deploys `main` → canteen.szvtech.org on every push
- After feature work: commit on `claude/practical-meitner-je2psm`, push, create PR, merge to `main`
- Claude handles merges (per user instruction)

---

## Session Log

| Date | What was done |
|---|---|
| 2026-06-26 | Transactions fix, clear cart, type-in qty, icon picker, name-first POS cards, add-ons, reports page, discounts/coupons, combo bundles, bochur profile modal (in progress) |

---

*Last updated: 2026-06-26 — bochur profile modal agent still running*
