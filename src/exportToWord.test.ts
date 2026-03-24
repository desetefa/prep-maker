/** @vitest-environment happy-dom */
import { describe, it, expect } from "vitest";
import { exportToWordBuffer } from "./exportToWord";
import { processRevTranscriptToBlocks } from "./processors/revTranscript";
import type { TranscriptBlock } from "./processors/premiereTranscript";
import { inspectDocxBodyParagraphs, isSpacerParagraph } from "./test-support/inspectDocxBody";

describe("exportToWordBuffer — Interview Clip Reel spacing", () => {
  it("full pipeline: clip-reel cues yield a spacer between STOSSEL and LUKAS turns", async () => {
    const input = `STOSSEL (00:05):\nDialogue A\nLUKAS (00:09):\nDialogue B`;
    const blocks = processRevTranscriptToBlocks(input);
    expect(blocks.length).toBe(2);

    const buf = await exportToWordBuffer(blocks, { outputFormat: "clipReel" });
    const paras = await inspectDocxBodyParagraphs(buf);
    // Block1: cue + dialogue = 2 paras, spacer, block2: cue + dialogue = 2 → 5
    expect(paras.length).toBe(5);
    expect(isSpacerParagraph(paras[2])).toBe(true);
  });

  it("inserts exactly one spacer between speaker blocks, not between lines of the same turn", async () => {
    const blocks: TranscriptBlock[] = [
      {
        speakerId: "Speaker 1",
        label: "STOSSEL",
        lines: [
          [
            { text: "STOSSEL (" },
            { text: "00:05", href: "https://example.com/tc1" },
            { text: "):" },
          ],
          [{ text: "Line A dialogue." }],
        ],
      },
      {
        speakerId: "Speaker 2",
        label: "LUKAS",
        lines: [
          [
            { text: "LUKAS (" },
            { text: "00:09", href: "https://example.com/tc2" },
            { text: "):" },
          ],
          [{ text: "Line B dialogue." }],
        ],
      },
    ];

    const buf = await exportToWordBuffer(blocks, { outputFormat: "clipReel" });
    const paras = await inspectDocxBodyParagraphs(buf);

    // 2 lines block1 + spacer + 2 lines block2 = 5 paragraphs
    expect(paras.length).toBe(5);
    expect(isSpacerParagraph(paras[2])).toBe(true);
    expect(paras[0].plainText).toContain("STOSSEL");
    expect(paras[1].plainText).toContain("Line A");
    expect(paras[3].plainText).toContain("LUKAS");
    expect(paras[4].plainText).toContain("Line B");
  });

  it("does not insert a spacer between two dialogue lines of the same block (single speaker)", async () => {
    const blocks: TranscriptBlock[] = [
      {
        speakerId: "Speaker 1",
        label: "STOSSEL",
        lines: [[{ text: "First line." }], [{ text: "Second line same speaker." }]],
      },
    ];

    const buf = await exportToWordBuffer(blocks, { outputFormat: "clipReel" });
    const paras = await inspectDocxBodyParagraphs(buf);

    expect(paras.length).toBe(2);
    expect(paras.some((p) => isSpacerParagraph(p))).toBe(false);
  });

  it("preserves hyperlinks on timecode segments (external URL)", async () => {
    const blocks: TranscriptBlock[] = [
      {
        speakerId: "Speaker 1",
        label: "STOSSEL",
        lines: [
          [
            { text: "STOSSEL (" },
            { text: "00:05", href: "https://example.com/time" },
            { text: "):" },
          ],
        ],
      },
    ];

    const buf = await exportToWordBuffer(blocks, { outputFormat: "clipReel" });
    const paras = await inspectDocxBodyParagraphs(buf);

    expect(paras.length).toBe(1);
    expect(paras[0].hyperlinkCount).toBeGreaterThanOrEqual(1);
    expect(paras[0].plainText).toContain("00:05");
  });
});

describe("exportToWordBuffer — Prep (unchanged spacer rules)", () => {
  it("does not use clip-reel between-block spacers", async () => {
    const blocks: TranscriptBlock[] = [
      {
        speakerId: "Speaker 1",
        label: "A",
        lines: [[{ text: "Interviewer line." }]],
      },
      {
        speakerId: "Speaker 2",
        label: "B",
        lines: [[{ text: "Guest line." }]],
      },
    ];

    const buf = await exportToWordBuffer(blocks, { outputFormat: "prep" });
    const paras = await inspectDocxBodyParagraphs(buf);

    // 1 + spacer after guest only? Prep adds spacer after non-interviewer only.
    // Speaker 1 is interviewer, Speaker 2 is guest - spacer after guest block.
    // Block1: 1 para, Block2: 1 para + spacer after guest = 3 paras?
    // Actually: block1 ends - no spacer (interviewer). block2 ends - spacer (guest).
    // So 1 + 1 + 1 spacer = 3
    expect(paras.length).toBe(3);
    expect(isSpacerParagraph(paras[2])).toBe(true);
  });
});
