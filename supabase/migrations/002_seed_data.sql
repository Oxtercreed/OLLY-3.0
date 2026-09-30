-- Seed data for OLLY food processing business (Peanut Butter & Tahini)

-- Raw materials
INSERT INTO products (name, sku, type, unit, cost_price, reorder_level, is_active) VALUES
  ('Groundnuts', 'RM-GN', 'raw_material', 'kg', 2500, 50, true),
  ('Sesame Seeds', 'RM-SS', 'raw_material', 'kg', 4500, 30, true),
  ('Cooking Oil', 'RM-OIL', 'raw_material', 'L', 3500, 20, true),
  ('Sugar', 'RM-SUG', 'raw_material', 'kg', 2000, 15, true),
  ('Salt', 'RM-SALT', 'raw_material', 'kg', 800, 5, true)
ON CONFLICT (sku) DO NOTHING;

-- Packaging
INSERT INTO products (name, sku, type, unit, cost_price, reorder_level, is_active) VALUES
  ('300g Jars', 'PK-J300', 'packaging', 'pcs', 300, 100, true),
  ('450g Jars', 'PK-J450', 'packaging', 'pcs', 400, 100, true),
  ('750g Jars', 'PK-J750', 'packaging', 'pcs', 550, 50, true),
  ('Caps', 'PK-CAP', 'packaging', 'pcs', 80, 200, true),
  ('Labels', 'PK-LBL', 'packaging', 'pcs', 50, 200, true)
ON CONFLICT (sku) DO NOTHING;

-- Suppliers
INSERT INTO suppliers (name, phone, is_active) VALUES
  ('Arusha Groundnuts Co', '+255 713 000 001', true),
  ('Sesame Oils Ltd', '+255 713 000 002', true),
  ('Packaging Hub TZ', '+255 713 000 003', true)
ON CONFLICT DO NOTHING;
