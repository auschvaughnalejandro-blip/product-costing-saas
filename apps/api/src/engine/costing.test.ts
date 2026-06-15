import { describe, expect, it } from 'vitest';
import type { CostInput, CostNode } from '@costing/shared';
import { computeCost } from './costing';
import { EngineError, type EngineErrorCode } from './errors';
import { widgetExample } from './examples';
import { Big } from './decimal';

/** Assert that running `fn` throws an EngineError with the given code. */
function expectEngineError(fn: () => unknown, code: EngineErrorCode): void {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(EngineError);
    expect((err as EngineError).code).toBe(code);
    return;
  }
  throw new Error(`Expected an EngineError with code ${code}, but nothing was thrown.`);
}

/** Find a node by id anywhere in the cost tree. */
function findNode(node: CostNode, id: string): CostNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

/** A minimal valid input with no overhead, for focused tests. */
function base(overrides: Partial<CostInput> = {}): CostInput {
  return {
    product: { id: 'P', name: 'Product', quantity: 1 },
    routing: [],
    rates: { materials: {}, labourRate: 10, machineRate: 10, overhead: { type: 'none' } },
    ...overrides,
  };
}

describe('computeCost — the worked example', () => {
  it('produces the exact expected total of 108.00', () => {
    const result = computeCost(widgetExample());
    expect(result.total.total).toBe('108.00');
  });

  it('breaks the product total down correctly', () => {
    const { total } = computeCost(widgetExample());
    expect(total).toEqual({
      material: '20.00',
      labour: '20.00',
      machine: '60.00',
      overhead: '8.00',
      total: '108.00',
    });
  });

  it('reports the cost at every level of the tree', () => {
    const { tree } = computeCost(widgetExample());

    const frame = findNode(tree, 'FRAME')!;
    expect(frame.cost).toEqual({
      material: '12.00', // own steel 10.00 + bolts 2.00
      labour: '20.00',
      machine: '60.00',
      overhead: '8.00',
      total: '100.00',
    });

    const bolt = findNode(tree, 'BOLT')!;
    expect(bolt.cost.material).toBe('2.00');
    expect(bolt.cost.total).toBe('2.00');
    expect(bolt.effectiveQuantity).toBe('8'); // 2 frames × 4 bolts

    const cover = findNode(tree, 'COVER')!;
    expect(cover.cost.total).toBe('8.00');
  });

  it('exposes the unit material price for display', () => {
    const { tree } = computeCost(widgetExample());
    expect(findNode(tree, 'FRAME')!.unitMaterialPrice).toBe('5.00');
    expect(findNode(tree, 'BOLT')!.unitMaterialPrice).toBe('0.25');
    expect(tree.unitMaterialPrice).toBeUndefined(); // the product itself has no material
  });

  it('always has components that add up to the node total', () => {
    const { tree } = computeCost(widgetExample());
    const check = (n: CostNode) => {
      const sum = new Big(n.cost.material)
        .plus(n.cost.labour)
        .plus(n.cost.machine)
        .plus(n.cost.overhead);
      expect(sum.toFixed(2)).toBe(n.cost.total);
      n.children.forEach(check);
    };
    check(tree);
  });
});

describe('computeCost — determinism', () => {
  it('returns identical output for identical input', () => {
    const a = computeCost(widgetExample());
    const b = computeCost(widgetExample());
    expect(a).toEqual(b);
  });
});

describe('computeCost — single-level parts', () => {
  it('costs a single purchased part', () => {
    const result = computeCost(
      base({
        product: { id: 'P', name: 'Plate', quantity: 1, materialId: 'M' },
        rates: {
          materials: { M: { unitPrice: 10 } },
          labourRate: 0,
          machineRate: 0,
          overhead: { type: 'none' },
        },
      }),
    );
    expect(result.total.material).toBe('10.00');
    expect(result.total.total).toBe('10.00');
  });

  it('multiplies quantity by unit price', () => {
    const result = computeCost(
      base({
        product: { id: 'P', name: 'Plate', quantity: 3, materialId: 'M' },
        rates: {
          materials: { M: { unitPrice: 4 } },
          labourRate: 0,
          machineRate: 0,
          overhead: { type: 'none' },
        },
      }),
    );
    expect(result.total.material).toBe('12.00');
  });

  it('costs labour and machine from an operation', () => {
    const result = computeCost(
      base({
        product: { id: 'P', name: 'Part', quantity: 2 },
        routing: [{ id: 'O', name: 'Mill', partId: 'P', machineTime: 1.5, labourTime: 0.25 }],
        rates: { materials: {}, labourRate: 40, machineRate: 100, overhead: { type: 'none' } },
      }),
    );
    // labour  = 2 · 0.25 · 40  = 20.00
    // machine = 2 · 1.5  · 100 = 300.00
    expect(result.total.labour).toBe('20.00');
    expect(result.total.machine).toBe('300.00');
  });
});

