import { describe, expect, it } from 'vitest';
import { calculateInvoice } from '../calculate.js';
import { invoice } from './fixtures.js';

describe('calculateInvoice', () => {
  it('floors tax once per rate, including mixed rates and zero tax', () => {
    const result = calculateInvoice(invoice({ items: [
      { description: 'A', quantity: 1, unitPrice: '19', taxRate: 8 },
      { description: 'B', quantity: 1, unitPrice: '19', taxRate: '8.00' },
      { description: 'C', quantity: 1, unitPrice: '15', taxRate: 10 },
      { description: 'D', quantity: 1, unitPrice: '15', taxRate: 10 },
      { description: 'E', quantity: 1, unitPrice: '99', taxRate: 0 },
    ] }));
    expect(result.subtotalMinor).toBe(167);
    expect(result.taxes).toEqual([
      { rate: '0', taxableMinor: 99, taxMinor: 0 },
      { rate: '8', taxableMinor: 38, taxMinor: 3 },
      { rate: '10', taxableMinor: 30, taxMinor: 3 },
    ]);
    expect(result.totalMinor).toBe(173);
    expect(result.total).toBe('173');
  });

  it.each(['USD', 'EUR'] as const)('uses integer cents for %s, without binary floating point drift', (currency) => {
    const result = calculateInvoice(invoice({ currency, items: [
      { description: 'A', quantity: 3, unitPrice: '0.10', taxRate: '7.25' },
      { description: 'B', quantity: 1, unitPrice: 0.2, taxRate: '7.25' },
    ] }));
    expect(result.lines.map((line) => line.amountMinor)).toEqual([30, 20]);
    expect(result.taxes).toEqual([{ rate: '7.25', taxableMinor: 50, taxMinor: 3 }]);
    expect(result.totalMinor).toBe(53);
    expect(result.total).toBe('0.53');
    expect(result.minorUnitDigits).toBe(2);
  });

  it('handles exact tax boundaries and fractional quantities', () => {
    const result = calculateInvoice(invoice({ currency: 'USD', items: [
      { description: 'Hours', quantity: '1.125', unitPrice: '1.99', taxRate: '6.25' },
      { description: 'Other', quantity: 1, unitPrice: '0.16', taxRate: '6.25' },
    ] }));
    expect(result.lines.map((line) => line.amountMinor)).toEqual([223, 16]);
    expect(result.totalMinor).toBe(253);
    expect(calculateInvoice(invoice({ items: [
      { description: 'Exact', quantity: 1, unitPrice: '100', taxRate: '29' },
    ] })).taxMinor).toBe(29);
  });

  it('rejects fractional yen and precision beyond currency minor units', () => {
    expect(() => calculateInvoice(invoice({ items: [
      { description: 'A', quantity: 1, unitPrice: '1.01', taxRate: 0 },
    ] }))).toThrow('whole yen');
    expect(() => calculateInvoice(invoice({ currency: 'USD', items: [
      { description: 'A', quantity: 1, unitPrice: '1.001', taxRate: 0 },
    ] }))).toThrow('decimal');
    expect(calculateInvoice(invoice({ items: [
      { description: 'A', quantity: 1, unitPrice: '100.00', taxRate: 0 },
    ] })).totalMinor).toBe(100);
  });

  it('rejects totals too large for exact spreadsheet calculation', () => {
    expect(() => calculateInvoice(invoice({ items: [
      { description: 'A', quantity: 1, unitPrice: '9999999999', taxRate: 10 },
    ] }))).toThrow('must not exceed');
  });
});
