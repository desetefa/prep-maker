import JSZip from "jszip";
import type { LineInput, TextSegment, TranscriptLine } from "./processors/premiereTranscript";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** Load hyperlink r:id → Target URL from word/_rels/document.xml.rels */
function parseHyperlinkRelationships(relsXml: string): Map<string, string> {
  const map = new Map<string, string>();
  const parser = new DOMParser();
  const doc = parser.parseFromString(relsXml, "application/xml");
  const rels = doc.getElementsByTagNameNS(REL_NS, "Relationship");
  for (let i = 0; i < rels.length; i++) {
    const r = rels[i];
    const id = r.getAttribute("Id");
    const type = r.getAttribute("Type");
    const target = r.getAttribute("Target");
    if (!id || !target || !type?.includes("hyperlink")) continue;
    map.set(id, target);
  }
  return map;
}

function getRelationshipIdFromHyperlink(el: Element): string | null {
  const direct = el.getAttribute("r:id");
  if (direct) return direct;
  for (const attr of el.attributes) {
    if (attr.localName === "id" && attr.namespaceURI === OFFICE_REL) {
      return attr.value;
    }
  }
  return null;
}

function getTextFromRun(run: Element): string {
  let text = "";
  const ts = run.getElementsByTagNameNS(W_NS, "t");
  for (let i = 0; i < ts.length; i++) {
    text += ts[i].textContent ?? "";
  }
  return text;
}

function appendSegment(segments: TextSegment[], text: string, href: string | undefined): void {
  if (text === "" && segments.length === 0) return;
  const last = segments[segments.length - 1];
  if (last && last.href === href) {
    last.text += text;
  } else {
    segments.push({ text, href });
  }
}

/** Walk paragraph children: w:r (text) and w:hyperlink (nested w:r) */
function walkParagraphContent(
  parent: Element,
  rels: Map<string, string>,
  segments: TextSegment[],
  inheritedHref: string | undefined,
): void {
  for (const child of parent.children) {
    const ln = child.localName;
    if (ln === "hyperlink") {
      const rid = getRelationshipIdFromHyperlink(child);
      let href: string | undefined;
      if (rid) {
        href = rels.get(rid);
      } else {
        const anchor = child.getAttributeNS(W_NS, "anchor") ?? child.getAttribute("anchor");
        if (anchor) {
          href = `#${anchor}`;
        }
      }
      walkParagraphContent(child, rels, segments, href ?? inheritedHref);
    } else if (ln === "r") {
      appendSegment(segments, getTextFromRun(child), inheritedHref);
    } else if (ln === "sdt") {
      const content = child.getElementsByTagNameNS(W_NS, "sdtContent")[0];
      if (content) walkParagraphContent(content, rels, segments, inheritedHref);
    } else if (ln === "smartTag") {
      walkParagraphContent(child, rels, segments, inheritedHref);
    } else if (ln === "fldSimple") {
      walkParagraphContent(child, rels, segments, inheritedHref);
    }
  }
}

function parseParagraphToSegments(p: Element, rels: Map<string, string>): TranscriptLine {
  const segments: TextSegment[] = [];
  walkParagraphContent(p, rels, segments, undefined);
  if (segments.length === 0) {
    return [{ text: "" }];
  }
  return segments;
}

function collectParagraphsFromBody(body: Element, rels: Map<string, string>): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  function walk(node: Element) {
    if (node.localName === "p") {
      lines.push(parseParagraphToSegments(node, rels));
      return;
    }
    for (const c of node.children) {
      walk(c as Element);
    }
  }
  for (const c of body.children) {
    walk(c as Element);
  }
  return lines;
}

/**
 * Read a .docx file and return one LineInput per paragraph, preserving hyperlinks as segments.
 */
export async function parseDocxToLineInputs(arrayBuffer: ArrayBuffer): Promise<LineInput[]> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("Invalid .docx: missing word/document.xml");
  }
  const docXml = await docFile.async("string");
  const relsFile = zip.file("word/_rels/document.xml.rels");
  const relsXml = relsFile ? await relsFile.async("string") : "";
  const rels = relsXml ? parseHyperlinkRelationships(relsXml) : new Map<string, string>();

  const parser = new DOMParser();
  const doc = parser.parseFromString(docXml, "application/xml");
  const body = doc.getElementsByTagNameNS(W_NS, "body")[0];
  if (!body) {
    throw new Error("Invalid .docx: missing w:body");
  }
  return collectParagraphsFromBody(body, rels);
}
