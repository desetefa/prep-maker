/**
 * Rev (and similar) transcript lines from Word: "NAME (timestamp):" speaker cues.
 * Not Premiere-style "Speaker 1" / timecode-strip lines — kept separate from premiereTranscript.ts.
 */

import type { LineInput, ProcessOptions, TranscriptBlock, TranscriptLine } from "./premiereTranscript";
import { plainLine } from "./premiereTranscript";

const SPEAKER_LINE_REGEX = /^Speaker\s+\d+$/i;

/** Premiere full-frame timecode line (strip if present) */
const PREMIERE_TIMECODE_LINE_REGEX = /^\d{2}:\d{2}:\d{2}:\d{2}\s*-\s*\d{2}:\d{2}:\d{2}:\d{2}\s*$/;

/**
 * Rev-style cue: text, parentheses with a timecode (flexible: MM:SS, HH:MM:SS, 00:00:00:00, decimals).
 * Optional colon after closing paren (some exports omit it).
 */
export const REV_SPEAKER_CUE_REGEX =
  /^\s*.+?\s*\(\s*[\d:.]+\s*\)\s*:?\s*$/;

/** Trim + strip ZWSP/BOM so Word paragraphs still match */
export function normalizeForRevCue(s: string): string {
  return s.trim().replace(/\u200b/g, "").replace(/\ufeff/g, "");
}

export function isRevSpeakerBoundaryLine(text: string): boolean {
  const trimmed = normalizeForRevCue(text);
  if (SPEAKER_LINE_REGEX.test(trimmed)) return true;
  return REV_SPEAKER_CUE_REGEX.test(trimmed);
}

/**
 * Stable speaker id for the modal and renames: "STOSSEL" from "STOSSEL (00:05):",
 * "Speaker 3" from "Speaker 3 (00:48):" — not one row per timestamp.
 */
export function extractRevSpeakerKey(trimmed: string): string {
  const t = normalizeForRevCue(trimmed);
  const withTime = t.match(/^(.+?)\s*\(\s*[\d:.]+\s*\)\s*:?\s*$/);
  if (withTime) {
    return normalizeForRevCue(withTime[1] ?? "");
  }
  if (SPEAKER_LINE_REGEX.test(t)) return t;
  return t;
}

function normalizeLine(line: LineInput): TranscriptLine {
  return typeof line === "string" ? [{ text: line }] : line;
}

function parseRevOptions(opts?: ProcessOptions | Record<string, string>): ProcessOptions {
  const o = opts;
  const isOpts =
    o != null &&
    typeof o === "object" &&
    ("speakersToRemove" in o || "speakerRenames" in o);
  return {
    speakerRenames: isOpts ? (o as ProcessOptions).speakerRenames ?? {} : (o as Record<string, string> | undefined) ?? {},
    speakersToRemove: isOpts ? (o as ProcessOptions).speakersToRemove ?? [] : [],
  };
}

/** Unique speaker names (not one entry per timestamped cue line) */
export function detectRevSpeakers(content: string): string[] {
  const seen = new Set<string>();
  const speakers: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = normalizeForRevCue(line);
    if (!trimmed) continue;
    if (isRevSpeakerBoundaryLine(trimmed)) {
      const key = extractRevSpeakerKey(trimmed);
      if (!seen.has(key)) {
        seen.add(key);
        speakers.push(key);
      }
    }
  }
  return speakers;
}

/**
 * Build blocks from Rev Word paragraphs (rich LineInput[]) or plain string lines.
 * Each speaker cue starts a new block; cue text is the first line of that block.
 */
export function processRevTranscriptToBlocks(
  content: string | LineInput[],
  options?: ProcessOptions | Record<string, string>,
): TranscriptBlock[] {
  const opts = parseRevOptions(options);
  const speakersToRemoveSet = new Set(opts.speakersToRemove ?? []);

  const linesInput: LineInput[] =
    typeof content === "string" ? content.split("\n") : content;

  let lines = linesInput.filter((line) => !PREMIERE_TIMECODE_LINE_REGEX.test(plainLine(line).trim()));

  const collapsed: LineInput[] = [];
  let lastSpeakerOriginal: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = normalizeForRevCue(plainLine(line));
    if (isRevSpeakerBoundaryLine(trimmed)) {
      if (trimmed === lastSpeakerOriginal) continue;
      lastSpeakerOriginal = trimmed;
      collapsed.push(line);
    } else {
      collapsed.push(line);
    }
  }

  const merged: LineInput[] = [];
  for (let i = 0; i < collapsed.length; i++) {
    const line = collapsed[i];
    const trimmed = normalizeForRevCue(plainLine(line));
    const isBlank = trimmed === "";
    const prev = merged[merged.length - 1];
    const prevPlain = prev !== undefined ? normalizeForRevCue(plainLine(prev)) : "";
    const prevIsDialogue =
      prev !== undefined && prevPlain !== "" && !isRevSpeakerBoundaryLine(prevPlain);
    const next = collapsed[i + 1];
    const nextPlain = next !== undefined ? normalizeForRevCue(plainLine(next)) : "";
    const nextIsDialogue =
      next !== undefined && nextPlain !== "" && !isRevSpeakerBoundaryLine(nextPlain);
    if (isBlank && prevIsDialogue && nextIsDialogue) continue;
    merged.push(line);
  }

  const blocks: TranscriptBlock[] = [];
  let current: TranscriptBlock | null = null;

  for (let i = 0; i < merged.length; i++) {
    const line = merged[i];
    const trimmed = normalizeForRevCue(plainLine(line));

    if (isRevSpeakerBoundaryLine(trimmed)) {
      const speakerKey = extractRevSpeakerKey(trimmed);
      const removed = speakersToRemoveSet.has(speakerKey);
      const block: TranscriptBlock = {
        speakerId: speakerKey,
        label: "",
        lines: removed ? [] : [normalizeLine(line)],
      };
      blocks.push(block);
      current = block;
    } else if (trimmed === "") {
      // skip
    } else {
      if (!current) {
        const orphan: TranscriptBlock = { speakerId: "", label: "", lines: [] };
        blocks.push(orphan);
        current = orphan;
      }
      current.lines.push(normalizeLine(line));
    }
  }

  return blocks;
}
