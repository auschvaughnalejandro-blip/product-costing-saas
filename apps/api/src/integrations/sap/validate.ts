/**
 * Validate a raw SAP response BEFORE it is mapped, so bad SAP data is rejected
 * with clear, plain-language messages instead of silently producing a wrong
 * number (NON-NEGOTIABLE rule 6). Problems use the same `ValidationProblem`
 * shape as Excel ingestion, so the AI assistant can reason about them the same
 * way. `sheet` is set to "SAP" to mark the origin.
 */
import type { ValidationProblem } from '@costing/shared';
import type { SapBomResponse } from './mapper';

const SHEET = 'SAP';

function isNumeric(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  return Number.isFinite(Number(value));
}

function isNonNegative(value: unknown): boolean {
  return isNumeric(value) && Number(value) >= 0;
}

/** Returns an empty array when the response is sound; otherwise every problem found. */
export function validateSapResponse(raw: SapBomResponse | undefined | null): ValidationProblem[] {
  const problems: ValidationProblem[] = [];

  if (!raw || typeof raw !== 'object') {
    problems.push({
      sheet: SHEET,
      code: 'empty_response',
      message: 'SAP returned no usable data for this material.',
    });
    return problems;
  }

  if (!raw.Material || String(raw.Material).trim() === '') {
    problems.push({
      sheet: SHEET,
      code: 'missing_material',
      message: 'SAP response is missing the Material number.',
    });
  }

  const components = Array.isArray(raw.Components) ? raw.Components : [];
  if (components.length === 0) {
    problems.push({
      sheet: SHEET,
      code: 'no_components',
      message: 'SAP returned a product with no BOM components.',
    });
  }

  const ids = new Set<string>();
  for (const c of components) {
    if (c.Component) ids.add(String(c.Component));
  }

  components.forEach((c, i) => {
    const ref = c.Component ? `component "${c.Component}"` : `component on row ${i + 1}`;
    if (!c.Component || String(c.Component).trim() === '') {
      problems.push({
        sheet: SHEET,
        code: 'missing_component_id',
        message: `A BOM ${ref} has no Component id.`,
      });
    }
    if (!isNonNegative(c.Quantity)) {
      problems.push({
        sheet: SHEET,
        column: 'Quantity',
        code: 'bad_quantity',
        message: `Quantity for ${ref} must be a number of 0 or more (got "${c.Quantity}").`,
      });
    }
    if (c.Price !== undefined && !isNonNegative(c.Price)) {
      problems.push({
        sheet: SHEET,
        column: 'Price',
        code: 'bad_price',
        message: `Price for ${ref} must be a number of 0 or more (got "${c.Price}").`,
      });
    }
    if (
      c.ParentComponent &&
      !ids.has(String(c.ParentComponent)) &&
      String(c.ParentComponent) !== String(raw.Material)
    ) {
      problems.push({
        sheet: SHEET,
        column: 'ParentComponent',
        code: 'broken_reference',
        message: `${ref} has parent "${c.ParentComponent}", which is not in the BOM.`,
      });
    }
  });

  const operations = Array.isArray(raw.Operations) ? raw.Operations : [];
  operations.forEach((o, i) => {
    const ref = o.Operation ? `operation "${o.Operation}"` : `operation on row ${i + 1}`;
    if (o.Component && !ids.has(String(o.Component))) {
      problems.push({
        sheet: SHEET,
        column: 'Component',
        code: 'broken_reference',
        message: `${ref} is on component "${o.Component}", which is not in the BOM.`,
      });
    }
    if (!isNonNegative(o.MachineTime)) {
      problems.push({
        sheet: SHEET,
        column: 'MachineTime',
        code: 'bad_time',
        message: `MachineTime for ${ref} must be a number of 0 or more.`,
      });
    }
    if (!isNonNegative(o.LabourTime)) {
      problems.push({
        sheet: SHEET,
        column: 'LabourTime',
        code: 'bad_time',
        message: `LabourTime for ${ref} must be a number of 0 or more.`,
      });
    }
  });

  if (!raw.Rates || typeof raw.Rates !== 'object') {
    problems.push({
      sheet: SHEET,
      code: 'missing_rates',
      message: 'SAP response is missing labour/machine rates.',
    });
  } else {
    if (!isNonNegative(raw.Rates.LabourRate)) {
      problems.push({
        sheet: SHEET,
        column: 'LabourRate',
        code: 'bad_rate',
        message: `LabourRate must be a number of 0 or more (got "${raw.Rates.LabourRate}").`,
      });
    }
    if (!isNonNegative(raw.Rates.MachineRate)) {
      problems.push({
        sheet: SHEET,
        column: 'MachineRate',
        code: 'bad_rate',
        message: `MachineRate must be a number of 0 or more (got "${raw.Rates.MachineRate}").`,
      });
    }
    if (raw.Rates.OverheadPercent !== undefined && !isNonNegative(raw.Rates.OverheadPercent)) {
      problems.push({
        sheet: SHEET,
        column: 'OverheadPercent',
        code: 'bad_rate',
        message: `OverheadPercent must be a number of 0 or more (got "${raw.Rates.OverheadPercent}").`,
      });
    }
  }

  return problems;
}
