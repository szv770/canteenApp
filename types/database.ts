export interface AccountType {
  id: string
  name: string
  discount_type: 'none' | 'percentage' | 'cost_price' | 'fixed'
  discount_value: number
  excluded_categories: string[]
  is_active: boolean
  created_at: string
}

export interface Category {
  id: string
  name: string
  color: string
  parent_id: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface Product {
  id: string
  name: string
  price: number
  cost_price: number
  stock_quantity: number
  low_stock_threshold: number
  icon: string | null
  has_variants: boolean
  is_active: boolean
  show_when_out_of_stock: boolean
  created_at: string
  updated_at: string
  sale_price?: number | null
  sale_active?: boolean
  sale_label?: string | null
  sale_starts_at?: string | null
  sale_ends_at?: string | null
  allow_preorder?: boolean
}

export interface DiscountCode {
  id: string
  code: string
  description: string | null
  type: 'percent' | 'fixed'
  value: number
  min_order_amount: number
  max_uses: number | null
  uses_count: number
  is_active: boolean
  expires_at: string | null
  created_at: string
}

export interface ProductVariant {
  id: string
  product_id: string
  label: string
  price: number
  stock_quantity: number
  sort_order: number
  is_active: boolean
}

export interface ProductAddon {
  id: string
  product_id: string
  name: string
  price_addition: number
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface Supplier {
  id: string
  name: string
  contact: string | null
  created_at: string
}

export interface Bochur {
  id: string
  name: string
  grade: string | null
  phone: string | null
  account_type_id: string
  balance: number
  allow_negative: boolean
  max_negative_balance: number
  notes: string | null
  archived: boolean
  is_frozen: boolean
  freeze_reason: string | null
  created_at: string
  updated_at: string
}

export interface BochurWithId extends Bochur {
  bochur_id: string
  account_type: AccountType
}

export interface CashierProfile {
  id: string
  name: string
  role: 'admin' | 'cashier'
  is_active: boolean
  created_at: string
}

export interface Order {
  id: string
  order_number: number
  bochur_id: string | null
  cashier_id: string
  subtotal: number
  discount_amount: number
  total: number
  status: 'completed' | 'voided' | 'refunded'
  notes: string | null
  void_reason: string | null
  voided_by: string | null
  created_at: string
}

export interface PreOrder {
  id: string
  bochur_id: string
  scheduled_date: string
  meal_period: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  notes: string | null
  status: 'pending' | 'ready' | 'collected' | 'cancelled'
  cashier_id: string | null
  total: number
  created_at: string
}

export interface PreOrderItem {
  id: string
  pre_order_id: string
  product_id: string | null
  product_name: string
  quantity: number
  unit_price: number
}

export interface TopupRequest {
  id: string
  bochur_id: string | null
  parent_name: string | null
  amount: number
  method: 'cash' | 'zelle' | 'credit_card' | 'check' | 'other'
  parent_notes: string | null
  admin_notes: string | null
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

export interface PurchaseOrder {
  id: string
  supplier: string | null
  notes: string | null
  total_cost: number
  created_at: string
  created_by: string | null
}

export interface PurchaseOrderItem {
  id: string
  po_id: string
  product_id: string | null
  product_name: string
  quantity_added: number
  unit_cost: number
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  variant_id: string | null
  product_name: string
  variant_label: string | null
  quantity: number
  unit_price: number
  discount_amount: number
  total: number
}

export interface Payment {
  id: string
  order_id: string
  method: 'balance' | 'cash' | 'credit_card' | 'zelle' | 'mixed'
  amount: number
  cash_tendered: number | null
  change_given: number | null
  cc_fee: number | null
  created_at: string
}

export interface BalanceLedger {
  id: string
  bochur_id: string
  amount: number
  type: 'purchase' | 'topup' | 'refund' | 'adjustment'
  method: string | null
  order_id: string | null
  note: string | null
  cashier_id: string | null
  created_at: string
}

export interface AppSettings {
  key: string
  value: string
  updated_at: string
}

export interface CartItem {
  product_id: string
  variant_id: string | null
  name: string
  variant_label: string | null
  icon: string | null
  price: number
  quantity: number
  addon_ids?: string[]
  addon_names?: string[]
  addon_total?: number
  is_bundle?: boolean
  bundle_item_ids?: string[]
  bundle_included_names?: string[]
}

export interface ProductBundle {
  id: string
  name: string
  description: string | null
  price: number
  original_price: number | null
  icon: string | null
  is_active: boolean
  sort_order: number
}

export interface BundleItem {
  id: string
  bundle_id: string
  product_id: string
  quantity: number
  // joined
  products?: { name: string; icon: string | null }
}

export interface ProductBundleWithItems extends ProductBundle {
  bundle_items: BundleItem[]
}
