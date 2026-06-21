# Building the Product Costing SaaS with Claude Code

This file is your complete playbook for building the platform with **Claude Code**. It has three parts:

1. **Setup** — get Claude Code running and seed the project.
2. **The `CLAUDE.md`** — paste this into your repo so Claude Code follows the project rules every session.
3. **The build prompts** — paste these one at a time, in order, to build each part.

> **How to use this:** Do the setup once. Save the `CLAUDE.md` once. Then work through the build prompts **one phase at a time** — review and commit after each before moving to the next. Don't paste them all at once; let Claude Code finish, check the result, then continue.

---

## Part 1 — Setup

1. **Install Claude Code** (if you haven't):

   ```bash
   npm install -g @anthropic-ai/claude-code
   ```

2. **Make the project folder and start Claude Code:**

   ```bash
   mkdir product-costing-saas
   cd product-costing-saas
   git init
   claude
   ```

3. **Create the `CLAUDE.md` file** in the project root with the content from Part 2 below. This is the single most valuable thing you can do — Claude Code reads it automatically at the start of every session and treats it as the project's standing instructions. You can either paste the content into a new `CLAUDE.md` yourself, or run `/init` and then replace what it generates with the version below.

### Working tips (read once)

- **Go phase by phase.** Paste one build prompt, let Claude Code work, then review.
- **Use plan mode for the big phases.** Before a large prompt (like the costing engine), ask Claude Code to *plan first, then implement after you approve*. It's much easier to catch a wrong approach in a plan than in finished code.
- **Commit after every phase.** Tell Claude Code: "commit this with a clear message." A clean commit per phase means you can always roll back.
- **`CLAUDE.md` is guidance, not a guarantee.** It steers Claude Code strongly, but the real enforcement of the critical rules (the engine being the only source of cost figures) comes from the **tests** — which is why the prompts make you build tests.
- **When something's wrong, say so plainly.** "The total is wrong for multi-level products — fix the roll-up" is better than a vague nudge. Claude Code remembers corrections within a session.

---

## Part 2 — `CLAUDE.md` (paste this into your repo root)

```markdown
# Product Costing SaaS — Project Instructions

## What this is
A web platform that calculates what a manufactured product costs to make, lets users edit
values and run "what-if" scenarios, and produces estimates and quotations. An AI assistant
explains figures in plain language. The first release serves a single customer but is built
to support many later.

## NON-NEGOTIABLE RULES (these define the product — never break them)
1. The COSTING ENGINE is the single source of all cost figures. Nothing else — not the API,
   not the UI, not the AI — ever calculates, guesses, or overrides a cost number.
2. The engine is PURE and DETERMINISTIC: same inputs always produce the same output. No
   database calls, no network calls, no randomness, no clock inside the engine.
3. The AI assistant EXPLAINS numbers; it never produces them. Any AI-proposed change to the
   user's data (e.g. fixing an Excel file) must be shown for explicit user approval before
   it is applied.
4. Material prices, labour rates, and machine rates are MASTER DATA — entered by the user or
   pulled from SAP. Never fetch or invent these from the internet.
5. Every customer-owned database table has a tenant_id column from day one, and every query
   is scoped by tenant — even though there is only one customer now.
6. Validate all inputs (uploads, edits, API requests, SAP data). Reject bad data with clear,
   plain-language messages. Never silently produce a wrong number.
7. Money is handled in a decimal-safe way (no floating-point money bugs); rounding rules are
   explicit and consistent.

## Tech stack (do not substitute without asking)
- Frontend: React + Vite + TypeScript
- Cost tables: AG Grid or TanStack Table (pick one early, stay consistent)
- Backend: Node.js + TypeScript
- Costing engine: Node.js/TypeScript, a pure module with no I/O
- Database: PostgreSQL, with versioned migrations
- AI: Google Gemini API, behind a swappable provider adapter (so the model can change later)
- Deployment: Docker (same build runs locally and in the cloud)

## How the cost is calculated
From three inputs: (1) bill of materials — parts, which may contain sub-parts (multi-level);
(2) routing — operations with machine/labour times; (3) rates — material prices, labour/machine
rates, overhead rules. The engine walks the tree bottom-up:
- Material cost = sum of (quantity x material price) across all levels
- Labour cost   = sum of (operation time x labour rate)
- Machine cost  = sum of (operation time x machine rate)
- Overhead      = percentage/share applied per the overhead rule
- Total         = sum of the above
It returns the cost at EVERY level, not just the final number, so the UI can show a tree.

## Architecture
Browser (React) -> Node.js API -> [pure costing engine] + PostgreSQL + Gemini adapter + SAP connector.
The API coordinates: it loads data, hands it to the engine, stores results, returns them.
All cost logic lives in the engine.

## Conventions
- TypeScript everywhere; share types between web and api via a shared package.
- Write tests for the engine first and keep them passing — this is the part people trust.
- Keep parsing, validation, and mapping as separate steps.
- Configuration via environment variables; never hard-code secrets.
- Small, reviewable commits — one logical change per commit.

## Build order
Engine -> data model -> Excel ingestion -> API -> frontend tables -> editing/recalculation ->
cost versions -> quotation -> approvals -> AI assistant -> SAP integration -> Docker ->
multi-tenant foundations. SAP comes late because it depends on the client granting access;
everything else must work on Excel alone.
```

---

## Part 3 — The build prompts

Paste these into Claude Code **one at a time, in order**. Each one assumes the previous is done and committed. Acceptance criteria are included so you (and Claude Code) know when a phase is finished.

> Tip: for the larger prompts, start with *"Plan this first and show me the plan before writing code."*

### Prompt 0 — Foundations & scaffolding

```
Set up the project skeleton.

Create a TypeScript monorepo with two apps and a shared package:
- apps/web   (React + Vite frontend)
- apps/api   (Node.js backend)
- packages/shared (TypeScript types shared by both)

Configure linting, formatting, and TypeScript across the repo. Add a docker-compose.yml that
runs a PostgreSQL database. Add a .env.example. Wire up a single "health check" request that
goes from the React app to the API and back, to prove the connection works.

Acceptance: `npm run dev` starts both apps, and the health check succeeds end to end.
Then commit with a clear message.
```

### Prompt 1 — Costing engine (the core — do this carefully)

```
Plan this first, then implement after I approve.

Build the costing engine as a PURE, DETERMINISTIC TypeScript module in apps/api with NO
database, network, or UI code inside it.

Inputs (define clear TypeScript types in packages/shared):
- Bill of materials: parts that may contain sub-parts (a multi-level tree), each with a quantity.
- Routing: a list of operations, each with a machine time and a labour time.
- Rates: material prices, a labour rate, a machine rate, and an overhead rule (percentage or share).

Calculation (walk the tree bottom-up — compute children first, roll up into parents):
- Material cost = sum of (quantity x material price) across all levels
- Labour cost   = sum of (operation time x labour rate)
- Machine cost  = sum of (operation time x machine rate)
- Overhead      = applied per the overhead rule
- Total         = sum of the above
Return a breakdown showing the cost at EVERY level, not just the final total.

Requirements:
- Deterministic: same inputs -> same output, always.
- Decimal-safe money handling; define and apply explicit rounding rules.
- Clear errors (not wrong numbers) for: missing rates, negative quantities, and circular part
  references (a part that contains itself).

Write a thorough unit test suite: a simple single-level part, a deep multi-level product, and
each error case. Include one worked example with a known expected total and assert it exactly.

Acceptance: all tests pass and the known example produces the exact expected total.
Do not move on until the numbers are provably correct. Then commit.
```

### Prompt 2 — Data model & database

```
Design the PostgreSQL schema and migrations.

Tables for: products and their tree structure, materials and rates, cost versions (snapshots),
quotations, users, and approval records. Add a migration tool so schema changes are versioned.

IMPORTANT: every customer-owned table has a tenant_id column now, even though there's one
customer. Each saved cost is stored as an immutable VERSION (snapshot) so drafts and finals
never overwrite each other.

Add functions to save a product + its rates and load them back into the engine's input format.

Acceptance: I can save a product and reload it, and the engine produces the same result from
stored data as from in-memory test data. Then commit.
```

### Prompt 3 — Excel ingestion

```
Build Excel upload and parsing.

Define ONE expected Excel format (materials, product structure, operations, rates) and document
it in the repo. Then build three separate steps:
- Parse: read the cells from the uploaded file.
- Validate: check the data is complete and sane; report exactly what's wrong (missing column,
  blank rate, bad number) in plain language.
- Map: convert valid data into the engine's input types.

Keep these three as distinct, testable steps. The validation output should be structured so the
AI assistant can later use it to suggest fixes.

Acceptance: a correctly-formatted file produces a fully costed product end to end; a malformed
file returns a clear list of problems instead of crashing. Then commit.
```

### Prompt 4 — Backend API

```
Build the backend API with authentication.

Add user accounts and login (choose session cookies or JWT and apply it consistently). Add REST
endpoints for: upload, get product, recalculate, save/load versions, quotations, and approvals.

The API is a COORDINATOR: it loads data from Postgres, hands it to the pure engine for any
calculation, stores results, and returns them. The API must never re-implement the cost maths.
Validate every request and scope every query by tenant_id and user.

Add integration tests for each endpoint.

Acceptance: the frontend can be built entirely against these endpoints; tests pass. Then commit.
```

### Prompt 5 — Frontend: tree/table view

```
Build the main frontend view.

Create the React app shell, routing, and a login screen. Build the main cost grid using
[AG Grid OR TanStack Table — pick one and tell me why]: a multi-level tree/table showing parts,
quantities, rates, and per-level costs. Add a summary panel showing the breakdown
(material / labour / machine / overhead / total).

The UI DISPLAYS what the engine returns — it does not calculate anything itself. Put money,
unit, and percentage formatting in one shared place.

Acceptance: a user can upload a file (or load a saved product) and see the full, correct,
explorable cost breakdown. Then commit.
```

### Prompt 6 — Editing & live recalculation

```
Make the grid editable with live recalculation.

Allow editing quantities, rates, and cost values. On edit: send the changed inputs to the
engine (server-side, via the API) and show updated totals. Recalculation MUST use the same
engine as the first calculation — one source of cost truth for both the initial view and every
what-if. Debounce edits so typing doesn't fire a request per keystroke. Show unsaved-change
indicators and validate edited values.

Acceptance: changing a rate or quantity updates the whole breakdown correctly and visibly, and
the user can see what they changed before saving. Then commit.
```

### Prompt 7 — Cost versions (save / reload)

```
Add saving and reloading of cost versions.

Let users save the current state as a named version (draft or final). Show a list of versions
with metadata (who, when) and the ability to open any of them. Each save is an immutable
snapshot — finals can't be silently changed. Keep draft and final clearly distinct.

Acceptance: a user can save a costing, leave, return, reopen it, and continue — with drafts and
finals kept separate. Then commit.
```

### Prompt 8 — Estimation & quotation

```
Build estimation and quotation.

Create estimation and quotation forms that pull from a saved cost version (so a quote always
traces back to a specific costing). Add fields for margin/markup, terms, and customer details.
Keep COST (to make) and PRICE (to charge) clearly separate — margin is applied on top of cost.
Produce a clean, shareable quotation output (on-screen and printable/exportable).

Acceptance: a user can produce a shareable quotation from a costed product. Then commit.
```

### Prompt 9 — Workflow approvals

```
Add an approval workflow.

Add explicit states to a cost version (e.g. draft -> submitted -> approved/rejected) with only
valid transitions allowed. Add submit/approve/reject actions, record who did what, and show the
current status and the available next action in the UI. Keep it to a single review step for now,
but design the states so more steps can be added later.

Acceptance: a costing can be submitted, reviewed, and approved or rejected, with the history
visible. Then commit.
```

### Prompt 10 — AI assistant

```
Build the in-app AI assistant.

First, create a swappable AI provider adapter with a clean interface like
generate(prompt, context), and implement Google Gemini behind it — so the model can be changed
later without touching the rest of the app. Put the Gemini API key in env vars.

Add an assistant panel available throughout the UI that can:
- Explain any term, field, or figure on screen in plain language.
- Explain how a cost was reached and what's driving it.
- Produce a simpler, shareable version of a breakdown.
- Suggest a corrected Excel file when an upload doesn't match the format (built on the Phase 3
  validation output) — shown for the user to APPROVE before it's applied.
- Answer quick "what happens if I change this" questions.

Feed the assistant the on-screen context (figures, breakdown, validation errors) so answers are
grounded in the user's real data.

HARD RULE, enforced in code: the assistant explains numbers, it NEVER generates or overrides
them — cost figures always come from the engine. Any AI-suggested data change is proposed,
shown, and only applied on explicit user approval.

Acceptance: a user anywhere in the app can get a definition or a cost explanation; a malformed
upload yields an AI-suggested fix the user can approve; and no cost number ever originates from
the AI. Then commit.
```

### Prompt 11 — SAP S/4HANA integration (only when client access is available)

```
Add the SAP S/4HANA connection as a SECOND data source on top of Excel.

Build a SAP connector that authenticates to the client's S/4HANA system and fetches the relevant
cost/rate data, then maps it into the SAME engine input types used for Excel — so the engine
doesn't care where data came from. Keep SAP config (URL, client, credentials) in env vars, blank
until access is granted. Handle SAP being unavailable gracefully: the app must keep working fully
on Excel if SAP can't be reached.

Acceptance: with access in place, cost data can be drawn from SAP and costed through the same
engine, and the rest of the app works whether SAP is connected or not. Then commit.
```

### Prompt 12 — Deployment (Docker, local + cloud)

```
Package the app with Docker.

Create Dockerfiles for web and api, plus a docker-compose.yml that brings up app + database
together. Use environment-based config so the same images run locally and in the cloud with only
env vars and the database connection changing. Write a deployment guide covering both local and
cloud setups.

Acceptance: `docker compose up` runs the whole app locally, the same images can deploy to the
cloud, and the deployment guide is written. Then commit.
```

### Prompt 13 — Multi-tenant foundations (verify)

```
Verify the multi-tenant foundations are solid.

Confirm every customer-owned table has a tenant_id and every query is tenant-scoped. Make sure
configuration is structured so per-customer settings can be added later. Do NOT build full
multi-tenancy (separate sign-ups, billing, hard data separation) yet — that's a later phase. Just
confirm the groundwork is in place so that phase is an extension, not a rewrite.

Acceptance: the data model and queries are tenant-aware throughout, ready for the later
multi-customer phase. Then commit.
```

---

## Wrapping up

When you've worked through all the prompts you'll have the full V1.0 (Prompts 0–10, 12), with SAP (11) added once client access is granted and the multi-tenant groundwork (13) confirmed. Keep the `CLAUDE.md` updated if anything important changes — it's the brief every future session reads first.

A good final prompt once things are working:

```
Write the project README and a usage guide based on what we actually built, and make sure the
setup and deployment instructions match the real commands in this repo.
```

---

## Part 4 — The gotchas (things that will break if you don't say them explicitly)

These are the real-world problems that a README and architecture doc don't cover. Every single one of these must be in your prompts or Claude Code will skip them and you'll hit them at runtime. Learned the hard way.

---

### Gotcha 1 — File upload will silently fail without the right setup

This is the most likely reason your Excel upload broke on localhost.

**What happens:** Express.js (the backend) has a default body size limit of ~100kb. An Excel file is 1–10MB. It hits that limit and the request either dies silently or returns a vague error. Also, to receive a file (not just text or JSON), the server needs a specific library called `multer`. Without it, the file arrives at the server and nothing catches it.

**Add this to your Prompt 3 (Excel ingestion):**

```
IMPORTANT — file upload setup:
- Install and configure `multer` as the file upload middleware.
- Set an explicit file size limit of 50MB on multer (Excel files from real manufacturing
  data can be large).
- Set Express body parser limits: express.json({ limit: '50mb' }) and
  express.urlencoded({ limit: '50mb', extended: true }).
- Only accept .xlsx and .xls MIME types; reject anything else with a clear error message.
- If the file is too large, return a clear plain-language error (not a server crash).
- Test the upload with a real Excel file of at least 1MB before marking this done.
```

---

### Gotcha 2 — CORS will block everything between frontend and backend

**What happens:** Your React app runs on `localhost:5173`. Your backend runs on `localhost:3000`. Browsers treat these as two different "origins" and block any request between them unless the backend explicitly allows it. You'll see a CORS error in the browser console and the request never reaches the server.

**Add this to your Prompt 0 (foundations):**

```
IMPORTANT — configure CORS from day one:
- Install the `cors` package on the backend.
- In development, allow requests from http://localhost:5173 (the Vite dev server).
- In production, allow requests only from the real domain.
- Put the CORS allowed origin in an environment variable (ALLOWED_ORIGIN) so it works in
  both environments without code changes.
- Apply CORS middleware before any route definitions so it applies everywhere.
```

---

### Gotcha 3 — Environment variables won't load unless you set them up properly

**What happens:** You create a `.env` file with your database URL and API keys. The app starts. Nothing works because nobody told the app to actually read the `.env` file.

**Add this to your Prompt 0 (foundations):**

```
IMPORTANT — environment variable setup:
- Install `dotenv` on the backend and call dotenv.config() at the very top of the entry
  file, before any other imports that might need env vars.
- Create a config module that reads all env vars in one place and throws a clear error
  on startup if any required variable is missing — don't let the app start silently broken.
- Include a .env.example with every variable listed (but no real values).
- Make sure .env is in .gitignore so secrets never get committed.
```

---

### Gotcha 4 — Excel parsing libraries are not all the same

**What happens:** Claude Code picks a library to parse Excel files. There are several (xlsx, exceljs, sheetjs). They all behave differently with dates, merged cells, empty rows, and large files. If you don't specify one, you'll get whatever Claude Code feels like using, and may hit a wall later.

**Add this to your Prompt 3 (Excel ingestion):**

```
IMPORTANT — Excel parsing:
- Use the `xlsx` (SheetJS) library for parsing — it handles .xlsx and .xls, is well
  maintained, and is the most widely used.
- After parsing, strip out completely empty rows before doing anything else — real
  spreadsheets from users always have trailing empty rows that break validation.
- Handle merged cells explicitly — merged cells from Excel often appear as a value in
  the first cell and undefined in the rest; decide how to handle this and document it.
- Test with a file that has at least 500 rows to confirm it doesn't time out or run out
  of memory.
```

---

### Gotcha 5 — Database connections will fail if not handled carefully

**What happens:** The app starts, tries to hit the database before it's fully ready, and crashes. Or the database connection pool runs out under load. Or migrations haven't run and the tables don't exist yet.

**Add this to your Prompt 2 (data model) and Prompt 0 (foundations):**

```
IMPORTANT — database connection handling:
- Add a startup health check that verifies the database connection is live before the
  server starts accepting requests. If the DB isn't reachable, the server should log a
  clear error and exit — not start and fail mysteriously on the first request.
- Run migrations automatically on startup (or provide a single command to do so).
  Document which command runs migrations so I don't have to guess.
- Use a connection pool with sensible limits (e.g. max 10 connections for local dev).
- Return a clean 503 error if the database goes down mid-session, not a crash.
```

---

### Gotcha 6 — The frontend will show a blank screen if errors aren't handled

**What happens:** The API returns an error. The frontend doesn't know what to do with it. The whole screen goes white or nothing happens and the user has no idea why.

**Add this to your Prompt 5 (frontend):**

```
IMPORTANT — error states in the UI:
- Every API call must have three states handled in the UI: loading, success, and error.
- Never show a blank screen on error — show a clear message saying what went wrong.
- For file upload specifically: show an upload progress indicator, a success confirmation
  when the file is received, and a list of validation errors (from the backend) if the
  file is rejected — displayed in plain language, not a raw error code.
- If the API is unreachable (network down, server not started), show "Unable to connect
  to server" — not a blank screen or an unhandled JS error.
```

---

### Gotcha 7 — Localhost ports will conflict if you're not specific

**What happens:** You have another project running on port 3000. Or 5173. The new app tries to start, silently picks a different port, and now your API calls go to the wrong place.

**Add this to your Prompt 0 (foundations):**

```
IMPORTANT — port configuration:
- Set all ports explicitly in environment variables (PORT=3000 for API, frontend default
  is 5173 via Vite).
- Add a note in .env.example explaining which port each service uses.
- In the Vite config, set the API proxy so requests from the frontend to /api are
  automatically forwarded to the backend — this avoids CORS issues in development and
  means you never hardcode localhost:3000 in the frontend code.
```

---

### Gotcha 8 — Vibe coding without a plan produces exactly these problems

The reason all of the above happened is that "here's the README, build it" gives Claude Code too much freedom to make silent assumptions. It will pick defaults that seem reasonable but break on real data.

**The rule going forward:** for every phase where something comes in from outside (a file, a user input, a database, an API), you must explicitly tell Claude Code how to handle the failure case — not just the happy path. If you only describe what should happen when everything works, it will only build for when everything works.

A useful pattern to add to the start of any prompt where things can go wrong:

```
For every place where this can fail (bad input, network error, missing data, file too
large, wrong format), return a clear plain-language error message to the UI. Never let
the server crash silently. Never show the user a blank screen or a raw error code.
```

---

*Claude Code build guide for the Product Costing SaaS · EBITA AI Private Limited*