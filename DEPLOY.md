# DEPLOY.md — Get Big Pickle AI online (free, no card)

There are 5 steps. Everything is free and nothing runs on your PC. ~20 minutes total.

- **Step 1** — Create the Discord bot (token + invite)
- **Step 2** — Get a free Gemini API key
- **Step 3** — Push this folder to GitHub
- **Step 4** — Deploy to Render (free tier)
- **Step 5** — Add a HetrixTools 1-minute keep-alive monitor

---

## Step 1 — Discord bot

1. Go to **https://discord.com/developers/applications** and click **New Application**.
   Name it **Big Pickle AI** (this shows as the bot's name). Click **Create**.
2. Left sidebar → **Bot** → click **Reset Token** → **Copy** the token.
   → Paste it somewhere safe (a scratch file you'll delete). Treat it like a password —
   never share it or commit it.
3. Still under **Bot**, scroll to **Privileged Gateway Intents** and enable
   **Message Content Intent** (required for the bot to read mentions). Save changes.
4. Left sidebar → **OAuth2 → URL Generator**:
   - Scopes: check **bot** and **applications.commands**
   - Bot permissions: **Send Messages**, **Read Message History**, **Use Slash Commands**,
     **Embed Links** (optional: **Create Public Threads**, **Send Messages in Threads**)
   - Copy the generated **Invite URL**, open it in a browser, and add the bot to your server.
     (Create a server if you don't have one — the green **+** on the sidebar.)
5. You should now see **Big Pickle AI** appear in your server's member list.

---

## Step 2 — Free Gemini API key

1. Go to **https://aistudio.google.com/apikey** and sign in with a Google account.
2. Click **Create API key** → select a project → copy the key.
   No credit card. This key is free for Flash models (~1,500 requests/day).
3. Keep it with your Discord token. The default model is `gemini-3.6-flash`.
   If the model name ever errors, open AI Studio and check the current Flash model name,
   then set `GEMINI_MODEL` in Render (Step 4) to it.

---

## Step 3 — Push to GitHub

1. Create a free account at **https://github.com** (if you don't have one).
2. Click **+** → **New repository** → name it `big-pickle-discord` → make it **Private** →
   **Create repository** (leave everything else as-is; don't add a README).
3. In a terminal on your PC, run these (replacing `YOUR_USERNAME`):
   ```bash
   cd big-pickle-discord
   git init
   git add .
   git commit -m "Big Pickle AI Discord bot"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/big-pickle-discord.git
   git push -u origin main
   ```
   (The folder already has a `.gitignore` so `node_modules` and `.env` stay out.)

---

## Step 4 — Deploy to Render (free tier, no card)

1. Create a free account at **https://render.com** — click **Sign Up** and use **Continue
   with GitHub** (easiest). No credit card needed.
2. Dashboard → **New +** → **Web Service**.
3. Connect your GitHub account → choose the **big-pickle-discord** repo.
4. Settings:
   - **Name**: `big-pickle-discord` (this becomes `https://big-pickle-discord.onrender.com`)
   - **Region**: nearest to you
   - **Branch**: `main`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node bot.js`
   - **Instance Type**: **Free** ($0)
   - **Create Web Service**. Render will build and deploy automatically.
5. **First deployment:** it will start, fail on the missing env vars, and show you the
   URL — that's expected. We set the secrets now:
   - Dashboard → your service → **Environment** → **Add Environment Variable**:
     - `DISCORD_TOKEN` = your bot token (Step 1)
     - `GEMINI_API_KEY` = your Gemini key (Step 2)
   - Click **Save Changes** → Render redeploys automatically.
6. **Second deployment:** after it's live, note the URL
   (`https://big-pickle-discord.onrender.com`). Add one more env var:
   - `PUBLIC_URL` = `https://big-pickle-discord.onrender.com`
   - Save → redeploys.
7. Watch the **Logs** tab: you should see `Logged in as Big Pickle AI#1234` and
   `Registered /ask slash command`. Your bot is now online in your server.

> The `PUBLIC_URL` env var lets the bot **self-ping its own `/ping` endpoint every
> 4 minutes**, which stops Render's free tier from putting it to sleep after 15 idle
> minutes.

---

## Step 5 — HetrixTools 1-minute monitor (instant wake-up)

If the bot ever does sleep (e.g., Render restarts it), the monitor wakes it within a
minute.

1. Create a free account at **https://hetrixtools.com** (no card).
2. **Add New Monitor** → type **HTTP(S)**.
3. **Check URL**: `https://big-pickle-discord.onrender.com/ping`
4. **Check Interval**: **60 seconds** (1 minute).
5. Save. That's it — the bot gets pinged every minute, so worst-case recovery from a
   sleep is ~1–2 minutes.

> HetrixTools free accounts need you to log in at least once every ~90 days or the
> account is paused. Add a calendar reminder if you want to be safe.

---

## Test it

In your Discord server:
- `@Big Pickle AI` hello
- Reply to one of its messages to continue the conversation
- `/ask what's your favorite kind of pickle?`
- DM the bot directly

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Bot never comes online | Check Render **Logs**. `Missing DISCORD_TOKEN` / `Missing GEMINI_API_KEY` → add the env vars (Step 4.5) |
| `Logged in` but no `/ask` | Wait ~30s for command registration, or re-invite the bot with the `applications.commands` scope (Step 1.4) |
| Bot doesn't see @mentions | **Message Content Intent** isn't enabled (Step 1.3) |
| Gemini API errors in logs | Wrong/missing key, or model name outdated → set `GEMINI_MODEL` to the current Flash model |
| Bot offline briefly after a Render restart | Normal for free tier; HetrixTools wakes it within ~1 min |
| Bot unresponsive but "online" | It hit Gemini's rate limit; it retries 3 times automatically, then says to try again |

---

## Notes
- Free-tier Gemini may use your prompts to improve Google's products — avoid sharing
  personal/sensitive data with the bot.
- Cost stays $0 as long as you use the free instance type and the free Gemini tier.
