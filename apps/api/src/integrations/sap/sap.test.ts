import { describe, expect, it, vi } from 'vitest';
import { computeCost } from '../../engine';
import { mappedToCostInput } from '../../ingestion';
import { DisabledSapConnector, type SapConnector } from './connector';
import { SapNotConfiguredError, SapUnavailableError } from './errors';
import type { SapBomResponse } from './mapper';
import { S4HanaConnector } from './s4hana';
import { ingestFromSap } from './index';
import { validateSapResponse } from './validate';

/**
 * The SAME widget as the Excel worked example, expressed as a SAP response:
 *   material = 2·5 + 8·0.25 + 1·8 = 20.00
 *   labour   = 2 · 0.5 · 20       = 20.00
 *   machine  = 2 · 1.0 · 30       = 60.00
 *   overhead = 10% of (20+60)     =  8.00
 *   total                         = 108.00
 */
function widgetSapResponse(): SapBomResponse {
  return {
    Material: 'WIDGET',
    MaterialDescription: 'Widget',
    Currency: 'USD',
    Components: [
      {
        Component: 'FRAME',
        Description: 'Frame',
        Quantity: 2,
        ParentComponent: 'WIDGET',
        Price: 5,
      },
      {
        Component: 'BOLT',
        Description: 'Bolt',
        Quantity: 4,
        ParentComponent: 'FRAME',
        Price: 0.25,
      },
      {
        Component: 'COVER',
        Description: 'Cover',
        Quantity: 1,
        ParentComponent: 'WIDGET',
        Price: 8,
      },
    ],
    Operations: [
      {
        Operation: 'OP1',
        Component: 'FRAME',
        Description: 'Machine frame',
        MachineTime: 1,
        LabourTime: 0.5,
      },
    ],
    Rates: { LabourRate: 20, MachineRate: 30, OverheadPercent: 10 },
  };
}

/** A connector that returns a canned response — stands in for a live S/4HANA. */
function fakeConnector(response: SapBomResponse): SapConnector {
  return {
    name: 'fake',
    configured: true,
    async fetchBom() {
      return response;
    },
  };
}

describe('SAP — disabled connector', () => {
  it('refuses loudly when SAP is not configured (so the app falls back to Excel)', async () => {
    const c = new DisabledSapConnector();
    expect(c.configured).toBe(false);
    await expect(c.fetchBom('WIDGET')).rejects.toBeInstanceOf(SapNotConfiguredError);
  });
});

describe('SAP — same engine, same number as Excel', () => {
  it('costs a SAP-sourced widget to exactly 108.00', async () => {
    const result = await ingestFromSap(fakeConnector(widgetSapResponse()), 'WIDGET');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Materials are tagged as coming from SAP.
    expect(result.materials.every((m) => m.source === 'sap')).toBe(true);

    const cost = computeCost(mappedToCostInput(result));
    expect(cost.total.material).toBe('20.00');
    expect(cost.total.labour).toBe('20.00');
    expect(cost.total.machine).toBe('60.00');
    expect(cost.total.overhead).toBe('8.00');
    expect(cost.total.total).toBe('108.00');
  });
});

describe('SAP — validation rejects bad data with plain messages', () => {
  it('accepts a sound response', () => {
    expect(validateSapResponse(widgetSapResponse())).toEqual([]);
  });

  it('flags an empty response', () => {
    const problems = validateSapResponse(undefined);
    expect(problems[0]?.code).toBe('empty_response');
  });

  it('collects every problem at once (no components, bad quantity, broken parent, missing rates)', () => {
    const bad = {
      Material: 'X',
      MaterialDescription: 'X',
      Components: [
        { Component: 'A', Description: 'A', Quantity: 'oops', ParentComponent: 'GHOST', Price: -1 },
      ],
      Rates: { LabourRate: 'nope', MachineRate: -5 },
    } as unknown as SapBomResponse;

    const codes = validateSapResponse(bad).map((p) => p.code);
    expect(codes).toContain('bad_quantity');
    expect(codes).toContain('bad_price');
    expect(codes).toContain('broken_reference');
    expect(codes).toContain('bad_rate');
  });

  it('ingestFromSap returns a structured problem list (never a crash) for bad data', async () => {
    const bad = {
      Material: 'X',
      MaterialDescription: 'X',
      Components: [],
      Rates: { LabourRate: 1, MachineRate: 1 },
    } as SapBomResponse;
    const result = await ingestFromSap(fakeConnector(bad), 'X');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.code === 'no_components')).toBe(true);
  });
});

describe('SAP — S/4HANA connector transport', () => {
  const cfg = { baseUrl: 'https://sap.example.com', client: '100', username: 'u', password: 'p' };

  it('sends Material and sap-client, and unwraps an OData { d: {...} } envelope', async () => {
    let calledUrl = '';
    const fetchFn = vi.fn(async (url: string | URL) => {
      calledUrl = String(url);
      return new Response(JSON.stringify({ d: widgetSapResponse() }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const connector = new S4HanaConnector(cfg, fetchFn as unknown as typeof fetch);

    const res = await connector.fetchBom('WIDGET');
    expect(res.Material).toBe('WIDGET');
    expect(calledUrl).toContain('Material=WIDGET');
    expect(calledUrl).toContain('sap-client=100');
  });

  it('turns a network failure into a clear SapUnavailableError (app keeps working on Excel)', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const connector = new S4HanaConnector(cfg, fetchFn as unknown as typeof fetch);
    await expect(connector.fetchBom('WIDGET')).rejects.toBeInstanceOf(SapUnavailableError);
  });

  it('reports rejected credentials clearly on 401', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 401 }));
    const connector = new S4HanaConnector(cfg, fetchFn as unknown as typeof fetch);
    await expect(connector.fetchBom('WIDGET')).rejects.toThrow(/credentials/i);
  });

  it('reports a missing material clearly on 404', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 404 }));
    const connector = new S4HanaConnector(cfg, fetchFn as unknown as typeof fetch);
    await expect(connector.fetchBom('NOPE')).rejects.toThrow(/no costing BOM/i);
  });
});
