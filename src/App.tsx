import { useState, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readTextFile, writeFile } from "@tauri-apps/plugin-fs";
import { dirname, join } from "@tauri-apps/api/path";
import {
  processPremiereTranscriptToBlocks,
  detectSpeakers,
} from "./processors/premiereTranscript";
import { exportToWordBuffer } from "./exportToWord";
import "./App.css";

type Status = "ready" | "processing" | "success" | "error";

type PendingFile = {
  path: string;
  content: string;
  speakers: string[];
};

function App() {
  const [status, setStatus] = useState<Status>("ready");
  const [message, setMessage] = useState("Drop a transcript file here");
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [removedSpeakers, setRemovedSpeakers] = useState<Set<string>>(new Set());
  const [documentTitle, setDocumentTitle] = useState("");
  const [authorName, setAuthorName] = useState("");

  const processAndSave = useCallback(
    async (
      path: string,
      content: string,
      renames: Record<string, string>,
      toRemove: string[] = [],
      title = "",
      author = "",
    ) => {
      setStatus("processing");
      setMessage("Processing...");
      setPendingFile(null);

      try {
        const blocks = processPremiereTranscriptToBlocks(content, {
          speakerRenames: renames,
          speakersToRemove: toRemove,
        });

        const dir = await dirname(path);
        const baseName = path.split("/").pop() ?? path.split("\\").pop() ?? "output";
        const nameWithoutExt = baseName.replace(/\.(txt|md)$/i, "");
        const outputPath = await join(dir, `${nameWithoutExt}_stripped.docx`);

        const buffer = await exportToWordBuffer(blocks, {
          interviewerSpeakerId: "Speaker 1",
          documentTitle: title,
          authorName: author,
        });
        await writeFile(outputPath, buffer);

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

    try {
      const content = await readTextFile(path);
      const speakers = detectSpeakers(content);

      if (speakers.length > 0) {
        setPendingFile({ path, content, speakers });
        setSpeakerNames(Object.fromEntries(speakers.map((s) => [s, ""])));
        setRemovedSpeakers(new Set());
        setDocumentTitle("");
        setAuthorName("");
      } else {
        await processAndSave(path, content, {}, [], "", "");
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errDetail = err instanceof Error && err.cause ? ` (${String(err.cause)})` : "";
      console.error("[Prep Maker] Error:", path, err, err instanceof Error ? err.stack : "");
      setStatus("error");
      setMessage(`${errMsg}${errDetail}`);
    }
  }, [processAndSave]);

  const handleProcessWithSpeakers = useCallback(() => {
    if (!pendingFile) return;
    const renames: Record<string, string> = {};
    for (const speaker of pendingFile.speakers) {
      const name = speakerNames[speaker]?.trim();
      if (name) renames[speaker] = name;
    }
    void processAndSave(
      pendingFile.path,
      pendingFile.content,
      renames,
      Array.from(removedSpeakers),
      documentTitle.trim(),
      authorName.trim(),
    );
  }, [pendingFile, speakerNames, removedSpeakers, documentTitle, authorName, processAndSave]);

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

      <div
        className={`drop-zone ${isDragOver ? "drag-over" : ""} ${status}`}
        onDragEnter={() => setIsDragOver(true)}
        onDragLeave={() => setIsDragOver(false)}
        onDragOver={(e) => e.preventDefault()}
      >
        <p className="drop-message">{message}</p>
      </div>

      <p className="hint">Removes timecodes from Premiere-style transcripts</p>

      {pendingFile && (
        <div className="modal-overlay" onClick={() => setPendingFile(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Name the speakers</h2>
            <p className="modal-hint">Enter a name for each speaker. Check &quot;Remove label&quot; to drop the name but keep their lines.</p>
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
