import { readFile } from 'node:fs/promises';
import { createInvoice } from './create.js';

try {
  const input: unknown = JSON.parse(await readFile(new URL('../examples/sample-invoice.json', import.meta.url), 'utf8'));
  console.log(JSON.stringify(await createInvoice(input), null, 2));
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : 'Failed to create the sample invoice.');
  process.exitCode = 1;
}
