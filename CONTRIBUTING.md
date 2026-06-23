# Contributing to PipCast

Thanks for your interest in contributing! This guide covers how to get set up and what we expect from contributions.

## Getting started

1. Fork and clone the repository.
2. Install dependencies with [Bun](https://bun.sh):
   ```bash
   bun install
   ```
3. Start the app in development:
   ```bash
   bun run dev
   ```

See the [README](README.md) for permission setup (Screen Recording, Camera, Microphone on macOS) and [CLAUDE.md](CLAUDE.md) for an architecture overview.

## Development workflow

1. Create a branch off `main` for your change.
2. Make your change, keeping commits focused and cleanup separate from feature work.
3. Type-check, test, and build before opening a PR:
   ```bash
   bun run typecheck && bun run test && bun run build
   ```
   A clean typecheck + green tests is the bar for a PR. There is no linter.
4. Open a pull request describing what changed and why. Include before/after notes or a screen recording for UI changes.

## Coding guidelines

- TypeScript is `strict`, with `noUnusedLocals` and `noUnusedParameters` on — keep the build warning-free.
- Respect the process boundaries: the renderer talks to Electron only through the typed `window.pipcast` bridge. When you add an IPC channel, update all three of [src/preload/index.ts](src/preload/index.ts), [src/preload/api.d.ts](src/preload/api.d.ts), and the `ipcMain` handler in [src/main/index.ts](src/main/index.ts).
- Don't tear down the long-lived webcam/mic stream inside the recorder — see the stream-ownership note in [CLAUDE.md](CLAUDE.md).
- Match the existing style: no framework in the renderer, plain DOM, small focused modules.
- When adding logic with real branches or edge cases, extract it into a pure helper and cover it with a co-located `*.test.ts` (vitest), rather than leaving it inline in a DOM/Electron-bound module. See the testing notes in [CLAUDE.md](CLAUDE.md).

## Reporting issues

Open an issue with clear reproduction steps, your OS and version, and what you expected to happen. For permission-related problems, note which permissions you've granted.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
