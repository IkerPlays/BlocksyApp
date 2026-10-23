Blocksy is a multiplayer block-building game for the web and the Nintendo 3DS (homebrew), with shared worlds, chat and friends.

## What's new since 1.1.0

### Changes
- **Loading tips.** A loading screen with a random tip when you enter a game.
- **Shortcuts panel.** Press ? or F1 in a game to see every keyboard shortcut.
- **Ping and photo mode.** The HUD shows your ping; press H to hide the interface for screenshots.
- **More emotes.** Jump for joy, Cry, Point and Flex, shown on web (the 3DS shows them as idle).
- **Emote wheel.** The emote menu is now a wheel around your character.
- **Quick reactions.** Alt+1 to Alt+4 show +1, GG, LOL or ! above your head for everybody.
- **Footsteps.** Soft footstep sounds while you walk or run.
- **Profile badges.** Pioneer, Regular, Veteran, Social, Collector, Rich and Creator badges on every profile.
- **Play time and last seen.** Profiles show the time played and, for friends, when they were last online.
- **Favorite games.** Add a game to your favorites from its page; they appear on your Home.
- **Private rooms.** Create or join a room with a code from any game page; players in other rooms do not see you.
- **Party chat.** A temporary group chat with a shareable code on the Friends page.
- **Invite everyone.** One button invites every online friend, including to your private room.
- **Emoticons.** A quick emoticon picker in private messages and party chat.
- **Sorting and tags.** Discover can sort by popular, newest, A-Z or top rated and filter by tags; creators add up to 5 tags in the editor.
- **Likes.** Like or dislike a game from its page.
- **Recently played.** Home shows the last games you played.
- **New accessories.** 6 new hats, glasses and masks, capes, wings and a backpack, available in the shop, loot crates and the Avatar page.
- **Trails and pets.** Leave sparks, fire, rainbow or bubbles when you walk, and a little pet follows you around; other players see them.
- **Custom looks.** Choose skin, hair, hairstyle and pants on the web Avatar page; other web players see your choice.
- **Random avatar.** One button to roll a new look and shirt color.
- **Saved outfits.** Save up to four outfits (look, shirt color and accessories) and wear them with one click.
- **Studio shapes.** Spheres, hollow spheres and cylinders fitted inside a box.
- **Studio line and replace.** Draw lines between two points and recolor every block of one color in one click.
- **Studio symmetry.** A mirror mode (X, Z or both) copies everything you build to the other side.
- **Studio drag and drop.** Drag parts with the mouse; hold Shift to lift them.
- **Studio groups and grid.** Parts with the same group name move together; pick a snap grid of 0.25, 0.5 or 1, or none.
- **Studio copy and paste for parts.** Ctrl+C and Ctrl+V duplicate a part (or its whole group).
- **Game templates.** Start a new game from a template: Obby, Social plaza, Collect coins or Platforms and lava (with ready-made Lua).
- **Export and import.** Export a whole game (blocks, parts, rules and script) from Studio and import it from the Create page.
- **Studio explorer and autosave.** A list of every part in the game, and Studio saves by itself every minute.
- **Lua DataStore.** DataStoreService:GetDataStore with GetAsync, SetAsync, UpdateAsync, IncrementAsync and RemoveAsync; data stays in the player's browser.
- **Lua raycast and regions.** Workspace:Raycast and part queries by radius, box or overlap.
- **Lua sounds.** Sound objects play built-in effects (coin, laser, boom, powerup, hit...); blocksy://name picks one, any Roblox id maps to one.
- **Lua teams.** Team and Teams service; a team's color paints the name of its players.
- **Lua BillboardGui and animations.** Labels floating over parts, and Humanoid:LoadAnimation to play emotes from scripts.
- **More chat commands.** /me, /pos, /ping and /clear, and /help now lists the commands created by the game's script.
- **Multiplayer Lua.** RemoteEvent now travels between every player in the game (FireServer, FireClient, FireAllClients) and RunService:IsServer() tells you who is the server.
- **Four multiplayer modes.** Ready-made templates in Create: Tag, Steal the flag, Waves of monsters and Hide and seek, all written in Lua.
- **Weather.** Rain and snow for any game, set in the editor or from a Lua script.
- **Fog.** Choose how far players can see; Lighting.FogEnd works from Lua.
- **Music per game.** Creators pick which song from the playlist plays in their game.
- **Double jump.** Creators can enable a double jump for their game.
- **Crouch.** Hold C to walk slowly in a crouch, visible to everyone.
- **Climb and swim.** Parts named Ladder (or marked climbable) can be climbed, and parts with the Water material let you swim.
- Compass strip, map pings (B) shared with the room and shown on the minimap, and a health bar driven by Humanoid.Health.
- Accessibility: colorblind filters, text size, sound captions and rebindable keys.
- Mobile: vibration, rotate hint, battery saver and native game sharing.
- Achievements page, BCoins ranking (AUTH v15.sql), daily chest countdown and shop wish list.
- Chat word filter, per-match mute, visible game rules and chat anti-spam.
- 3DS: Portuguese language, profile summary, race top times and rain/snow weather.
- 3DS: photo mode (L+R), footstep dust and Dark Forest difficulty setting.
- What's new, credits, error log and bug report on the web; favorites on the 3DS.
- Page transitions, skeleton loaders, high contrast theme and interface sounds.

## Installing
- Install `Blocksy.cia` with FBI, or copy `Blocksy.3dsx` to the `3ds` folder of the SD card and run it from the Homebrew Launcher.
