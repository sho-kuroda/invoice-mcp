import { mkdir, open, realpath, unlink, type FileHandle } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, parse, resolve } from 'node:path';
import { filenameSchema } from './schema.js';

export function outputDirectory(): string {
  return resolve(process.env.INVOICE_MCP_OUTPUT_DIR ?? join(homedir(), 'Documents', 'invoices'));
}

export async function saveWorkbook(data: Uint8Array, requestedFilename = 'invoice.xlsx'): Promise<string> {
  const filename = filenameSchema.parse(requestedFilename);
  const directory = outputDirectory();
  await mkdir(directory, { recursive: true });
  const canonicalDirectory = await realpath(directory);
  const { name, ext } = parse(filename);
  for (let sequence = 0; ; sequence++) {
    const candidate = join(canonicalDirectory, sequence === 0 ? filename : `${name}-${sequence}${ext}`);
    let handle: FileHandle;
    try {
      // 排他的な作成で同時実行時の上書きと既存シンボリックリンクの追跡を防ぐ。
      handle = await open(candidate, 'wx', 0o600);
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') continue;
      throw error;
    }
    try {
      await handle.writeFile(data);
    } catch (error: unknown) {
      await handle.close();
      await unlink(candidate);
      throw error;
    }
    await handle.close();
    return candidate;
  }
}