describe('computeCost — deep multi-level products', () => {
  it('multiplies quantities all the way down the tree', () => {
    const input = base({
      product: {
        id: 'L0',
        name: 'L0',
        quantity: 1,
        children: [
          {
            id: 'L1',
            name: 'L1',
            quantity: 2,
            children: [
              {
                id: 'L2',
                name: 'L2',
                quantity: 3,
                children: [{ id: 'L3', name: 'L3', quantity: 5, materialId: 'M' }],
              },
            ],
          },
        ],
      },
      rates: {
        materials: { M: { unitPrice: 1 } },
        labourRate: 0,
        machineRate: 0,
        overhead: { type: 'none' },
      },
    });
    const result = computeCost(input);
    // effective qty of L3 = 1·2·3·5 = 30, price 1 → 30.00
    expect(result.total.material).toBe('30.00');
    expect(findNode(result.tree, 'L3')!.effectiveQuantity).toBe('30');
  });
});

describe('computeCost — decimal-safe money', () => {
  it('does not suffer 0.1 + 0.2 floating-point error', () => {
    const result = computeCost(
      base({
        product: {
          id: 'P',
          name: 'P',
          quantity: 1,
          children: [
            { id: 'A', name: 'A', quantity: 1, materialId: 'A' },
            { id: 'B', name: 'B', quantity: 1, materialId: 'B' },
          ],
        },
        rates: {
          materials: { A: { unitPrice: '0.1' }, B: { unitPrice: '0.2' } },
          labourRate: 0,
          machineRate: 0,
          overhead: { type: 'none' },
        },
      }),
    );
    expect(result.total.material).toBe('0.30');
  });

  it('handles 0.1 × 3 exactly', () => {
    const result = computeCost(
      base({
        product: { id: 'P', name: 'P', quantity: 3, materialId: 'M' },
        rates: {
          materials: { M: { unitPrice: '0.1' } },
          labourRate: 0,
          machineRate: 0,
          overhead: { type: 'none' },
        },
      }),
    );
    expect(result.total.material).toBe('0.30');
  });

  it('rounds half-up at 2 decimal places', () => {
    const result = computeCost(
      base({
        product: { id: 'P', name: 'P', quantity: 1, materialId: 'M' },
        rates: {
          materials: { M: { unitPrice: '1.005' } },
          labourRate: 0,
          machineRate: 0,
          overhead: { type: 'none' },
        },
      }),
    );
    // 1.005 → 1.01 (half-up). A naive float toFixed(2) would give "1.00".
    expect(result.total.material).toBe('1.01');
  });
});

describe('computeCost — overhead rules', () => {
  const withRates = (overhead: CostInput['rates']['overhead']): CostInput =>
    base({
      product: { id: 'P', name: 'P', quantity: 1, materialId: 'M' },
      routing: [{ id: 'O', name: 'Op', partId: 'P', machineTime: 1, labourTime: 1 }],
      rates: {
        materials: { M: { unitPrice: 100 } }, // material 100
        labourRate: 10, // labour 10
        machineRate: 20, // machine 20
        overhead,
      },
    });

  it('applies a percentage of conversion (labour + machine) by default', () => {
    const r = computeCost(withRates({ type: 'percentage', percent: 50 }));
    // conversion = 30, overhead = 15
    expect(r.total.overhead).toBe('15.00');
    expect(r.total.total).toBe('145.00');
  });

  it('applies a percentage of total when asked', () => {
    const r = computeCost(withRates({ type: 'percentage', percent: 10, base: 'total' }));
    // total base = 130, overhead = 13
    expect(r.total.overhead).toBe('13.00');
  });

  it('applies a percentage of material when asked', () => {
    const r = computeCost(withRates({ type: 'percentage', percent: 25, base: 'material' }));
    expect(r.total.overhead).toBe('25.00');
  });

  it('applies a fixed amount once at the product level', () => {
    const r = computeCost(withRates({ type: 'fixed', amount: 42 }));
    expect(r.total.overhead).toBe('42.00');
  });

  it('applies no overhead for the none rule', () => {
    const r = computeCost(withRates({ type: 'none' }));
    expect(r.total.overhead).toBe('0.00');
    expect(r.total.total).toBe('130.00');
  });
});

