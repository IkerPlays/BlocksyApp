Devbuild 26: network fixes
- 3DS updater: network settings copied from Iker's Tube (bigger receive buffer, TCP keep-alive, stall detection) for the update check, the download and every Supabase request.
- Web: fixes 'Failed to fetch' when creating a game in Studio and in the shop. If the STORE server does not answer, the web falls back to the previous GAME/AUTH mode instead of failing, and shows a clear message that says what is wrong.
- Web: new-style Supabase keys (sb_publishable_) no longer break the session request.
