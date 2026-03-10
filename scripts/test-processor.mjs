/**
 * Integration test: runs the processor on real input and verifies output.
 * Run: node scripts/test-processor.mjs
 * Or: npm run test:integration
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Uses inline processor - matches src/processors/premiereTranscript.ts
const TIMECODE_LINE_REGEX = /^\d{2}:\d{2}:\d{2}:\d{2}\s*-\s*\d{2}:\d{2}:\d{2}:\d{2}\s*$/;
const SPEAKER_LINE_REGEX = /^Speaker\s+\d+$/i;

function processPremiereTranscript(content, options = {}) {
  const speakerRenames = options.speakerRenames ?? {};
  const speakersToRemoveSet = new Set(options.speakersToRemove ?? []);

  let lines = content.split("\n");
  lines = lines.filter((line) => !TIMECODE_LINE_REGEX.test(line.trim()));

  // Pass 1: collapse consecutive same-speaker
  const collapsed = [];
  let lastSpeakerOriginal = null;
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

  // Pass 2: remove blanks between same-speaker dialogue (BEFORE removing labels)
  const merged = [];
  for (let i = 0; i < collapsed.length; i++) {
    const line = collapsed[i];
    const trimmed = line.trim();
    const prev = merged[merged.length - 1];
    const prevIsDialogue =
      prev !== undefined && prev.trim() !== "" && !SPEAKER_LINE_REGEX.test(prev.trim());
    const next = collapsed[i + 1];
    const nextIsDialogue =
      next !== undefined && next.trim() !== "" && !SPEAKER_LINE_REGEX.test(next.trim());
    if (trimmed === "" && prevIsDialogue && nextIsDialogue) continue;
    merged.push(line);
  }

  // Pass 3: apply removals and renames
  const output = [];
  for (let i = 0; i < merged.length; i++) {
    const line = merged[i];
    const trimmed = line.trim();
    if (SPEAKER_LINE_REGEX.test(trimmed)) {
      if (speakersToRemoveSet.has(trimmed)) continue;
      const newLabel = speakerRenames[trimmed]
        ? speakerRenames[trimmed].toUpperCase()
        : trimmed;
      output.push(line.replace(trimmed, newLabel));
    } else {
      output.push(line);
    }
  }

  return output.join("\n");
}

const fixturePath = join(__dirname, "../src/processors/__tests__/fixtures/carrie-sample.txt");
const carriePath = "/Users/daniel/StosselTV/Daycare Regulation/DOCS/Interview Prep/Carrie.txt";

const pathsToTry = [carriePath, fixturePath];
let content = null;
let usedPath = null;
for (const p of pathsToTry) {
  try {
    content = readFileSync(p, "utf-8");
    usedPath = p;
    break;
  } catch {
    // skip
  }
}

if (!content) {
  console.error("Could not read fixture or Carrie.txt");
  process.exit(1);
}

console.log("Input file:", usedPath);
console.log("Input lines:", content.split("\n").length);
console.log("");

const options = {
  speakerRenames: { "Speaker 1": "DAN", "Speaker 2": "CARRIE" },
  speakersToRemove: [],
};

const result = processPremiereTranscript(content, options);

const danCount = (result.match(/\bDAN\b/g) ?? []).length;
const carrieCount = (result.match(/\bCARRIE\b/g) ?? []).length;
const speaker1Count = (result.match(/\bSpeaker 1\b/g) ?? []).length;
const speaker2Count = (result.match(/\bSpeaker 2\b/g) ?? []).length;

console.log("Output stats:");
console.log("  DAN labels:", danCount);
console.log("  CARRIE labels:", carrieCount);
console.log("  Speaker 1 (unrenamed):", speaker1Count);
console.log("  Speaker 2 (unrenamed):", speaker2Count);
console.log("");

const outputPath = join(__dirname, "../test-output.txt");
writeFileSync(outputPath, result);
console.log("Full output saved to:", outputPath);
console.log("");
console.log("First 80 lines of output:");
console.log(result.split("\n").slice(0, 80).join("\n"));

const totalLabels = danCount + carrieCount + speaker1Count + speaker2Count;
if (totalLabels < 3) {
  console.error("\nFAIL: Expected multiple speaker labels (got " + totalLabels + ")");
  process.exit(1);
}
console.log("\nPASS: Labels appear correctly (total:", totalLabels, ")");
