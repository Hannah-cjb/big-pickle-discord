# Big Pickle AI — Discord Bot

A Discord bot with a personality, powered by the **free Gemini API** and hosted on
**Render's free tier**. 100% free, no credit card anywhere, nothing runs on your PC.

## Features
- **@mention** Big Pickle in a channel and it replies.
- **Reply to its messages** to keep a conversation going.
- **`/ask <message>`** slash command.
- **DMs** — direct-message the bot and it remembers the whole chat.
- Per-conversation memory (last ~24 messages, editable via `MAX_HISTORY`).
- Cooldown guard, 2000-char-safe replies, crash-safe logging, auto-reconnect.
- Self-ping keep-alive so Render's free tier doesn't put it to sleep.

## How it works
```
Discord (Big Pickle AI bot)
   |  Gateway (24/7 connection)
   v
Node.js bot on Render free tier (self-pings every 4 min)
   |  OpenAI-compatible HTTPS call (free)
   v
Gemini Flash model (free tier, ~1,500 replies/day)
```

## Cost & limits
| Item | Cost | Limit |
|---|---|---|
| Render free tier | $0, no card | 750 hrs/mo, 512MB RAM |
| Gemini API free tier | $0, no card | ~1,500 req/day, Flash models only (default: `gemini-3.6-flash`) |
| HetrixTools monitor | $0, no card | 1-min checks |
| Discord bot | $0 | — |

Free-tier Gemini prompts may be used by Google to improve their products — don't send
anything sensitive.

## Files
| File | Purpose |
|---|---|
| `bot.js` | The whole bot (gateway, keep-alive server, memory, Gemini calls) |
| `persona.md` | Big Pickle's personality prompt (edit freely, it reloads on restart) |
| `package.json` | Node deps (`discord.js`, `dotenv`) |
| `.env.example` | Copy to `.env` if testing locally |
| `DEPLOY.md` | Step-by-step setup + deployment instructions |

## Local testing (optional)
```bash
npm install
copy .env.example .env   # fill in DISCORD_TOKEN and GEMINI_API_KEY
npm start
```

## Deploying
Follow **`DEPLOY.md`** — it covers Discord Developer Portal, Gemini API key, GitHub,
Render, and HetrixTools.
