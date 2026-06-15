# Excel upload format

This is the one spreadsheet format the platform accepts. A valid workbook has
the sheets below. Upload is the primary way to get product data in; if a file
doesn't match this format the app reports exactly what's wrong (and, from Phase
10, the AI assistant can suggest a corrected file for you to approve).

You can download a ready-made template + worked example from the app
(**Upload → Download template**), which is generated from this exact spec.

> Column headers must appear in row 1 of each sheet and match the names below
> (case-insensitive). Extra columns are ignored. Money and rates are plain
> numbers; don't include currency symbols.

## Sheet: `Materials` (required)

Master-data prices for every material referenced by the product.

| Column | Required | Notes |
| --- | --- | --- |
| `Code` | ✅ | Unique code, referenced by parts (e.g. `STEEL`). |
| `Name` | ✅ | Human-readable name. |
| `Unit` | | Unit of measure (e.g. `kg`, `pcs`). |
| `UnitPrice` | ✅ | Price per unit, a number ≥ 0. |
| `Currency` | | Defaults to the product currency. |

## Sheet: `Parts` (required)

The bill of materials as a tree. Each row is one part; `ParentId` links it to
its parent. Exactly one row must have a blank `ParentId` — that's the product.

| Column | Required | Notes |
| --- | --- | --- |
| `NodeId` | ✅ | Unique id within the product (e.g. `FRAME`). |
| `ParentId` | | The `NodeId` of the parent. Blank for the product root. |
| `Name` | ✅ | Part name. |
| `Quantity` | ✅ | Quantity per one of its parent, a number ≥ 0. |
| `Unit` | | Unit of measure. |
| `MaterialCode` | | A `Code` from the `Materials` sheet, if this part consumes a material. |

## Sheet: `Operations` (optional)

Routing operations. Labour and machine costs come from these.

| Column | Required | Notes |
| --- | --- | --- |
| `OpId` | ✅ | Unique operation id. |
| `PartId` | ✅ | The `NodeId` of the part this operation is performed on. |
| `Name` | ✅ | Operation name. |
| `MachineTime` | ✅ | Machine time per unit of the part (e.g. hours), a number ≥ 0. |
| `LabourTime` | ✅ | Labour time per unit of the part, a number ≥ 0. |
| `MachineRateCode` | | Optional named machine rate (see `NamedRates`); defaults to `MachineRate`. |
| `LabourRateCode` | | Optional named labour rate; defaults to `LabourRate`. |

## Sheet: `Settings` (required)

Two columns, `Key` and `Value`. The recognised keys:

| Key | Required | Notes |
| --- | --- | --- |
| `ProductCode` | ✅ | Unique product code. |
| `ProductName` | ✅ | Product name. |
| `ProductDescription` | | Free text. |
| `LabourRate` | ✅ | Default labour cost per time unit. |
| `MachineRate` | ✅ | Default machine cost per time unit. |
| `OverheadType` | ✅ | `none`, `percentage`, or `fixed`. |
| `OverheadPercent` | if percentage | Percentage value (e.g. `10` for 10%). |
| `OverheadBase` | | `material`, `conversion` (default), `prime`, or `total`. |
| `OverheadAmount` | if fixed | A fixed overhead amount. |
| `Currency` | | Defaults to `USD`. |

## Sheet: `NamedRates` (optional)

Per-workcentre labour/machine rates, referenced by operations.

| Column | Required | Notes |
| --- | --- | --- |
| `Kind` | ✅ | `labour` or `machine`. |
| `Code` | ✅ | The code referenced by an operation. |
| `Rate` | ✅ | Cost per time unit, a number ≥ 0. |

---

### How it's processed

The upload goes through three separate, independently-tested steps:

1. **Parse** — read the cells from the workbook.
2. **Validate** — check the data is complete and sane; report every problem in
   plain language (missing column, blank rate, bad number, broken reference).
3. **Map** — convert valid data into the costing engine's input types.

Only after a clean validation does anything get costed or saved.
