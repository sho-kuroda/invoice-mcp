import { z } from 'zod';

export const currencySchema = z.enum(['JPY', 'USD', 'EUR']);
export type Currency = z.infer<typeof currencySchema>;

const text = (max: number): z.ZodString => z.string().trim().min(1).max(max);
const decimal = (places: number): z.ZodType<string, z.ZodTypeDef, string | number> =>
  z.union([z.string().max(16), z.number().finite().nonnegative()])
    .transform(String)
    .refine((value) => new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(value),
      `Use a nonnegative decimal with at most ${places} decimal places (no exponent notation).`);

const date = text(10).regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Use a valid calendar date.');

const partySchema = z.object({
  name: text(100),
  address: text(300),
  email: z.string().email().max(254),
}).strict();

export const filenameSchema = z.string().min(1).max(120)
  .refine((value) => !/[\\/<>:"|?*]/.test(value) && !value.includes('..')
    && [...value].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127),
  'Use a filename only; path separators, "..", and reserved characters are not allowed.')
  .refine((value) => value.trim() === value && !value.startsWith('.'), 'Use a visible filename without outer spaces.')
  .refine((value) => /\.xlsx$/i.test(value), 'The filename must end in .xlsx.')
  .refine((value) => !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(value), 'Use a portable filename.');

export const invoiceInputSchema = z.object({
  issuer: partySchema.extend({
    registrationNumber: z.string().regex(/^T\d{13}$/, 'Use T followed by exactly 13 digits.').optional(),
  }).describe('Invoice issuer; registrationNumber is an optional Japanese registration number.'),
  customer: partySchema.describe('The customer receiving the invoice.'),
  invoiceNumber: text(60),
  issueDate: date,
  dueDate: date,
  currency: currencySchema,
  items: z.array(z.object({
    description: text(200),
    quantity: decimal(3).refine((value) => Number(value) > 0 && Number(value) <= 1_000_000,
      'Quantity must be greater than zero and at most 1,000,000.'),
    unitPrice: decimal(2).describe('Price in major units. Decimal strings are recommended, e.g. "19.99". JPY requires whole yen.'),
    taxRate: decimal(2).refine((value) => Number(value) <= 100, 'Tax rate must be between 0 and 100.')
      .describe('Percentage, e.g. 8 means 8%. Up to two decimal places.'),
  }).strict()).min(1).max(200),
  notes: text(2000).optional(),
  outputFilename: filenameSchema.optional().describe('Optional .xlsx filename, never a path. Defaults to invoice.xlsx.'),
}).strict();

export const invoiceSchema = invoiceInputSchema.superRefine((invoice, context) => {
  if (invoice.dueDate < invoice.issueDate) {
    context.addIssue({ code: 'custom', path: ['dueDate'], message: 'Due date must not precede the issue date.' });
  }
  invoice.items.forEach((item, index) => {
    if (invoice.currency === 'JPY' && /\.[0-9]*[1-9]/.test(item.unitPrice)) {
      context.addIssue({ code: 'custom', path: ['items', index, 'unitPrice'], message: 'JPY prices must be whole yen.' });
    }
  });
});

export type Invoice = z.infer<typeof invoiceSchema>;
