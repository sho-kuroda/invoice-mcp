import { readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInvoice } from '../create.js';
import { saveWorkbook } from '../output.js';
import { invoice, temporaryDirectory } from './fixtures.js';

describe('safe output', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await temporaryDirectory();
    vi.stubEnv('INVOICE_MCP_OUTPUT_DIR', directory);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it.each(['../escape.xlsx', '/escape.xlsx', 'a/b.xlsx', 'a\\b.xlsx', 'a..b.xlsx'])(
    'rejects %s before creating files', async (outputFilename) => {
      await expect(createInvoice(invoice({ outputFilename }))).rejects.toThrow();
      expect(await readdir(directory)).toEqual([]);
    },
  );

  it('never overwrites files, including concurrent creates', async () => {
    const existing = join(directory, 'invoice.xlsx');
    await writeFile(existing, 'keep me');
    const paths = await Promise.all([saveWorkbook(Buffer.from('one')), saveWorkbook(Buffer.from('two'))]);
    expect(new Set(paths).size).toBe(2);
    expect(paths.sort()).toEqual([join(directory, 'invoice-1.xlsx'), join(directory, 'invoice-2.xlsx')]);
    expect(await readFile(existing, 'utf8')).toBe('keep me');
    expect((await Promise.all(paths.map((path) => readFile(path, 'utf8')))).sort()).toEqual(['one', 'two']);
  });

  it('does not follow an existing filename symlink', async () => {
    const target = join(directory, 'original.xlsx');
    await writeFile(target, 'original');
    await symlink(target, join(directory, 'invoice.xlsx'));
    expect(await saveWorkbook(Buffer.from('new'))).toBe(join(directory, 'invoice-1.xlsx'));
    expect(await readFile(target, 'utf8')).toBe('original');
  });

  it('propagates filesystem failures', async () => {
    const file = join(directory, 'not-a-directory');
    await writeFile(file, 'x');
    vi.stubEnv('INVOICE_MCP_OUTPUT_DIR', file);
    await expect(saveWorkbook(Buffer.from('new'))).rejects.toThrow();
  });
});
