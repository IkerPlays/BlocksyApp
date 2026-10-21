# Notes for Claude (repository workflow)

Same release system as Iker's Tube.

- Layout: `web/` (Netlify), `3ds/` (devkitARM, `.3dsx` + `.cia`), `supabase/` (SQL + Edge Function).
- `VERSION` (repo root) = core version of the next release (MAJOR.MINOR.PATCH).
- Pushes do NOT publish anything. A devbuild (`v<version>-dev.N`) is created by hand: Actions > Build 3DSX + CIA > Run workflow on `main`
  (or `actions_run_trigger` with workflow `build.yml`, ref `main`). Do it when several commits have piled up, and before finishing a session.
  Each devbuild run prunes the list: only the newest 15 devbuilds of each version line are kept (`.github/scripts/prune-devbuilds.sh`).
  Pull requests only build (web + 3DS), nothing is published.
- Devbuild version = `max(VERSION, latest stable + 1 patch)-dev.<run number>`.
- `RELEASE_NOTES.md` = notes of the CURRENT devbuild only (English, plain text, no emojis). Replace its content with what the push adds.
- `STABLE_RELEASE_NOTES.md` = everything new since the LAST stable release (base = the commit the latest stable tag vX.Y.Z was built from;
  check it at the start of a session). Add each new feature to the list. When the owner publishes a stable release, rewrite the file for
  the next one: keep the intro line and the Installing section. English, plain text, no emojis.
- Stable release: Actions > "Stable release" > Run workflow on `main`, type the version (for example 0.1.0), optional draft. It reads
  `STABLE_RELEASE_NOTES.md`. Afterwards bump `VERSION` if needed.
- "Releases maintenance" workflow: `backup` (archive every release), `prune`, `republish`, `restructure` (needs RELEASES_PAT).
- GitHub secrets for the 3DS build: `AUTH_SUPABASE_URL`, `AUTH_SUPABASE_ANON_KEY`, `GAME_SUPABASE_URL`, `GAME_SUPABASE_ANON_KEY`.
- Compile the 3DS locally before pushing: `docker run --rm -v $PWD/3ds:/src -w /src devkitpro/devkitarm make` (needs `3ds/source/config.h`).
- 3DS UI preview without a console: see `3ds/preview/README.md` (renders every screen to PNG on the PC). Use it after any UI change in `3ds/source/ui.c` or `app.c`.
- 3DS auto update (`3ds/source/update.c`): reads https://api.github.com/repos/IkerPlays/BlocksyApp/releases, so every release must keep the assets named `Blocksy.cia` and `Blocksy.3dsx` and tags like `v0.1.0` (stable) / `v0.1.1-dev.N` (pre-release).
- Creating games is web-only and restricted by the server: `sessions.can_create` is set by the `game-session` function from `CREATOR_EMAILS` (default: the owner email). Do not add it to the 3DS.
- The 3DS updater and the README QR read the releases without logging in, so the repository must be PUBLIC.
- Avatar look is derived from the username with FNV-1a (web/src/avatar.js and 3ds/source/avatar3d.c MUST stay identical: palettes, hash, hair style). Emotes travel in player_state.anim (wave, dance, cheer, clap, sit; max 12 chars). The 3DS title version (makerom -ver) is the commit count (APP_VER) so every .cia is newer than the installed one; keep fetch-depth: 0 in the build jobs.
- Web game preview without Supabase: web/preview/README.md.
