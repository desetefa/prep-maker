import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { processPremiereTranscript, detectSpeakers } from "../premiereTranscript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "fixtures", "carrie-sample.txt");
const fullCarriePath = "/Users/daniel/StosselTV/Daycare Regulation/DOCS/Interview Prep/Carrie.txt";

describe("detectSpeakers", () => {
  it("detects Speaker 1 and Speaker 2 in order", () => {
    const input = `00:00:01:00 - 00:00:02:00
Speaker 1
Hello

00:00:02:00 - 00:00:03:00
Speaker 2
Hi there`;
    expect(detectSpeakers(input)).toEqual(["Speaker 1", "Speaker 2"]);
  });

  it("returns unique speakers only", () => {
    const input = `Speaker 1\nLine\nSpeaker 2\nLine\nSpeaker 1\nLine`;
    expect(detectSpeakers(input)).toEqual(["Speaker 1", "Speaker 2"]);
  });
});

describe("processPremiereTranscript", () => {
  it("removes timecode lines", () => {
    const input = `00:00:03:17 - 00:00:10:01
Speaker 1
Okay, so first, just tell me about your expertise.

00:00:10:01 - 00:00:28:23
Speaker 2
Yeah. So this is obviously been a priority.`;

    const result = processPremiereTranscript(input);

    expect(result).not.toMatch(/00:00:03:17/);
    expect(result).not.toMatch(/00:00:10:01/);
    expect(result).toContain("Speaker 1");
    expect(result).toContain("Speaker 2");
    expect(result).toContain("Okay, so first");
    expect(result).toContain("Yeah. So this is obviously");
  });

  it("preserves speaker labels", () => {
    const input = `00:00:01:00 - 00:00:02:00
Speaker 1
Hello

00:00:02:00 - 00:00:03:00
Speaker 2
Hi there`;

    const result = processPremiereTranscript(input);

    expect(result).toContain("Speaker 1");
    expect(result).toContain("Speaker 2");
    expect(result).toContain("Hello");
    expect(result).toContain("Hi there");
  });

  it("preserves paragraph structure and blank lines", () => {
    const input = `00:00:01:00 - 00:00:02:00
Speaker 1
Line one.

00:00:02:00 - 00:00:03:00
Speaker 2
Line two.`;

    const result = processPremiereTranscript(input);

    const blocks = result.split("\n\n");
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(result).toContain("Speaker 1");
    expect(result).toContain("Line one.");
    expect(result).toContain("Speaker 2");
    expect(result).toContain("Line two.");
  });

  it("handles timecodes with varying whitespace around dash", () => {
    const input = `00:00:01:00-00:00:02:00
Text

00:00:03:00 - 00:00:04:00
More text`;

    const result = processPremiereTranscript(input);

    expect(result).not.toMatch(/\d{2}:\d{2}:\d{2}:\d{2}/);
    expect(result).toContain("Text");
    expect(result).toContain("More text");
  });

  it("does not remove lines that merely contain timecode-like numbers", () => {
    const input = `Speaker 1
I was there at 00:00 and left at 12:30.
Another line.`;

    const result = processPremiereTranscript(input);

    expect(result).toContain("I was there at 00:00 and left at 12:30.");
    expect(result).toContain("Another line.");
  });

  it("processes Carrie fixture correctly", () => {
    const input = readFileSync(fixturePath, "utf-8");
    const result = processPremiereTranscript(input);

    expect(result).not.toMatch(/\d{2}:\d{2}:\d{2}:\d{2}\s*-\s*\d{2}:\d{2}:\d{2}:\d{2}/);
    expect(result).toContain("Speaker 1");
    expect(result).toContain("Speaker 2");
    expect(result).toContain("Okay, so first, just tell me about");
    expect(result).toContain("Independent Women's Forum");
    expect(result).toContain("lived overseas for the better part of two decades");
  });

  it("Carrie fixture with renames: collapses consecutive same-speaker, keeps labels when switching", () => {
    const input = readFileSync(fixturePath, "utf-8");
    const result = processPremiereTranscript(input, {
      speakerRenames: { "Speaker 1": "DAN", "Speaker 2": "CARRIE" },
    });

    expect(result).not.toMatch(/\d{2}:\d{2}:\d{2}:\d{2}\s*-\s*\d{2}:\d{2}:\d{2}:\d{2}/);
    expect(result).toContain("DAN");
    expect(result).toContain("CARRIE");
    expect(result).toContain("Okay, so first, just tell me about");
    expect(result).toContain("Independent Women's Forum");
    expect(result).toContain("All right? Because one size fits all");
    const danCount = (result.match(/\bDAN\b/g) ?? []).length;
    const carrieCount = (result.match(/\bCARRIE\b/g) ?? []).length;
    expect(danCount).toBe(2);
    expect(carrieCount).toBe(1);
  });

  it("keeps only first label when same speaker has consecutive blocks", () => {
    const input = `00:00:01:00 - 00:00:02:00
Speaker 1
First block.

00:00:02:00 - 00:00:03:00
Speaker 1
Second block.

00:00:03:00 - 00:00:04:00
Speaker 1
Third block.

00:00:04:00 - 00:00:05:00
Speaker 2
Different speaker.`;
    const result = processPremiereTranscript(input, {
      speakerRenames: { "Speaker 1": "Carrie", "Speaker 2": "John" },
    });

    expect(result).toContain("CARRIE");
    expect(result).toContain("First block.");
    expect(result).toContain("Second block.");
    expect(result).toContain("Third block.");
    expect(result).toContain("JOHN");
    expect(result).toContain("Different speaker.");
    const carrieCount = (result.match(/CARRIE/g) ?? []).length;
    expect(carrieCount).toBe(1);
    const johnCount = (result.match(/JOHN/g) ?? []).length;
    expect(johnCount).toBe(1);
  });

  it("matches Carrie-style alternating pattern: collapse within speaker, show when switching", () => {
    const input = `00:00:01:00 - 00:00:02:00
Speaker 1
First question.

00:00:02:00 - 00:00:03:00
Speaker 2
Answer one.

00:00:03:00 - 00:00:04:00
Speaker 2
Answer two.

00:00:04:00 - 00:00:05:00
Speaker 1
Follow-up.

00:00:05:00 - 00:00:06:00
Speaker 1
Another question.

00:00:06:00 - 00:00:07:00
Speaker 2
Final answer.`;
    const result = processPremiereTranscript(input, {
      speakerRenames: { "Speaker 1": "DAN", "Speaker 2": "CARRIE" },
    });

    const lines = result.split("\n");
    const danLabels = lines.filter((l) => l.trim() === "DAN");
    const carrieLabels = lines.filter((l) => l.trim() === "CARRIE");
    expect(danLabels.length).toBe(2);
    expect(carrieLabels.length).toBe(2);
    expect(result).toContain("First question.");
    expect(result).toContain("Answer one.");
    expect(result).toContain("Answer two.");
    expect(result).toContain("Follow-up.");
    expect(result).toContain("Another question.");
    expect(result).toContain("Final answer.");
  });

  it("shows label again when speaker returns after another speaker", () => {
    const input = `00:00:01:00 - 00:00:02:00
Speaker 1
First from Carrie.

00:00:02:00 - 00:00:03:00
Speaker 2
From John.

00:00:03:00 - 00:00:04:00
Speaker 1
Carrie again.

00:00:04:00 - 00:00:05:00
Speaker 1
Carrie still.`;
    const result = processPremiereTranscript(input, {
      speakerRenames: { "Speaker 1": "Carrie", "Speaker 2": "John" },
    });

    const carrieCount = (result.match(/CARRIE/g) ?? []).length;
    expect(carrieCount).toBe(2);
    expect(result).toContain("First from Carrie.");
    expect(result).toContain("From John.");
    expect(result).toContain("Carrie again.");
    expect(result).toContain("Carrie still.");
    const johnCount = (result.match(/JOHN/g) ?? []).length;
    expect(johnCount).toBe(1);
  });

  it("removes only speaker labels when speakersToRemove specified, keeps dialogue", () => {
    const input = `00:00:01:00 - 00:00:02:00
Speaker 1
I am the interviewer.

00:00:02:00 - 00:00:03:00
Speaker 2
I am the guest.`;
    const result = processPremiereTranscript(input, {
      speakerRenames: {},
      speakersToRemove: ["Speaker 1"],
    });

    expect(result).not.toContain("Speaker 1");
    expect(result).toContain("I am the interviewer");
    expect(result).toContain("Speaker 2");
    expect(result).toContain("I am the guest");
  });

  it("preserves blank between speakers when one has Remove label", () => {
    const input = `00:00:01:00 - 00:00:02:00
Speaker 2
a
b
c

00:00:02:00 - 00:00:03:00
Speaker 1
Dans line`;
    const result = processPremiereTranscript(input, {
      speakerRenames: { "Speaker 1": "DAN", "Speaker 2": "CARRIE" },
      speakersToRemove: ["Speaker 1"],
    });
    expect(result).toMatch(/c\n\nDans line/);
  });

  it("integration: full Carrie file with app-style options produces alternating DAN/CARRIE labels", () => {
    let content: string;
    try {
      content = readFileSync(fullCarriePath, "utf-8");
    } catch {
      return;
    }
    const options = {
      speakerRenames: { "Speaker 1": "DAN", "Speaker 2": "CARRIE" },
      speakersToRemove: [] as string[],
    };
    const result = processPremiereTranscript(content, options);
    const danCount = (result.match(/\bDAN\b/g) ?? []).length;
    const carrieCount = (result.match(/\bCARRIE\b/g) ?? []).length;
    expect(danCount).toBeGreaterThan(10);
    expect(carrieCount).toBeGreaterThan(10);
  });

  it("removes blank lines between same speaker's consecutive dialogue blocks", () => {
    const input = `00:00:01:00 - 00:00:02:00
Speaker 1
First line.

00:00:02:00 - 00:00:03:00
Speaker 1
Second line.

00:00:03:00 - 00:00:04:00
Speaker 2
Other speaker.`;
    const result = processPremiereTranscript(input, {
      speakerRenames: { "Speaker 1": "A", "Speaker 2": "B" },
    });
    expect(result).toContain("First line.");
    expect(result).toContain("Second line.");
    expect(result).toContain("Other speaker.");
    expect(result).not.toMatch(/First line\.\n\nSecond line\./);
    expect(result).toMatch(/First line\.\nSecond line\./);
  });

  it("replaces speaker labels when renames provided, always in all caps", () => {
    const input = `00:00:01:00 - 00:00:02:00
Speaker 1
Hello

00:00:02:00 - 00:00:03:00
Speaker 2
Hi there`;
    const result = processPremiereTranscript(input, {
      "Speaker 1": "Carrie",
      "Speaker 2": "John",
    });

    expect(result).toContain("CARRIE");
    expect(result).toContain("JOHN");
    expect(result).not.toContain("Speaker 1");
    expect(result).not.toContain("Speaker 2");
    expect(result).toContain("Hello");
    expect(result).toContain("Hi there");
  });
});
