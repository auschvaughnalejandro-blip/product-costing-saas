/**
 * Quotation persistence. A quotation always traces back to a specific saved cost
 * version, so a price can always be explained by the costing it came from.
 */
import type { Database, Queryable } from '../../db/pool';
import { newId } from '../../lib/ids';
import { notFound } from '../../lib/http';
import { getCostVersion } from '../versions/versions.repo';
import { computePrice, type MarginType } from './pricing';

export interface CreateQuotationInput {
  costVersionId: string;
  number?: string;
  customerName: string;
  customerContact?: string | null;
  customerAddress?: string | null;
  marginType: MarginType;
  marginValue: number | string;
  terms?: string | null;
  notes?: string | null;
}

export interface Quotation {
  id: string;
  number: string;
  costVersionId: string;
  customerName: string;
  customerContact: string | null;
  customerAddress: string | null;
  currency: string;
  marginType: MarginType;
  marginValue: string;
  costTotal: string;
  priceTotal: string;
  terms: string | null;
  notes: string | null;
  status: string;
  createdBy: string | null;
  createdAt: string;
}

interface QuotationRow {
  id: string;
  number: string;
  cost_version_id: string;
  customer_name: string;
  customer_contact: string | null;
  customer_address: string | null;
  currency: string;
  margin_type: MarginType;
  margin_value: string;
  cost_total: string;
  price_total: string;
  terms: string | null;
  notes: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
}

function toQuotation(row: QuotationRow): Quotation {
  return {
    id: row.id,
    number: row.number,
    costVersionId: row.cost_version_id,
    customerName: row.customer_name,
    customerContact: row.customer_contact,
    customerAddress: row.customer_address,
    currency: row.currency,
    marginType: row.margin_type,
    marginValue: row.margin_value,
    costTotal: row.cost_total,
    priceTotal: row.price_total,
    terms: row.terms,
    notes: row.notes,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function createQuotation(
  db: Database,
  tenantId: string,
  userId: string | null,
  input: CreateQuotationInput,
): Promise<Quotation> {
  const version = await getCostVersion(db, tenantId, input.costVersionId);
  if (!version) throw notFound('The cost version for this quotation was not found.');

  // PRICE = COST (from the engine, via the version) + margin. Kept separate.
  const { price } = computePrice(version.totalCost, input.marginType, input.marginValue);

  return db.transaction(async (tx) => {
    let number = input.number?.trim();
    if (!number) {
      const { rows } = await tx.query<{ count: string }>(
        'SELECT COUNT(*)::int AS count FROM quotations WHERE tenant_id = $1',
        [tenantId],
      );
      number = `Q-${String(Number(rows[0]?.count ?? 0) + 1).padStart(4, '0')}`;
    }

    const { rows } = await tx.query<QuotationRow>(
      `INSERT INTO quotations
         (id, tenant_id, cost_version_id, number, customer_name, customer_contact, customer_address,
          currency, margin_type, margin_value, cost_total, price_total, terms, notes, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'draft',$15)
       RETURNING *`,
      [
        newId(),
        tenantId,
        input.costVersionId,
        number,
        input.customerName,
        input.customerContact ?? null,
        input.customerAddress ?? null,
        version.currency,
        input.marginType,
        String(input.marginValue),
        version.totalCost,
        price,
        input.terms ?? null,
        input.notes ?? null,
        userId,
      ],
    );
    return toQuotation(rows[0]!);
  });
}

export async function listQuotations(db: Queryable, tenantId: string): Promise<Quotation[]> {
  const { rows } = await db.query<QuotationRow>(
    'SELECT * FROM quotations WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId],
  );
  return rows.map(toQuotation);
}

export async function getQuotation(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<Quotation | null> {
  const { rows } = await db.query<QuotationRow>(
    'SELECT * FROM quotations WHERE tenant_id = $1 AND id = $2',
    [tenantId, id],
  );
  return rows[0] ? toQuotation(rows[0]) : null;
}
