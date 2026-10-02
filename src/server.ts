import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { calculateInvoice } from './calculate.js';
import { createInvoice } from './create.js';
import { invoiceInputSchema } from './schema.js';

async function toolResult(action: () => unknown | Promise<unknown>): Promise<CallToolResult> {
  try {
    const result = await action();
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error: unknown) {
    return {
      isError: true,
      content: [{ type: 'text', text: error instanceof Error ? error.message : 'Invoice operation failed.' }],
    };
  }
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'invoice-mcp', version: '1.0.0' });
  server.registerTool('calculate_invoice', {
    title: 'Calculate invoice',
    description: 'Calculate an invoice using integer minor units. Tax is floored once per rate. Returns JSON; creates no files.',
    inputSchema: invoiceInputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (input) => toolResult(() => calculateInvoice(input)));
  server.registerTool('create_invoice', {
    title: 'Create Excel invoice',
    description: 'Save a formatted .xlsx invoice in the configured output directory. Returns its absolute path and total. Existing files are never overwritten.',
    inputSchema: invoiceInputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, (input) => toolResult(() => createInvoice(input)));
  return server;
}
