import { invoiceSchema, type Currency, type Invoice } from './schema.js';

// Excel の有効桁数内で、数量・税率の整数演算も正確に保つ上限。
export const MAX_MINOR = 9_999_999_999n;

export interface InvoiceLine {
  description: string;
  quantity: string;
  unitPriceMinor: number;
  taxRate: string;
  amountMinor: number;
}

export interface TaxBreakdown {
  rate: string;
  taxableMinor: number;
  taxMinor: number;
}

export interface InvoiceCalculation {
  currency: Currency;
  minorUnitDigits: number;
  lines: InvoiceLine[];
  subtotalMinor: number;
  taxes: TaxBreakdown[];
  taxMinor: number;
  totalMinor: number;
  total: string;
}

export function scaledInteger(value: string, digits: number): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0').slice(0, digits) || '0');
}

export function formatMinor(value: bigint, digits: number): string {
  if (digits === 0) return value.toString();
  const padded = value.toString().padStart(digits + 1, '0');
  return `${padded.slice(0, -digits)}.${padded.slice(-digits)}`;
}

function bounded(value: bigint): number {
  if (value > MAX_MINOR) {
    throw new Error(`Amounts must not exceed ${MAX_MINOR} minor units, including the invoice total.`);
  }
  return Number(value);
}

export function calculateInvoice(input: unknown): InvoiceCalculation {
  return prepareInvoice(input).calculation;
}

export function prepareInvoice(input: unknown): { invoice: Invoice; calculation: InvoiceCalculation } {
  const invoice = invoiceSchema.parse(input);
  const digits = invoice.currency === 'JPY' ? 0 : 2;
  const groups = new Map<bigint, bigint>();
  let subtotal = 0n;
  const lines: InvoiceLine[] = invoice.items.map((item) => {
    const price = scaledInteger(item.unitPrice, digits);
    const quantity = scaledInteger(item.quantity, 3);
    const rate = scaledInteger(item.taxRate, 2);
    // 小数数量による最小通貨単位未満の端数は、明細ごとに切り捨てる。
    const amount = price * quantity / 1000n;
    subtotal += amount;
    groups.set(rate, (groups.get(rate) ?? 0n) + amount);
    return {
      description: item.description,
      quantity: item.quantity,
      unitPriceMinor: bounded(price),
      taxRate: formatMinor(rate, 2).replace(/\.?0+$/, ''),
      amountMinor: bounded(amount),
    };
  });
  let tax = 0n;
  const taxes: TaxBreakdown[] = [...groups.entries()]
    .sort(([a], [b]) => Number(a - b))
    .map(([rate, taxable]) => {
      // 税率ごとの課税対象額を合算した後、一度だけ切り捨てる。
      const amount = taxable * rate / 10_000n;
      tax += amount;
      return {
        rate: formatMinor(rate, 2).replace(/\.?0+$/, ''),
        taxableMinor: bounded(taxable),
        taxMinor: bounded(amount),
      };
    });
  const total = subtotal + tax;
  return {
    invoice,
    calculation: {
      currency: invoice.currency,
      minorUnitDigits: digits,
      lines,
      subtotalMinor: bounded(subtotal),
      taxes,
      taxMinor: bounded(tax),
      totalMinor: bounded(total),
      total: formatMinor(total, digits),
    },
  };
}
