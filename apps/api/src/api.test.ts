import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from './app';
import { createTestDb, type TestDb } from './db/testing';
import { sampleWorkbookSpec, writeWorkbook } from './ingestion';

describe('API integration', () => {
  let h: TestDb;
  let app: Express;
  let agent: ReturnType<typeof request.agent>;
  let productId = '';

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
    const res = await agent.post('/api/uploads/excel').attach('file', buffer, 'bad.xlsx').expect(422);
    expect(res.body.ok).toBe(false);
    expect(res.body.errors.length).toBeGreaterThan(0);
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

    const list = await agent.get(`/api/products/${productId}/versions`).expect(200);
    expect(list.body.versions.length).toBe(1);

    const get = await agent.get(`/api/versions/${create.body.version.id}`).expect(200);
    expect(get.body.version.result.total.total).toBe('108.00');
  });

  it('forbids a viewer-only check on protected role routes when logged out', async () => {
    await request(app)
      .post('/api/products/recalculate')
      .send({ input: {} })
      .expect(401);
  });
});
