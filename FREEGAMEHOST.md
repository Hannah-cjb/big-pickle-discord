# Deploy Big Pickle AI to FreeGameHost (free 24/7, replaces Render)

FreeGameHost is a free-forever, no-credit-card host that runs Node.js/discord.js
bots 24/7 with 512 MB RAM. It is reachable/working (Waifly email and Kerit
Discord both failed, so this is the backup). Runs `bot.js` as-is.

## Caveat: daily renewal
Uptime works on a "Renew" model — each renewal adds 8h of runtime, up to 24h.
**Renew once a day** from the panel to keep the bot online continuously. If you
skip a day, the bot stops until renewed. (A real trade-off for a free host.)

## Step 1 — Secrets (env vars)
Required on the server:
- `DISCORD_TOKEN`
- `GEMINI_API_KEY` (Groq `gsk_...`)
- `GEMINI_MODEL` (`llama-3.3-70b-versatile` or `llama-3.1-8b-instant`)
- `GEMINI_ENDPOINT` = `https://api.groq.com/openai/v1/chat/completions`

Optional: `BLOCKED_USERS`, `SLOW_USERS`, `RESPECTED_USERS`, `WATCH_CHANNELS`
(comma-separated IDs), or rely on the `.txt` files in the repo.

## Step 2 — Account + server
1. **panel.freegamehost.xyz** → register (email, no card).
2. Create a server / deploy panel → choose **Node.js** runtime.
3. Upload files via file manager or SFTP: `bot.js`, `package.json`,
   `persona.md`, `extra-rules.md`, and the list `.txt` files.
4. Panel console: `npm install` (installs discord.js + dotenv).

## Step 3 — Env vars + start
1. Set the env vars from Step 1 in the panel.
2. Start command: `node bot.js`.
3. **Start** → console shows `Logged in as ...` + `Registered /ask...`.
4. Test `@Big Pickle AI` / `/ask` in Discord.

## Step 4 — Keep it running
- **Renew daily** in the panel (adds 8h; up to 24h). A once-a-day renewal keeps
  it up 24/7.
- Backups are automatic.

## Troubleshooting
- Ignoring messages → enable **Message Content Intent** for the bot in the
  Discord Developer Portal.
- Groq `429 / pickles got tangled` → switch `GEMINI_MODEL` to
  `llama-3.1-8b-instant` (higher daily cap) or enable Groq's free Developer tier.
