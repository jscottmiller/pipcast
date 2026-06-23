# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `bun run dev` — start the app with HMR (electron-vite dev)
- `bun run build` — type-check then bundle main/preload/renderer into `out/`
- `bun run typecheck` — `tsc --noEmit` across `src` and the vite config
- `bun run preview` — run the production build locally

There is no test runner or linter configured. `build` runs `typecheck` as a pre-step, so a clean `bun run build` is the closest thing to a CI gate.

## Architecture

PipCast is an Electron app (three process boundaries) that records the screen with a circular webcam bubble composited on top, then saves an MP4. electron-vite builds each boundary from its own entry point (see [electron.vite.config.ts](electron.vite.config.ts)).

**Main** ([src/main/index.ts](src/main/index.ts)) — owns screen-source selection, permissions, settings persistence, and the save/transcode pipeline. The renderer never touches `desktopCapturer` directly: it sends a source id via `set-capture-source`, and the `setDisplayMediaRequestHandler` resolves the renderer's later `getDisplayMedia()` call to that source. Settings live as JSON in `app.getPath('userData')`. Recordings are saved through a native dialog; WebM blobs are transcoded to MP4 via [transcode.ts](src/main/transcode.ts) (bundled `ffmpeg-static`), MP4 blobs are written straight to disk.

**Preload** ([src/preload/index.ts](src/preload/index.ts)) — the only IPC surface. Exposes a typed `window.pipcast` API via `contextBridge` (contextIsolation on, nodeIntegration off). The renderer's view of this API is hand-mirrored in [src/preload/api.d.ts](src/preload/api.d.ts) — keep both in sync when adding a channel, and add the matching `ipcMain` handler in main.

**Renderer** ([src/renderer/src/main.ts](src/renderer/src/main.ts)) — vanilla TS, no framework. `main.ts` is a state machine (`idle → counting → recording → paused → reviewing`) driving a plain-HTML UI by id lookups. Two other modules do the media work:
- [recorder.ts](src/renderer/src/recorder.ts) — owns the `MediaRecorder`. Picks the best supported MIME (MP4 → WebM/VP9 → WebM/VP8), so output format is runtime-dependent and the WebM→MP4 fallback in main exists for that reason.
- [compositor.ts](src/renderer/src/compositor.ts) — draws screen video + circular webcam bubble onto a canvas each frame and exposes `canvas.captureStream()` as the recorded video track.

### Stream ownership (important)

The webcam+mic stream is acquired once in `main.ts` (`acquireMedia`) and is **long-lived** — it feeds the live self-view and is passed into the recorder by reference. `Recorder.cleanup()` deliberately stops only the screen stream and the compositor, never the webcam stream, so the self-view keeps running after a recording ends. Don't add webcam-track teardown inside the recorder. Mic audio is captured via `getUserMedia` and muxed in at record time; `getDisplayMedia` requests video only.

## Platform notes

macOS is the primary target. Screen Recording permission can't be prompted programmatically, so main surfaces a `SCREEN_PERMISSION_REQUIRED` sentinel and the renderer shows a hint with a deep link to System Settings plus a Retry button. Camera/mic access is requested on app ready and declared in [build/entitlements.mac.plist](build/entitlements.mac.plist). On non-darwin platforms the permission checks short-circuit to `granted`.
