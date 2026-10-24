Blocksy is a multiplayer block-building game for the web and the Nintendo 3DS (homebrew), with shared worlds, chat and friends.

## What's new since 1.3.0

### Changes
- Game pages with images, and publish, link-only and private visibility in Studio, web and 3DS.
- Studio redesigned like Roblox Studio: docked Explorer, Properties, Toolbox and Output panels.
- 3DS plays the web playlist (mp3) with music and volume settings.
- New multiplayer templates: PvP Arena, Teams with on-screen score, and Lap race with standings.
- New worlds: Desert, Caves and City, identical on the web and on the 3DS.
- Equippable tools with an in-game hotbar (Lua Tool objects) and an Armory template; mouse clicks now reach scripts.
- Weekly missions and seasons with limited cosmetic rewards (needs supabase/auth/v16.sql and supabase/store/v16.sql).
- Reusable components (save parts or scripts and reuse them across games) and an Animator for parts and custom avatar emotes.
- Real-time collaboration in the Studio: share a link and edit parts and script together; the owner saves.
- Clans with chat and shared games, dated meetups with reminders, and image or voice messages in private chats (needs supabase/auth/v17.sql).
- Moderation panel with server-side suspensions and content blocking, a report button on private messages, and total visit counters on games (needs supabase/auth/v18.sql and the updated game-session function).

## Installing
- Install `Blocksy.cia` with FBI, or copy `Blocksy.3dsx` to the `3ds` folder of the SD card and run it from the Homebrew Launcher.
