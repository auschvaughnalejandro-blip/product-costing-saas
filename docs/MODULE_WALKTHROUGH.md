# Module Walkthrough — Modules 4.1–4.12

Prep doc for walking the client/stakeholder through the core of the platform (SOW
Section 4). This is the part everything else — AI suite, SAP integration — is built
on top of, so it's worth covering on its own before going near the rest of the SOW.

Each module below has: a simple wireframe of the screen, where it sits in the overall
flow, and a plain-language "how it actually works" section — grounded in what's
actually in this repo today, not aspirational description. Where the SOW asks for
something not yet built, that's called out explicitly so nothing gets overpromised
in the meeting.

## Overall flow — how the modules connect

```
   ┌────────┐      ┌───────────┐      ┌──────────────┐      ┌──────────────────┐
   │  4.1   │ ──▶ │   4.2     │ ──▶ │     4.3      │ ──▶ │       4.4         │
   │ Login  │      │ Dashboard │      │ Excel Upload │      │ Cost Tree / BOM  │
   └────────┘      └───────────┘      └──────────────┘      └──────────────────┘
                                                                      │
                          ┌───────────────────────────────────────────┤
                          ▼                                           ▼
                  ┌──────────────┐                            ┌──────────────┐
                  │     4.5      │                            │     4.6      │
                  │  Breakdown   │ ◀────────── shares engine ─▶│   What-If    │
                  └──────────────┘                            └──────────────┘
                          │
                          ▼
                  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
                  │     4.7      │ ──▶ │     4.8      │ ──▶ │     4.9      │
                  │  Quotation   │      │   Versions   │      │  Approvals   │
                  └──────────────┘      └──────────────┘      └──────────────┘

   Cross-cutting, available from every screen above:
   ┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐
   │  4.10 — AI   │   │ 4.11 — Master    │   │ 4.12 — Settings  │
   │  Assistant   │   │ Data Admin       │   │ & Governance     │
   └──────────────┘   └──────────────────┘   └──────────────────┘
```

The one rule that holds the whole diagram together: **4.4, 4.5, 4.6, 4.7 all call the
same costing engine function** (`computeCost` in `apps/api/src/engine/costing.ts`).
There is no second place in the codebase that calculates a cost. That's what makes
"what-if" trustworthy — it isn't a separate estimate, it's the same math re-run with
one changed input.

### Quick status — what's actually built vs. what the SOW describes

| # | Module | Status |
|---|---|---|
| 4.1 | Authentication & Workspace | Built — login, JWT cookie sessions, RBAC |
| 4.2 | Dashboard / Home | **Not built yet** — no dedicated landing screen with recent/pending widgets |
| 4.3 | Data Ingestion & Excel Clean-Up | Built — upload, validate, AI fix-suggestion |
| 4.4 | Cost Tree / BOM Workspace | Built — editable tree, live roll-up |
| 4.5 | Cost Breakdown & Buckets | **Partially built** — engine has 4 buckets, not the 6 in the SOW |
| 4.6 | Simulation / What-If | Built — pure engine recalculation |
| 4.7 | Estimation & Quotation | **Partially built** — margin-on-cost only, no FX, single report |
| 4.8 | Versioning & Comparison | Built — immutable snapshots, draft/submitted/approved/rejected |
| 4.9 | Approvals & Workflow | Built — RBAC sign-off, insert-only audit trail |
| 4.10 | AI Assistant | **Partially built** — explanations + Excel fix work; should-cost & anomaly detection not yet built |
| 4.11 | Master Data Administration | **Partially built** — materials/rates exist; no date-stamped rate history, no FX feed |
| 4.12 | Settings & Governance | **Not built yet** — no data-masking layer between backend and Gemini |

Use this table as the meeting's opening slide: it tells him exactly what's real today
versus what's still SOW scope to build. Everything below explains the "Built" rows in
enough mechanical detail to answer follow-up questions, and is explicit about the gaps.

