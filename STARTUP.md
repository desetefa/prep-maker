# Prep Maker — startup

Use this folder as the **repository root** (open `prep-maker-3` in your editor, not a nested `prep-maker` folder).

## First time only

1. Install **Rust** (required for Tauri): https://rustup.rs/
2. From this directory:

```bash
npm install
```

## Run the desktop app (dev)

From the **project root** (`prep-maker-3`):

```bash
npm run tauri dev
```

This starts **Vite** at http://localhost:1420 and opens the **Prep Maker** window.

## If the Rust build fails with old paths

After moving the repo or changing layout, you may see errors mentioning `prep-maker/src-tauri/...`. Clear the Rust build cache:

```bash
cd src-tauri && cargo clean && cd ..
npm run tauri dev
```

## Quick commands

| Goal | Command |
|------|---------|
| Desktop app (dev) | `npm run tauri dev` |
| Web UI only (no Tauri shell) | `npm run dev` |
| Unit tests | `npm test` |
| Release `.app` (macOS) | `npm run tauri build` |

After `tauri build`, the bundle is under `src-tauri/target/release/bundle/macos/`.

## More detail

See [README.md](./README.md) for features, tests, and project layout.
