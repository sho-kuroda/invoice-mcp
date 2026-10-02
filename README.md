# invoice-mcp

A local MCP server that turns invoice details into a formatted Excel workbook. Connect it to Claude or another MCP client to calculate totals or create an `.xlsx` invoice from a conversation.

- Two tools: `calculate_invoice` and `create_invoice`.
- JPY, USD, and EUR, with integer minor-unit calculations.
- Mixed tax rates, with tax rounded down once per rate.
- Excel formulas, cached totals, and an A4 portrait print layout.
- Local files only. The server makes no network requests and needs no API key.

Built with TypeScript, the official `@modelcontextprotocol/sdk`, ExcelJS, and Zod. Tests use Vitest.

## Quick start

Install Node.js 20 or later, then run these commands from the repository root:

```sh
npm install && npm run build
```

Generate the included [sample invoice](examples/sample-invoice.json) without an AI client:

```sh
INVOICE_MCP_OUTPUT_DIR="$PWD/output" npm run sample
```

On PowerShell:

```powershell
$env:INVOICE_MCP_OUTPUT_DIR = "$PWD/output"
npm run sample
```

This creates `output/sample-invoice.xlsx` and prints its absolute path, currency, and total: **JPY 172,078**. Repeating the command creates `sample-invoice-1.xlsx`, then `sample-invoice-2.xlsx`. The sample runner reads `examples/sample-invoice.json`; edit that file to try your own data. All sample parties and addresses are fictional, and the registration number is a format example.

## Connect to Claude

### Claude Code

Use an absolute path to the built server:

```sh
claude mcp add invoice-mcp -- node /path/to/invoice-mcp/dist/index.js
```

To choose an output directory during registration:

```sh
claude mcp add --env INVOICE_MCP_OUTPUT_DIR=/absolute/path/to/invoices invoice-mcp -- node /path/to/invoice-mcp/dist/index.js
```