---

## 4.1 Authentication & Workspace

```
┌──────────────────────────────┐
│   ebita.ai · Sign in         │
│  ┌─────────────────────────┐ │
│  │ Email                   │ │
│  ├─────────────────────────┤ │
│  │ Password                │ │
│  └─────────────────────────┘ │
│        [ Sign In ]           │
└──────────────────────────────┘
        │ on success
        ▼
   Sets an httpOnly cookie → redirect to workspace
```

**Status: built.** `apps/api/src/middleware/auth.ts`, `apps/api/src/lib/jwt.ts`,
`apps/web/src/lib/auth.tsx`, `apps/web/src/components/ProtectedRoute.tsx`.

**How it actually works**

- On login, the server issues a JWT and sets it as an **httpOnly cookie**
  (`AUTH_COOKIE = 'token'`, `auth.ts:27`). httpOnly means JavaScript running in the
  page — including any injected/malicious script — cannot read the cookie. That's
  the main XSS defence.
- Cookie flags: `secure: true` in production (HTTPS-only), `sameSite: 'none'` in
  production / `'lax'` in dev, 7-day expiry (`authCookieOptions()`, `auth.ts:29-37`).
- Every request runs through `authMiddleware`, which tries to read the cookie (or an
  `Authorization: Bearer` header as a fallback for tooling/tests), verifies the JWT
  signature, and — if valid — attaches `req.user = { id, tenantId, role }`. An
  invalid or missing token is just treated as "not logged in"; it doesn't crash the
  request.
- `requireAuth` and `requireRole(...)` are separate guards routes opt into. So a
  route can be public (health check), logged-in-only, or role-restricted, and that
  restriction is enforced **server-side** — the UI hiding a button is not the
  security boundary.

**Answering "what if I copy-paste the URL into another browser?"**
The URL carries no session information — there's no token in the query string or
path. The session lives only in the httpOnly cookie set on the browser that logged
in. Paste the URL into a different browser (or an incognito window, or send it to a
colleague) and that request arrives with no cookie at all → `authMiddleware` sees no
token → the page redirects to `/login`. The only way to "carry" a session is to
actually copy the browser's cookie storage, which is a different, much higher bar.

**What's not built yet:** Google/OAuth SSO (today is email + password only — need
to confirm whether the client actually wants Google sign-in before scoping it), and
there's no dedicated "Dashboard" landing page (4.2) — login currently lands on the
products list.

---

## 4.2 Dashboard / Home

```
┌───────────────────────────────────────────┐
│  [ NOT YET BUILT ]                         │
│  SOW asks for: recent estimates, pending   │
│  approvals, quick actions.                 │
│  Today: login redirects straight to the    │
│  products list (ProductsPage) instead.     │
└───────────────────────────────────────────┘
```

**Status: not built.** Worth saying plainly in the meeting rather than implying it
exists — `apps/web/src/App.tsx` routes `/` directly to `ProductsPage`, there is no
`DashboardPage`. This is a real, scoped gap against module 4.2, not a design choice.

---

## 4.3 Data Ingestion & Excel Clean-Up

```
Step 1                 Step 2                      Step 3
┌────────────┐  POST  ┌──────────────┐  invalid?  ┌───────────────────┐
│ Drag/drop  │ ─────▶ │ Parse +      │ ─────────▶ │ AI proposes a     │
│ .xlsx file │        │ validate     │            │ corrected file —  │
└────────────┘        │ (pure code)  │            │ download/review/  │
                       └──────┬───────┘            │ re-upload to apply│
                              │ valid               └───────────────────┘
                              ▼
                      ┌──────────────┐
                      │ Cost computed │
                      │ + product     │
                      │ saved         │
                      └──────────────┘
```

**Status: built.** `apps/api/src/routes/uploads.routes.ts`,
`apps/api/src/ingestion/{parse,validate,map}.ts`,
`apps/api/src/modules/assistant/assistant.service.ts` (`suggestExcelFix`).

