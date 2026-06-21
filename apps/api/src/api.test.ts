import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from './app';
import { createTestDb, type TestDb } from './db/testing';
import { sampleWorkbookSpec, writeWorkbook } from './ingestion';
import { setSapConnector, type SapBomResponse, type SapConnector } from './integrations/sap';

describe('API integration', () => {
  let h: TestDb;
  let app: Express;
  let agent: ReturnType<typeof request.agent>;
  let productId = '';
  let versionId = '';

  beforeAll(async () => {
    h = await createTestDb();
    app = createApp({ db: h.db });
    agent = request.agent(app);
  });
  afterAll(async () => {
    await h.close();
  });

  it('rejects unauthenticated access', async () => {
    await request(app).get('/api/products').expect(401);
  });

  it('registers the first user as admin and starts a session', async () => {
    const res = await agent
      .post('/api/auth/register')
      .send({ email: 'admin@test.com', name: 'Admin', password: 'password123' })
      .expect(201);
    expect(res.body.user.role).toBe('admin');
  });

  it('returns the current user from the session cookie', async () => {
    const res = await agent.get('/api/auth/me').expect(200);
    expect(res.body.user.email).toBe('admin@test.com');
  });

  it('downloads the excel template', async () => {
    const res = await agent.get('/api/uploads/template').expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(Number(res.headers['content-length'])).toBeGreaterThan(0);
  });

  it('ingests an uploaded excel file and costs it to 108.00', async () => {
    const buffer = await writeWorkbook(sampleWorkbookSpec());
    const res = await agent
      .post('/api/uploads/excel')
      .attach('file', buffer, 'widget.xlsx')
      .expect(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.result.total.total).toBe('108.00');
    productId = res.body.productId;
    expect(productId).toBeTruthy();
  });

  it('returns a clear problem list for a malformed file (no crash)', async () => {
    const buffer = await writeWorkbook({
      materials: [{ Code: 'M', Name: 'M', UnitPrice: '' }],
      parts: [{ NodeId: 'A', ParentId: 'X', Name: 'A', Quantity: 'bad' }],
      settings: { Currency: 'USD' },
    });
    const res = await agent
      .post('/api/uploads/excel')
      .attach('file', buffer, 'bad.xlsx')
      .expect(422);
    expect(res.body.ok).toBe(false);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it('rejects a non-Excel upload with a clear message (no crash)', async () => {
    const res = await agent
      .post('/api/uploads/excel')
      .attach('file', Buffer.from('not a spreadsheet'), 'notes.txt')
      .expect(400);
    expect(res.body.message).toMatch(/excel/i);
  });

  it('accepts a large Excel file (well past the old body limit) and costs it', async () => {
    // The sample widget plus thousands of (unused) material rows — a file far
    // bigger than Express's old ~100kb default body limit. It must still upload
    // and cost correctly, proving the upload path isn't capped too low.
    const spec = sampleWorkbookSpec();
    for (let i = 0; i < 8000; i += 1) {
      spec.materials.push({
        Code: `BULK-${i}-${Math.random().toString(36).slice(2)}`,
        Name: `Bulk filler material row ${i} ${Math.random().toString(36).slice(2)}`,
        Unit: 'kg',
        UnitPrice: 1,
        Currency: 'USD',
      });
    }
    const buffer = await writeWorkbook(spec);
    expect(buffer.length).toBeGreaterThan(100 * 1024); // clearly a "large" file

    const res = await agent
      .post('/api/uploads/excel?dryRun=1')
      .attach('file', buffer, 'big-widget.xlsx')
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.result.total.total).toBe('108.00');
  });

  it('lists products including the uploaded one', async () => {
    const res = await agent.get('/api/products').expect(200);
    expect(res.body.products.map((p: { code: string }) => p.code)).toContain('WIDGET');
  });

  it('loads a product cost from storage (108.00)', async () => {
    const res = await agent.get(`/api/products/${productId}/cost`).expect(200);
    expect(res.body.result.total.total).toBe('108.00');
    expect(res.body.input).toBeTruthy();
  });

  it('recalculates an edited what-if with the same engine', async () => {
    const cost = await agent.get(`/api/products/${productId}/cost`).expect(200);
    const input = cost.body.input;
    input.rates.labourRate = 40; // double the labour rate (was 20)
    const res = await agent.post('/api/products/recalculate').send({ input }).expect(200);
    expect(res.body.result.total.labour).toBe('40.00');
    expect(res.body.result.total.total).toBe('130.00');
  });

  it('rejects an invalid recalculation with a clear engine error', async () => {
    const cost = await agent.get(`/api/products/${productId}/cost`).expect(200);
    const input = cost.body.input;
    input.product.quantity = -1;
    const res = await agent.post('/api/products/recalculate').send({ input }).expect(400);
    expect(res.body.error).toBe('engine_error');
    expect(res.body.details.code).toBe('INVALID_QUANTITY');
  });

  it('saves and reloads an immutable version', async () => {
    const create = await agent
      .post(`/api/products/${productId}/versions`)
      .send({ name: 'v1', kind: 'draft' })
      .expect(201);
    expect(create.body.version.totalCost).toBe('108.00');
    versionId = create.body.version.id;

    const list = await agent.get(`/api/products/${productId}/versions`).expect(200);
    expect(list.body.versions.length).toBe(1);

    const get = await agent.get(`/api/versions/${versionId}`).expect(200);
    expect(get.body.version.result.total.total).toBe('108.00');
  });

  it('creates a quotation from a version (price = cost + margin)', async () => {
    const res = await agent
      .post('/api/quotations')
      .send({
        costVersionId: versionId,
        customerName: 'Acme Corp',
        marginType: 'percent',
        marginValue: 25,
        terms: 'Net 30',
      })
      .expect(201);
    expect(res.body.quotation.costTotal).toBe('108.00');
    expect(res.body.quotation.priceTotal).toBe('135.00'); // 108 + 25%
    expect(res.body.quotation.number).toMatch(/^Q-\d{4}$/);
  });

  it('lists and fetches the quotation with its source version', async () => {
    const list = await agent.get('/api/quotations').expect(200);
    expect(list.body.quotations.length).toBe(1);
    const id = list.body.quotations[0].id;
    const get = await agent.get(`/api/quotations/${id}`).expect(200);
    expect(get.body.quotation.customerName).toBe('Acme Corp');
    expect(get.body.version.result.total.total).toBe('108.00'); // traces back to the costing
  });

  it('moves a version through the approval workflow', async () => {
    const submit = await agent
      .post(`/api/versions/${versionId}/transition`)
      .send({ action: 'submit' })
      .expect(200);
    expect(submit.body.version.status).toBe('submitted');
    expect(submit.body.nextActions).toEqual(expect.arrayContaining(['approve', 'reject']));

    const approve = await agent
      .post(`/api/versions/${versionId}/transition`)
      .send({ action: 'approve', comment: 'Looks good' })
      .expect(200);
    expect(approve.body.version.status).toBe('approved');
    expect(approve.body.nextActions).toEqual([]);
  });

  it('refuses an invalid transition', async () => {
    const res = await agent
      .post(`/api/versions/${versionId}/transition`)
      .send({ action: 'approve' })
      .expect(400);
    expect(res.body.message).toMatch(/can't approve/i);
  });

  it('records the approval history (who did what)', async () => {
    const res = await agent.get(`/api/versions/${versionId}/approvals`).expect(200);
    expect(res.body.events.map((e: { action: string }) => e.action)).toEqual(['submit', 'approve']);
    expect(res.body.events[1].toStatus).toBe('approved');
  });

  it('forbids a viewer-only check on protected role routes when logged out', async () => {
    await request(app).post('/api/products/recalculate').send({ input: {} }).expect(401);
  });

  // ── SAP as a second data source (Phase 11) ───────────────────────────────
  // The app works fully without SAP, and SAP-sourced data is costed through the
  // very same engine — so it produces the same number Excel does.

  it('reports SAP as not configured (the app runs on Excel regardless)', async () => {
    setSapConnector(null); // fall back to the real, env-driven connector
    const res = await agent.get('/api/sap/status').expect(200);
    expect(res.body.configured).toBe(false);
  });

  it('returns a clear 409 when importing while SAP is not configured (no crash)', async () => {
    setSapConnector(null);
    const res = await agent.post('/api/sap/import').send({ material: 'WIDGET' }).expect(409);
    expect(res.body.error).toBe('sap_not_configured');
  });

  it('imports a SAP-sourced product and costs it to 108.00 via the same engine', async () => {
    const widget: SapBomResponse = {
      Material: 'SAP-WIDGET',
      MaterialDescription: 'SAP Widget',
      Currency: 'USD',
      Components: [
        {
          Component: 'FRAME',
          Description: 'Frame',
          Quantity: 2,
          ParentComponent: 'SAP-WIDGET',
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
          ParentComponent: 'SAP-WIDGET',
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
    const fake: SapConnector = {
      name: 'fake',
      configured: true,
      async fetchBom() {
        return widget;
      },
    };
    setSapConnector(fake);

    const dry = await agent
      .post('/api/sap/import')
      .send({ material: 'SAP-WIDGET', dryRun: true })
      .expect(200);
    expect(dry.body.source).toBe('sap');
    expect(dry.body.result.total.total).toBe('108.00');

    const saved = await agent.post('/api/sap/import').send({ material: 'SAP-WIDGET' }).expect(201);
    expect(saved.body.productId).toBeTruthy();

    const list = await agent.get('/api/products').expect(200);
    expect(list.body.products.map((p: { code: string }) => p.code)).toContain('SAP-WIDGET');

    setSapConnector(null); // leave the cache clean for other tests
  });
});
