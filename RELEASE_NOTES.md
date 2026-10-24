Devbuild 60: usable items
- Lua scripts can now create Tool objects (Instance.new('Tool') inside the player's Backpack). A hotbar appears at the bottom of the screen: keys 1-9 or a tap equip a tool, a click or tap fires its Activated event (Equipped, Unequipped and Humanoid:EquipTool also work).
- The mouse click now reaches Lua scripts (UserInputService MouseButton1), so the Arena mode works with click as well as F.
- New Armory template with a sword, a medkit and a flare as an example.
- The 3DS does not run Lua scripts, so tools are web only for now.
