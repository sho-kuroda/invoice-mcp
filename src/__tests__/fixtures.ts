import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import type { z } from 'zod';
import type { invoiceSchema } from '../schema.js';

export type InvoiceInput = z.input<typeof invoiceSchema>;

export function invoice(overrides: Partial<InvoiceInput> = {}): InvoiceInput {
  return {
    issuer: { name: 'Example Studio', address: '1 Sample Lane', email: 'billing@example.com' },
    customer: { name: 'Sample Workshop', address: '2 Demo Street', email: 'accounts@example.org' },
    invoiceNumber: 'TEST-001',
    issueDate: '2026-10-01',
    dueDate: '2026-10-31',
    currency: 'JPY',
    items: [{ description: 'Design', quantity: 1, unitPrice: '100', taxRate: 10 }],
    ...overrides,
  };
}

export async function temporaryDirectory(): Promise<string> {
  const root = resolve('.test-output');
  await mkdir(root, { recursive: true });
  return mkdtemp(join(root, 'invoice-'));
}
