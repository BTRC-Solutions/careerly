import JSZip from 'jszip';
import { PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { docxLinks, pdfLinks } from './cv-links.js';

/** A PDF whose links show only a label, like most exported CVs. */
async function pdfWithLinks(urls: string[]) {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const annotations = urls.map((url, index) => {
    const y = 760 - index * 20;
    page.drawText(`Link ${index + 1}`, { x: 50, y, size: 11, font });
    return document.context.register(
      document.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [50, y, 120, y + 12],
        Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
      }),
    );
  });
  page.node.set(PDFName.of('Annots'), document.context.obj(annotations));
  // Object streams (compressed), as Word and browsers export them.
  return document.save({ useObjectStreams: true });
}

async function docxWithLinks(body: string[], header: string[]) {
  const relationships = (targets: string[]) =>
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    targets
      .map(
        (target, index) =>
          `<Relationship Id="rId${index + 10}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${target}" TargetMode="External"/>`,
      )
      .join('') +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';
  const zip = new JSZip();
  zip.file('word/document.xml', '<w:document/>');
  zip.file('word/_rels/header1.xml.rels', relationships(header));
  zip.file('word/_rels/document.xml.rels', relationships(body));
  return zip.generateAsync({ type: 'uint8array' });
}

describe('links in a CV file', () => {
  it('reads the targets of the link annotations of a PDF', async () => {
    const pdf = await pdfWithLinks([
      'https://www.linkedin.com/in/lucia-fernandez/',
      'https://github.com/lucia',
      'mailto:lucia@example.com',
      'https://github.com/lucia',
      'javascript:alert(1)',
    ]);
    expect(await pdfLinks(pdf)).toEqual([
      'https://www.linkedin.com/in/lucia-fernandez/',
      'https://github.com/lucia',
      'mailto:lucia@example.com',
    ]);
  });

  it('reads the hyperlinks of a DOCX, header included, body first', async () => {
    const docx = await docxWithLinks(
      ['https://lucia.dev/?a=1&amp;b=2'],
      ['https://www.linkedin.com/in/lucia', 'https://github.com/lucia'],
    );
    expect(await docxLinks(docx)).toEqual([
      'https://lucia.dev/?a=1&b=2',
      'https://www.linkedin.com/in/lucia',
      'https://github.com/lucia',
    ]);
  });

  it('returns nothing (instead of failing) for files without readable links', async () => {
    expect(await pdfLinks(Buffer.from('%PDF-1.7 not really'))).toEqual([]);
    expect(await docxLinks(Buffer.from('PK not a zip'))).toEqual([]);
    expect(await pdfLinks(await (await PDFDocument.create()).save())).toEqual([]);
  });
});
