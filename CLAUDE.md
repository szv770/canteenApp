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
    accounts/        # Financial reconciliation — payment balances by method + withdrawal log
  (pos)/
    page.tsx         # Main POS terminal
  api/pos/
    checkout/        # POST: validate cart, write order, deduct balance, block frozen accounts; atomically increments discount uses_count via DB RPC
    apply-discount/  # POST: validate coupon (preview only — does NOT write to DB)

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
| `cashier_notifications` | Also has `show_on_home_page bool DEFAULT false` — added 2026-07-09; same composer posts to cashier POS toast and/or parent home page banner |
| `balance_topups` | `method` check constraint extended to include `cashapp`, `credit_card` (was cash/zelle/venmo/paypal/stripe/manual) — added 2026-07-09 |
| `withdrawal_log` | `account` (zelle/stripe/cash), `amount`, `date`, `note`, `recorded_by` — added 2026-07-09 |
| `pre_order_items`, `topup_requests`, `purchase_orders`, `pre_orders`, `purchase_order_items` | **Not used anywhere in the app** (zero code references) — appear to be abandoned scaffolding from an earlier iteration. Empty, and RLS was fully disabled on all 5 until 2026-07-10 (fixed — now RLS-enabled with no policies, i.e. locked to service-role only). Don't build against these without first confirming with the user whether they're meant to be resurrected or just dropped. |
| `bochurim_with_id` (view) | `SELECT * FROM bochurim` plus a computed `bochur_id` display column (`'B' \|\| lpad(bochur_number, 3, '0')`). Used everywhere the app reads student data. Was `SECURITY DEFINER` with anon grants until 2026-07-10 — see gotcha #16, this was a critical exposure. Now `security_invoker = true`, authenticated-SELECT-only. |

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
| Cashier dashboard | `app/cashier-dashboard/page.tsx` | Orders/students/top item today + recent orders (all cashiers, shared view); tap a row to expand item names; shows "rung by [cashier]"; no revenue/$ shown |
| Category hierarchy (POS) | `components/pos/CategoryTabs.tsx` | Top-level tabs + subcategory pills; filter cascades |
| Product image upload | `app/(admin)/products/page.tsx` | Upload to `product-images` Storage bucket; shown in POS grid |
| Printable menu | `app/(admin)/menu/page.tsx` | Grouped by category; CSV export; cashier-accessible |
| Account types in bochurim tab | `app/(admin)/bochurim/page.tsx`, `AccountTypesPanel.tsx` | Moved from sidebar into Students/Account Types tabs |
| Negative balance support | BochurProfileModal, checkout API | allow_negative + max_negative_balance per student; enforced at checkout |
| Manual CC checkout | `components/pos/CheckoutModal.tsx` | Shows "Charge $X on your reader" + enables Complete Order |
| COGS in reports | `app/(admin)/reports/page.tsx` | 5-card strip: Gross / Product COGS / Expenses / Wastage / Net Profit |
| Supabase Storage bucket | Migration | `product-images` bucket (public, 5MB, image/* types) with RLS |
| Home page redesign | `app/LandingClient.tsx`, `app/page.tsx` | Reordered sections, balanced hero text wrap, Cash App added, general "include CANTEEN - camper name in notes" banner; mobile pass: payment method cards are two-row (name+buttons, then handle) so Copy/Open never cramp against the handle text, dynamic notes-reminder method list, shortened Credit Card card label to avoid truncation |
| Online credit card top-up | `app/LandingClient.tsx`, `app/(admin)/settings/page.tsx` | Admin toggle + link + `cc_fee_percent`. Parent fills out the whole form first (camper first/last name on its own line at the top, then parent info) and submits — the pending request is saved immediately regardless of method. If method is Credit Card, a post-submit modal shows the fee math (amount ÷ (1 − fee%) = amount to actually send, since Stripe can't be told the amount via URL) and no-refund warning, then opens the Stripe link with `client_reference_id` set to the camper's name (the one param Stripe Payment Links actually support — see gotcha #17). Success screen keeps an "Open Payment Page" button as a fallback. |
| Home page announcements | `app/(admin)/notifications/page.tsx`, `app/LandingClient.tsx`, `lib/home.ts` | Same composer as cashier notifications, `show_on_home_page` checkbox; renders as dismissible (localStorage) banner on home page vs. popup toast for cashiers |
| Popular items section | `app/(admin)/settings/page.tsx`, `app/api/home/top-sellers/route.ts`, `lib/home.ts` | Manual (admin-typed, default) or Auto mode; Auto safely aggregates last-30-day completed order_items server-side and only ever returns product name + icon — no prices/costs/customer data |
| Nine Days menu section | `app/(admin)/settings/page.tsx`, `app/LandingClient.tsx` | Admin blurb + optional flyer (image/PDF) upload to new `site-assets` bucket; section hidden unless filled in |
| Supabase Storage bucket | Migration | `site-assets` bucket (public, 10MB, image/*+PDF) with RLS — home page assets like the Nine Days flyer |

### ✅ Also Working

| Feature | Files | Notes |
|---|---|---|
| Inventory burn-rate | `app/(admin)/inventory/page.tsx` | "Burn Rate" column: ~X days to stockout, red/amber/green, computed from last-30-day velocity |
| Daily revenue target gauge | `app/(admin)/dashboard/page.tsx`, `settings/page.tsx` | Progress bar on dashboard; set target in Settings → Daily Revenue Target |
| Low balance alert log | `app/(admin)/dashboard/page.tsx`, `app/api/pos/checkout/route.ts` | Failed balance checkouts logged to `failed_checkout_log` table; shown as today's table on dashboard |
| Checkout discount preview | `components/pos/CheckoutModal.tsx` | Account type discount shown as line item with estimated $ amount; coupon shown separately |
| Accounts page (financial reconciliation) | `app/(admin)/accounts/page.tsx` | Date-range payment balances by method (Cash/Zelle/CC/Balance/Total) + outstanding student balance liability card + withdrawal log with add/delete |
| Dashboard Net Profit card | `app/(admin)/dashboard/page.tsx` | Today's revenue − COGS − expenses − wastage; green if positive, red if negative |
| Reports full redesign | `app/(admin)/reports/page.tsx` | 4 tabs: Overview, Products, Profit & COGS, Students. Smart date presets (Today/Yesterday/This Week/Last Week/This Month/30 Days/This Summer) + custom range + period nav arrows. Chart/table toggle on every card. Student name click → BochurProfileModal inline. Wastage edit (notes) + delete. CSV export with Items column. Print button. |
| Discount codes admin page | `app/(admin)/discount-codes/page.tsx` | CRUD for coupon codes (percent/fixed, min order, max uses, expiry, active toggle); the checkout engine (`apply-discount` route, `CheckoutModal.tsx`) already fully supported codes, this was the missing admin UI to create them — added 2026-07-10 |
| Credit Card "Coming Soon" refinement | `app/LandingClient.tsx`, `app/(admin)/settings/page.tsx` | Fixed 2026-07-10. New `payment_cc_coming_soon_enabled` toggle (Settings → Online Credit Card Top-up). The greyed-out placeholder now only shows when ALL of: CC is disabled, `payment_cc_link` is empty (i.e. genuinely not configured, not just mid-setup), and the admin has explicitly turned the toggle on. If the admin has started configuring a link but hasn't enabled it yet, nothing shows (not treated as "coming soon") — lets an admin test privately without a public announcement. |

### ❌ Not Yet Built

| Feature | Notes |
|---|---|
| Stripe / card reader integration | User still deciding between Stripe Terminal vs manual phone reader |
| "Approve without crediting" security hardening | Plan only (not built): admin-only role gate, mandatory reason field, visual "No credit" badge on row, `skip_credit_reason` audit column to flag the action. Real risk is cashier pocketing payment by claiming "already added manually" — admin-only restriction closes this. |
| Enable Supabase Auth leaked-password protection | Flagged 2026-07-10 by `get_advisors`. Not fixable via migration/SQL — it's a Supabase Auth project setting (checks new passwords against HaveIBeenPwned), only togglable from the Supabase dashboard under Authentication → Policies, or the Management API. Low urgency since cashiers/admins are provisioned by the admin, not self-signup, but worth flipping on. |
| Discount display mode toggle | Admin setting to choose between "show normal price + discount line" vs "show reduced price per item" in checkout |
| "Lost revenue from discounts" report view | Show total revenue given away in discounts per period |
| Balance ledger "Other/Internal" type | Add "Other/Internal" type to Add Funds flow so owner compensation doesn't inflate cash counts; edit existing ledger entries from bochur profile |

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

10. **Public home page data must go through `lib/home.ts` (service-role, tightly-scoped selects)** — `cashier_notifications` and `order_items`/`orders` have no anon RLS SELECT policy on purpose (they contain internal/customer data). The home page and `/api/home/top-sellers` never query them with the anon client; they use `createAdminClient()` in `lib/home.ts` and select only the specific columns needed (e.g. `id, message, type` for announcements; product `name, icon` only for top sellers — never prices, costs, quantities, or order/customer fields). Do not widen these selects without re-checking what becomes publicly visible.

11. **`supabase/rls-policies.sql` is stale — don't trust it for the actual deployed policy.** Live policies (checked via Supabase MCP `execute_sql` against `pg_policies`) are simpler than the file: `orders`, `order_items`, and `cashier_profiles` all use a single permissive `auth_all` policy (`auth.role() = 'authenticated'`) — any authenticated cashier can read/write all rows, not just their own. This is why cross-cashier joins (e.g. cashier-dashboard showing "rung by [other cashier]") work without extra policy changes. When in doubt about what's really enforced, query `pg_policies` directly instead of reading the checked-in file.

12. **Discount code `uses_count` IS incremented at checkout** — `apply-discount` is a preview-only route (no DB writes). The actual increment happens in `checkout/route.ts` after the order is committed, via the atomic `increment_discount_uses(code_id)` Postgres RPC (avoids read-then-write race when two checkouts use the same code simultaneously). The old CLAUDE.md note saying "does NOT increment" was stale.

13. **Topup double-credit prevention** — `topup-confirm` POST now updates `balance_topups.status = 'confirmed' WHERE id=X AND status='pending'` BEFORE touching `bochurim.balance`. If two requests race, exactly one will claim the row; the other gets 0 rows back and receives a 409. This prevents the same top-up from being double-credited if two cashiers tap Confirm simultaneously.

14. **Admin-entered URLs (e.g. `payment_cc_link`) need a protocol before `window.open`/`<a href>`** — if the admin types `example.com/x` without `http(s)://`, the browser treats it as a relative path off the current origin (`canteen.szvtech.org/example.com/x`) instead of opening the external site. Always normalize with something like `/^https?:\/\//i.test(v) ? v : \`https://${v}\`` before using an admin-entered link as a navigation target.

13. **New public-facing `settings` keys must be added to the anon RLS allowlist or they silently read as empty.** The `settings` table's anon SELECT policy (`anon can read public settings` in `pg_policies`) only exposes an explicit list of keys to unauthenticated visitors (the home page). Adding a new `payment_*`/`nine_days_*`/`top_sellers_*` setting and wiring it into `LandingClient.tsx`/`lib/home.ts` is not enough — if the key isn't also added to that policy's allowlist, real parents get `undefined`/empty for it even though it works fine when you (as an authenticated admin) test it. This bit us once already: `payment_cc_prefill_enabled`, `payment_cc_amount_param`, `payment_cc_name_param` were missed when the policy was tightened. Check `pg_policies` directly (see gotcha #11) rather than assuming a new setting is automatically public-readable.

14. **`lib/email.ts`'s Resend client must stay lazily constructed.** `new Resend(key)` throws immediately if `RESEND_API_KEY` is falsy, and since Next.js imports route modules during build-time page data collection, doing this at module scope breaks `npm run build`/every deploy whenever the env var isn't set — not just at runtime. Keep it behind a `getResend()` accessor, never a top-level `const resend = new Resend(...)`.

15. **A stale/older session's branch can silently revert already-merged work when it's squash-merged later.** This happened on 2026-07-10: a session that added Turnstile/Resend/SpeedInsights had forked its branch *before* the home-page mobile-polish PR had merged. Squash-merge has no real ancestry — when that older branch's PR was merged into `main` afterward, git's 3-way merge used a stale common ancestor, and the parts of `LandingClient.tsx` that older branch never touched still showed as "changed" relative to that ancestor in a way that produced merge conflicts against the newer mobile-polish text (not a silent revert exactly, but it required manually reconciling file-by-file rather than trusting the auto-merge). **To avoid this:** before starting real work in *any* session/branch — especially if it's been open a while or if you know other sessions might be working on the same repo — run `git fetch origin main` and reset/rebase your branch onto the current `main` tip first (`git checkout -B <branch> origin/main`, or rebase if you have unmerged work to preserve). When merging a branch that's been open for a while, don't trust a clean `git merge` result blindly — run `git diff --name-only HEAD origin/main` afterward and spot-check that every file matches what you expect, since squash-merge conflicts can resolve "cleanly" in the wrong direction.

16. **Run `mcp__Supabase__get_advisors` (security + performance) periodically — it caught a live, actively-exploitable data breach on 2026-07-10.** The `bochurim_with_id` view (used everywhere student data is read — bochurim page, dashboard, checkout, top-up modal, etc.) was `SECURITY DEFINER` *and* had `anon` granted SELECT/INSERT/UPDATE/DELETE on it. Since SECURITY DEFINER views run with the view creator's privileges rather than the querying user's, this completely bypassed the underlying `bochurim` table's RLS (`auth.role() = 'authenticated'`) — meaning anyone on the internet, with no login at all, could read (and possibly write) every student's name, phone number, balance, and notes via the plain PostgREST API using nothing but the public anon key. Nobody noticed because the app itself always queries it as an authenticated cashier, so it "worked fine" from inside the app the whole time. Fixed via `ALTER VIEW public.bochurim_with_id SET (security_invoker = true)` plus revoking all anon grants and trimming authenticated to SELECT-only. **Any time a new view is added, check `information_schema.role_table_grants` for that view and confirm it isn't `SECURITY DEFINER` with anon access** — `pg_get_viewdef` + the security advisor won't always make the anon-grant part obvious at a glance; check grants explicitly. Also found and fixed in the same pass: 5 unused tables (`pre_order_items`, `topup_requests`, `purchase_orders`, `pre_orders`, `purchase_order_items` — all empty, zero code references, likely abandoned scaffolding from an earlier iteration) had RLS disabled entirely; the anon `balance_topups` INSERT policy had lost its amount/status bounds check (`WITH CHECK (true)`) at some point and was restored; and the `product-images`/`site-assets` Storage buckets had a redundant "public read" RLS policy on `storage.objects` that additionally permitted anonymous bucket-listing/enumeration (removed — both buckets are `public: true`, so direct object GET already bypasses RLS without that policy; only the listing capability was lost, which nothing in the app uses).

17. **Stripe Payment Links do not support prefilling the payment amount via URL query parameter — don't build against a `prefilled_amount`-style param, it doesn't exist.** Confirmed against Stripe's own docs (docs.stripe.com/payment-links/url-parameters): the only officially supported params are `client_reference_id` (passes a reference string through to the Checkout Session, genuinely useful for tying a payment back to a camper), `prefilled_email`, and UTM tracking params. There is no way to set a custom dollar amount via URL on a shared Payment Link — if the link has a fixed price it can't be overridden, and if it's a "customer enters amount" link the customer must type the number in manually on Stripe's page regardless of any URL param. An earlier version of this app had `payment_cc_prefill_enabled`/`payment_cc_amount_param`/`payment_cc_name_param` admin settings based on incorrect third-party (Gemini) advice that an amount param existed — removed 2026-07-13. The current design instead computes the fee-inclusive amount client-side and displays it in a modal for the parent to type in themselves, and always appends `client_reference_id` (hardcoded, not admin-configurable, since it's the one param that's real).

18. **PostgREST joins only work for FKs within the `public` schema — cross-schema FKs (e.g. to `auth.users`) are invisible to PostgREST.** `balance_topups.created_by` and `confirmed_by` both have FK constraints to `auth.users` (auth schema). PostgREST can't traverse these, so `cashier_profiles!created_by(name)` will never resolve and causes the entire `.select()` to return null. The fix is to not join across schemas: use `sender_name` (already denormalized into the row) or add a second FK to a public-schema table if the join is truly needed.

17. **`account_types.type` is NOT NULL with no default** — when inserting a new account type, the `type` column must be provided or the DB will reject the row. In `AccountTypesPanel.tsx`, `type` is set to `baseSlug` (the name-derived slug without the timestamp suffix). UPDATE statements don't need to provide it, only INSERTs.

---

## Deployment

- Vercel auto-deploys `main` → canteen.szvtech.org
- Dev branch: `claude/practical-meitner-je2psm`
- Workflow: code on dev branch → push → create PR → merge to main (Claude does this)

---

## Changelog

| Date | Change |
|---|---|
| 2026-07-12 | Security: fix TOCTOU race in topup-confirm — atomic status claim with `.eq('status','pending')` guard before balance update prevents double-credit |
| 2026-07-12 | Security: discount uses_count increment made atomic via `increment_discount_uses` Postgres RPC (avoids read-then-write race with concurrent checkouts) |
| 2026-07-12 | Security audit: all API routes verified — admin routes guarded by requireCashier()/requireAdmin(), public routes (/api/topup, /api/home/top-sellers) intentionally unauthenticated with rate limiting / tight data scoping |
| 2026-07-12 | RLS audit: bundle_items has anon SELECT (qual=true) — non-sensitive product bundle composition data, noted in Known Issues |
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
| 2026-07-09 | Feat: inventory burn-rate — Burn Rate column shows ~X days to stockout from 30-day velocity |
| 2026-07-09 | Feat: daily revenue target gauge on dashboard — progress bar toward target set in settings |
| 2026-07-09 | Feat: low balance alert log — failed balance checkouts logged to failed_checkout_log; shown on dashboard |
| 2026-07-09 | Feat: checkout discount preview — account type discount shown as line item with estimated amount |
| 2026-07-09 | Feat: home page redesign — Cash App payment method, online credit card top-up with no-refund warning modal, general payment-notes reminder banner ("CANTEEN - camper name"), Popular Items section (manual or safe DB-aggregated), Nine Days blurb + flyer upload, dismissible admin-posted home page announcement banner, hero text-wrap/spacing cleanup |
| 2026-07-09 | Infra: added `cashier_notifications.show_on_home_page` column; extended `balance_topups.method` check constraint with `cashapp`/`credit_card`; created `site-assets` Storage bucket (public, 10MB, image/PDF) with RLS |
| 2026-07-09 | Feat: cashier dashboard "Recent Orders" — tap to expand and see actual item names bought (not just a count); now shows which cashier rang up each order since all cashiers share this view; still no prices/$ shown |
| 2026-07-09 | Fix: CC top-up warning modal now explicitly tells parents the payment link opens in a new tab and to come back to submit the request — the app already opens Stripe/CC links via `window.open(..., '_blank')` rather than a same-tab redirect, so no dependency on Stripe redirecting back into the site |
| 2026-07-09 | Fix: `payment_cc_link` opened as a relative path (e.g. `canteen.szvtech.org/randomlink.com/...`) when the admin typed a link without `http(s)://` — now auto-prefixed with `https://` if missing |
| 2026-07-10 | Polish: home page mobile pass verified live via Playwright at 375/390/414/1280px — payment method cards restructured to two rows (badge+name+buttons on top, handle full-width below) so Copy/Open buttons never cramp against long handles/emails; fixed "Credit Card (Online)" truncating to "Credit Card (O..." in the card row (shortened to "Credit Card", full label kept in the method dropdown); payment-notes reminder banner now lists only the methods the admin actually enabled instead of a hardcoded list; hero heading/tagline sizing tightened for small phones with break-word safety; email input changed to `type="email"` for correct mobile keyboard; nav canteen name truncates instead of pushing the login button off-screen; announcement dismiss (X) button and payment method Copy/Open buttons given larger tap targets |
| 2026-07-10 | Feat (undocumented by original PR, backfilled): parent email notifications via Resend (`lib/email.ts`) for top-up received/approved/rejected, with admin-configurable sender identity, subject lines, and per-status extra notes (Settings page); Cloudflare Turnstile captcha added to the public top-up form (`NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `CLOUDFLARE_TURNSTILE_SECRET` env vars, no-op if unset); Vercel Speed Insights added to root layout |
| 2026-07-10 | Feat: "Credit Card — Coming soon" greyed-out placeholder card now always shows when `payment_cc_enabled` is off, so parents know it's on the way; clearer step-by-step copy on "how to add funds" (explicitly says to send money in your own banking app first, this page can't do it for you); prominent red warning box directly above the top-up form telling parents not to submit until they've actually sent the payment; methods with no deep link (e.g. Zelle) now show an inline note to open your banking app manually |
| 2026-07-10 | Fix: `lib/email.ts` constructed its Resend client at module load time, so any deploy without `RESEND_API_KEY` set failed the build outright (email sending is meant to be optional) — made the client lazily constructed |
| 2026-07-10 | Fix: the RLS security-hardening pass (see "Security: fix critical RLS exposures..." commit) restricted the anon `settings` SELECT policy to an explicit key allowlist but missed `payment_cc_prefill_enabled`/`payment_cc_amount_param`/`payment_cc_name_param` — the CC prefill feature would have silently never worked for real parents. Added those 3 keys to the allowlist via Supabase migration. **Gotcha for future sessions:** whenever a new public-facing `settings` key is added, it must also be added to this allowlist (`pg_policies` → `anon can read public settings` on the `settings` table) or anonymous parents will silently get an empty value for it. |
| 2026-07-09 | Feat: Accounts admin page (/accounts) — date-range payment balance cards (Cash/Zelle/CC/Balance/Total), outstanding student balance liability, withdrawal log with form + delete; new `withdrawal_log` table with RLS |
| 2026-07-09 | Feat: category filter pills on products admin page — All + one pill per category for client-side filtering; active pill highlighted with category color |
| 2026-07-09 | Feat: category delete warning now shows product count affected; product count shown on hover in category panel |
| 2026-07-09 | Chore: removed "Categories" from sidebar nav — categories are managed inline on the Products page |
| 2026-07-09 | Feat: dashboard Today's Net Profit card — queries today's expenses, wastage, COGS; shows revenue minus all costs in green/red |
| 2026-07-09 | Feat: reports new sections — Daily Revenue line chart (fills missing dates), Day-of-Week bar chart (Mon–Sun total + avg), Category Revenue table (zebra rows, units+revenue), Top 10 Student Spenders ranked list |
| 2026-07-10 | **Security (critical):** `bochurim_with_id` view was `SECURITY DEFINER` with `anon` SELECT/INSERT/UPDATE/DELETE grants, completely bypassing `bochurim`'s own RLS — anyone unauthenticated could read/write every student's name, phone, balance, and notes via the plain PostgREST API. Fixed via `security_invoker = true` + revoked anon grants (see gotcha #16). Found via routine `get_advisors` check. |
| 2026-07-10 | Security: enabled RLS (locked to service-role, no policies) on 5 unused, empty, zero-code-reference tables (`pre_order_items`, `topup_requests`, `purchase_orders`, `pre_orders`, `purchase_order_items`) that had RLS fully disabled and were publicly readable/writable |
| 2026-07-10 | Security: restored amount/status bounds on the anon `balance_topups` INSERT policy (`WITH CHECK (true)` had crept in at some point, dropping the `status='pending' AND 0 < amount <= 10000` check present in the original design) |
| 2026-07-10 | Security: removed redundant "public read" RLS policies on `storage.objects` for `product-images`/`site-assets` — both buckets are `public: true` so direct object GET already bypasses RLS; the policy only added anonymous bucket-listing/enumeration capability, which nothing in the app needs |
| 2026-07-10 | Security: hardened `update_updated_at()` function against search_path hijacking (`SET search_path = public`) |
| 2026-07-10 | Feat: Discount Codes admin page (/discount-codes) — the checkout engine already fully supported coupon codes but there was no admin UI to create them; new CRUD page follows the account-types page pattern, sidebar link added |
| 2026-07-10 | Feat: CC "Coming Soon" refinement — new `payment_cc_coming_soon_enabled` admin toggle; placeholder now only shows when CC is disabled AND `payment_cc_link` is empty AND the toggle is on, so an admin mid-configuration (link set, not yet enabled) or not wanting the announcement doesn't show anything instead of an automatic "coming soon"; added the new setting key to the anon RLS allowlist |
| 2026-07-13 | Fix: topups admin page showed empty even with pending rows — `cashier_profiles!created_by(name)` join failed because the FK on `balance_topups.created_by` points to `auth.users` (auth schema), not `cashier_profiles` (public schema); PostgREST can't traverse cross-schema FKs so the entire query returned null; fixed by dropping the join and using `sender_name` (already set by cashier-topup route) |
| 2026-07-13 | Feat: cashier top-up form now has optional Parent Email field — stored in `balance_topups.parent_email`; if provided, sends "received" confirmation email via Resend; admin approval also sends "approved" email to that address |
| 2026-07-13 | Feat: email send tracking on top-up rows — `balance_topups` gains `received_email_sent_at`, `approved_email_sent_at`, `rejected_email_sent_at` columns; email functions return `Promise<boolean>`; timestamps stamped on successful send; Top-ups admin shows MailCheck/MailX icons per row |
| 2026-07-13 | Feat: COGS page delete buttons — hover-reveal trash icon on both Wastage Log and Expenses table rows; confirm dialog before delete |
| 2026-07-13 | Feat: cashier POS top-ups now require admin confirmation — TopUpModal submits to `/api/pos/cashier-topup` which creates a pending `balance_topups` record; admin confirms/rejects from Admin → Top-ups page; Cashier/Parent badge on each row |
| 2026-07-12 | Feat: top-ups admin — "Approve without crediting" button (double-checkmark icon) on pending rows; passes `skip_credit: true` to POST /api/admin/topup-confirm which marks status confirmed + sends email but skips balance update and ledger entry; intended for cases where admin already manually credited balance |
| 2026-07-12 | Feat: top-ups admin — hide processed rows by default; "Show All" / "Hide Processed" toggle in header; subtitle shows count of hidden processed rows; empty-state inline link to reveal them |
| 2026-07-13 | Redesign: Reports page fully rebuilt — 4 tabs (Overview/Products/Profit & COGS/Students), smart date presets incl. "☀️ This Summer" (default), period nav arrows (prev/next), chart↔table toggle on every card, student name click opens BochurProfileModal inline, wastage inline edit (notes) + delete, enhanced CSV export (adds Items column), print button with print-CSS |
| 2026-07-13 | Feat: cash change → student balance — when cash payment + student selected + change > 0, toggle appears to credit the change amount to their balance instead of handing back coins; checkout API credits bochurim.balance + logs balance_ledger entry |
| 2026-07-13 | Feat: restock edit/delete on COGS Purchase History tab — hover-reveal pencil + trash on each row; edit modal for qty/cost/notes; delete with confirm dialog |
| 2026-07-13 | UX: inventory restock modal — "Batch cost per unit (this restock only)" label + blue summary box; default cost_price unchanged unless checkbox explicitly checked |
| 2026-07-13 | Feat: Purchase History tab on COGS page — shows stock_entries batch restock costs (date/product/units/cost-per-unit/total); monthly summary card + all-time total footer |
| 2026-07-12 | Fix: creating new account types now works — `account_types.type` (NOT NULL, no default) was never included in the insert payload; now set to `baseSlug` derived from the type name |
| 2026-07-12 | UX: products admin Cost Price field now shows helper text "Used for 'At cost' account type discounts" |
| 2026-07-12 | Fix: transactions page walk-in orders now visible — replaced unreliable PostgREST LEFT JOIN with two-query pattern (fetch orders, then fetch bochur names separately, merge client-side) so null bochur_id orders always appear |
| 2026-07-12 | Fix: tip amount now displayed in transaction detail modal (shown as informational line in payments section) |
| 2026-07-12 | Infra: added `balance_topups.payment_received_date date` column via migration |
| 2026-07-12 | Feat: topups admin page — Date Received date picker for pending rows (defaults to today); date sent to confirm API and stored; non-pending rows show payment_received_date (or confirmed_at fallback) |
| 2026-07-12 | Feat: accounts page — new "Top-up Deposits Received" section showing confirmed top-ups grouped by method, filtered by payment_received_date (fallback to confirmed_at), within the selected date range |
| 2026-07-12 | Feat: reports page — COGS breakdown table showing product name, units sold, cost/unit, and total cost contribution for all products with cost_price set; appears below the financial strip |
| 2026-07-12 | Feat: cashier tip payout now credits linked bochur balance — new `payout_tips` API action in PATCH /api/admin/cashier; credits tip_balance to bochurim.balance, logs to balance_ledger, zeros tip_balance; if no bochur linked, shows informative message and falls back to cash payout (just zeros tip_balance) |
| 2026-07-12 | UX: parent top-up form splits "Son's Name" into "Son's First Name" + "Son's Last Name" (both required, separate fields); concatenated as `student_name` before sending — no API or DB change |
| 2026-07-12 | Feat: admin top-ups page — smart name-match suggestions for unlinked pending rows; word-overlap scoring (≥0.5 = suggestion, ≥0.85 = amber highlight); "💡 Name? Yes ✓" chip for one-tap linking; `saveLink` accepts optional override bochurId |
| 2026-07-12 | UX: admin top-ups reject button now opens an inline modal with optional reason textarea + preset chips (Payment not received / Duplicate request / Wrong amount); reason sent to PATCH topup-confirm and included in rejection email |
| 2026-07-12 | Refactor: admin sidebar reduced from ~15 items to 6 nav items + POS Terminal shortcut — new Finance hub page (`/finance`) absorbs Top-ups/Accounts/COGS as tabs; Products page gains Bundles/Inventory/Discount Codes tabs; Transactions page gains Refund Requests tab; Settings page gains Cashiers/Notifications/Menu tabs; Dashboard gets "View Full Analytics" link to /reports; POS Terminal button opens in new tab |
| 2026-07-13 | Feat: parent top-up form reordered — camper's First/Last Name is now its own row at the very top of the form, above the parent's own info (was previously interleaved across two rows) |
| 2026-07-13 | Feat: Credit Card top-up now shows the live `cc_fee_percent` setting on the parent home page (e.g. "3.5% fee" badge, plus an inline hint once selected in the dropdown) |
| 2026-07-13 | Feat: Credit Card flow changed to submit-then-pay — the pending request is saved to the DB as soon as the form is submitted (same as any other method), then a modal shows the fee math ("$100 requested + $3.63 fee = send $103.63") and opens the Stripe link; success screen keeps an "Open Payment Page" button as a fallback if the parent skips or closes the modal. Replaces the old flow where selecting Credit Card in the dropdown immediately warned/redirected before the rest of the form was even filled out |
| 2026-07-13 | Fix: removed `payment_cc_prefill_enabled`/`payment_cc_amount_param`/`payment_cc_name_param` settings — Stripe Payment Links have no real "prefill amount" URL parameter (confirmed against Stripe's docs), so this never worked; only `client_reference_id` (camper's name) is real and is now always appended automatically, no admin config needed |
| 2026-07-13 | Infra: added `cc_fee_percent` to the anon settings RLS allowlist (needed by the public home page now); removed the 3 now-deleted prefill/param keys from the same allowlist |
