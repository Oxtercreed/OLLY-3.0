-- Migration 003: Fix Foreign Key Insertion Order in record_sale & record_purchase and fix delete_sale
--
-- Root Cause:
-- In record_sale and record_purchase, child items (sale_items, purchase_items)
-- were being inserted inside the loop BEFORE the parent record (sales, purchases) was inserted.
-- PostgreSQL foreign key constraints immediately rejected this with:
--   "insert or update on table 'sale_items' violates foreign key constraint 'sale_items_sale_id_fkey'"
--
-- In delete_sale, setting payment_status = 'cancelled' failed because 'cancelled'
-- is not in the payment_status enum ('pending', 'partial', 'paid', 'overdue').

-- ============================================================
-- 1. FIX record_sale
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
  v_avail NUMERIC;
BEGIN
  v_sale_id := uuid_generate_v4();
  v_invoice := 'INV-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(v_sale_id::text, 1, 6);

  -- First Pass: Stock validation and total calculation
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_price := (v_item->>'unit_price')::NUMERIC;
    SELECT * INTO v_product FROM products WHERE id = (v_item->>'product_id')::UUID;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

    -- Stock check
    SELECT COALESCE(quantity, 0) INTO v_avail FROM inventory_balances WHERE product_id = v_product.id;
    IF v_avail < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for % (available: %)', v_product.name, v_avail;
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

  -- STEP 1: Insert parent record FIRST so foreign keys in sale_items succeed
  INSERT INTO sales (id, customer_id, sale_date, invoice_number, total_amount, paid_amount, payment_method, payment_status, cogs_amount, notes)
  VALUES (v_sale_id, p_customer_id, CURRENT_DATE, v_invoice, v_total, v_paid, p_payment_method, v_status, v_cogs, p_notes);

  -- STEP 2: Insert child sale_items and inventory movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_price := (v_item->>'unit_price')::NUMERIC;
    SELECT * INTO v_product FROM products WHERE id = (v_item->>'product_id')::UUID;
    v_cost := COALESCE(v_product.cost_price, 0);

    INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, unit_cost)
    VALUES (v_sale_id, v_product.id, v_qty, v_price, v_cost);

    -- Inventory out (triggers balance reduction automatically)
    INSERT INTO inventory_movements (product_id, movement_type, quantity, unit_cost, reference_type, reference_id)
    VALUES (v_product.id, 'sale', -v_qty, v_cost, 'sale', v_sale_id);
  END LOOP;

  -- STEP 3: Ledger entries (revenue + COGS)
  INSERT INTO ledger_entries (entry_type, amount, description, reference_type, reference_id, entry_date)
  VALUES ('revenue', v_total, 'Sale ' || v_invoice, 'sale', v_sale_id, CURRENT_DATE);

  INSERT INTO ledger_entries (entry_type, amount, description, reference_type, reference_id, entry_date)
  VALUES ('cogs', v_cogs, 'COGS for sale ' || v_invoice, 'sale', v_sale_id, CURRENT_DATE);

  -- STEP 4: Payment in if paid
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
-- 2. FIX record_purchase
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

  -- First Pass: calculate total
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

  -- STEP 1: Insert parent purchase FIRST
  INSERT INTO purchases (id, supplier_id, purchase_date, invoice_number, total_amount, paid_amount, payment_method, payment_status, notes)
  VALUES (v_purchase_id, p_supplier_id, CURRENT_DATE, p_invoice_number, v_total, v_paid, p_payment_method, v_status, p_notes);

  -- STEP 2: Insert items and inventory movements
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

  -- STEP 3: Ledger entries
  INSERT INTO ledger_entries (entry_type, amount, description, reference_type, reference_id, entry_date)
  VALUES ('purchase', v_total, 'Purchase', 'purchase', v_purchase_id, CURRENT_DATE);

  -- STEP 4: Payment out if paid
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
-- 3. FIX delete_sale
-- ============================================================
CREATE OR REPLACE FUNCTION delete_sale(p_sale_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_sale sales%ROWTYPE;
  v_item RECORD;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  -- Revert inventory movements for each sold item
  FOR v_item IN SELECT product_id, quantity, unit_cost FROM sale_items WHERE sale_id = p_sale_id
  LOOP
    INSERT INTO inventory_movements (product_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes)
    VALUES (v_item.product_id, 'adjustment', v_item.quantity, v_item.unit_cost, 'sale_reversal', p_sale_id, 'Reversal of sale ' || COALESCE(v_sale.invoice_number, ''));
  END LOOP;

  -- Clean up ledger and payments
  DELETE FROM ledger_entries WHERE reference_type = 'sale' AND reference_id = p_sale_id;
  DELETE FROM payments WHERE reference_type = 'sale' AND reference_id = p_sale_id;

  -- Delete sale (cascades to sale_items)
  DELETE FROM sales WHERE id = p_sale_id;

  RETURN jsonb_build_object('success', true, 'sale_id', p_sale_id);
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions to anon and authenticated
GRANT EXECUTE ON FUNCTION record_sale TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_purchase TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_sale TO anon, authenticated;