These follow the [Claude Code MCP configuration](https://code.claude.com/docs/en/mcp). If Node.js is unavailable in the client's environment, replace `node` with the absolute path to the Node.js executable.

### Claude Desktop

Add this entry to the `mcpServers` object in `claude_desktop_config.json`, then restart Claude Desktop. Use absolute paths; environment values in this JSON do not expand `~` or `$HOME`.

```json
{
  "mcpServers": {
    "invoice-mcp": {
      "command": "node",
      "args": ["/path/to/invoice-mcp/dist/index.js"],
      "env": {
        "INVOICE_MCP_OUTPUT_DIR": "/absolute/path/to/invoices"
      }
    }
  }
}
```

On Windows, use JSON-escaped paths such as `C:\\projects\\invoice-mcp\\dist\\index.js`. The server uses stdio: standard output is reserved for MCP messages; errors go to standard error.

Try asking:

> Create invoice INV-2026-002 from Example Studio, 1 Sample Lane, billing@example.com, to Sample Workshop, 2 Demo Street, accounts@example.org. Issue it on October 1, 2026, due October 31. Charge USD 80.00 per hour for 12.5 hours of design, with 10% tax. Save it as design-invoice.xlsx.

## Tool input

Both tools accept the same object. `unitPrice` is expressed in major currency units, and `taxRate` is a percentage: `8` means 8%, not 0.08%.

```json
{
  "issuer": {
    "name": "Example Studio",
    "address": "1 Sample Lane",
    "email": "billing@example.com",
    "registrationNumber": "T1234567890123"
  },
  "customer": {
    "name": "Sample Workshop",
    "address": "2 Demo Street",
    "email": "accounts@example.org"
  },
  "invoiceNumber": "INV-2026-002",
  "issueDate": "2026-10-01",
  "dueDate": "2026-10-31",
  "currency": "USD",
  "items": [
    {
      "description": "Design hours",
      "quantity": "12.5",
      "unitPrice": "80.00",
      "taxRate": 10
    }
  ],
  "notes": "Please include the invoice number with your payment.",
  "outputFilename": "design-invoice.xlsx"
}
```

| Field | Requirements |
| --- | --- |
| `issuer`, `customer` | Name, address, and email are required. Addresses may contain line breaks. |
| `issuer.registrationNumber` | Optional. `T` followed by exactly 13 digits; format validation only. |
| `invoiceNumber` | Nonempty text, up to 60 characters. |
| `issueDate`, `dueDate` | Valid `YYYY-MM-DD` dates. Due date must not precede issue date. |
| `currency` | `JPY`, `USD`, or `EUR`. |
| `items` | 1–200 lines, each with a nonempty description of up to 200 characters. |
| `quantity` | Positive number or decimal string, up to 3 decimal places and at most 1,000,000. |
| `unitPrice` | Nonnegative number or decimal string. Whole yen for JPY; up to 2 decimal places for USD/EUR. Decimal strings preserve the exact input. |
| `taxRate` | Number or decimal string from 0 to 100, up to 2 decimal places. Rates such as 0, 8, 10, and 7.25 may be mixed. |
| `notes` | Optional nonempty text, up to 2,000 characters. |
| `outputFilename` | Optional filename ending in `.xlsx`, up to 120 characters. Defaults to `invoice.xlsx`. Paths are rejected. Validated by both tools. |

Names are limited to 100 characters, addresses to 300, and emails to 254. Numeric strings use a decimal point, without grouping separators or exponent notation. Negative prices and credit notes are not supported. Each price, line amount, subtotal, and total must fit within **9,999,999,999 minor units** so the generated Excel formulas retain integer precision.

### `calculate_invoice`

Returns JSON as MCP text content. It does not create files or directories. For the USD example above:

```json
{
  "currency": "USD",
  "minorUnitDigits": 2,
  "lines": [
    {
      "description": "Design hours",
      "quantity": "12.5",
      "unitPriceMinor": 8000,
      "taxRate": "10",
      "amountMinor": 100000
    }
  ],
  "subtotalMinor": 100000,
  "taxes": [
    { "rate": "10", "taxableMinor": 100000, "taxMinor": 10000 }
  ],
  "taxMinor": 10000,
  "totalMinor": 110000,
  "total": "1100.00"
}
```

Fields ending in `Minor` are integers in yen or cents. `total` is a decimal string in major currency units. Tax groups are sorted by rate, including a zero-rate group when present.

### `create_invoice`

Uses the same calculation and returns JSON as MCP text content:

```json
{
  "path": "/absolute/path/to/invoices/design-invoice.xlsx",
  "currency": "USD",
  "totalMinor": 110000,
  "total": "1100.00"
}
```

Invalid inputs and filesystem failures produce an MCP tool error (`isError: true`) with a descriptive message.

## Calculation rules

1. Parse decimal input directly into scaled integers with `BigInt`. Money is never calculated using floating-point arithmetic in the server.
2. Convert unit prices to the currency's smallest unit: whole yen for JPY, cents for USD/EUR.
3. Multiply each price by its quantity using integer arithmetic. If a fractional quantity creates a fraction of a yen or cent, round the line amount down to the nearest minor unit.
4. Sum line amounts by tax rate, then round each group's tax down **once**. Sum those taxes and add them to the subtotal.

For example, two JPY 19 lines at 8% have a taxable amount of JPY 38 and tax of JPY 3. Rounding each line's tax separately would produce JPY 2; this server groups the lines first. Tax rates are provided by the caller; the server does not select a rate or verify a registration number against a registry.

## Editing and printing the workbook

The workbook contains issuer and customer details, dates, an item table, taxable amounts and tax for each rate, total due, and optional notes. Monetary cells use currency codes and thousands separators. The print area is set to A4 portrait, one page wide, with additional pages for longer invoices.

Line amounts, subtotal, tax breakdown, tax total, and total due are Excel formulas. A hidden column holds integer minor-unit calculations. Cached results are included because ExcelJS writes formulas but does not evaluate them; the workbook requests recalculation when opened in Excel or another compatible spreadsheet app. The [ExcelJS documentation](https://github.com/exceljs/exceljs#formula-value) describes this formula/result model.

You can edit descriptions, quantities, and prices in existing item rows. Tax-rate dropdowns include the rates in the generated invoice, so lines can move between those groups. Keep the input precision and amount limits above when editing. To add lines or introduce a new tax rate, generate a new invoice. JSON tool results describe the original calculation and do not track later workbook edits.

## Output directory and filenames

`INVOICE_MCP_OUTPUT_DIR` selects the only output directory. If unset, it defaults to `~/Documents/invoices` using the current user's home directory. The directory is created when needed. Absolute paths are recommended; relative environment values resolve against the server's working directory.

Tool input cannot override the directory. Filenames containing `/`, `\`, or `..` are rejected, as are control characters and reserved filename characters. The server resolves the configured directory and creates each file exclusively, adding `-1`, `-2`, and so on for collisions. This also prevents overwriting through an existing filename symlink and handles concurrent creates.

The output directory is trusted local configuration. Keep it under your control. No invoice data is uploaded by this server; your AI client's own handling of conversation data is separate.

## Development and verification

```sh
npm run build && npm test && npm run lint && npx tsc --noEmit
```

`npm test` builds the server and runs tests for:

- Mixed tax rates, grouped rounding, fractional quantities, JPY units, and USD/EUR cents.
- Registration numbers, dates, numeric precision, and invalid input.
- Path traversal rejection, filename separators, symlinks, and concurrent collision handling.
- Reading generated workbooks back with ExcelJS to verify formulas, cached totals, and print settings.
- Launching the compiled stdio server with the official MCP client, calling `tools/list` to verify exactly two tools, and exercising both tools.
- Generating `examples/sample-invoice.json` and checking its expected total.

Test files and temporary outputs stay inside the repository. Tests remove their own output directories. Generated workbooks, build output, and local npm cache are ignored by Git. Runtime code is in `src/`; tests are in `src/__tests__/`.

## License

[MIT](LICENSE), copyright Sho Kuroda.