describe('computeCost — zero is valid', () => {
  it('allows a zero quantity', () => {
    const r = computeCost(
      base({
        product: { id: 'P', name: 'P', quantity: 0, materialId: 'M' },
        rates: {
          materials: { M: { unitPrice: 99 } },
          labourRate: 0,
          machineRate: 0,
          overhead: { type: 'none' },
        },
      }),
    );
    expect(r.total.material).toBe('0.00');
  });
});

describe('computeCost — error cases (clear errors, never wrong numbers)', () => {
  it('rejects a missing material price', () => {
    expectEngineError(
      () =>
        computeCost(
          base({ product: { id: 'P', name: 'P', quantity: 1, materialId: 'NOPE' } }),
        ),
      'MISSING_MATERIAL_RATE',
    );
  });

  it('rejects a negative quantity', () => {
    expectEngineError(
      () => computeCost(base({ product: { id: 'P', name: 'P', quantity: -1, materialId: 'M' } })),
      'INVALID_QUANTITY',
    );
  });

  it('rejects a non-numeric quantity', () => {
    expectEngineError(
      () =>
        computeCost(
          base({ product: { id: 'P', name: 'P', quantity: 'abc' as unknown as number } }),
        ),
      'INVALID_QUANTITY',
    );
  });

  it('rejects a negative material price', () => {
    expectEngineError(
      () =>
        computeCost(
          base({
            product: { id: 'P', name: 'P', quantity: 1, materialId: 'M' },
            rates: {
              materials: { M: { unitPrice: -5 } },
              labourRate: 0,
              machineRate: 0,
              overhead: { type: 'none' },
            },
          }),
        ),
      'INVALID_VALUE',
    );
  });

  it('rejects a circular part reference', () => {
    // Root P contains a child that is also "P" — a part that contains itself.
    expectEngineError(
      () =>
        computeCost(
          base({
            product: {
              id: 'P',
              name: 'P',
              quantity: 1,
              children: [{ id: 'P', name: 'P again', quantity: 1 }],
            },
          }),
        ),
      'CIRCULAR_REFERENCE',
    );
  });

  it('rejects a duplicate part id in different branches', () => {
    expectEngineError(
      () =>
        computeCost(
          base({
            product: {
              id: 'ROOT',
              name: 'Root',
              quantity: 1,
              children: [
                { id: 'X', name: 'X1', quantity: 1 },
                { id: 'X', name: 'X2', quantity: 1 },
              ],
            },
          }),
        ),
      'DUPLICATE_PART_ID',
    );
  });

  it('rejects an operation that points at a non-existent part', () => {
    expectEngineError(
      () =>
        computeCost(
          base({
            routing: [{ id: 'O', name: 'Ghost op', partId: 'GHOST', machineTime: 1, labourTime: 1 }],
          }),
        ),
      'UNKNOWN_OPERATION_PART',
    );
  });

  it('rejects an operation with no labour rate available', () => {
    expectEngineError(
      () =>
        computeCost({
          product: { id: 'P', name: 'P', quantity: 1 },
          routing: [{ id: 'O', name: 'Op', partId: 'P', machineTime: 1, labourTime: 1 }],
          rates: {
            materials: {},
            labourRate: undefined as unknown as number,
            machineRate: 5,
            overhead: { type: 'none' },
          },
        }),
      'MISSING_LABOUR_RATE',
    );
  });

  it('rejects a negative overhead percentage', () => {
    expectEngineError(
      () =>
        computeCost(
          base({
            product: { id: 'P', name: 'P', quantity: 1, materialId: 'M' },
            rates: {
              materials: { M: { unitPrice: 10 } },
              labourRate: 0,
              machineRate: 0,
              overhead: { type: 'percentage', percent: -5 },
            },
          }),
        ),
      'INVALID_OVERHEAD',
    );
  });

  it('rejects missing rates entirely', () => {
    expectEngineError(
      () => computeCost({ product: { id: 'P', name: 'P', quantity: 1 }, routing: [] } as unknown as CostInput),
      'MISSING_RATES',
    );
  });
});
