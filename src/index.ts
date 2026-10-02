import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const server = createServer();
try {
  await server.connect(new StdioServerTransport());
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : 'Failed to start invoice-mcp.');
  process.exitCode = 1;
}
