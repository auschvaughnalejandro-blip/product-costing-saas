/**
 * A small, hand-verifiable worked example used by the engine tests and by the
 * database seed. The exact expected total is asserted in the test suite.
 *
 * Widget (qty 1)
 * ├─ Frame  (qty 2, consumes STEEL @ 5.00)        ← also has the machining op
 * │  └─ Bolt (qty 4, consumes BOLT  @ 0.25)
 * └─ Cover  (qty 1, consumes PLASTIC @ 8.00)
 *
 * Effective quantities: Frame 2, Bolt 8, Cover 1.
 *   material = 2·5 + 8·0.25 + 1·8 = 10 + 2 + 8 = 20.00
 *   labour   = 2 · 0.5h · 20      = 20.00
 *   machine  = 2 · 1.0h · 30      = 60.00
 *   overhead = 10% of (labour+machine) = 10% of 80 = 8.00
 *   total    = 20 + 20 + 60 + 8   = 108.00
 */
import type { CostInput } from '@costing/shared';

export function widgetExample(): CostInput {
  return {
    currency: 'USD',
    product: {
      id: 'WIDGET',
      name: 'Widget',
      quantity: 1,
      children: [
        {
          id: 'FRAME',
          name: 'Frame',
          quantity: 2,
          materialId: 'STEEL',
          children: [{ id: 'BOLT', name: 'Bolt', quantity: 4, materialId: 'BOLT' }],
        },
        { id: 'COVER', name: 'Cover', quantity: 1, materialId: 'PLASTIC' },
      ],
    },
    routing: [
      { id: 'OP1', name: 'Machine frame', partId: 'FRAME', machineTime: 1, labourTime: 0.5 },
    ],
    rates: {
      materials: {
        STEEL: { unitPrice: 5, unit: 'kg' },
        BOLT: { unitPrice: 0.25, unit: 'pcs' },
        PLASTIC: { unitPrice: 8, unit: 'kg' },
      },
      labourRate: 20,
      machineRate: 30,
      overhead: { type: 'percentage', percent: 10, base: 'conversion' },
      currency: 'USD',
    },
  };
}
