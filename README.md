# Prep Maker

A Mac app that strips timecodes from Premiere-style transcripts. Drag a transcript file into the drop zone and it saves a clean version next to the original.

## Features

- **Premiere Transcript** format: removes lines like `00:00:03:17 - 00:00:10:01`
- Preserves speaker labels (Speaker 1, Speaker 2) and dialogue
- Saves output as `{filename}_stripped.txt` in the same folder

## Setup

1. **Install Rust** (required for Tauri): https://rustup.rs/

2. Install dependencies and run:

```bash
cd prep-maker
npm install
npm run tauri dev
```

To build the Mac app:

```bash
npm run tauri build
```

The `.app` bundle will be in `src-tauri/target/release/bundle/macos/`.

## Tests

```bash
npm run test
```

## Project Structure

```
prep-maker/
├── src/
│   ├── App.tsx              # Main UI with drop zone
│   ├── processors/
│   │   ├── premiereTranscript.ts   # Timecode removal logic
│   │   └── __tests__/             # Unit tests
│   └── ...
├── src-tauri/               # Rust backend (file I/O, plugins)
└── ...
```
