/**
 * Test-only helpers: read word/document.xml from a .docx buffer and summarize body paragraphs.
 */
import JSZip from "jszip";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function deepHasLocalName(root: Element, localName: string): boolean {
  const stack: Element[] = [root];
  while (stack.length) {
    const el = stack.pop()!;
    if (el.localName === localName) return true;
    for (const c of el.children) stack.push(c as Element);
  }
  return false;
}

function findElementByLocalName(root: Element | null, localName: string): Element | null {
  if (!root) return null;
  const stack: Element[] = [root];
  while (stack.length) {
    const el = stack.pop()!;
    if (el.localName === localName) return el;
    for (const c of el.children) stack.push(c as Element);
  }
  return null;
}

function textFromParagraph(p: Element): string {
  let s = "";
  const walker = (el: Element) => {
    if (el.localName === "t" && el.namespaceURI === W_NS) {
      s += el.textContent ?? "";
    }
    for (const c of el.children) {
      walker(c as Element);
    }
  };
  walker(p);
  return s;
}

function hyperlinkCountInParagraph(p: Element): number {
  let n = 0;
  const stack: Element[] = [p];
  while (stack.length) {
    const el = stack.pop()!;
    if (el.localName === "hyperlink") n += 1;
    for (const c of el.children) stack.push(c as Element);
  }
  return n;
}

export type BodyParagraphInfo = {
  plainText: string;
  hyperlinkCount: number;
  /** True if w:pPr/w:spacing is set (needed so Word does not collapse blank lines) */
  hasSpacing: boolean;
};

/**
 * Returns one entry per direct `w:p` under `w:body` (document body text, not headers).
 */
export async function inspectDocxBodyParagraphs(buffer: Uint8Array): Promise<BodyParagraphInfo[]> {
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("missing word/document.xml");
  }
  const xml = await docFile.async("string");
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const body =
    doc.getElementsByTagNameNS(W_NS, "body")[0] ?? findElementByLocalName(doc.documentElement, "body");
  if (!body) {
    throw new Error("missing w:body");
  }
  const out: BodyParagraphInfo[] = [];
  for (const child of body.children) {
    if (child.localName === "p") {
      const hasSpacing = deepHasLocalName(child, "spacing");
      out.push({
        plainText: textFromParagraph(child),
        hyperlinkCount: hyperlinkCountInParagraph(child),
        hasSpacing,
      });
    }
  }
  return out;
}

/** Blank line we emit is a single ASCII space in a run */
export function isSpacerParagraph(info: BodyParagraphInfo): boolean {
  const t = info.plainText.replace(/\u00a0/g, " ");
  return t === "" || t === " ";
}
