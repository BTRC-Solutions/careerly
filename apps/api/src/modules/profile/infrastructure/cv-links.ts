import JSZip from 'jszip';
import { PDFDict, PDFName, PDFString, PDFHexString, PDFDocument, PDFArray } from 'pdf-lib';

/*
 * Links in a CV are often hyperlinks whose visible text is just "LinkedIn" or an icon: the model
 * sees the text, not the URL. These helpers read the link targets from the file itself, locally,
 * so they can be handed to the model next to the content. Best effort: a file whose links cannot
 * be read still imports, without them.
 */

const MAX_LINKS = 50;

/** Keeps web and mail links only, once each, in file order. */
function clean(targets: Iterable<string>): string[] {
  const links = new Set<string>();
  for (const target of targets) {
    const link = target.trim();
    if (/^(https?:\/\/|mailto:)\S+$/i.test(link) && link.length <= 2048) links.add(link);
    if (links.size >= MAX_LINKS) break;
  }
  return [...links];
}

/** URI targets of the link annotations of every page. */
export async function pdfLinks(data: Uint8Array): Promise<string[]> {
  try {
    const document = await PDFDocument.load(data, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const targets: string[] = [];
    for (const page of document.getPages()) {
      const annotations = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
      for (let index = 0; index < (annotations?.size() ?? 0); index++) {
        const annotation = annotations!.lookupMaybe(index, PDFDict);
        const action = annotation?.lookupMaybe(PDFName.of('A'), PDFDict);
        const uri = action?.lookupMaybe(PDFName.of('URI'), PDFString, PDFHexString);
        if (uri) targets.push(uri.decodeText());
      }
    }
    return clean(targets);
  } catch {
    return [];
  }
}

/** External hyperlink targets of the body, headers and footers. */
export async function docxLinks(data: Uint8Array): Promise<string[]> {
  try {
    const zip = await JSZip.loadAsync(data);
    const relationFiles = Object.keys(zip.files)
      .filter((name) => /^word\/_rels\/.+\.xml\.rels$/.test(name))
      // The body first, then headers and footers.
      .sort(
        (a, b) =>
          Number(!a.endsWith('document.xml.rels')) - Number(!b.endsWith('document.xml.rels')),
      );
    const targets: string[] = [];
    for (const name of relationFiles) {
      const xml = await zip.file(name)!.async('string');
      for (const [relationship] of xml.matchAll(/<Relationship\b[^>]*>/g)) {
        if (!/Type="[^"]*\/hyperlink"/.test(relationship)) continue;
        const target = /Target="([^"]*)"/.exec(relationship)?.[1];
        if (target) targets.push(decodeXml(target));
      }
    }
    return clean(targets);
  } catch {
    return [];
  }
}

function decodeXml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
