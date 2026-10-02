import { prepareInvoice } from './calculate.js';
import { saveWorkbook } from './output.js';
import type { Currency } from './schema.js';
import { buildWorkbook } from './workbook.js';

export interface CreatedInvoice {
  path: string;
  currency: Currency;
  totalMinor: number;
  total: string;
}

export async function createInvoice(input: unknown): Promise<CreatedInvoice> {
  const { invoice, calculation } = prepareInvoice(input);
  const workbook = buildWorkbook(invoice, calculation);
  const data = await workbook.xlsx.writeBuffer();
  const path = await saveWorkbook(new Uint8Array(data), invoice.outputFilename);
  return { path, currency: calculation.currency, totalMinor: calculation.totalMinor, total: calculation.total };
}
