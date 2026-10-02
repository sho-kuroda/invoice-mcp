import { describe, expect, it } from 'vitest';
import { invoiceSchema } from '../schema.js';
import { invoice } from './fixtures.js';

describe('invoice input', () => {
  it('accepts an omitted or correctly formatted registration number', () => {
    expect(invoiceSchema.safeParse(invoice()).success).toBe(true);
    const input = invoice();
    expect(invoiceSchema.safeParse({ ...input, issuer: { ...input.issuer, registrationNumber: 'T1234567890123' } }).success).toBe(true);
  });

  it.each(['1234567890123', 'T123', 'T12345678901234', 't1234567890123', 'T123456789012X'])(
    'rejects registration number %s', (registrationNumber) => {
      const input = invoice();
      expect(invoiceSchema.safeParse({ ...input, issuer: { ...input.issuer, registrationNumber } }).success).toBe(false);
    },
  );

  it.each(['../outside.xlsx', '/tmp/outside.xlsx', 'folder/file.xlsx', 'folder\\file.xlsx', '..xlsx', 'a..b.xlsx', 'C:\\file.xlsx', 'C:file.xlsx', 'file.txt', 'a\u0000.xlsx'])(
    'rejects unsafe filename %s', (outputFilename) => {
      expect(invoiceSchema.safeParse(invoice({ outputFilename })).success).toBe(false);
    },
  );

  it('rejects invalid calendar dates, reversed dates, and empty invoices', () => {
    expect(invoiceSchema.safeParse(invoice({ issueDate: '2026-02-30' })).success).toBe(false);
    expect(invoiceSchema.safeParse(invoice({ dueDate: '2026-09-30' })).success).toBe(false);
    expect(invoiceSchema.safeParse(invoice({ items: [] })).success).toBe(false);
  });

  it.each([
    { quantity: 0 }, { quantity: -1 }, { quantity: '0.0001' },
    { unitPrice: -1 }, { unitPrice: '1e3' }, { unitPrice: Infinity },
    { taxRate: -1 }, { taxRate: 101 }, { taxRate: '7.123' },
  ])('rejects invalid item values: %j', (override) => {
    expect(invoiceSchema.safeParse(invoice({ items: [
      { description: 'Work', quantity: 1, unitPrice: '100', taxRate: 10, ...override },
    ] })).success).toBe(false);
  });
});