**How it actually works — three separate, testable steps**

1. **Parse** (`ingestion/parse.ts`) — reads raw cell values with `exceljs`, with no
   judgement about whether they're valid. It explicitly handles merged cells: Excel
   only stores a value in the top-left cell of a merged region, so a naive reader
   sees blanks for the rest of the region; `resolveCell()` falls back to the
   merge's master cell so a value under a merged header reads correctly everywhere.
2. **Validate** (`ingestion/validate.ts`) — checks completeness and sanity (missing
   columns, blank prices, bad numbers) and produces a structured list of problems
   (sheet, row, column, plain-language message) — not a crash, and never a guessed
   number.
3. **Map** (`ingestion/map.ts`) — converts validated data into the engine's input
   types.

**The Excel upload crash you ran into — what it actually was**

There were two separate bugs, both now fixed in the working tree
(`apps/api/src/lib/http.ts`, `apps/api/src/routes/uploads.routes.ts`):

- The upload size limit was **hardcoded to 10MB** with no matching error handling.
  A larger file hit Multer's internal limit, Multer threw a `MulterError`, and
  nothing in the error middleware recognised that error type — so it fell through
  to a raw, unhandled 500. From the browser, that looks exactly like "something
  broke in storage" with no useful message.
- There was no file-type check (`fileFilter`), so a non-Excel file would be handed
  straight to the parser instead of being rejected up front with a clear message.

The fix: the size limit now comes from `MAX_UPLOAD_MB` (config, default 50MB) and
is shared by both the body parser and Multer so they agree; `MulterError` is now
caught explicitly and turned into a clean `413`/`400` JSON response
(`"That file is too large. The maximum upload size is 50 MB."`); and a `fileFilter`
rejects non-`.xlsx`/`.xls` uploads before parsing starts. Separately, the server now
checks `SELECT 1` against the database on boot and a lost DB connection mid-request
returns a clean `503` instead of an unhandled crash — so a database hiccup looks
like "try again" rather than a broken upload.

**The AI clean-up flow, and why it can't silently corrupt data:** validation runs
first as pure code with no AI involved. Only the resulting problem list (not the
raw file) is sent to Gemini, which proposes fixes. The proposal comes back as an
actual `.xlsx` file the user downloads, reviews, and **re-uploads** — it goes through
the exact same parse → validate → map pipeline as any other upload. There's no
code path where an AI suggestion is written to the database directly.

**Upload size ceiling today:** files are buffered fully in memory (`multer.memoryStorage()`)
and parsed synchronously. Fine at 50MB and ~5 concurrent users (the SOW's expected
load); a file in the hundreds of MB, or much higher concurrency, would need a
streaming parser — explicitly out of scope for V1.0.

---

## 4.4 Cost Tree / BOM Workspace

```
┌─────────────────────────────────────────────┬───────────────┐
│ Part / Description    Qty  Mat  Lab  Mch  OH│ Cost summary  │
│ ▼ Subsea Gate Valve     1   ...total row...  │ Material  ... │
│   ▼ Valve Body Assy     1   ...              │ Labour    ... │
│     ▷ Machined Body     1   ...              │ Machine   ... │
│     ▷ Gate & Stem       1   ...              │ Overhead  ... │
│   ▷ Hardware Kit        1   ...              │ TOTAL     ... │
└─────────────────────────────────────────────┴───────────────┘
        edit a cell → debounce → POST /api/products/recalculate → re-render
```

**Status: built.** `apps/web/src/components/{CostTree,EditableCostTree,EditableCostView}.tsx`,
`apps/api/src/routes/products.routes.ts` (`/recalculate`), engine in
`apps/api/src/engine/costing.ts`.

**How it actually works**

