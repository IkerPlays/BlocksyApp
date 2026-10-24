Devbuild 61: weekly missions and seasons
- Shop page: new Weekly missions (5 goals that reset every Monday, with BCoins rewards) and a Season panel (28 days, 10 levels, 100 points per level).
- Claiming a daily mission gives 10 season points and a weekly one 60. Every level gives BCoins; level 5 gives a limited trail and level 10 a limited title of that season. They cannot be bought and cannot be earned after the season ends.
- The 3DS shop ignores season-only items.
- Needs two SQL files: supabase/auth/v16.sql (AUTH) and supabase/store/v16.sql (STORE). Without them these panels just stay hidden.
