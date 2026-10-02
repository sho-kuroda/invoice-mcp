import ExcelJS from 'exceljs';
import type { InvoiceCalculation } from './calculate.js';
import type { Invoice } from './schema.js';

const INK = '243247';
const MUTED = '64748B';
const LINE = 'D5DCE5';
const FIRST_ITEM_ROW = 14;

function wrappedHeight(value: string, width: number, minimum = 22): number {
  const lines = value.split('\n').reduce((count, line) => {
    const displayWidth = [...line].reduce((length, character) => length + ((character.codePointAt(0) ?? 0) > 255 ? 2 : 1), 0);
    return count + Math.max(1, Math.ceil(displayWidth / width));
  }, 0);
  return Math.max(minimum, lines * 15 + 8);
}

export function buildWorkbook(invoice: Invoice, calculation: InvoiceCalculation): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = invoice.issuer.name;
  workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = workbook.addWorksheet('Invoice', {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
      printTitlesRow: '13:13',
    },
    headerFooter: { oddFooter: '&RPage &P of &N' },
  });
  sheet.columns = [
    { width: 38 }, { width: 11 }, { width: 19 }, { width: 11 }, { width: 21 },
    { width: 18, hidden: true },
  ];
  const factor = 10 ** calculation.minorUnitDigits;
  const moneyFormat = `"${invoice.currency}" #,##0${calculation.minorUnitDigits === 2 ? '.00' : ''}`;

  const mergedText = (range: string, value: string): ExcelJS.Cell => {
    sheet.mergeCells(range);
    const cell = sheet.getCell(range.split(':')[0] ?? range);
    cell.value = value;
    cell.alignment = { vertical: 'middle', wrapText: true };
    return cell;
  };
  mergedText('A1:E1', 'INVOICE');
  sheet.getRow(1).height = 36;
  mergedText('A2:E2', invoice.invoiceNumber);
  sheet.getRow(2).height = wrappedHeight(invoice.invoiceNumber, 90);
  mergedText('A4:B4', 'FROM');
  mergedText('C4:E4', 'BILL TO');
  mergedText('A5:B5', invoice.issuer.name);
  mergedText('C5:E5', invoice.customer.name);
  sheet.getRow(5).height = Math.max(wrappedHeight(invoice.issuer.name, 45), wrappedHeight(invoice.customer.name, 45));
  mergedText('A6:B6', invoice.issuer.address);
  mergedText('C6:E6', invoice.customer.address);
  sheet.getRow(6).height = Math.max(wrappedHeight(invoice.issuer.address, 45), wrappedHeight(invoice.customer.address, 45));
  mergedText('A7:B7', invoice.issuer.email);
  mergedText('C7:E7', invoice.customer.email);
  sheet.getRow(7).height = Math.max(wrappedHeight(invoice.issuer.email, 45), wrappedHeight(invoice.customer.email, 45));
  if (invoice.issuer.registrationNumber) mergedText('A8:E8', `Registration no. ${invoice.issuer.registrationNumber}`);
  mergedText('A10:B10', 'ISSUED');
  mergedText('C10:D10', 'PAYMENT DUE');
  sheet.getCell('A11').value = new Date(`${invoice.issueDate}T00:00:00Z`);
  sheet.getCell('C11').value = new Date(`${invoice.dueDate}T00:00:00Z`);
  sheet.getCell('A11').numFmt = 'yyyy-mm-dd';
  sheet.getCell('C11').numFmt = 'yyyy-mm-dd';
  sheet.getCell('E11').value = invoice.currency;
  sheet.getRow(13).values = ['Description', 'Quantity', 'Unit price', 'Tax rate', 'Amount'];
  sheet.getRow(13).height = 26;

  const lastItem = FIRST_ITEM_ROW + calculation.lines.length - 1;
  const subtotalRow = lastItem + 2;
  const taxHeader = subtotalRow + 2;
  const firstTax = taxHeader + 1;
  const lastTax = firstTax + calculation.taxes.length - 1;
  const taxTotalRow = lastTax + 1;
  const totalRow = lastTax + 3;
  const formula = (cell: string, expression: string, result: number): void => {
    sheet.getCell(cell).value = { formula: expression, result };
  };

  calculation.lines.forEach((item, index) => {
    const row = FIRST_ITEM_ROW + index;
    sheet.getRow(row).values = [item.description, Number(item.quantity), item.unitPriceMinor / factor, Number(item.taxRate) / 100];
    sheet.getRow(row).height = wrappedHeight(item.description, 34, 28);
    sheet.getCell(`B${row}`).numFmt = '#,##0.###';
    sheet.getCell(`C${row}`).numFmt = moneyFormat;
    sheet.getCell(`D${row}`).numFmt = '0.##%';
    sheet.getCell(`E${row}`).numFmt = moneyFormat;
    // 非表示の F 列で最小単位の整数を保持し、表示用の換算と分離する。
    formula(`F${row}`, `ROUNDDOWN(ROUND(C${row}*${factor},0)*ROUND(B${row}*1000,0)/1000,0)`, item.amountMinor);
    formula(`E${row}`, `F${row}/${factor}`, item.amountMinor / factor);
    sheet.getCell(`B${row}`).dataValidation = {
      type: 'decimal', operator: 'between', formulae: [0.001, 1_000_000], showErrorMessage: true, errorStyle: 'stop',
      error: 'Enter a positive quantity with up to three decimal places.',
    };
    sheet.getCell(`C${row}`).dataValidation = {
      type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0], showErrorMessage: true, errorStyle: 'stop',
      error: 'Enter a nonnegative price in the invoice currency.',
    };
    sheet.getCell(`D${row}`).dataValidation = {
      type: 'list', formulae: [`$B$${firstTax}:$B$${lastTax}`], showErrorMessage: true, errorStyle: 'stop',
      error: 'Select a rate from the tax breakdown. Regenerate the invoice to add a new rate.',
    };
    for (let column = 1; column <= 5; column++) {
      sheet.getCell(row, column).border = { bottom: { style: 'hair', color: { argb: LINE } } };
    }
  });

  mergedText(`A${subtotalRow}:D${subtotalRow}`, 'Subtotal');
  formula(`F${subtotalRow}`, `SUM(F${FIRST_ITEM_ROW}:F${lastItem})`, calculation.subtotalMinor);
  formula(`E${subtotalRow}`, `F${subtotalRow}/${factor}`, calculation.subtotalMinor / factor);
  sheet.getRow(taxHeader).values = ['Tax breakdown', 'Rate', 'Taxable amount', null, 'Tax'];
  sheet.getRow(taxHeader).height = 26;
  calculation.taxes.forEach((tax, index) => {
    const row = firstTax + index;
    sheet.getCell(`A${row}`).value = 'Tax';
    sheet.getCell(`B${row}`).value = Number(tax.rate) / 100;
    sheet.getCell(`B${row}`).numFmt = '0.##%';
    formula(`F${row}`, `SUMIF(D${FIRST_ITEM_ROW}:D${lastItem},B${row},F${FIRST_ITEM_ROW}:F${lastItem})`, tax.taxableMinor);
    formula(`C${row}`, `F${row}/${factor}`, tax.taxableMinor / factor);
    sheet.getCell(`C${row}`).numFmt = moneyFormat;
    // 百分率を整数化してから掛け、税率ごとに一度だけ切り捨てる。
    formula(`E${row}`, `ROUNDDOWN(F${row}*ROUND(B${row}*10000,0)/10000,0)/${factor}`, tax.taxMinor / factor);
  });
  mergedText(`A${taxTotalRow}:D${taxTotalRow}`, 'Total tax');
  formula(`F${taxTotalRow}`, `ROUND(SUM(E${firstTax}:E${lastTax})*${factor},0)`, calculation.taxMinor);
  formula(`E${taxTotalRow}`, `F${taxTotalRow}/${factor}`, calculation.taxMinor / factor);
  mergedText(`A${totalRow}:D${totalRow}`, 'TOTAL DUE');
  formula(`E${totalRow}`, `(F${subtotalRow}+F${taxTotalRow})/${factor}`, calculation.totalMinor / factor);
  workbook.definedNames.add(`'Invoice'!$E$${subtotalRow}`, 'InvoiceSubtotal');
  workbook.definedNames.add(`'Invoice'!$E$${taxTotalRow}`, 'InvoiceTax');
  workbook.definedNames.add(`'Invoice'!$E$${totalRow}`, 'InvoiceTotal');

  let finalRow = totalRow + 1;
  if (invoice.notes) {
    mergedText(`A${totalRow + 3}:E${totalRow + 3}`, 'NOTES');
    // 長い備考は行を分け、Excel の行高上限による欠けを防ぐ。
    const paragraphs = invoice.notes.split('\n').flatMap((paragraph) => paragraph.match(/.{1,180}/gu) ?? ['']);
    paragraphs.forEach((paragraph, index) => {
      const row = totalRow + 4 + index;
      mergedText(`A${row}:E${row}`, paragraph);
      sheet.getRow(row).height = wrappedHeight(paragraph, 95);
    });
    finalRow = totalRow + 3 + paragraphs.length;
  }
  sheet.pageSetup.printArea = `A1:E${finalRow}`;
  sheet.eachRow((row) => {
    row.height ??= 23;
    row.eachCell((cell, column) => {
      cell.font = { name: 'Arial', size: 10, color: { argb: INK } };
      cell.alignment = { ...cell.alignment, vertical: 'middle', wrapText: true };
      if (column === 5 && row.number >= FIRST_ITEM_ROW) cell.numFmt = moneyFormat;
      if (cell.type === ExcelJS.ValueType.Number || cell.type === ExcelJS.ValueType.Formula) {
        cell.alignment.horizontal = 'right';
      }
    });
  });
  sheet.getCell('A1').font = { name: 'Arial', size: 24, bold: true, color: { argb: INK } };
  for (const rowNumber of [4, 10]) {
    sheet.getRow(rowNumber).eachCell((cell) => {
      cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: MUTED } };
    });
  }
  for (const rowNumber of [13, taxHeader]) {
    for (let column = 1; column <= 5; column++) {
      const cell = sheet.getCell(rowNumber, column);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
    }
  }
  sheet.getRow(totalRow).height = 34;
  for (let column = 1; column <= 5; column++) {
    const cell = sheet.getCell(totalRow, column);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EBEFF5' } };
    cell.font = { name: 'Arial', size: 12, bold: true, color: { argb: INK } };
    cell.border = { top: { style: 'thin', color: { argb: INK } } };
  }
  return workbook;
}
