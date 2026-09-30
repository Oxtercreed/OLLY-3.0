-- OLLY Food-Processing ERP Schema
-- Transaction-driven architecture: Purchases → Production → Inventory → Sales → Payments → Profit

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE item_type AS ENUM ('raw_material', 'packaging', 'finished_good');
CREATE TYPE payment_method AS ENUM ('cash', 'mobile_money', 'bank', 'credit');
CREATE TYPE payment_status AS ENUM ('pending', 'partial', 'paid', 'overdue');
CREATE TYPE production_status AS ENUM ('draft', 'in_progress', 'completed', 'cancelled');
CREATE TYPE movement_type AS ENUM (
  'purchase', 'production_consume', 'production_output',
  'sale', 'adjustment', 'waste', 'transfer'
);
CREATE TYPE ledger_entry_type AS ENUM (
  'revenue', 'cogs', 'expense', 'payroll', 'purchase',
  'payment_in', 'payment_out', 'adjustment'
);

-- ============================================================
-- CORE: PRODUCTS & RECIPES
-- ============================================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  type item_type NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs', -- kg, L, pcs, etc.
  selling_price NUMERIC(14,2) DEFAULT 0,
  cost_price NUMERIC(14,2) DEFAULT 0, -- last known / average unit cost
  reorder_level NUMERIC(14,3) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE, -- finished good
  name TEXT NOT NULL,
  yield_quantity NUMERIC(14,3) NOT NULL DEFAULT 1, -- units produced by this recipe
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id)
);

CREATE TABLE recipe_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id), -- raw or packaging
  quantity NUMERIC(14,4) NOT NULL, -- amount needed per recipe yield
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVENTORY (movement-based)
-- ============================================================
CREATE TABLE inventory_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id)
);

CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id),
  movement_type movement_type NOT NULL,
  quantity NUMERIC(14,4) NOT NULL, -- positive = in, negative = out
  unit_cost NUMERIC(14,4) DEFAULT 0,
  reference_type TEXT, -- 'purchase', 'production', 'sale', etc.
  reference_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

CREATE INDEX idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX idx_inventory_movements_ref ON inventory_movements(reference_type, reference_id);

-- ============================================================
-- RELATIONSHIPS: CUSTOMERS & SUPPLIERS
-- ============================================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customer / Supplier ledgers are derived from sales, purchases, payments

-- ============================================================
-- PURCHASES
-- ============================================================
CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID REFERENCES suppliers(id),
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_number TEXT,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_method payment_method DEFAULT 'cash',
  payment_status payment_status DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity NUMERIC(14,4) NOT NULL,
  unit_cost NUMERIC(14,4) NOT NULL,
  line_total NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED
);

-- ============================================================
-- PRODUCTION
-- ============================================================
CREATE TABLE production_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_number TEXT UNIQUE NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id), -- finished good
  recipe_id UUID REFERENCES recipes(id),
  planned_quantity NUMERIC(14,3) NOT NULL,
  actual_quantity NUMERIC(14,3), -- good output
  waste_quantity NUMERIC(14,3) DEFAULT 0,
  waste_reason TEXT,
  status production_status DEFAULT 'draft',
  material_cost NUMERIC(14,2) DEFAULT 0,
  packaging_cost NUMERIC(14,2) DEFAULT 0,
  labor_cost NUMERIC(14,2) DEFAULT 0,
  overhead_cost NUMERIC(14,2) DEFAULT 0,
  total_cost NUMERIC(14,2) DEFAULT 0,
  unit_cost NUMERIC(14,4) DEFAULT 0, -- total_cost / actual_quantity
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE production_consumptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity NUMERIC(14,4) NOT NULL,
  unit_cost NUMERIC(14,4) DEFAULT 0,
  line_cost NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED
);

