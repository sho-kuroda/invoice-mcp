import { readFile, rm } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateInvoice } from '../calculate.js';
import { createInvoice } from '../create.js';
import { invoice, temporaryDirectory } from './fixtures.js';

function readWorkbookXml(archive: Buffer): string {
  // 生成した ZIP の中央ディレクトリから、対象 XML の位置と圧縮方式を取得する。
  const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThanOrEqual(0);
  const entries = archive.readUInt16LE(end + 10);
  let offset = archive.readUInt32LE(end + 16);
  for (let index = 0; index < entries; index++) {
    expect(archive.readUInt32LE(offset)).toBe(0x02014b50);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const name = archive.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (name === 'xl/workbook.xml') {
      const method = archive.readUInt16LE(offset + 10);
      const compressedSize = archive.readUInt32LE(offset + 20);
      const uncompressedSize = archive.readUInt32LE(offset + 24);
      const localOffset = archive.readUInt32LE(offset + 42);
      expect(archive.readUInt32LE(localOffset)).toBe(0x04034b50);
      const start = localOffset + 30 + archive.readUInt16LE(localOffset + 26) + archive.readUInt16LE(localOffset + 28);
      const compressed = archive.subarray(start, start + compressedSize);
      expect([0, 8]).toContain(method);
      const xml = method === 8 ? inflateRawSync(compressed) : compressed;
      expect(xml.length).toBe(uncompressedSize);
      return xml.toString('utf8');
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error('Missing xl/workbook.xml in the generated XLSX.');
}

describe('Excel invoices', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await temporaryDirectory();
    vi.stubEnv('INVOICE_MCP_OUTPUT_DIR', directory);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it.each(['JPY', 'USD', 'EUR'] as const)('round-trips formulas and cached values in %s', async (currency) => {
    const input = invoice({ currency, items: [
      { description: '=SUM(1,2)', quantity: 1, unitPrice: '19', taxRate: 8 },
      { description: 'B', quantity: 1, unitPrice: '19', taxRate: 8 },
      { description: 'C', quantity: '1.5', unitPrice: '15', taxRate: 10 },
      { description: 'D', quantity: 1, unitPrice: '5', taxRate: 0 },
    ] });
    const calculation = calculateInvoice(input);
    const result = await createInvoice(input);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(result.path);
    const sheet = workbook.getWorksheet('Invoice');
    expect(sheet).toBeDefined();
    if (!sheet) throw new Error('Missing invoice sheet.');
    const totalAddress = workbook.definedNames.getRanges('InvoiceTotal').ranges[0]?.split('!')[1]?.replaceAll('$', '');
    if (!totalAddress) throw new Error('Missing total cell.');
    expect(sheet.getCell(totalAddress).type).toBe(ExcelJS.ValueType.Formula);
    expect(sheet.getCell(totalAddress).formula).toContain('F');
    expect(sheet.getCell(totalAddress).result).toBe(calculation.totalMinor / 10 ** calculation.minorUnitDigits);
    expect(result.totalMinor).toBe(calculation.totalMinor);
    expect(sheet.getCell('A14').value).toBe('=SUM(1,2)');
    expect(sheet.getCell('A14').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell('F14').formula).toContain('ROUNDDOWN');
    expect(sheet.getCell('E14').formula).toMatch(/^F14\//);
    for (const name of ['InvoiceSubtotal', 'InvoiceTax']) {
      const address = workbook.definedNames.getRanges(name).ranges[0]?.split('!')[1]?.replaceAll('$', '');
      if (!address) throw new Error(`Missing ${name}.`);
      expect(sheet.getCell(address).type).toBe(ExcelJS.ValueType.Formula);
    }
    const formulas: string[] = [];
    sheet.eachRow((row) => row.eachCell((cell) => { if (cell.formula) formulas.push(cell.formula); }));
    expect(formulas.some((formula) => formula.startsWith('SUMIF('))).toBe(true);
    expect(formulas.some((formula) => formula.includes('*10000,0)/10000'))).toBe(true);
    // ExcelJS は読み込み時に再計算設定を復元しないため、保存された XML を検証する。
    const workbookXml = readWorkbookXml(await readFile(result.path));
    expect(workbookXml).toMatch(/<calcPr\b[^>]*\sfullCalcOnLoad="1"(?:\s|\/?>)/);
    expect(sheet.pageSetup).toMatchObject({ paperSize: 9, orientation: 'portrait', fitToWidth: 1 });
    expect(sheet.pageSetup.printArea).toMatch(/^A1:E\d+$/);
    expect(sheet.getColumn(6).hidden).toBe(true);
  });

  it('generates the documented JSON example', async () => {
    const input: unknown = JSON.parse(await readFile(new URL('../../examples/sample-invoice.json', import.meta.url), 'utf8'));
    const result = await createInvoice(input);
    expect(result).toMatchObject({ currency: 'JPY', totalMinor: 172078, total: '172078' });
    expect(result.path).toMatch(/sample-invoice\.xlsx$/);
  });
});
