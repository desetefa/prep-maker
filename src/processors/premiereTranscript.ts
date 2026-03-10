/**
 * Premiere Transcript processor: removes timecode lines (HH:MM:SS:FF - HH:MM:SS:FF)
 * while preserving speaker labels, dialogue, and paragraph structure.
 */

const TIMECODE_LINE_REGEX = /^\d{2}:\d{2}:\d{2}:\d{2}\s*-\s*\d{2}:\d{2}:\d{2}:\d{2}\s*$/;

const SPEAKER_LINE_REGEX = /^Speaker\s+\d+$/i;

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
  lines: string[];
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
  content: string,
  options?: ProcessOptions | Record<string, string>,
): TranscriptBlock[] {
  const opts = parseOptions(options);
  const speakerRenames = opts.speakerRenames ?? {};
  const speakersToRemoveSet = new Set(opts.speakersToRemove ?? []);

  let lines = content.split("\n");
  lines = lines.filter((line) => !TIMECODE_LINE_REGEX.test(line.trim()));

  const collapsed: string[] = [];
  let lastSpeakerOriginal: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (SPEAKER_LINE_REGEX.test(trimmed)) {
      if (trimmed === lastSpeakerOriginal) continue;
      lastSpeakerOriginal = trimmed;
      collapsed.push(line);
    } else {
      collapsed.push(line);
    }
  }

  const merged: string[] = [];
  for (let i = 0; i < collapsed.length; i++) {
    const line = collapsed[i];
    const trimmed = line.trim();
    const isBlank = trimmed === "";
    const prev = merged[merged.length - 1];
    const prevIsDialogue =
      prev !== undefined && prev.trim() !== "" && !SPEAKER_LINE_REGEX.test(prev.trim());
    const next = collapsed[i + 1];
    const nextIsDialogue =
      next !== undefined && next.trim() !== "" && !SPEAKER_LINE_REGEX.test(next.trim());
    if (isBlank && prevIsDialogue && nextIsDialogue) continue;
    merged.push(line);
  }

  const blocks: TranscriptBlock[] = [];
  let current: TranscriptBlock | null = null;

  for (let i = 0; i < merged.length; i++) {
    const line = merged[i];
    const trimmed = line.trim();

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
      current.lines.push(line);
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
    return head + b.lines.join("\n");
  });
  return blockStrings.join("\n\n");
}
