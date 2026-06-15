# Build Plan — Product Costing SaaS

This plan describes how every part of the platform is built, in the order it should be built. The guiding principle is **build the core first, then build outward**: the costing engine is the heart of the product, so it comes first and everything else is layered around it.

Each phase lists:
- **Goal** — what this phase achieves
- **Build** — what gets created
- **How** — the approach and key technical decisions
- **Done when** — how you know the phase is finished

At the end, the phases are mapped to the three payment milestones.

---

## Build order at a glance

```
Phase 0  Foundations & scaffolding
Phase 1  Costing engine          ← the core; build and trust this first
Phase 2  Data model & database
Phase 3  Excel ingestion
Phase 4  Backend API
Phase 5  Frontend: tree/table view
Phase 6  Editing & live recalculation
Phase 7  Cost versions (save / reload)
Phase 8  Estimation & quotation
Phase 9  Workflow approvals
Phase 10 AI assistant
Phase 11 SAP S/4HANA integration  ← scheduled late (depends on client access)
Phase 12 Deployment (Docker, local + cloud)
Phase 13 Multi-tenant foundations
```

Why this order: each phase depends on the ones before it. You can't show a cost table (Phase 5) before you can calculate cost (Phase 1) and store it (Phase 2). SAP (Phase 11) is deliberately late because it depends on the client granting access, and nothing else needs it.

---

## Phase 0 — Foundations & scaffolding

**Goal:** A running skeleton both parts of the app live in.

**Build:**
- A monorepo with two apps (`web`, `api`) and a `shared` package for common types.
- Linting, formatting, and TypeScript configured across the repo.
- A "hello world" request that goes browser → API → back, to prove the wiring.
- `.env.example`, a basic `docker-compose.yml` for the database, and a README stub.

**How:**
- Use TypeScript everywhere so the frontend and backend share the same type definitions (e.g. what a "product node" or "cost result" looks like). This prevents whole classes of bugs.
- Set up Git, a branch strategy, and a simple CI check that runs lint + tests on every push.

**Done when:** `npm run dev` starts both apps and a test request succeeds end to end.

---

## Phase 1 — Costing engine (the core)

**Goal:** A pure function that takes product data in and returns a correct, complete cost breakdown — with no database, no network, no UI.

**Build:**
- A typed model of the inputs: a **bill of materials** (parts, which may contain sub-parts) and a **routing** (operations with machine/labour times), plus a **rates** table (material prices, labour rate, machine rate, overhead rules).
- The calculation that walks the product tree bottom-up:
  - Material cost = Σ (quantity × material price) across all levels
  - Labour cost = Σ (operation time × labour rate)
  - Machine cost = Σ (operation time × machine rate)
  - Overhead = percentage/share applied per the overhead rule
  - Total = sum of the above
- A returned breakdown that shows the cost **at every level**, not just the final number, so the UI can display a tree.

**How:**
- Keep the engine **pure and deterministic**: same inputs → same outputs, always. No randomness, no clock, no I/O inside it. This is what makes the numbers trustworthy and the engine easy to test.
- Handle the multi-level (recursive) structure carefully: a part made of parts made of parts. Compute children first, then roll their cost up into the parent.
- Guard against bad data: missing rates, circular part references (a part that contains itself), negative quantities. Return clear errors rather than silently producing a wrong number.
- Use a decimal-safe approach to money (avoid floating-point rounding surprises) and define the rounding rules explicitly.

**Done when:** A suite of unit tests — simple parts, deep multi-level products, edge cases — all pass, and a known example product produces the exact expected total. *This is the single most important phase; do not move on until the numbers are provably correct.*

---

## Phase 2 — Data model & database

**Goal:** A place to store products, rates, cost versions, users, and quotations.

