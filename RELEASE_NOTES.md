Devbuild: updater rewritten
- 3DS updater rebuilt from scratch: downloads are verified (size and SHA-256 published by GitHub) before anything is installed.
- Interrupted downloads resume from the byte where they stopped; staged progress with speed and time left.
- .3dsx updates keep a backup and can go back to the previous version; a toast confirms the new version after restarting.
- The update page lists what changes in each new version and the download size.
- New 3DS: runs at full speed and draws more blocks at a longer distance.
