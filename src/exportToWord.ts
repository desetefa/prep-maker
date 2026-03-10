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
} from "docx";
import type { TranscriptBlock } from "./processors/premiereTranscript";

const FONT = "Calibri";
const FONT_SIZE_NORMAL = 28; // 14pt in half-points
const FONT_SIZE_INTERVIEWER = 32; // 16pt in half-points

export type ExportOptions = {
  /** Speaker ID to style as interviewer (bold 16pt, no label). Default: "Speaker 1" */
  interviewerSpeakerId?: string;
  /** Document title for header (left side) */
  documentTitle?: string;
  /** Author name for header (right side, before page number) */
  authorName?: string;
};

export async function exportToWordBuffer(
  blocks: TranscriptBlock[],
  options?: ExportOptions,
): Promise<Uint8Array> {
  const interviewerId = options?.interviewerSpeakerId ?? "Speaker 1";
  const documentTitle = options?.documentTitle ?? "";
  const authorName = options?.authorName ?? "";
  const children: Paragraph[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const isInterviewer = block.speakerId === interviewerId;

    const runProps = {
      font: FONT,
      size: isInterviewer ? FONT_SIZE_INTERVIEWER : FONT_SIZE_NORMAL,
      bold: isInterviewer,
    };

    for (const line of block.lines) {
      const trimmed = line.trim();
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed || " ",
              ...runProps,
            }),
          ],
        }),
      );
    }

    if (!isInterviewer) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: " ",
              font: FONT,
              size: FONT_SIZE_NORMAL,
            }),
          ],
        }),
      );
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
              }),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.END,
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