**Build:**
- PostgreSQL schema and migrations for: products and their tree structure, materials and rates, cost versions, quotations, users, and approval records.
- A migration tool so schema changes are versioned and repeatable.
- A `tenant_id` column on every customer-owned table from day one (even though there's only one customer now — see Phase 13).

**How:**
- Model the product tree in a way Postgres handles well (parent references, or a nested structure) so you can load a whole product efficiently.
- Store each saved cost as a **version** (a snapshot), so drafts and finals never overwrite each other.
- Add the `tenant_id` everywhere now; retrofitting multi-tenancy later is far more painful than reserving the column up front.

**Done when:** You can save a product and its rates, reload them, and the engine from Phase 1 produces the same result from stored data as it did from in-memory test data.

---

## Phase 3 — Excel ingestion

**Goal:** Turn an uploaded spreadsheet into the engine's input format.

**Build:**
- An upload endpoint that accepts an Excel file.
- A parser that reads the expected sheets/columns (materials, structure, operations, rates) and maps them to the typed model.
- A **validation layer** that checks the file before use and reports exactly what's wrong (missing column, blank rate, bad number) in plain language.

**How:**
- Define one **expected Excel format** clearly and document it — this becomes the contract.
- Separate parsing (reading cells) from validation (is the data sane?) from mapping (into engine inputs). Three small steps are easier to debug than one big one.
- Validation errors feed the AI clean-up feature later (Phase 10): the same checks that reject a file are what the assistant uses to suggest a fix.

**Done when:** A correctly-formatted file produces a costed product end to end, and a malformed file produces a clear list of problems instead of a crash.

---

## Phase 4 — Backend API

**Goal:** The endpoints the frontend needs, with authentication.

**Build:**
- Auth (login, sessions/tokens) and user accounts.
- REST endpoints for: upload, get product, recalculate, save/load versions, quotations, approvals.
- A thin layer that calls the **engine** for any calculation — the API never re-implements the maths.

**How:**
- Keep the API a coordinator: it loads data from Postgres, hands it to the pure engine, stores results, and returns them. All the cost logic stays in the engine.
- Validate every incoming request and scope every query by `tenant_id` and user.
- Decide the auth approach (session cookies vs. JWT) and apply it consistently.

**Done when:** The frontend can be built entirely against these endpoints; each is covered by an integration test.

---

## Phase 5 — Frontend: tree/table view

**Goal:** Show the product structure and its cost breakdown in the browser.

**Build:**
- The React (Vite) app shell, routing, and login screen.
- The main **cost grid** using AG Grid or TanStack Table: a multi-level tree/table showing parts, quantities, rates, and per-level costs.
- A summary panel with the total cost breakdown (material / labour / machine / overhead / total).

**How:**
- Choose AG Grid vs. TanStack Table early based on how rich the editing needs to be (AG Grid has more built in; TanStack is lighter and more customisable). Pick one and commit.
- Render the tree the engine returns directly — the UI displays what the engine computed; it does not calculate anything itself.
- Format money, units, and percentages consistently in one shared place.

**Done when:** A user can upload a file (or load a saved product) and see the full, correct, explorable cost breakdown.

---

## Phase 6 — Editing & live recalculation

**Goal:** Let users change values and immediately see the effect — the "what-if" core.

**Build:**
- Editable cells for quantities, rates, and cost values.
- A recalculation flow: edit → send changed inputs to the engine → show updated totals.
- Visual cues for unsaved changes and validation on edited values.

**How:**
- Recalculate by calling the **same engine** with the edited inputs. There is exactly one source of cost truth, used for both the first calculation and every what-if.
- Decide where recalculation runs (server-side via the API is simplest and keeps one engine; client-side is faster but duplicates logic — prefer server-side unless performance demands otherwise).
- Debounce edits so rapid typing doesn't fire a request per keystroke.

**Done when:** Changing a rate or quantity updates the whole breakdown correctly and visibly, and the user can see what they've changed before saving.

---

## Phase 7 — Cost versions (save / reload)

**Goal:** Save drafts and finals, and reload them later.

**Build:**
- Save the current state as a named version (draft or final).
- A list of versions with the ability to open any of them.
- Clear labelling of draft vs. final and basic version metadata (who, when).

**How:**
- Each save is an immutable **snapshot** so history is never lost and finals can't be silently changed.
- Reuse the Phase 2 schema; this phase is mostly UI plus a couple of endpoints.

**Done when:** A user can save a costing, leave, come back, reopen it, and continue — with drafts and finals kept separate.

---

## Phase 8 — Estimation & quotation

**Goal:** Turn a costed product into an estimate and a customer-facing quotation.

**Build:**
- Estimation and quotation forms that pull from the costed product.
- Fields for margin/markup, terms, and customer details.
- A clean, shareable quotation output (on-screen, and printable/exportable).

**How:**
- Build the quotation **on top of** a saved cost version so a quote always traces back to a specific costing.
- Keep cost (what it costs to make) and price (what you charge) clearly separate — margin is applied on top of cost.

**Done when:** A user can produce a quotation from a costed product and share it.

---

## Phase 9 — Workflow approvals

**Goal:** Move a cost version through a review/approval process.

**Build:**
- Approval states (e.g. draft → submitted → approved/rejected) on a cost version.
- Actions to submit, approve, or reject, with who-did-what recorded.
- UI that shows current status and the available next action.

**How:**
- Model the workflow as explicit states with allowed transitions, so an item can't jump to an invalid state.
- Keep it simple for the first release (a single review step is usually enough); design the states so more steps can be added later.

**Done when:** A costing can be submitted, reviewed, and approved or rejected, with the history visible.

---

## Phase 10 — AI assistant

**Goal:** An in-app assistant that explains terms, figures, and breakdowns, and suggests Excel fixes — without ever producing the cost numbers.

**Build:**
- A **swappable AI provider adapter** with Gemini as the first implementation, so the model can be changed later without touching the rest of the app.
- An assistant panel available throughout the UI.
- Capabilities: explain a term/field/figure on screen; explain how a cost was reached and what's driving it; produce a simpler, shareable version of a breakdown; suggest a corrected Excel file when one doesn't match the format; answer quick "what happens if I change this" questions.
- An approval step for any AI-proposed data change (e.g. an Excel fix is shown for the user to accept before it's applied).

**How:**
- Put a clean interface in front of the AI (`generate(prompt, context)`), and implement Gemini behind it. Swapping providers later means writing one new implementation, not rewriting the app.
- Feed the assistant the on-screen context (the figures, the breakdown, the validation errors) so its explanations are grounded in the user's actual data.
- **Hard rule, enforced in code:** the assistant explains numbers; it never generates or overrides them. Cost figures always come from the engine. Any AI-suggested change to data is proposed, shown, and only applied on explicit user approval.
- Build the Excel clean-up feature on the Phase 3 validation output: the assistant proposes corrections for the exact problems the validator found.

**Done when:** A user anywhere in the app can ask for a definition or a cost explanation and get a clear answer; a malformed upload yields an AI-suggested fix the user can approve; and no cost number ever originates from the AI.

---

## Phase 11 — SAP S/4HANA integration

**Goal:** Pull cost data from the client's SAP system as a second source, on top of Excel.

**Build:**
- A **SAP connector** that authenticates to the client's S/4HANA system and fetches the relevant cost/rate data.
- A mapping from SAP's data into the same engine input format used for Excel.
- Configuration (URL, client, credentials) kept in environment variables and left blank until access is granted.

**How:**
- Build everything else to work on Excel alone first; SAP is added on top. This is why it's scheduled late — **it depends on the client providing a test system, credentials, network access, and IT/security sign-off**, and that timing is outside your control.
- Reuse the same mapping target as Excel so the engine doesn't care where data came from — Excel and SAP both produce the same typed inputs.
- Handle SAP being unavailable gracefully; the app must keep working on Excel if SAP can't be reached.

**Done when:** With access in place, cost data can be drawn from SAP and costed through the same engine, and the rest of the app is unaffected whether SAP is connected or not.

---

## Phase 12 — Deployment (Docker, local + cloud)

**Goal:** One packaged build that runs on a laptop for demos and in the cloud for the live product.

**Build:**
- Dockerfiles for `web` and `api`, plus a `docker-compose.yml` that brings up the app and database together.
- Environment-based configuration so the same images run locally and in the cloud with only env vars and the database connection changing.
- A deployment guide for both setups.

**How:**
- Package the app so there are no "works on my machine" gaps — the container holds the code and its dependencies.
- Finalise the specific cloud configuration in the technical planning session noted in the SOW.

**Done when:** `docker compose up` runs the whole app locally, the same images deploy to the cloud, and the deployment guide is written.

---

## Phase 13 — Multi-tenant foundations

**Goal:** Make sure the single-customer release can grow into a multi-customer product without a rewrite.

**Build (now, as foundations):**
- The `tenant_id` column on every customer-owned table (from Phase 2) and tenant-scoping on every query (from Phase 4).
- Configuration designed so per-customer settings can be added later.

**Build (later phase, after first customer is validated):**
- Separate customer sign-ups, strict data separation between customers, per-customer settings, and billing.

**How:**
- Do the cheap, high-value groundwork now (the `tenant_id` and query scoping); defer the full multi-tenant features until the SOW's later phase.

**Done when:** The data model and queries are tenant-aware even though only one customer is live, so the later multi-customer phase is an extension rather than a rebuild.

---

## How the phases map to the payment milestones

The SOW defines three milestones. Here's roughly how the phases fall against them:

| Milestone | Trigger | Phases it covers |
| --- | --- | --- |
| **1. Advance** | Project kickoff | Phase 0 begins; planning and scaffolding |
| **2. V1.0 submission** | Delivery of V1.0 | Phases 1–10 (and 12): the working application — engine, data, Excel, API, UI, editing, versions, quotation, approvals, AI assistant, running in Docker |
| **3. UAT & handover** | Completion of UAT and final handover | SAP integration (Phase 11, once client access is in place), refinements during UAT, multi-tenant foundations finalised (Phase 13), documentation and deployment guide complete |

*A reasonable amount of refinement to V1.0 is included on the way to final handover. Genuinely new features or significant additions beyond this scope are quoted separately.*

---

## Cross-cutting practices (apply in every phase)

- **One source of cost truth:** the engine. Nothing else calculates cost — not the API, not the UI, not the AI.
- **Test the engine hardest:** it's the part people trust their decisions to.
- **Validate all inputs:** uploads, edits, API requests, SAP data — reject bad data with clear messages instead of producing wrong numbers.
- **Tenant-scope everything from day one**, even with one customer.
- **Keep the AI a helper, never a source of figures**, with user approval on any data change.
- **Configuration via environment variables**, so the same build runs locally and in the cloud.

---

*Build plan for the Product Costing SaaS · EBITA AI Private Limited*