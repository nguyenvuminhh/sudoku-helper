# Desktop Packaging Design

## Goal

Package Puzzle Hint as one desktop app codebase that can produce a macOS `.dmg`
and a Windows `.exe` installer.

The desktop app should preserve the existing product architecture:

- FastAPI backend in `backend/app`.
- Static Next.js frontend in `frontend`.
- Production frontend build in `frontend/out`.
- FastAPI API routes under `/api/sudoku/*`.

The desktop work should not fork the Sudoku UI, solver, OCR, or API behavior.

## Recommended Approach

Use Tauri as the desktop wrapper.

Tauri gives one cross-platform desktop project that can package the same app for
macOS and Windows. It also keeps installer size lower than Electron because it
uses the operating system webview instead of bundling Chromium.

The app will have platform-specific build outputs, but not platform-specific
product code:

- macOS: `.dmg`
- Windows: `.exe` installer

Platform-specific details are limited to icons, signing/notarization settings,
installer metadata, and bundled executable paths.

## Alternatives Considered

### Electron

Electron would also support one codebase and both installers. It is easier when
an app is already Node-centric, but Puzzle Hint's runtime core is Python plus a
static frontend. Electron would add a larger Chromium runtime without giving a
meaningful product benefit at this stage.

### Native Rewrite

A native Swift or Windows UI would produce a more platform-native app, but it
would duplicate the existing frontend and substantially increase maintenance.
That is not appropriate for the first desktop release.

## Architecture

Add a desktop package alongside the existing backend and frontend. The desktop
wrapper owns only application lifecycle:

1. Build the static frontend with `npm run build` in `frontend`.
2. Package the built frontend output as the UI shown in the desktop window.
3. Start a local FastAPI backend process on app launch.
4. Point frontend API calls to the local backend.
5. Stop the backend process when the desktop app exits.

The backend remains the source of truth for Sudoku validation, hints, puzzle
generation, and server-side image OCR fallback. The frontend remains the source
of truth for the tutor workspace and browser-first image recognition.

## Backend Packaging

The first implementation should use PyInstaller to produce a backend executable
for each target platform. Tauri will bundle that executable as a sidecar.

The sidecar starts Uvicorn with `backend.app.main:app` and a desktop-specific
static directory. The static directory should resolve from packaged resources,
not from the source checkout.

The first implementation should use fixed loopback port `48731`. The wrapper
must run a startup health check against `http://127.0.0.1:48731/api/health`
before showing the app. If the port is unavailable or the backend does not
become healthy, the wrapper must report a clear error.

## Frontend Configuration

For desktop builds, `NEXT_PUBLIC_API_BASE_URL` should point at the local backend
origin used by the wrapper. Browser-first OCR assets in `frontend/public/vendor`
and `frontend/public/models` must remain included in the static export.

No external AI service should be added for image import.

## Developer Commands

Add focused commands for desktop development and packaging:

- `make desktop-deps`: install desktop dependencies.
- `make desktop-dev`: run the desktop app in development.
- `make desktop-frontend`: build the static frontend for desktop.
- `make desktop-backend`: build the backend sidecar for the current platform.
- `make desktop-build`: build the desktop installer for the current platform.

Existing commands for backend tests and frontend checks should continue to work.

## Testing

Add tests around the desktop release files and build configuration so future
changes do not silently remove the packaging path.

Verification for implementation should include:

- `python3 -m unittest discover -s tests -v`
- `cd frontend && npm test -- --run`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
- Desktop package config validation or a dry build command where available.

Full `.dmg` and `.exe` generation depends on the host operating system and
installed packaging toolchains. A macOS host can build and verify the macOS
package first. Windows packaging should be documented and configured from the
same codebase even if it is built on a Windows runner later.

## Scope Boundaries

This design does not change Sudoku rules, solver behavior, image import logic,
or the main tutor workspace UI. The desktop wrapper should expose the existing
app in a desktop window and make offline local use practical.

Code signing, notarization, auto-update, and app store distribution are out of
scope for the first implementation. The package metadata should leave a clear
place for those values later.