-- ============================================================
-- SALES
-- ============================================================
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id), -- null = walk-in
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_number TEXT,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_method payment_method DEFAULT 'cash',
  payment_status payment_status DEFAULT 'paid',
  cogs_amount NUMERIC(14,2) DEFAULT 0, -- calculated from inventory costs
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity NUMERIC(14,4) NOT NULL,
  unit_price NUMERIC(14,4) NOT NULL,
  unit_cost NUMERIC(14,4) DEFAULT 0, -- for COGS
  line_total NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

-- ============================================================
-- PAYMENTS (customer receipts & supplier payments)
-- ============================================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')), -- in = from customer, out = to supplier
  customer_id UUID REFERENCES customers(id),
  supplier_id UUID REFERENCES suppliers(id),
  amount NUMERIC(14,2) NOT NULL,
  payment_method payment_method NOT NULL DEFAULT 'cash',
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_type TEXT, -- 'sale', 'purchase', or free
  reference_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EXPENSES
-- ============================================================
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL, -- transport, electricity, water, security, other
  description TEXT,
  amount NUMERIC(14,2) NOT NULL,
  payment_method payment_method DEFAULT 'cash',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EMPLOYEES & PAYROLL
-- ============================================================
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  salary NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  hire_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payroll_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_label TEXT NOT NULL, -- e.g. "September 2026"
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_amount NUMERIC(14,2) DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payroll_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  base_salary NUMERIC(14,2) NOT NULL,
  allowances NUMERIC(14,2) DEFAULT 0,
  deductions NUMERIC(14,2) DEFAULT 0,
  net_amount NUMERIC(14,2) GENERATED ALWAYS AS (base_salary + allowances - deductions) STORED,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid'))
);

-- ============================================================
-- LEDGER / ACCOUNTING ENTRIES (single source of truth for P&L)
-- ============================================================
CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_type ledger_entry_type NOT NULL,
  amount NUMERIC(14,2) NOT NULL, -- always positive; direction by type
  description TEXT,
  reference_type TEXT,
  reference_id UUID,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ledger_entries_type_date ON ledger_entries(entry_type, entry_date);
CREATE INDEX idx_ledger_entries_ref ON ledger_entries(reference_type, reference_id);

-- ============================================================
-- HELPER: update inventory balance trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_inventory_balance()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO inventory_balances (product_id, quantity, updated_at)
  VALUES (NEW.product_id, NEW.quantity, NOW())
  ON CONFLICT (product_id)
  DO UPDATE SET
    quantity = inventory_balances.quantity + NEW.quantity,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_movement
AFTER INSERT ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION update_inventory_balance();

