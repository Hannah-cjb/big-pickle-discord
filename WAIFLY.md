# Deploy Big Pickle AI to Waifly (free 24/7, replaces Render)

Waifly is a free, forever, no-credit-card host that runs Node.js 24/7 with no
sleep. This deploys the original **Node** bot (`bot.js`) — more reliable for
always-on than the Streamlit/Python variant, and it's the exact logic that was
working on Render.

## Step 1 — Set up the bot's secrets on your machine

`bot.js` reads from `.env` and/or environment variables. On Waifly you set env
vars in the panel, so you don't strictly need a local `.env`. Required vars:

- `DISCORD_TOKEN` — your Discord bot token
- `GEMINI_API_KEY` — your Groq key (`gsk_...`)
- `GEMINI_MODEL` — e.g. `llama-3.3-70b-versatile` or `llama-3.1-8b-instant`
- `GEMINI_ENDPOINT` — `https://api.groq.com/openai/v1/chat/completions`
- `PUBLIC_URL` — optional; only used for the old Render self-ping. Can leave blank on Waifly.

Optional list vars (comma-separated IDs, or via the .txt files):
- `BLOCKED_USERS`, `SLOW_USERS`, `RESPECTED_USERS`, `WATCH_CHANNELS`
- The `.txt` files (`blocked-users.txt`, etc.) are read if they exist on the server.

## Step 2 — Create a Waifly account + server

1. Go to **https://dash.waifly.com** → **Register** (no card).
2. In the dashboard **Servers** tab → **Create** a server.
3. Name it `big-pickle`.
4. Choose the **NodeJS** egg.
5. Location: **FR2 Paris** (default).
6. Free plan resources are fixed (30% CPU / 300 MB RAM / 1 GB disk) — fine for the bot.

## Step 3 — Upload the files (Pterodactyl panel)

1. Open the server → **panel.waifly.com** → **Files**.
2. Upload the project files into the home directory:
   - `bot.js`
   - `package.json`
   - `persona.md`
   - `extra-rules.md`
   - `blocked-users.txt`
   - `slow-users.txt`
   - `respected-users.txt`
   - `known-users.txt`
   - `watched-channels.txt`
   - (do NOT upload `.env` — set vars in the panel instead; it's ignored anyway)
3. Use the **Startup** tab (or Console) to run `npm install` once:
   - `npm install` (installs `discord.js` + `dotenv`)

## Step 4 — Set environment variables (panel)

1. In the Pterodactyl panel open **Startup** (or the server's **Env** section).
2. Add the env vars from Step 1 (`DISCORD_TOKEN`, `GEMINI_API_KEY`, etc.).
3. Make sure the **start command** is: `node bot.js`

## Step 5 — Start it

1. Press **Start** in the panel.
2. Watch the **Console** for: `Logged in as ...` and `Registered /ask...` — that
   means it's online.
3. Test in Discord with `@Big Pickle AI` and `/ask`.

## Keeping it alive

- Waifly runs 24/7 with **no sleep**, so no keep-alive is needed.
- Only rule: the anti-abuse policy suspends a server that is **left offline for
  3 days**. As long as it's running, you're fine.
- Your single **free** server slot is used by this bot.

## Troubleshooting

- `npm install` fails → confirm you picked the **NodeJS** egg and have a network
  connection in the panel; retry.
- Bot logs in but ignores messages → make sure **Message Content Intent** is
  enabled for the bot in the Discord Developer Portal.
- Groq `429 / pickles got tangled` → hitting the free daily/minute cap; switch
  `GEMINI_MODEL` to `llama-3.1-8b-instant` for a higher daily cap, or enable
  Groq's free Developer tier (card on file, no minimum).
