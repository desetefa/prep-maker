import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readTextFile, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";
import { dirname, join } from "@tauri-apps/api/path";
import {
  processPremiereTranscriptToBlocks,
  detectSpeakers,
  plainLine,
  type LineInput,
} from "./processors/premiereTranscript";
import { processRevTranscriptToBlocks, detectRevSpeakers } from "./processors/revTranscript";
import { parseDocxToLineInputs } from "./parseDocxLines";
import { exportToWordBuffer } from "./exportToWord";
import "./App.css";

type Status = "ready" | "processing" | "success" | "error";

type PendingFile = {
  path: string;
  /** Plain text for speaker detection (and modal context) */
  content: string;
  /** When set (Word input), processing preserves hyperlinks */
  lineInputs?: LineInput[];
  speakers: string[];
};

function App() {
  const [status, setStatus] = useState<Status>("ready");
  const [message, setMessage] = useState("Drop a transcript file (.txt or .md) here");
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [removedSpeakers, setRemovedSpeakers] = useState<Set<string>>(new Set());
  const [documentTitle, setDocumentTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [outputFormat, setOutputFormat] = useState<"prep" | "clipReel">("prep");

  const dropMessage =
    outputFormat === "clipReel"
      ? "Drop a Word document (.docx) here"
      : "Drop a transcript file (.txt or .md) here";

  const processAndSave = useCallback(
    async (
      path: string,
      contentOrLines: string | LineInput[],
      renames: Record<string, string>,
      toRemove: string[] = [],
      title = "",
      author = "",
      format: "prep" | "clipReel" = "prep",
    ) => {
      setStatus("processing");
      setMessage("Processing...");
      setPendingFile(null);

      try {
        const blocks =
          format === "clipReel"
            ? processRevTranscriptToBlocks(contentOrLines, {
                speakerRenames: renames,
                speakersToRemove: toRemove,
              })
            : processPremiereTranscriptToBlocks(contentOrLines, {
                speakerRenames: renames,
                speakersToRemove: toRemove,
              });

        const dir = await dirname(path);
        const baseName = path.split("/").pop() ?? path.split("\\").pop() ?? "output";
        const nameWithoutExt = baseName.replace(/\.(txt|md|docx)$/i, "");
        const suffix = format === "clipReel" ? "_clip_reel" : "_stripped";
        const suggestedName = `${nameWithoutExt}${suffix}.docx`;

        const buffer = await exportToWordBuffer(blocks, {
          interviewerSpeakerId: "Speaker 1",
          documentTitle: title,
          authorName: author,
          outputFormat: format,
        });

        let outputPath: string;
        if (format === "clipReel") {
          // Save sheet avoids iCloud/OneDrive “server document” read-only + overwriting a file Word still has open (Mac/Windows).
          const picked = await save({
            title: "Save Interview Clip Reel",
            defaultPath: await join(dir, suggestedName),
            filters: [{ name: "Word Document", extensions: ["docx"] }],
            canCreateDirectories: true,
          });
          if (picked === null) {
            setStatus("ready");
            setMessage("Save cancelled.");
            return;
          }
          outputPath = picked;
        } else {
          outputPath = await join(dir, suggestedName);
        }

        await writeFile(outputPath, buffer);

        try {
          await invoke("ensure_file_writable", { path: outputPath });
        } catch (e) {
          console.warn("[Prep Maker] ensure_file_writable:", e);
        }

        setStatus("success");
        setMessage(`Saved to ${outputPath.split("/").pop() ?? outputPath.split("\\").pop() ?? outputPath}`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const errDetail = err instanceof Error && err.cause ? ` (${String(err.cause)})` : "";
        console.error("[Prep Maker] Error:", path, err, err instanceof Error ? err.stack : "");
        setStatus("error");
        setMessage(`${errMsg}${errDetail}`);
      }
    },
    [],
  );

  const handleFile = useCallback(async (filePath: string) => {
    const path = filePath.replace(/^file:\/\//, "");
    console.log("[Prep Maker] Processing file:", path);

    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const acceptedExts = ["txt", "md", "docx"];

    if (!acceptedExts.includes(ext)) {
      setStatus("error");
      setMessage("Please drop a .txt, .md, or .docx file.");
      return;
    }

    if ((ext === "txt" || ext === "md") && outputFormat === "clipReel") {
      setStatus("error");
      setMessage(
        "Interview Clip Reel expects a Word document (.docx). Choose Transcript to Prep for .txt / .md, or drop a .docx file.",
      );
      return;
    }

    try {
      let content: string;
      let lineInputs: LineInput[] | undefined;
      let speakers: string[];

      if (ext === "docx") {
        setOutputFormat("clipReel");
        const raw = await readFile(path);
        const arrayBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
        lineInputs = await parseDocxToLineInputs(arrayBuffer);
        content = lineInputs.map((l) => plainLine(l)).join("\n");
        speakers = detectRevSpeakers(content);
      } else {
        content = await readTextFile(path);
        speakers = detectSpeakers(content);
      }

      setPendingFile({ path, content, lineInputs, speakers });
      setSpeakerNames(Object.fromEntries(speakers.map((s) => [s, ""])));
      setRemovedSpeakers(new Set());
      setDocumentTitle("");
      setAuthorName("");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errDetail = err instanceof Error && err.cause ? ` (${String(err.cause)})` : "";
      console.error("[Prep Maker] Error:", path, err, err instanceof Error ? err.stack : "");
      setStatus("error");
      setMessage(`${errMsg}${errDetail}`);
    }
  }, [outputFormat]);

  const handleProcessWithSpeakers = useCallback(() => {
    if (!pendingFile) return;
    const renames: Record<string, string> = {};
    for (const speaker of pendingFile.speakers) {
      const name = speakerNames[speaker]?.trim();
      if (name) renames[speaker] = name;
    }
    void processAndSave(
      pendingFile.path,
      pendingFile.lineInputs ?? pendingFile.content,
      renames,
      Array.from(removedSpeakers),
      documentTitle.trim(),
      authorName.trim(),
      outputFormat,
    );
  }, [pendingFile, speakerNames, removedSpeakers, documentTitle, authorName, outputFormat, processAndSave]);

  useEffect(() => {
    const unlisten = getCurrentWindow().onDragDropEvent((event) => {
      const payload = event.payload;
      if (payload.type === "enter" || payload.type === "over") {
        setIsDragOver(true);
      } else if (payload.type === "leave") {
        setIsDragOver(false);
      } else if (payload.type === "drop" && payload.paths.length > 0) {
        setIsDragOver(false);
        const filePath = payload.paths[0];
        void handleFile(filePath);
      }
    });

    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [handleFile]);

  return (
    <main className="container">
      <h1>Prep Maker</h1>
      <p className="format-label">Premiere Transcript</p>

      <div className="output-format-row">
        <label htmlFor="output-format">Convert to</label>
        <select
          id="output-format"
          value={outputFormat}
          onChange={(e) => setOutputFormat(e.target.value as "prep" | "clipReel")}
        >
          <option value="prep">Transcript to Prep</option>
          <option value="clipReel">Transcript to Interview Clip Reel</option>
        </select>
      </div>

      <div
        className={`drop-zone ${isDragOver ? "drag-over" : ""} ${status}`}
        onDragEnter={() => setIsDragOver(true)}
        onDragLeave={() => setIsDragOver(false)}
        onDragOver={(e) => e.preventDefault()}
      >
        <p className="drop-message">
          {status === "ready" ? dropMessage : message}
        </p>
      </div>

      <p className="hint">Removes timecodes from Premiere-style transcripts</p>

      {pendingFile && (
        <div className="modal-overlay" onClick={() => setPendingFile(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Convert transcript</h2>
            <p className="modal-hint">
              {pendingFile.speakers.length > 0
                ? "Enter a name for each speaker. Check &quot;Remove label&quot; to drop the name but keep their lines."
                : "No speaker labels (Speaker 1, Speaker 2) found. Content will be exported as-is."}
            </p>
            <div className="meta-inputs">
              <div className="meta-row">
                <label htmlFor="doc-title">Document title</label>
                <input
                  id="doc-title"
                  type="text"
                  placeholder="e.g. Carrie Interview Prep"
                  value={documentTitle}
                  onChange={(e) => setDocumentTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleProcessWithSpeakers()}
                />
              </div>
              <div className="meta-row">
                <label htmlFor="author-name">Author</label>
                <input
                  id="author-name"
                  type="text"
                  placeholder="e.g. John Smith"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleProcessWithSpeakers()}
                />
              </div>
            </div>
            {pendingFile.speakers.length > 0 && (
            <div className="speaker-inputs">
              {pendingFile.speakers.map((speaker) => (
                <div key={speaker} className="speaker-row">
                  <label htmlFor={`speaker-${speaker.replace(/\s+/g, "-")}`} className="speaker-label">{speaker}</label>
                  <input
                    id={`speaker-${speaker.replace(/\s+/g, "-")}`}
                    type="text"
                    placeholder={`e.g. Carrie`}
                    value={speakerNames[speaker] ?? ""}
                    onChange={(e) =>
                      setSpeakerNames((prev) => ({ ...prev, [speaker]: e.target.value }))
                    }
                    onKeyDown={(e) => e.key === "Enter" && handleProcessWithSpeakers()}
                    disabled={removedSpeakers.has(speaker)}
                  />
                  <label className="remove-checkbox">
                    <input
                      type="checkbox"
                      checked={removedSpeakers.has(speaker)}
                      onChange={(e) =>
                        setRemovedSpeakers((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(speaker);
                          else next.delete(speaker);
                          return next;
                        })
                      }
                    />
                    Remove label
                  </label>
                </div>
              ))}
            </div>
            )}
            <div className="modal-actions">
              <button type="button" onClick={() => setPendingFile(null)}>
                Cancel
              </button>
              <button type="button" onClick={handleProcessWithSpeakers}>
                Process
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
