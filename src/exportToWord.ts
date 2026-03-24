import {
  Document,
  Paragraph,
  TextRun,
  Packer,
  Header,
  Table,
  TableRow,
  TableCell,
  TableBorders,
  AlignmentType,
  SimpleField,
  WidthType,
  ExternalHyperlink,
  InternalHyperlink,
} from "docx";
import type { TranscriptBlock, TranscriptLine } from "./processors/premiereTranscript";

const FONT = "Calibri";
const FONT_SIZE_NORMAL = 28; // 14pt in half-points
const FONT_SIZE_INTERVIEWER = 32; // 16pt in half-points

type RunProps = {
  font: string;
  size: number;
  bold: boolean;
};

function paragraphChildrenFromLine(line: TranscriptLine, runProps: RunProps): (TextRun | ExternalHyperlink | InternalHyperlink)[] {
  const joined = line.map((s) => s.text).join("");
  const trimmed = joined.trim();
  if (trimmed === "") {
    return [new TextRun({ text: " ", ...runProps })];
  }
  const out: (TextRun | ExternalHyperlink | InternalHyperlink)[] = [];
  for (const seg of line) {
    const t = seg.text || " ";
    if (seg.href) {
      if (seg.href.startsWith("#")) {
        out.push(
          new InternalHyperlink({
            children: [
              new TextRun({
                text: t,
                ...runProps,
                style: "Hyperlink",
              }),
            ],
            anchor: seg.href.slice(1),
          }),
        );
      } else {
        out.push(
          new ExternalHyperlink({
            children: [
              new TextRun({
                text: t,
                ...runProps,
                style: "Hyperlink",
              }),
            ],
            link: seg.href,
          }),
        );
      }
    } else {
      out.push(new TextRun({ text: t, ...runProps }));
    }
  }
  return out;
}

export type ExportOptions = {
  /** Speaker ID to style as interviewer (bold 16pt, no label). Default: "Speaker 1" */
  interviewerSpeakerId?: string;
  /** Document title for header (left side) */
  documentTitle?: string;
  /** Author name for header (right side, before page number) */
  authorName?: string;
  /** "prep" = standard prep doc; "clipReel" = clip reel with contextual spacing */
  outputFormat?: "prep" | "clipReel";
};

export async function exportToWordBuffer(
  blocks: TranscriptBlock[],
  options?: ExportOptions,
): Promise<Uint8Array> {
  const interviewerId = options?.interviewerSpeakerId ?? "Speaker 1";
  const documentTitle = options?.documentTitle ?? "";
  const authorName = options?.authorName ?? "";
  const outputFormat = options?.outputFormat ?? "prep";
  /** Clip reel: contextual spacing on body paragraphs stacks with blank lines and looks double-spaced; keep it for header only. */
  const clipReel = outputFormat === "clipReel";
  const children: Paragraph[] = [];

  /** One empty paragraph = one visual blank line. No extra w:spacing — before/after twips + contextual neighbors read as double spacing. */
  const blankLineParagraph = (): Paragraph =>
    new Paragraph({
      children: [
        new TextRun({
          text: " ",
          font: FONT,
          size: FONT_SIZE_NORMAL,
        }),
      ],
    });

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const isInterviewer = block.speakerId === interviewerId;

    const runProps: RunProps = {
      font: FONT,
      size: isInterviewer ? FONT_SIZE_INTERVIEWER : FONT_SIZE_NORMAL,
      bold: isInterviewer,
    };

    for (const line of block.lines) {
      children.push(
        new Paragraph({
          children: paragraphChildrenFromLine(line, runProps),
        }),
      );
    }

    // Interview Clip Reel only: blank line after this speaker's dialogue, before the next speaker
    if (clipReel && i < blocks.length - 1) {
      children.push(blankLineParagraph());
    }

    // Prep only: extra line after each non-interviewer block (unchanged)
    if (!clipReel && !isInterviewer) {
      children.push(blankLineParagraph());
    }
  }

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: "autofit",
    borders: TableBorders.NONE,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                text: documentTitle || " ",
                alignment: AlignmentType.START,
                ...(clipReel && { contextualSpacing: true }),
              }),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.END,
                ...(clipReel && { contextualSpacing: true }),
                children: [
                  ...(authorName ? [new TextRun({ text: `${authorName} - `, font: FONT, size: FONT_SIZE_NORMAL })] : []),
                  new SimpleField("PAGE", "1"),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const header = new Header({
    children: [headerTable],
  });

  const doc = new Document({
    sections: [
      {
        headers: { default: header },
        children,
      },
    ],
    styles: {
      default: {
        document: {
          run: {
            font: FONT,
            size: FONT_SIZE_NORMAL,
          },
        },
      },
    },
  });

  const arrayBuffer = await Packer.toArrayBuffer(doc);
  return new Uint8Array(arrayBuffer);
}