- The BOM is stored as a self-referencing tree: `product_parts.parent_id` points at
  another `product_parts.id`; `parent_id = null` is the root. There is no depth
  limit in the schema — the engine enforces a sanity cap of 512 levels
  (`MAX_DEPTH`, `costing.ts:34`) purely to catch data errors, not a real-world
  ceiling.
- Grid: **TanStack Table**, not AG Grid — both are named as acceptable in the SOW's
  tech stack and TanStack was the one actually adopted
  (`apps/web/package.json` → `@tanstack/react-table`). Worth saying this explicitly
  to the client since the SOW lists both as options.
- Editing flow: a cell edit is debounced (`apps/web/src/lib/useDebouncedCallback.ts`)
  to avoid firing a request per keystroke, then the **full current input** is sent
  to `POST /api/products/recalculate`, which calls the exact same `computeCost(...)`
  used everywhere else, and returns the full updated tree for re-render.
- The engine computes "effective quantity" by multiplying a node's quantity up
  through every ancestor — so 2 frames each needing 4 bolts correctly needs 8 bolts
  rolled into the parent total. That propagation is what makes an edit at any depth
  ripple correctly to the root.

---

## 4.5 Cost Breakdown & Buckets

```
┌──────────┬──────────┬────────┬─────────┬────────────────┬──────────┐
│ Raw Mat. │ Bought-Out│ Labour │ Machine │ Subcontracting │ Overhead │
│   $420   │    —      │  $580  │  $480   │       —        │   $148   │
└──────────┴──────────┴────────┴─────────┴────────────────┴──────────┘
        ↑ SOW asks for 6 buckets — engine currently returns 4
```

**Status: partially built.** `apps/api/src/engine/costing.ts` (`CostBreakdown` type
in `packages/shared`) currently returns exactly four buckets: `material`, `labour`,
`machine`, `overhead`. The SOW's six-bucket breakdown (adding **Bought-Out** and
**Subcontracting** as their own lines) isn't implemented — today a bought-out part
would just be modelled as a material with no further explosion, and there's no
distinct subcontracting cost type. This is a real, scoped piece of remaining work,
not a UI question — it needs a schema and engine change, not just a new column.

**How the existing 4 buckets actually roll up:** each tree node accumulates its own
material/labour/machine from its own material price and routing operations, then
adds in the (already-computed) totals of its children before overhead is applied.
Overhead is computed per node from a configurable rule — `none`, `fixed` (applied
once, at the root only), or `percentage` of a chosen base (`material`,
`conversion` = labour+machine, `prime` = material+labour, or `total`). Which base to
use is part of the SOW's Section 15 client dependency (their existing costing logic
must dictate this), and it's already a first-class, configurable input to the
engine rather than hardcoded.

---

## 4.6 Simulation / What-If

```
 Change a value  →  same engine reruns  →  Original vs Modified, side by side
 (e.g. qty 1→2)      (no AI involved)        with Δ highlighted per bucket
```

**Status: built.** `apps/api/src/routes/products.routes.ts:55` (`POST /recalculate`).

**How it actually works — and what system actually powers it**

Pure math, not AI. The endpoint's own comment says it plainly: *"Recalculate from
an edited input — the what-if path. Uses the SAME engine as every other
calculation; nothing here re-implements cost maths."* The request is validated
against `RecalculateSchema` and handed straight to `computeCost(input)` — the
identical function used for the very first calculation on upload. Same inputs
always produce the same output; change one input and only the parts of the tree
that depend on it change, deterministically.

