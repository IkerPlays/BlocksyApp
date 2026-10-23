Blocksy is a multiplayer block-building game for the web and the Nintendo 3DS (homebrew), with shared worlds, chat and friends.

## What's new since 1.0.0

### Changes
- **Dark Forest.** A new game: at night, with a flashlight, find the 5 light shards with your friends and run from the monster. Web and 3DS (the monster is shared: whoever is in the game moves it).
- **Accessories.** Change your hat and title from the Avatar page on web and 3DS. Hats are now visible to every player, on web and 3DS.
- **Studio 2.** Box fill (solid, hollow, clear), paint, eyedropper, select with copy, cut and paste, ready-made structures (house, tower, bridge, wall, stairs, pyramid, tree, arch...), undo and redo (Ctrl+Z / Ctrl+Y), parts with size, color, shape and material, spawn points and an Environment panel (sky, gravity, speed, jump, welcome message, rules).
- **Roblox-style Lua.** Scripts can use Instance.new, Parts, game:GetService, Players, Humanoid, TweenService, RunService, UserInputService, Lighting, Debris, CollectionService, ScreenGui / TextLabel / TextButton, ClickDetector, ProximityPrompt, leaderstats, Touched, task.wait and more. Luau syntax (+=, continue, type annotations, `{variable}` strings) works too. See the API reference in the script editor.
- **3DS build controls.** Games without building (Dark Forest, Plaza, Obby, Arena) no longer show the block palette, the outline or the build hints on the 3DS.
- **3DS shop.** If a purchase fails, the 3DS shows the real reason; it also falls back to the old shop when the new server is not reachable.
- **Safety.** Block and report players, daily missions with BCoin rewards, and 14 languages on the web chosen automatically from your browser.
- **Best times.** Obby and race finish times are saved on the server and everyone sees the top 5 and their rank (web and 3DS; supabase/game/v5.sql).
- **More languages.** Portuguese, French, German and Italian are fully translated on the web (Russian, Polish, Japanese, Chinese and Korean cover the main screens); the language follows your browser unless you pick one.
- **Bulk edits.** The server accepts many blocks at once (supabase/game/v5.sql), so Studio boxes and structures are fast.

## Installing
- Install `Blocksy.cia` with FBI, or copy `Blocksy.3dsx` to the `3ds` folder of the SD card and run it from the Homebrew Launcher.
