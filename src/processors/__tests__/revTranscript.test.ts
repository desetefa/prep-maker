import { describe, it, expect } from "vitest";
import { processPremiereTranscriptToBlocks } from "../premiereTranscript";
import {
  processRevTranscriptToBlocks,
  detectRevSpeakers,
  isRevSpeakerBoundaryLine,
} from "../revTranscript";

describe("processRevTranscriptToBlocks", () => {
  it("splits Rev NAME (MM:SS): lines into separate blocks", () => {
    const input = `STOSSEL (00:05):\nLine A\nLUKAS (00:09):\nLine B`;
    const blocks = processRevTranscriptToBlocks(input);
    expect(blocks.length).toBe(2);
    expect(blocks[0].lines.map((l) => l.map((s) => s.text).join(""))).toEqual([
      "STOSSEL (00:05):",
      "Line A",
    ]);
    expect(blocks[1].lines.map((l) => l.map((s) => s.text).join(""))).toEqual([
      "LUKAS (00:09):",
      "Line B",
    ]);
  });

  it("accepts four-segment timecodes in parentheses", () => {
    const cue = "STOSSEL (00:00:00:00):";
    expect(isRevSpeakerBoundaryLine(cue)).toBe(true);
    const input = `${cue}\nHello`;
    const blocks = processRevTranscriptToBlocks(input);
    expect(blocks.length).toBe(1);
    expect(blocks[0].lines.length).toBe(2);
  });

  it("treats Speaker 3 (time): as a cue line", () => {
    const input = `Speaker 3 (00:48):\nSorry.`;
    const blocks = processRevTranscriptToBlocks(input);
    expect(blocks.length).toBe(1);
    expect(blocks[0].lines.length).toBe(2);
  });

  it("does not treat Rev cues as speaker lines in Premiere-only processor context", () => {
    const input = `STOSSEL (00:05):\nLine A`;
    const blocks = processPremiereTranscriptToBlocks(input);
    expect(blocks.length).toBe(1);
    expect(blocks[0].speakerId).toBe("");
  });
});

describe("detectRevSpeakers", () => {
  it("lists each speaker once (not once per timestamped cue)", () => {
    const content = `STOSSEL (00:05):\nA\nSTOSSEL (00:12):\nB\nLUKAS (00:09):\nC`;
    expect(detectRevSpeakers(content)).toEqual(["STOSSEL", "LUKAS"]);
  });
});
