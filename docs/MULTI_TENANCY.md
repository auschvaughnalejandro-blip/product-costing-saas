# Multi-tenant foundations

The platform serves a **single customer today**, but is built tenant-aware from
day one so the later multi-customer phase is an *extension, not a rewrite*. This
document records the Phase 13 verification: every customer-owned table carries a
`tenant_id`, and every query is scoped by it.

> This is groundwork only. Full multi-tenancy — separate sign-ups, per-customer
> billing, hard data partitioning, tenant-admin tooling — is intentionally **not**
> built yet.

## Tenant column — every customer-owned table

`tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` is present on:

| Table | tenant_id |
| --- | --- |
| `users` | ✅ |
| `materials` | ✅ |
| `products` | ✅ |
| `product_rates` | ✅ |
| `product_parts` | ✅ |
| `operations` | ✅ |
| `product_named_rates` | ✅ |
| `cost_versions` | ✅ |
| `quotations` | ✅ |
| `approval_events` | ✅ |

`tenants` itself is the registry that *defines* tenants, so it is correctly not
tenant-scoped. Uniqueness is per-tenant where it matters: `users(tenant_id,
email)`, `materials(tenant_id, code)`, `products(tenant_id, code)`,
`quotations(tenant_id, number)`.

## Query scoping — every read/write

The tenant id flows from the auth token (`tid`) into `req.user.tenantId` and is
passed to every repository function as the first scoping argument:

- **Directly tenant-scoped** (`WHERE tenant_id = $1 …`): all list/get/update
  queries for users, materials, products, cost versions, quotations and approval
  events; all inserts write `tenant_id`.
- **Scoped via a tenant-checked parent** — a few queries filter by `product_id`
  alone (loading a product's parts/operations/rates, replacing them on save).
  These are safe because:
  - `loadProductDefinition` / `loadCostInput` first confirm the product belongs
    to the tenant (`WHERE tenant_id = $1 AND id = $2`) and return `null`
    otherwise, so child loads only run for an owned product; and
  - `saveProduct` obtains the product id from an `INSERT … ON CONFLICT
    (tenant_id, code) RETURNING id`, so the id it then writes children for
    provably belongs to the tenant.
- **Inherently single-tenant** — `cost_versions.version_no` is computed with
  `MAX(version_no) WHERE product_id = $1`; `product_id` is a globally unique FK to
  one product (hence one tenant), so this cannot cross tenants.

## Hardening applied in this phase

Two defense-in-depth fixes so the rule holds literally everywhere:

1. **`getUserById` is now tenant-scoped** (`WHERE tenant_id = $1 AND id = $2`).
   It backs `GET /api/auth/me`; the caller already has the tenant from the token.
   Regression test: `users.repo.test.ts`.
2. **Version creation re-checks product ownership.** `POST
   /api/products/:id/versions` previously skipped the tenant-scoped product load
   when the client supplied an edited `input`, which could let a version row
   reference another tenant's product. It now always confirms the product is
   owned by the tenant (404 otherwise) before saving the snapshot.

## How isolation is tested

`products.repo.test.ts` creates two tenants and asserts that one tenant cannot
load another's product (`loadCostInput(t2, pid) === null`) while the owner can.
`users.repo.test.ts` does the same for users. These prove the scoping the rest of
the app relies on.

## Configuration for per-customer settings later

Configuration is centralised in `apps/api/src/config.ts` and read from the
environment. Per-customer settings (rates defaults, feature flags, SAP/AI
credentials per tenant) can later be layered as a tenant-keyed settings table or
config resolver without disturbing the request flow, because tenant identity is
already threaded through every request and query.
