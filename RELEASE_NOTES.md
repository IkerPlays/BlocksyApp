Devbuild 65: moderation panel and visit counter
- New Moderation page (only for staff accounts): review open reports, dismiss or resolve them, warn a user, suspend or unsuspend accounts for N days or forever, block a reported game, delete a reported private message, look up a user, and see a log of every action. Staff can open the images and voice notes of messages that were reported.
- Suspensions are enforced on the server: a suspended account cannot send messages, clan chat, friend requests, meetups or create clans, and (with the updated game-session function) cannot open a game session. Blocked games disappear from lists on the web and on the 3DS.
- Private messages now have a report button on received messages.
- Every game now shows its total visits (web game page and card, and the 3DS game card). A visit is one entry into a game; the same person counts once every 10 minutes. The 3DS counts its own visits when logged in with email.
- Needs supabase/auth/v18.sql, then make yourself admin with the insert shown at the top of the file, and redeploy the game-session Edge Function on GAME and STORE.
