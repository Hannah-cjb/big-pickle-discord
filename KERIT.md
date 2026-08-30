# Deploy Big Pickle AI to Kerit Cloud (free 24/7, replaces Render)

Kerit Cloud offers a forever-free Discord bot plan: 256 MB RAM / 30% CPU /
2 GB NVMe, **no sleep, no credit card**, Node.js LTS (18/20/22), automatic
dependency install, and **Git deploy** so it can pull straight from your
GitHub repo. Runs `bot.js` (Discord.js v14) exactly as it ran on Render.

## Step 1 — Your secrets

`bot.js` reads env vars. Required:
- `DISCORD_TOKEN` — Discord bot token
- `GEMINI_API_KEY` — Groq key (`gsk_...`)
- `GEMINI_MODEL` — e.g. `llama-3.3-70b-versatile` or `llama-3.1-8b-instant`
- `GEMINI_ENDPOINT` — `https://api.groq.com/openai/v1/chat/completions`

Optional (comma-separated IDs in env, or the `.txt` files on the server):
`BLOCKED_USERS`, `SLOW_USERS`, `RESPECTED_USERS`, `WATCH_CHANNELS`.

## Step 2 — Create a Kerit Cloud account + server

1. Go to **https://kerit.cloud/discord** → `Get Started Free` → sign up (email,
   no card).
2. Choose the **free** plan (₹0 forever).
3. Pick a **region** (Virginia/Frankfurt/India etc. — closest to your community).
4. Runtime: **Node.js**.
5. Deploy method: **Git deploy** → connect your GitHub repo
   `Hannah-cjb/big-pickle-discord` (branch `main`). Dependencies
   (`npm install`) run automatically.

## Step 3 — Set environment variables

In the control panel, open your server → **Environment/Variables** and add the
secrets from Step 1. Make sure the **start command** is `node bot.js`.

## Step 4 — Start it

1. Start the server.
2. Watch the **console** for `Logged in as ...` and `Registered /ask...`.
3. Test `@Big Pickle AI` and `/ask` in Discord.

## Keeping it alive

- Kerit runs 24/7 with **no sleep** on the free tier → nothing else needed.
- Auto-restart is included on every plan.
- Free tier is one bot server — this uses it.

## Troubleshooting
- Logs show `Discord Gateway` errors → check `DISCORD_TOKEN` and that the bot's
  **Message Content Intent** is enabled in the Discord Developer Portal.
- Groq `429 / pickles got tangled` → hit free limit; switch `GEMINI_MODEL` to
  `llama-3.1-8b-instant` (higher daily cap) or enable Groq's free Developer
  tier.
