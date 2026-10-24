Devbuild 64: clans, meetups, and image or voice messages
- Clan page: create or join a clan (up to 30 members, one clan per person) with its own live chat, a list of shared games with Play buttons, and kick or leave options.
- Meetups page: schedule a game at a date and time (public or clan only), say you are going, and get a reminder 10 minutes before and when it starts (while Blocksy is open).
- Private chats can now send images and voice notes (up to 60 seconds). Files are stored in a private bucket and only the two people in the chat can open them.
- Needs supabase/auth/v17.sql on the AUTH project. Without it the new pages explain what is missing and chat keeps working with text.
