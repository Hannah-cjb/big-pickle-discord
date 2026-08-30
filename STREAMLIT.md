# Deploy to Streamlit Community Cloud (replaces Render)

This version hosts BOTH the Discord bot and a web chat UI inside one Streamlit app.

## Setup

1. **Add your secrets** in Streamlit Cloud (Settings → Secrets), as TOML:
   ```toml
   DISCORD_TOKEN = "your-discord-bot-token"
   GROQ_API_KEY = "gsk_..."
   GEMINI_MODEL = "llama-3.3-70b-versatile"
   GEMINI_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
   BLOCKED_USER_IDS = ""
   SLOW_USER_IDS = ""
   RESPECTED_USER_IDS = ""
   WATCH_CHANNEL_IDS = ""
   SLOW_MODE_MS = "15000"
   # known users (newlines inside the value):
   # KNOWN_USER_IDS = "1396370445917225026 Alex\n1378139379259932732 Sam"
   ```
2. On Streamlit Cloud → **New app** → pick the `big-pickle-discord` repo →
   Main file: `streamlit_app.py` → **Deploy**.

## Files
- `streamlit_app.py` — web chat UI + starts the bot thread
- `discord_bot.py` — the Discord bot (Groq), runs in a background thread
- `persona.md` / `extra-rules.md` — personality + extra system prompt
- `known-users.txt` etc. — NOTE: on Streamlit, these are read via secrets if
  you copy their contents into the `*_USER_IDS` / `KNOWN_USER_IDS` secrets.
  (Streamlit Cloud does not ship arbitrary repo files into the runtime by
  default unless the repo is public; secrets are the reliable path.)

## Important: sleep / uptime
- Community Cloud free tier sleeps the WHOLE app (bot included) after ~12h of
  no traffic. The discriminator bot will go offline while asleep.
- The GitHub Actions workflow (`keepalive.yml`) pushes an empty commit every
  10h to reset the sleep timer, but an app already asleep needs a visit/reboot.
- This is NOT a true 24/7 host. Streamlit cannot keep a bot awake reliably.
  If you need uninterrupted uptime, Render free tier (or a paid host) is still
  the correct choice.

## Turning off the bot (web-only)
Set `BOT_DISABLED = "1"` in secrets to run only the web chat UI.
