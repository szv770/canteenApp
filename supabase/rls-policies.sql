-- =============================================================================
-- REQUIRED ROW-LEVEL SECURITY (RLS) POLICIES
-- Apply these in your Supabase SQL editor or via a migration.
-- All money-sensitive tables must have RLS enabled AND enforcing policies.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. bochurim — student accounts with balances
-- -----------------------------------------------------------------------------
ALTER TABLE bochurim ENABLE ROW LEVEL SECURITY;

-- Authenticated cashiers/admins can read all bochurim
CREATE POLICY "cashiers_select_bochurim"
  ON bochurim FOR SELECT
  TO authenticated
  USING (true);

-- Only authenticated cashiers/admins can INSERT new bochurim
CREATE POLICY "cashiers_insert_bochurim"
  ON bochurim FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cashier_profiles
      WHERE id = auth.uid() AND is_active = true
    )
  );

-- Only authenticated cashiers/admins can UPDATE bochurim (e.g. balance changes)
CREATE POLICY "cashiers_update_bochurim"
  ON bochurim FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cashier_profiles
      WHERE id = auth.uid() AND is_active = true
    )
  );

-- Only admins can archive/delete bochurim
CREATE POLICY "admins_delete_bochurim"
  ON bochurim FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cashier_profiles
      WHERE id = auth.uid() AND role = 'admin' AND is_active = true
    )
  );

-- IMPORTANT: Anonymous users (parents on landing page) must NOT be able to
-- read or write bochurim. The anon role should have NO policies here.
-- All money writes go through server-side API routes using the service role key.

-- -----------------------------------------------------------------------------
-- 2. balance_topups — parent payment requests
-- -----------------------------------------------------------------------------
ALTER TABLE balance_topups ENABLE ROW LEVEL SECURITY;

-- Allow anonymous INSERT so parents can submit top-up requests
-- (The /api/topup route validates all inputs server-side before inserting)
CREATE POLICY "anon_insert_topups"
  ON balance_topups FOR INSERT
  TO anon
  WITH CHECK (
    status = 'pending'
    AND amount > 0
    AND amount <= 10000
  );

-- Authenticated cashiers/admins can read all topups
CREATE POLICY "cashiers_select_topups"
  ON balance_topups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cashier_profiles
      WHERE id = auth.uid() AND is_active = true
    )
  );

-- Only authenticated cashiers/admins can UPDATE topup status (confirm/reject/link)
-- Actual status changes go through /api/admin/topup-confirm which uses service role
CREATE POLICY "cashiers_update_topups"
  ON balance_topups FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cashier_profiles
      WHERE id = auth.uid() AND is_active = true
    )
  );

-- Anonymous users must NOT be able to SELECT balance_topups
-- (they contain parent email, phone, etc.)

-- -----------------------------------------------------------------------------
-- 3. balance_ledger — audit trail of all balance changes
-- -----------------------------------------------------------------------------
ALTER TABLE balance_ledger ENABLE ROW LEVEL SECURITY;

-- Only authenticated cashiers/admins can read the ledger
CREATE POLICY "cashiers_select_ledger"
  ON balance_ledger FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cashier_profiles
      WHERE id = auth.uid() AND is_active = true
    )
  );

-- Only authenticated cashiers/admins can insert ledger entries
-- (In practice, all inserts go through service-role API routes)
CREATE POLICY "cashiers_insert_ledger"
  ON balance_ledger FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cashier_profiles
      WHERE id = auth.uid() AND is_active = true
    )
  );

-- No one should UPDATE or DELETE ledger entries (immutable audit trail)

-- -----------------------------------------------------------------------------
-- 4. orders, order_items, payments — transaction records
-- -----------------------------------------------------------------------------
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cashiers_all_orders"
  ON orders FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cashier_profiles
      WHERE id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "cashiers_all_order_items"
  ON order_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cashier_profiles
      WHERE id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "cashiers_all_payments"
  ON payments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cashier_profiles
      WHERE id = auth.uid() AND is_active = true
    )
  );

-- Anonymous users must NOT be able to access orders/payments.

-- -----------------------------------------------------------------------------
-- 5. cashier_profiles — staff accounts
-- -----------------------------------------------------------------------------
ALTER TABLE cashier_profiles ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read their own profile (for role checks)
CREATE POLICY "self_select_profile"
  ON cashier_profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Admins can read all profiles
CREATE POLICY "admins_select_profiles"
  ON cashier_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cashier_profiles
      WHERE id = auth.uid() AND role = 'admin' AND is_active = true
    )
  );

-- Only service role (API routes) should INSERT/UPDATE/DELETE cashier_profiles
-- Do NOT add authenticated INSERT/UPDATE policies here — use /api/admin/cashier

-- -----------------------------------------------------------------------------
-- 6. products, categories, product_categories — catalog
-- -----------------------------------------------------------------------------
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

-- Read-only for authenticated users (POS needs to browse)
CREATE POLICY "cashiers_select_products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "cashiers_select_categories"
  ON categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "cashiers_select_product_categories"
  ON product_categories FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can mutate the catalog
CREATE POLICY "admins_mutate_products"
  ON products FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cashier_profiles
      WHERE id = auth.uid() AND role = 'admin' AND is_active = true
    )
  );

-- -----------------------------------------------------------------------------
-- 7. settings — app configuration
-- -----------------------------------------------------------------------------
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read public settings (shown on landing page)
CREATE POLICY "anon_select_settings"
  ON settings FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only admins can mutate settings
CREATE POLICY "admins_update_settings"
  ON settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cashier_profiles
      WHERE id = auth.uid() AND role = 'admin' AND is_active = true
    )
  );

-- =============================================================================
-- SUMMARY OF SECURITY MODEL
-- =============================================================================
-- • Anonymous (parents): can INSERT balance_topups and SELECT settings only.
--   All inserts go through /api/topup which validates server-side.
-- • Authenticated cashiers: can read catalog, search bochurim, process orders.
--   All money writes (balance updates, ledger) go through service-role API routes.
-- • Authenticated admins: can manage catalog, confirm topups, manage cashiers.
--   Admin operations go through /api/admin/* routes which verify admin role.
-- • Service role key: used only in server-side API routes, never in client bundle.
-- =============================================================================
