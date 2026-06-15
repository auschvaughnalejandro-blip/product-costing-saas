-- ─────────────────────────────────────────────────────────────────────────
-- 0001_init — core schema.
--
-- Multi-tenant from day one: every customer-owned table carries tenant_id, even
-- though there is a single customer today. Each saved costing is an immutable
-- snapshot (cost_versions) so drafts and finals never overwrite each other.
--
-- UUID primary keys are supplied by the application (crypto.randomUUID), so no
-- database UUID extension is required. Money/rate columns are NUMERIC and are
-- returned by the driver as strings, keeping figures decimal-safe end to end.
-- ─────────────────────────────────────────────────────────────────────────

-- The tenant registry itself is not tenant-scoped — it defines the tenants.
CREATE TABLE IF NOT EXISTS tenants (
  id          uuid PRIMARY KEY,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email          text NOT NULL,
  password_hash  text NOT NULL,
  name           text NOT NULL,
  role           text NOT NULL DEFAULT 'estimator'
                   CHECK (role IN ('admin', 'estimator', 'approver', 'viewer')),
  created_at     timestamptz NOT NULL DEFAULT now()
);
-- Email is unique per tenant (stored lower-cased by the app).
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_uniq ON users (tenant_id, email);

-- Material prices — master data, entered by the user or pulled from SAP.
CREATE TABLE IF NOT EXISTS materials (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code        text NOT NULL,
  name        text NOT NULL,
  unit        text,
  unit_price  numeric NOT NULL CHECK (unit_price >= 0),
  currency    text NOT NULL DEFAULT 'USD',
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'excel', 'sap')),
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS materials_tenant_code_uniq ON materials (tenant_id, code);

CREATE TABLE IF NOT EXISTS products (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code        text NOT NULL,
  name        text NOT NULL,
  description text,
  currency    text NOT NULL DEFAULT 'USD',
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_code_uniq ON products (tenant_id, code);

-- The current, editable rate settings for a product (one row per product).
CREATE TABLE IF NOT EXISTS product_rates (
  product_id       uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  labour_rate      numeric NOT NULL DEFAULT 0 CHECK (labour_rate >= 0),
  machine_rate     numeric NOT NULL DEFAULT 0 CHECK (machine_rate >= 0),
  overhead_type    text NOT NULL DEFAULT 'none'
                     CHECK (overhead_type IN ('none', 'percentage', 'fixed')),
  overhead_percent numeric CHECK (overhead_percent >= 0),
  overhead_base    text CHECK (overhead_base IN ('material', 'conversion', 'prime', 'total')),
  overhead_amount  numeric CHECK (overhead_amount >= 0),
  currency         text NOT NULL DEFAULT 'USD'
);

-- The bill of materials, as a tree (parent_id self-reference). node_key is the
-- stable id used by the engine; it is unique within a product.
CREATE TABLE IF NOT EXISTS product_parts (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES product_parts(id) ON DELETE CASCADE,
  node_key    text NOT NULL,
  name        text NOT NULL,
  quantity    numeric NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit        text,
  material_id uuid REFERENCES materials(id),
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_parts_node_uniq ON product_parts (product_id, node_key);
CREATE INDEX IF NOT EXISTS product_parts_parent_idx ON product_parts (parent_id);

-- Routing operations, attached to a specific part.
CREATE TABLE IF NOT EXISTS operations (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id       uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  part_id          uuid NOT NULL REFERENCES product_parts(id) ON DELETE CASCADE,
  op_key           text NOT NULL,
  name             text NOT NULL,
  machine_time     numeric NOT NULL DEFAULT 0 CHECK (machine_time >= 0),
  labour_time      numeric NOT NULL DEFAULT 0 CHECK (labour_time >= 0),
  machine_rate_code text,
  labour_rate_code  text,
  sort_order       integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS operations_op_uniq ON operations (product_id, op_key);

-- Optional named labour/machine rates (e.g. per workcentre).
CREATE TABLE IF NOT EXISTS product_named_rates (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('labour', 'machine')),
  code        text NOT NULL,
  rate        numeric NOT NULL CHECK (rate >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_named_rates_uniq
  ON product_named_rates (product_id, kind, code);

-- Immutable cost snapshots. input_json and result_json capture exactly what the
-- engine was given and produced, so a version is self-contained and verifiable.
CREATE TABLE IF NOT EXISTS cost_versions (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  version_no  integer NOT NULL,
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'draft' CHECK (kind IN ('draft', 'final')),
  status      text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  input_json  jsonb NOT NULL,
  result_json jsonb NOT NULL,
  currency    text NOT NULL DEFAULT 'USD',
  total_cost  numeric NOT NULL DEFAULT 0,
  notes       text,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cost_versions_no_uniq ON cost_versions (product_id, version_no);
CREATE INDEX IF NOT EXISTS cost_versions_product_idx ON cost_versions (tenant_id, product_id);

CREATE TABLE IF NOT EXISTS quotations (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cost_version_id  uuid NOT NULL REFERENCES cost_versions(id) ON DELETE CASCADE,
  number           text NOT NULL,
  customer_name    text NOT NULL,
  customer_contact text,
  customer_address text,
  currency         text NOT NULL DEFAULT 'USD',
  margin_type      text NOT NULL DEFAULT 'percent' CHECK (margin_type IN ('percent', 'amount')),
  margin_value     numeric NOT NULL DEFAULT 0,
  cost_total       numeric NOT NULL DEFAULT 0,
  price_total      numeric NOT NULL DEFAULT 0,
  terms            text,
  notes            text,
  status           text NOT NULL DEFAULT 'draft',
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS quotations_number_uniq ON quotations (tenant_id, number);

-- Who did what, when — the approval history for a cost version.
CREATE TABLE IF NOT EXISTS approval_events (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cost_version_id  uuid NOT NULL REFERENCES cost_versions(id) ON DELETE CASCADE,
  action           text NOT NULL CHECK (action IN ('submit', 'approve', 'reject')),
  from_status      text NOT NULL,
  to_status        text NOT NULL,
  actor_id         uuid REFERENCES users(id),
  comment          text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS approval_events_version_idx ON approval_events (cost_version_id);
