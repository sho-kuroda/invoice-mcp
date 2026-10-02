import { readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { invoice, temporaryDirectory } from './fixtures.js';

describe('MCP over stdio', () => {
  let client: Client;
  let directory: string;
  beforeEach(async () => {
    directory = await temporaryDirectory();
    client = new Client({ name: 'invoice-test', version: '1.0.0' });
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [resolve('dist/index.js')],
      env: { INVOICE_MCP_OUTPUT_DIR: directory },
      stderr: 'pipe',
    }));
  });
  afterEach(async () => {
    await client.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('lists exactly two tools and calculates without creating files', async () => {
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual(['calculate_invoice', 'create_invoice']);
    const result = await client.callTool({ name: 'calculate_invoice', arguments: invoice() });
    expect(result.isError).not.toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: expect.stringContaining('"totalMinor": 110') }]);
    expect(await readdir(directory)).toEqual([]);
  });

  it('creates a real workbook and returns tool errors for invalid input', async () => {
    const result = await client.callTool({ name: 'create_invoice', arguments: invoice() });
    expect(result.isError).not.toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: expect.stringContaining('"total": "110"') }]);
    const data = await readFile(resolve(directory, 'invoice.xlsx'));
    expect(data.subarray(0, 2).toString()).toBe('PK');
    const invalid = await client.callTool({ name: 'create_invoice', arguments: invoice({ outputFilename: '../escape.xlsx' }) });
    expect(invalid.isError).toBe(true);
    expect(await readdir(directory)).toEqual(['invoice.xlsx']);
    const invalidCurrencyPrecision = await client.callTool({ name: 'calculate_invoice', arguments: invoice({ items: [
      { description: 'A', quantity: 1, unitPrice: '1.01', taxRate: 0 },
    ] }) });
    expect(invalidCurrencyPrecision.isError).toBe(true);
  });
});
