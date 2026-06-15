# SAP S/4HANA integration

SAP is a **second data source on top of Excel**, not a replacement. A material's
bill of materials, routing and rates are pulled from the client's S/4HANA system,
mapped into the *same* shape Excel produces, and costed through the *same* engine.
The engine — and everything downstream (versions, quotations, approvals, the AI
assistant) — never learns where the data came from.

SAP is **optional**. The application runs fully on Excel whether or not SAP is
configured or reachable. Nothing in the rest of the app depends on it.

## Configuration

All SAP settings come from environment variables (blank until the client grants
access). See `.env.example`:

| Variable | Notes |
| --- | --- |
| `SAP_BASE_URL` | Base URL of the S/4HANA gateway (e.g. `https://s4.example.com`). |
| `SAP_CLIENT` | SAP client / mandant (sent as the `sap-client` query parameter). |
| `SAP_USERNAME` | Service user for HTTP Basic auth. |
| `SAP_PASSWORD` | Service user password. |

SAP is considered **configured** only when `SAP_BASE_URL` and `SAP_USERNAME` are
both set. Until then the app uses a disabled connector that fails loudly with a
clear message — it never invents data.

Check the live status at `GET /api/sap/status` → `{ "configured": false, "connector": "none" }`.

## How a fetch works

The connector calls a gateway service on the client's system that returns the
costed BOM for a material as JSON:

```
GET {SAP_BASE_URL}/sap/opu/odata/sap/API_COSTING_BOM_SRV/CostedBom
      ?Material={material}&sap-client={client}&$format=json
Authorization: Basic base64(user:password)
```

OData envelopes (`{ "d": { … } }`, `{ "value": [ … ] }`, `{ "results": [ … ] }`)
are unwrapped automatically. The expected payload shape (`SapBomResponse`):

```jsonc
{
  "Material": "WIDGET",
  "MaterialDescription": "Widget",
  "Currency": "USD",
  "Components": [
    { "Component": "FRAME", "Description": "Frame", "Quantity": 2, "ParentComponent": "WIDGET", "Price": 5 },
    { "Component": "BOLT",  "Description": "Bolt",  "Quantity": 4, "ParentComponent": "FRAME",  "Price": 0.25 },
    { "Component": "COVER", "Description": "Cover", "Quantity": 1, "ParentComponent": "WIDGET", "Price": 8 }
  ],
  "Operations": [
    { "Operation": "OP1", "Component": "FRAME", "Description": "Machine frame", "MachineTime": 1, "LabourTime": 0.5 }
  ],
  "Rates": { "LabourRate": 20, "MachineRate": 30, "OverheadPercent": 10 }
}
```

- A component is a BOM part. If it has a `Price`, it also contributes that price
  as a material (priced components become master-data materials tagged
  `source: 'sap'`).
- `ParentComponent` links the tree; a component with no parent (or whose parent
  is the top `Material`) hangs off the product root.
- `OverheadPercent > 0` becomes a percentage overhead rule on the conversion
  cost; otherwise overhead is `none`.

If the client's gateway exposes the data at a different path, override
`servicePath` when constructing the `S4HanaConnector`.

## Pipeline (mirrors Excel: fetch → validate → map)

1. **Fetch** — `S4HanaConnector.fetchBom(material)` authenticates and retrieves
   the payload. Any connection problem becomes a clear, typed error rather than a
   crash:
   - not configured → `SapNotConfiguredError` (HTTP **409**),
   - unreachable / timeout / auth rejected / material not found / non-2xx →
     `SapUnavailableError` (HTTP **503**).
2. **Validate** — `validateSapResponse` checks the payload is complete and sane,
   collecting *every* problem in plain language (missing material, no components,
   bad quantity/price/time, broken parent reference, missing/negative rates). The
   problems use the same `ValidationProblem` shape as Excel, so the AI assistant
   can reason about them the same way. Bad data returns **422** with the list —
   never a wrong number.
3. **Map** — `normalizeSapToValidatedData` → `mapToProduct(..., 'sap')` produces
   exactly the engine-ready `MappedUpload` the Excel path produces.

Only after a clean validation is the product costed and (unless `dryRun`) saved.

## API

| Method & path | Role | Notes |
| --- | --- | --- |
| `GET /api/sap/status` | any user | `{ configured, connector }`. The UI shows "Import from SAP" only when configured. |
| `POST /api/sap/import` | admin / estimator | Body `{ "material": "WIDGET", "dryRun"?: true }`. On clean data: costs it and (unless `dryRun`) saves the product. `422` with `errors` for bad SAP data; `409`/`503` when SAP is off/unreachable. |

## Swapping the connector

The transport sits behind the `SapConnector` interface
(`fetchBom(materialNumber) → SapBomResponse`). To move from OData to RFC/BAPI,
CPI, or anything else, write one new implementation and return it from
`getSapConnector()` — nothing else in the app changes. Tests inject a fake
connector via `setSapConnector(...)`.

## Worked example

The `WIDGET` payload above costs to **108.00** — the *same* total as the Excel
worked example in `docs/EXCEL_FORMAT.md`, proving the engine is the single source
of cost truth regardless of where the data originates:

```
material = 2·5 + 8·0.25 + 1·8       = 20.00
labour   = 2 · 0.5 · 20             = 20.00
machine  = 2 · 1.0 · 30             = 60.00
overhead = 10% of (labour+machine)  =  8.00
total                               = 108.00
```
