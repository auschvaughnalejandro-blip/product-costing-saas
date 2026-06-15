# Usage guide

A walkthrough of the app from a user's point of view. It assumes the app is
running (see the README for local dev, or `docs/DEPLOYMENT.md` for Docker).

## 1. First user & sign-in

Open the app (local dev: http://localhost:5173 · Docker: http://localhost:8080).

- **Register** the first account — it automatically becomes the **admin** for the
  single tenant. After that, only an admin can add more users.
- Sign in with email + password. Sessions are kept in an httpOnly cookie.

**Roles** determine what you can do:

| Role | Can |
| --- | --- |
| `admin` | everything, including adding users |
| `estimator` | upload/import, edit, save versions, submit for approval |
| `approver` | approve / reject submitted versions |
| `viewer` | read-only |

## 2. Get product data in

Two data sources feed the **same** costing engine.

### Excel (primary)

1. **Products → Upload spreadsheet**.
2. New to the format? **Download the template** — it includes a worked example.
   The full spec is in `docs/EXCEL_FORMAT.md`.
3. Upload your `.xlsx`. A clean file is costed immediately and saved as a product.
4. If the file doesn't match the format, you get a **plain-language list of every
   problem** (missing column, blank rate, bad number…). You can ask the **AI
   assistant to suggest a corrected file**, review it, and re-upload — the AI
   never changes your data without your approval.

### SAP S/4HANA (optional second source)

If SAP is configured (see `docs/SAP_INTEGRATION.md`), an **Import from SAP**
button appears on the Products page. Enter a material number; its BOM, routing
and rates are pulled from S/4HANA and costed exactly like an uploaded file. If
SAP isn't configured or is unreachable, the rest of the app is unaffected — it
runs fully on Excel.

## 3. Explore the cost breakdown

Open a product to see:

- A **multi-level tree/table** of parts and sub-parts with quantities, rates and
  the per-level cost.
- A **summary panel** with the breakdown: material / labour / machine / overhead /
  total.

The interface only **displays** what the engine returns — it never calculates a
figure itself.

## 4. Edit and run what-ifs

Edit quantities, rates or cost values directly in the grid. Each change is sent
to the engine (server-side) and the whole breakdown **recalculates live** — the
same engine powers both the first calculation and every what-if, so the numbers
always agree. Unsaved changes are flagged before you commit them.

## 5. Save cost versions

Save the current state as a **named version**, marked **draft** or **final**.
Each save is an **immutable snapshot** (who, when, the exact input and result), so
finals are never silently overwritten. Reopen any version later to continue.

## 6. Estimation & quotation

From a saved version, create a **quotation**: add customer details, terms, and a
**margin/markup**. Cost (to make) and price (to charge) are kept clearly separate
— margin is applied on top of cost. The result is a clean, shareable quotation
that always traces back to the specific costing it came from.

## 7. Approvals

A cost version moves through **draft → submitted → approved / rejected**, with
only valid transitions allowed:

- An **estimator** submits a version for review.
- An **approver** approves or rejects it, optionally with a comment.
- The full **history (who did what, when)** is recorded and visible.

## 8. The AI assistant

Available throughout the app, the assistant can:

- explain any term, field or figure on screen in plain language,
- explain how a cost was reached and what's driving it,
- produce a simpler, shareable version of a breakdown,
- suggest a corrected Excel file when an upload doesn't match the format
  (shown for your approval), and
- answer quick "what happens if I change this" questions.

**It explains numbers — it never produces them.** Every cost figure comes from
the engine; any AI-suggested data change is only applied after you approve it. If
no AI key is configured, the assistant simply reports that it's unavailable and
the rest of the app is unaffected.
