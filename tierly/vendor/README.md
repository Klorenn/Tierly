# Stockfish.js 18 vendor provenance

The unchanged `stockfish-18-lite-single.js` and `stockfish-18-lite-single.wasm` are the lite single-threaded WebAssembly variant from the official [nmrugg/stockfish.js v18.0.0 release](https://github.com/nmrugg/stockfish.js/releases/tag/v18.0.0). Copyright and attribution are preserved in the JS header. GPL version 3 is included verbatim in [Copying.txt](Copying.txt), retrieved from that upstream tag.

On 2026-09-28, both local files were SHA-256 compared against fresh downloads of those exact upstream release assets and matched byte for byte:

| File | SHA-256 |
|---|---|
| stockfish-18-lite-single.js | 2278005057f381491f1c9bb3e44c9f5920b3a00bef9759e33cc6582769a1f1fe |
| stockfish-18-lite-single.wasm | a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1 |

Asset URLs:
- https://github.com/nmrugg/stockfish.js/releases/download/v18.0.0/stockfish-18-lite-single.js
- https://github.com/nmrugg/stockfish.js/releases/download/v18.0.0/stockfish-18-lite-single.wasm

## Corresponding source and building

The upstream tag resolves to commit [`31a98753a5d932511693f44775da908377c24513`](https://github.com/nmrugg/stockfish.js/tree/31a98753a5d932511693f44775da908377c24513). Full corresponding source, build scripts and network definitions are available in the [source archive](https://github.com/nmrugg/stockfish.js/archive/31a98753a5d932511693f44775da908377c24513.tar.gz). Preserve this source availability when redistributing these artifacts; Tierly does not modify the engine.

Follow the pinned [upstream compilation instructions](https://github.com/nmrugg/stockfish.js/blob/31a98753a5d932511693f44775da908377c24513/README.md#compiling) and [build script](https://github.com/nmrugg/stockfish.js/blob/31a98753a5d932511693f44775da908377c24513/build.js). This tag expects Emscripten 3.1.7, Node.js and a working make/compiler toolchain. From the extracted source root with the Emscripten environment loaded, run:

```sh
node build.js --single-threaded --lite -f
```

The build script downloads/ensures the required neural networks and supports `--help` for build options. No rebuild was performed here; the verified evidence is equality with official release artifacts, not a claim of reproducible compilation. The upstream package.json at this tag still says 17.1.0; the release tag and bundled engine header identify these verified artifacts as 18.
