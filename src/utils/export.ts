import * as XLSX from 'xlsx';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
(pdfMake as any).vfs = (pdfFonts as any).vfs;

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

/**
 * Convert rows to an array of plain objects (flatten nested values via key path).
 */
function rowToObj(row: Record<string, unknown>, cols: ExportColumn[]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const c of cols) {
    const v = row[c.key];
    if (v === null || v === undefined) out[c.header] = '';
    else if (typeof v === 'object') out[c.header] = JSON.stringify(v);
    else out[c.header] = v as string | number;
  }
  return out;
}

export async function exportCSV(rows: Array<Record<string, unknown>>, cols: ExportColumn[], suggestedName: string): Promise<void> {
  const data = rows.map((r) => rowToObj(r, cols));
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);
  downloadInBrowser(csv, suggestedName.replace(/\.csv$/i, '') + '.csv', 'text/csv');
}

export async function exportExcel(rows: Array<Record<string, unknown>>, cols: ExportColumn[], suggestedName: string): Promise<void> {
  const data = rows.map((r) => rowToObj(r, cols));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadInBrowser(new Blob([buf]), suggestedName.replace(/\.xlsx$/i, '') + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export async function exportPDF(
  title: string,
  subtitle: string,
  cols: ExportColumn[],
  rows: Array<Record<string, unknown>>,
  suggestedName: string,
): Promise<void> {
  const widths = cols.map((c) => c.width ?? 'auto');
  const body = rows.map((r) => cols.map((c) => String(rowToObj(r, cols)[c.header] ?? '')));
  const docDefinition = {
    pageSize: 'A4' as const,
    pageMargins: [30, 40, 30, 40] as [number, number, number, number],
    content: [
      { text: title, style: 'header' },
      { text: subtitle, style: 'subtitle' },
      { text: `Generated: ${new Date().toLocaleString()}`, style: 'small' },
      {
        table: {
          headerRows: 1,
          widths,
          body: [
            cols.map((c) => ({ text: c.header, bold: true, fillColor: '#f1f5f9' })),
            ...body,
          ],
        },
      },
    ],
    styles: {
      header: { fontSize: 16, bold: true, margin: [0, 0, 0, 6] as [number, number, number, number] },
      subtitle: { fontSize: 11, color: '#64748b', margin: [0, 0, 0, 4] as [number, number, number, number] },
      small: { fontSize: 8, color: '#94a3b8', margin: [0, 0, 0, 12] as [number, number, number, number] },
    },
  };
  const pdf = pdfMake.createPdf(docDefinition);
  const dataUrl = await new Promise<string>((resolve) => pdf.getDataUrl((url) => resolve(url)));
  downloadInBrowser(dataUrl, suggestedName.replace(/\.pdf$/i, '') + '.pdf', 'application/pdf');
}

/** Save report via browser download. Works in Electron (session downloads). */
function downloadInBrowser(content: string | Blob, filename: string, mime: string) {
  const blob = typeof content === 'string' && !content.startsWith('data:')
    ? new Blob([content], { type: mime })
    : typeof content === 'string'
      ? dataUrlToBlob(content)
      : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const mime = head.match(/data:(.*?);/)?.[1] ?? 'application/octet-stream';
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}