-- ============================================================
-- FUNCTION: complete production batch (atomic)
-- ============================================================
CREATE OR REPLACE FUNCTION complete_production_batch(
  p_batch_id UUID,
  p_actual_qty NUMERIC,
  p_waste_qty NUMERIC DEFAULT 0,
  p_waste_reason TEXT DEFAULT NULL,
  p_labor_cost NUMERIC DEFAULT 0,
  p_overhead_cost NUMERIC DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
  v_batch production_batches%ROWTYPE;
  v_cons RECORD;
  v_total_material NUMERIC := 0;
  v_total_packaging NUMERIC := 0;
  v_total_cost NUMERIC;
  v_unit_cost NUMERIC;
  v_product products%ROWTYPE;
BEGIN
  SELECT * INTO v_batch FROM production_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;
  IF v_batch.status = 'completed' THEN
    RAISE EXCEPTION 'Batch already completed';
  END IF;

  SELECT * INTO v_product FROM products WHERE id = v_batch.product_id;

  -- Consume materials (already recorded in production_consumptions)
  FOR v_cons IN
    SELECT pc.*, p.type, p.cost_price
    FROM production_consumptions pc
    JOIN products p ON p.id = pc.product_id
    WHERE pc.batch_id = p_batch_id
  LOOP
    -- Check stock
    IF (SELECT COALESCE(quantity,0) FROM inventory_balances WHERE product_id = v_cons.product_id) < v_cons.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product %', v_cons.product_id;
    END IF;

    -- Movement out
    INSERT INTO inventory_movements (product_id, movement_type, quantity, unit_cost, reference_type, reference_id)
    VALUES (v_cons.product_id, 'production_consume', -v_cons.quantity, v_cons.unit_cost, 'production', p_batch_id);

    IF v_cons.type = 'raw_material' THEN
      v_total_material := v_total_material + (v_cons.quantity * v_cons.unit_cost);
    ELSE
      v_total_packaging := v_total_packaging + (v_cons.quantity * v_cons.unit_cost);
    END IF;
  END LOOP;

  v_total_cost := v_total_material + v_total_packaging + COALESCE(p_labor_cost,0) + COALESCE(p_overhead_cost,0);
  IF p_actual_qty > 0 THEN
    v_unit_cost := v_total_cost / p_actual_qty;
  ELSE
    v_unit_cost := 0;
  END IF;

  -- Output finished goods
  IF p_actual_qty > 0 THEN
    INSERT INTO inventory_movements (product_id, movement_type, quantity, unit_cost, reference_type, reference_id)
    VALUES (v_batch.product_id, 'production_output', p_actual_qty, v_unit_cost, 'production', p_batch_id);

    -- Update product cost_price (weighted average simplified: use latest unit cost)
    UPDATE products SET cost_price = v_unit_cost, updated_at = NOW() WHERE id = v_batch.product_id;
  END IF;

  -- Waste movement if tracked as separate (optional: just record qty)
  UPDATE production_batches SET
    actual_quantity = p_actual_qty,
    waste_quantity = COALESCE(p_waste_qty, 0),
    waste_reason = p_waste_reason,
    material_cost = v_total_material,
    packaging_cost = v_total_packaging,
    labor_cost = COALESCE(p_labor_cost, 0),
    overhead_cost = COALESCE(p_overhead_cost, 0),
    total_cost = v_total_cost,
    unit_cost = v_unit_cost,
    status = 'completed',
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_batch_id;

  -- Ledger: production cost is tracked via COGS at sale time; optional production overhead as expense
  IF COALESCE(p_labor_cost,0) + COALESCE(p_overhead_cost,0) > 0 THEN
    INSERT INTO ledger_entries (entry_type, amount, description, reference_type, reference_id, entry_date)
    VALUES ('expense', COALESCE(p_labor_cost,0) + COALESCE(p_overhead_cost,0),
            'Production overhead/labor - batch ' || v_batch.batch_number,
            'production', p_batch_id, CURRENT_DATE);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'total_cost', v_total_cost,
    'unit_cost', v_unit_cost
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: record sale (atomic) with COGS
-- ============================================================
CREATE OR REPLACE FUNCTION record_sale(
  p_customer_id UUID,
  p_items JSONB, -- [{product_id, quantity, unit_price}]
  p_payment_method payment_method DEFAULT 'cash',
  p_paid_amount NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_sale_id UUID;
  v_item JSONB;
  v_product products%ROWTYPE;
  v_qty NUMERIC;
  v_price NUMERIC;
  v_cost NUMERIC;
  v_total NUMERIC := 0;
  v_cogs NUMERIC := 0;
  v_paid NUMERIC;
  v_status payment_status;
  v_invoice TEXT;
BEGIN
  v_sale_id := uuid_generate_v4();
  v_invoice := 'INV-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(v_sale_id::text, 1, 6);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_price := (v_item->>'unit_price')::NUMERIC;
    SELECT * INTO v_product FROM products WHERE id = (v_item->>'product_id')::UUID;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

    -- Stock check
    IF (SELECT COALESCE(quantity,0) FROM inventory_balances WHERE product_id = v_product.id) < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for % (available: %)', v_product.name,
        (SELECT COALESCE(quantity,0) FROM inventory_balances WHERE product_id = v_product.id);
    END IF;

    v_cost := COALESCE(v_product.cost_price, 0);
    v_total := v_total + (v_qty * v_price);
    v_cogs := v_cogs + (v_qty * v_cost);
  END LOOP;

  v_paid := COALESCE(p_paid_amount, CASE WHEN p_payment_method = 'credit' THEN 0 ELSE v_total END);
  IF v_paid >= v_total THEN
    v_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_status := 'partial';
  ELSE
    v_status := 'pending';
  END IF;

  -- Insert parent sale FIRST so foreign key in sale_items succeeds
  INSERT INTO sales (id, customer_id, sale_date, invoice_number, total_amount, paid_amount, payment_method, payment_status, cogs_amount, notes)
  VALUES (v_sale_id, p_customer_id, CURRENT_DATE, v_invoice, v_total, v_paid, p_payment_method, v_status, v_cogs, p_notes);

  -- Insert child sale_items and inventory movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_price := (v_item->>'unit_price')::NUMERIC;
    SELECT * INTO v_product FROM products WHERE id = (v_item->>'product_id')::UUID;
    v_cost := COALESCE(v_product.cost_price, 0);

    INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, unit_cost)
    VALUES (v_sale_id, v_product.id, v_qty, v_price, v_cost);

    -- Inventory out
    INSERT INTO inventory_movements (product_id, movement_type, quantity, unit_cost, reference_type, reference_id)
    VALUES (v_product.id, 'sale', -v_qty, v_cost, 'sale', v_sale_id);
  END LOOP;

  -- Ledger: revenue + COGS
  INSERT INTO ledger_entries (entry_type, amount, description, reference_type, reference_id, entry_date)
  VALUES ('revenue', v_total, 'Sale ' || v_invoice, 'sale', v_sale_id, CURRENT_DATE);

  INSERT INTO ledger_entries (entry_type, amount, description, reference_type, reference_id, entry_date)
  VALUES ('cogs', v_cogs, 'COGS for sale ' || v_invoice, 'sale', v_sale_id, CURRENT_DATE);

  -- Payment in if paid
  IF v_paid > 0 THEN
    INSERT INTO payments (direction, customer_id, amount, payment_method, payment_date, reference_type, reference_id)
    VALUES ('in', p_customer_id, v_paid, p_payment_method, CURRENT_DATE, 'sale', v_sale_id);

    INSERT INTO ledger_entries (entry_type, amount, description, reference_type, reference_id, entry_date)
    VALUES ('payment_in', v_paid, 'Payment for sale ' || v_invoice, 'sale', v_sale_id, CURRENT_DATE);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'invoice_number', v_invoice,
    'total', v_total,
    'cogs', v_cogs,
    'gross_profit', v_total - v_cogs
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: record purchase (atomic)
-- ============================================================
CREATE OR REPLACE FUNCTION record_purchase(
  p_supplier_id UUID,
  p_items JSONB, -- [{product_id, quantity, unit_cost}]
  p_payment_method payment_method DEFAULT 'cash',
  p_paid_amount NUMERIC DEFAULT NULL,
  p_invoice_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_purchase_id UUID;
  v_item JSONB;
  v_total NUMERIC := 0;
  v_paid NUMERIC;
  v_status payment_status;
  v_prod_id UUID;
  v_qty NUMERIC;
  v_cost NUMERIC;
BEGIN
  v_purchase_id := uuid_generate_v4();

  -- First pass: calculate total
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_cost := (v_item->>'unit_cost')::NUMERIC;
    v_total := v_total + (v_qty * v_cost);
  END LOOP;

  v_paid := COALESCE(p_paid_amount, CASE WHEN p_payment_method = 'credit' THEN 0 ELSE v_total END);
  IF v_paid >= v_total THEN v_status := 'paid';
  ELSIF v_paid > 0 THEN v_status := 'partial';
  ELSE v_status := 'pending'; END IF;

  -- Insert parent purchase FIRST so foreign keys in purchase_items succeed
  INSERT INTO purchases (id, supplier_id, purchase_date, invoice_number, total_amount, paid_amount, payment_method, payment_status, notes)
  VALUES (v_purchase_id, p_supplier_id, CURRENT_DATE, p_invoice_number, v_total, v_paid, p_payment_method, v_status, p_notes);

  -- Insert child purchase_items and inventory movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_cost := (v_item->>'unit_cost')::NUMERIC;

    INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost)
    VALUES (v_purchase_id, v_prod_id, v_qty, v_cost);

    -- Inventory in
    INSERT INTO inventory_movements (product_id, movement_type, quantity, unit_cost, reference_type, reference_id)
    VALUES (v_prod_id, 'purchase', v_qty, v_cost, 'purchase', v_purchase_id);

    -- Update product cost_price
    UPDATE products SET cost_price = v_cost, updated_at = NOW() WHERE id = v_prod_id;
  END LOOP;

  INSERT INTO ledger_entries (entry_type, amount, description, reference_type, reference_id, entry_date)
  VALUES ('purchase', v_total, 'Purchase', 'purchase', v_purchase_id, CURRENT_DATE);

  IF v_paid > 0 THEN
    INSERT INTO payments (direction, supplier_id, amount, payment_method, payment_date, reference_type, reference_id)
    VALUES ('out', p_supplier_id, v_paid, p_payment_method, CURRENT_DATE, 'purchase', v_purchase_id);

    INSERT INTO ledger_entries (entry_type, amount, description, reference_type, reference_id, entry_date)
    VALUES ('payment_out', v_paid, 'Payment for purchase', 'purchase', v_purchase_id, CURRENT_DATE);
  END IF;

  RETURN jsonb_build_object('success', true, 'purchase_id', v_purchase_id, 'total', v_total);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- VIEWS for dashboard / reporting
-- ============================================================
CREATE OR REPLACE VIEW v_customer_balances AS
SELECT
  c.id,
  c.name,
  COALESCE(SUM(CASE WHEN s.payment_status != 'paid' THEN s.total_amount - s.paid_amount ELSE 0 END), 0) AS outstanding
FROM customers c
LEFT JOIN sales s ON s.customer_id = c.id
GROUP BY c.id, c.name;

CREATE OR REPLACE VIEW v_supplier_balances AS
SELECT
  s.id,
  s.name,
  COALESCE(SUM(CASE WHEN p.payment_status != 'paid' THEN p.total_amount - p.paid_amount ELSE 0 END), 0) AS outstanding
FROM suppliers s
LEFT JOIN purchases p ON p.supplier_id = s.id
GROUP BY s.id, s.name;

CREATE OR REPLACE VIEW v_profit_summary AS
SELECT
  COALESCE(SUM(CASE WHEN entry_type = 'revenue' THEN amount ELSE 0 END), 0) AS revenue,
  COALESCE(SUM(CASE WHEN entry_type = 'cogs' THEN amount ELSE 0 END), 0) AS cogs,
  COALESCE(SUM(CASE WHEN entry_type = 'revenue' THEN amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN entry_type = 'cogs' THEN amount ELSE 0 END), 0) AS gross_profit,
  COALESCE(SUM(CASE WHEN entry_type IN ('expense', 'payroll') THEN amount ELSE 0 END), 0) AS operating_expenses,
  COALESCE(SUM(CASE WHEN entry_type = 'revenue' THEN amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN entry_type = 'cogs' THEN amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN entry_type IN ('expense', 'payroll') THEN amount ELSE 0 END), 0) AS net_profit
FROM ledger_entries;

-- RLS: for now allow all (anon key) – tighten later with auth
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

-- Permissive policies for MVP (replace with auth later)
CREATE POLICY "Allow all" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON recipes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON recipe_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON inventory_balances FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON inventory_movements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON purchases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON purchase_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON production_batches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON production_consumptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON sale_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON expenses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON payroll_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON payroll_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON ledger_entries FOR ALL USING (true) WITH CHECK (true);

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION record_sale TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_purchase TO anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_production_batch TO anon, authenticated;
