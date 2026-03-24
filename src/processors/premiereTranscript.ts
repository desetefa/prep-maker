/**
 * Premiere Transcript processor: removes timecode lines (HH:MM:SS:FF - HH:MM:SS:FF)
 * while preserving speaker labels, dialogue, and paragraph structure.
 */

const TIMECODE_LINE_REGEX = /^\d{2}:\d{2}:\d{2}:\d{2}\s*-\s*\d{2}:\d{2}:\d{2}:\d{2}\s*$/;

const SPEAKER_LINE_REGEX = /^Speaker\s+\d+$/i;

/** One run of text, optionally hyperlinked (from Word or export) */
export type TextSegment = { text: string; href?: string };

/** A logical line: one or more segments (plain text uses a single segment) */
export type TranscriptLine = TextSegment[];

/** Input line: newline-split string from .txt, or rich segments from .docx */
export type LineInput = string | TranscriptLine;

export function plainLine(line: LineInput): string {
  if (typeof line === "string") return line;
  return line.map((s) => s.text).join("");
}

function normalizeLine(line: LineInput): TranscriptLine {
  return typeof line === "string" ? [{ text: line }] : line;
}

export function detectSpeakers(content: string): string[] {
  const seen = new Set<string>();
  const speakers: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (SPEAKER_LINE_REGEX.test(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed);
      speakers.push(trimmed);
    }
  }
  return speakers;
}

export type ProcessOptions = {
  speakerRenames?: Record<string, string>;
  speakersToRemove?: string[];
};

export type TranscriptBlock = {
  speakerId: string;
  label: string;
  lines: TranscriptLine[];
};

function parseOptions(opts?: ProcessOptions | Record<string, string>): ProcessOptions {
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

export function processPremiereTranscriptToBlocks(
  content: string | LineInput[],
  options?: ProcessOptions | Record<string, string>,
): TranscriptBlock[] {
  const opts = parseOptions(options);
  const speakerRenames = opts.speakerRenames ?? {};
  const speakersToRemoveSet = new Set(opts.speakersToRemove ?? []);

  const linesInput: LineInput[] =
    typeof content === "string" ? content.split("\n") : content;

  let lines = linesInput.filter((line) => !TIMECODE_LINE_REGEX.test(plainLine(line).trim()));

  const collapsed: LineInput[] = [];
  let lastSpeakerOriginal: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = plainLine(line).trim();
    if (SPEAKER_LINE_REGEX.test(trimmed)) {
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
    const trimmed = plainLine(line).trim();
    const isBlank = trimmed === "";
    const prev = merged[merged.length - 1];
    const prevPlain = prev !== undefined ? plainLine(prev).trim() : "";
    const prevIsDialogue =
      prev !== undefined && prevPlain !== "" && !SPEAKER_LINE_REGEX.test(prevPlain);
    const next = collapsed[i + 1];
    const nextPlain = next !== undefined ? plainLine(next).trim() : "";
    const nextIsDialogue =
      next !== undefined && nextPlain !== "" && !SPEAKER_LINE_REGEX.test(nextPlain);
    if (isBlank && prevIsDialogue && nextIsDialogue) continue;
    merged.push(line);
  }

  const blocks: TranscriptBlock[] = [];
  let current: TranscriptBlock | null = null;

  for (let i = 0; i < merged.length; i++) {
    const line = merged[i];
    const trimmed = plainLine(line).trim();

    if (SPEAKER_LINE_REGEX.test(trimmed)) {
      const removed = speakersToRemoveSet.has(trimmed);
      const label = removed
        ? ""
        : (speakerRenames[trimmed] ?? trimmed);
      const displayLabel = speakerRenames[trimmed]
        ? label.toUpperCase()
        : label;
      const block: TranscriptBlock = {
        speakerId: trimmed,
        label: displayLabel,
        lines: [],
      };
      blocks.push(block);
      current = block;
    } else if (trimmed === "") {
      // Blank between blocks: do not add to current block
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

export function processPremiereTranscript(
  content: string,
  options?: ProcessOptions | Record<string, string>,
): string {
  const blocks = processPremiereTranscriptToBlocks(content, options);
  const blockStrings = blocks.map((b) => {
    const head = b.label ? b.label + "\n" : "";
    const body = b.lines.map((line) => line.map((s) => s.text).join("")).join("\n");
    return head + body;
  });
  return blockStrings.join("\n\n");
}