Where AI *is* allowed to participate: **after** the engine produces a result, the
AI assistant (4.10) can be asked to explain it in plain language ("doubling the
steel quantity raised material cost by 100% because the bolt count doubled with
it"). The AI never decides the number — it's handed the engine's already-computed
result and asked to describe it.

---

## 4.7 Estimation & Quotation

```
┌───────────────────────────────┬─────────────────────┐
│ Customer details              │ Quotation preview     │
│ Base cost (read-only, engine) │ shows price + terms   │
│ Margin %  →  Price (derived)  │ (single report today; │
│ [ Generate quotation ]        │ no separate customer  │
└───────────────────────────────┴─────────────────────┘
```

**Status: partially built.** `apps/api/src/modules/quotations/{pricing,quotations.repo}.ts`,
`apps/web/src/pages/{QuotationPage,QuotationsPage}.tsx`.

**How it actually works**

- `computePrice()` is deliberately a separate module from the engine —
  *"the engine never knows about margin or price"* (`pricing.ts:1-8`). It reuses the
  engine's same decimal-safe `Big`/`money` helpers, so there's no floating-point
  drift between cost and price.
- **Only the "margin on cost" formula is implemented today**:
  `price = cost + cost × margin%` (or a flat amount). The SOW's Section 15 client
  dependency is which formula the client's finance team actually uses — "on cost"
  vs "on price" (`Price = Cost ÷ (1 − Margin%)`) — and that second formula isn't in
  the code yet. This is the single highest-leverage open question to raise in the
  meeting, because it's a one-line confirmation that's currently blocking a real
  feature gap.
- **Not yet built:** multi-currency/FX conversion (no FX-rate code exists anywhere
  in the repo today), the two estimate modes (New-Product vs. Repair/Service — the
  latter explicitly needs the client's salvage/replacement rules per Section 15),
  and dual report generation (customer-facing vs. internal) — today there's one
  quotation view, not two role-gated outputs.

---

## 4.8 Versioning & Comparison

```
 v1 Draft ──▶ v2 Revised ──▶ v3 Final (current)
   archived      archived       ▲ APPROVED
                                 │
                         immutable snapshot:
                         input_json + result_json
                         frozen at save time
```

**Status: built.** `apps/api/src/modules/versions/versions.repo.ts`,
`apps/web/src/components/{VersionsPanel,SaveVersionDialog}.tsx`, schema in
`db/migrations/0001_init.sql` (`cost_versions` table).

**How it actually works**

Each saved version stores the **complete** engine input and the **complete** engine
output as JSON (`input_json`, `result_json`) alongside a `version_no` that's unique
per product. There's no `UPDATE` path for a version's figures in the code — saving
a change always means a new row with the next `version_no`, so a version, once
created, cannot drift from what it said at save time. `kind` (`draft`/`final`) and
`status` (`draft`/`submitted`/`approved`/`rejected`) are tracked together, which is
functionally the SOW's Draft→Revised→Final lifecycle, just with slightly different
state names worth aligning on with the client.

---

## 4.9 Approvals & Workflow

```
Estimator submits  ──▶  Approver/Admin reviews  ──▶  approved / rejected
                                                          │
                                              insert-only audit row:
                                              who, when, from→to status
```

**Status: built.** `apps/api/src/modules/approvals/{approvals.repo,approvals.service}.ts`,
`apps/web/src/components/ApprovalPanel.tsx`, `approval_events` table.

**How it actually works**

- `requireRole('admin', 'approver')` gates the approve/reject endpoints server-side
  — exactly the same enforcement pattern as 4.1. An Estimator's request to approve
  their own submission is rejected with `403` by the server regardless of what
  buttons the UI happens to render for them.
- Every transition (`submit`/`approve`/`reject`) writes a row to `approval_events`
  with `actor_id`, `from_status`, `to_status`, a server-generated timestamp, and an
  optional comment. The table has no update path in the code — it's a pure log,
  which is what makes the audit trail meaningfully immutable rather than just
  labelled that way.

---

## 4.10 AI Assistant (cross-cutting)

```
 Floating panel, available from 4.3–4.7
 ┌─────────────────────────────────────┐
 │ "Why is this cost high?"  →  AI      │
 │  reads the on-screen cost JSON and    │
 │  explains it — never invents a number│
 └─────────────────────────────────────┘
```

**Status: partially built.** `apps/api/src/integrations/ai/{provider,gemini}.ts`,
`apps/api/src/modules/assistant/assistant.service.ts`,
`apps/web/src/components/AssistantWidget.tsx`.

**How it actually works**

- Swappable provider interface: `AiProvider { name, enabled, generate(options) }`
  (`provider.ts`). `GeminiProvider` implements it today; switching models later is
  a new class implementing the same interface plus an env var change — not a
  rewrite. There's also a `DisabledAiProvider` used automatically when no API key
  is set, so the rest of the app never has to special-case "AI is off."
- `explain()` builds the prompt from **on-screen context the caller passes in**
  (the current cost breakdown, figures, validation errors) — the AI is grounded in
  the actual numbers on screen, not asked to guess from a vague question.
- Hard rule enforced by the function shape itself, not just a comment: `explain()`
  returns `{ answer: string, ... }` — a string for display. There is no code path
  where its return value is written into a cost field. Same for `suggestExcelFix()`
  — it returns a downloadable file for the user to review and re-upload, never a
  direct database write.
- **Graceful degradation is real, not just documented:** if `GEMINI_API_KEY` isn't
  set, `provider.enabled` is `false` and `explain()`/`suggestExcelFix()` return a
  plain "AI isn't configured" message instead of throwing — upload, costing,
  editing, versions, and approvals have no dependency on this provider at all.
- **Not yet built:** should-cost estimation (suggesting a cost from historical
  analogs) and anomaly/margin-risk detection — both listed in the SOW's V1.0 AI
  capability table but not present in `assistant.service.ts` today. Also not yet
  built: the data-masking layer (see 4.12) that's supposed to sit between the
  backend and Gemini — right now, whatever context is passed to `explain()` goes to
  Gemini as-is, with no field-stripping step in between.

---

## 4.11 Master Data Administration

```
┌──────────────────────────────────────┐
│ Materials   (code, price, currency)   │
│ Labour / machine rates                │
└──────────────────────────────────────┘
   source: 'manual' | 'excel' | 'sap'
```

**Status: partially built.** `apps/api/src/modules/materials/materials.repo.ts`,
`materials` table.

**How it actually works**

Materials carry a `source` column (`manual`/`excel`/`sap`) so the same row can be
created by hand, by an Excel upload, or by the SAP connector, and the engine never
needs to know or care which — it just reads `unit_price`. Admin-only write access
is enforced the same way as 4.1/4.9 (role check at the route).

**Not yet built:** the SOW's **date-stamped rating** — historical quotes retaining
the rate that was current when the quote was made. Today a material has one
current `unit_price`; there's no effective-dated history table, so re-opening an
old quote and recomputing it from current master data could legitimately drift from
what was originally quoted. (Versions, 4.8, work around this today by freezing the
engine's *output* JSON at save time — so an old quote's stored total is safe — but
the underlying *rate history* itself isn't tracked yet.) Also not built: FX rate
management/feed — there is no FX-related code in the repo.

---

## 4.12 Settings & Governance

```
┌──────────────────────────────────────┐
│ [ NOT YET BUILT ]                     │
│ User/role management exists via       │
│ users table + RBAC, but there is no   │
│ Settings screen, and no data-masking  │
│ layer between the backend and Gemini. │
└──────────────────────────────────────┘
```

**Status: not built as a module.** The pieces it would sit on top of — `users`
table with `role`, RBAC middleware — exist and are exercised by 4.1/4.9/4.11. But
there's no dedicated settings UI, and critically, **no data-masking enforcement**
yet: the SOW (Section 6) requires sensitive fields (margin %, customer identity,
labour contract rates) to be stripped before anything reaches Gemini, and that
stripping step doesn't exist in the code today — `explain()` sends whatever
context object it's given, unfiltered. This is worth flagging as a security/scope
item distinct from the AI feature gaps in 4.10, since it's a governance
requirement rather than a capability.
