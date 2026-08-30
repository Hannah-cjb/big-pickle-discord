"""Discord bot that runs as a background thread inside the Streamlit app.

Kept intentionally separated from streamlit_app.py so it doesn't import
streamlit (avoid interfering with the web thread). Uses discord.py and Groq.
"""
import asyncio
import os
import re
import threading
import time

import discord
from discord import app_commands

# ---------------------------------------------------------------------------
# Config (read from Streamlit secrets / env)
# ---------------------------------------------------------------------------
TOKEN = os.environ.get("DISCORD_TOKEN", "")
GROQ_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GROQ_API_KEY", "")
MODEL = os.environ.get("GEMINI_MODEL", "llama-3.3-70b-versatile")
ENDPOINT = os.environ.get("GEMINI_ENDPOINT") or "https://api.groq.com/openai/v1/chat/completions"
SLOW_MS = int(os.environ.get("SLOW_MODE_MS", "15000"))
KNOWN_IDS = os.environ.get("KNOWN_USER_IDS", "")
BLOCKED_IDS = os.environ.get("BLOCKED_USER_IDS", "")
SLOW_IDS = os.environ.get("SLOW_USER_IDS", "")
RESPECTED_IDS = os.environ.get("RESPECTED_USER_IDS", "")
WATCHED_IDS = os.environ.get("WATCH_CHANNEL_IDS", "")

_MAX_HISTORY = 12
_MAX_TOKENS = 600


def _parse_ids(raw):
    out = set()
    for part in (raw or "").split(","):
        p = part.strip()
        if p.isdigit():
            out.add(p)
    return out


BLOCKED = _parse_ids(BLOCKED_IDS)
SLOW = _parse_ids(SLOW_IDS)
RESPECTED = _parse_ids(RESPECTED_IDS)
WATCHED = _parse_ids(WATCHED_IDS)

_name_map = {}
for line in (KNOWN_IDS or "").splitlines():
    m = re.match(r"^(\d{15,20})[\s:-]+(.+)$", line.strip())
    if m:
        _name_map[m.group(1)] = m.group(2).strip()


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------
def _strip_comments(text):
    return re.sub(r"<!--[\s\S]*?-->", "", text or "")


def _load_named(name):
    if os.path.exists(name):
        with open(name, "r", encoding="utf-8") as f:
            return _strip_comments(f.read()).strip()
    return ""


PERSONA = _load_named("persona.md") or os.environ.get("SYSTEM_PROMPT", "")
EXTRA = _load_named("extra-rules.md")
SYSTEM_PROMPT = f"{PERSONA}\n\n## Additional instructions\n{EXTRA}" if EXTRA else PERSONA

KNOWN = {}
for line in (KNOWN_IDS or "").splitlines():
    m = re.match(r"^(\d{15,20})[\s:-]+(.+)$", line.strip())
    if m:
        KNOWN[m.group(1)] = m.group(2).strip()


def name_for(user_id):
    if user_id in KNOWN:
        return KNOWN[user_id]
    try:
        u = client.get_user(int(user_id)) or (client.get_user(int(user_id)))
        if u:
            return u.display_name or u.name or user_id
    except Exception:
        pass
    return user_id


# ---------------------------------------------------------------------------
# Groq call (thread-safe, no blocking of the web thread)
# ---------------------------------------------------------------------------
import requests  # noqa: E402


def groq_chat(messages, max_tokens=_MAX_TOKENS):
    payload = {
        "model": MODEL,
        "messages": messages,
        "temperature": 0.8,
        "max_tokens": max_tokens,
    }
    resp = requests.post(
        ENDPOINT,
        headers={"Authorization": f"Bearer {GROQ_KEY}", "Content-Type": "application/json"},
        json=payload,
        timeout=120,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Groq {resp.status_code}: {resp.text[:200]}")
    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


# ---------------------------------------------------------------------------
# Discord client
# ---------------------------------------------------------------------------
intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True
intents.guild_messages = True
intents.dm_messages = True

client = discord.Client(intents=intents)
tree = app_commands.CommandTree(client)

last_used = {}
last_marinated = {}


@client.event
async def on_ready():
    print(f"Logged in as {client.user} (in Streamlit thread)")
    try:
        synced = await tree.sync()
        print(f"Synced {len(synced)} slash commands")
    except Exception as e:
        print(f"Slash sync failed: {e}")
    threading.Thread(target=_keep_groq_warm, daemon=True).start()


def _keep_groq_warm():
    """Pings Groq periodically to reduce cold-sleep windows (best-effort)."""
    while True:
        time.sleep(300)
        try:
            if TOKEN and GROQ_KEY:
                groq_chat(
                    [{"role": "user", "content": "ping"}], max_tokens=5
                )
        except Exception:
            pass


def _char_blocked(author_id):
    return author_id in BLOCKED and author_id not in RESPECTED


@client.event
async def on_message(message):
    if message.author.bot:
        return
    if not message.content.strip():
        return
    if _char_blocked(str(message.author.id)):
        return

    is_respected = str(message.author.id) in RESPECTED
    is_slow = str(message.author.id) in SLOW and not is_respected
    in_watched = str(message.channel.id) in WATCHED

    mentioned = client.user in message.mentions
    replied_to_bot = False
    if message.reference and message.reference.message_id:
        try:
            ref = await message.channel.fetch_message(message.reference.message_id)
            replied_to_bot = ref.author.id == client.user.id
        except Exception:
            pass

    should_reply = (not message.guild) or mentioned or replied_to_bot or in_watched
    if not should_reply:
        return

    now = time.time()
    cooldown = SLOW_MS / 1000 if is_slow else 0
    last = last_used.get(message.author.id, 0)
    if now - last < cooldown:
        if not is_slow:
            if now - last_marinated.get(message.author.id, 0) > 10:
                last_marinated[message.author.id] = now
                await message.channel.send(
                    "Big Pickle is marinating — give me a second and try again!"
                )
        return
    last_used[message.author.id] = now

    history = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"[{name_for(str(message.author.id))}]: {message.content}"},
    ]
    key = str(message.channel.id) if message.guild else f"dm:{message.author.id}"
    hist = _histories.setdefault(key, [])
    hist.append(history[-1])
    hist = hist[-_MAX_HISTORY:]

    async with message.channel.typing():
        try:
            msgs = [
                {"role": "system", "content": SYSTEM_PROMPT},
                *[_m for _m in hist],
            ]
            reply = groq_chat(msgs)
        except Exception as e:
            print(f"Groq error: {e}")
            reply = "My pickles got tangled — give me a second and try again!"
    hist.append({"role": "assistant", "content": reply})
    _histories[key] = hist[-_MAX_HISTORY:]
    await message.channel.send(reply)


_histories = {}


@tree.command(name="ask", description="Chat with Big Pickle AI")
@app_commands.describe(message="What do you want to say?")
async def ask(interaction: discord.Interaction, message: str):
    if str(interaction.user.id) in BLOCKED and not str(interaction.user.id) in RESPECTED:
        return
    await interaction.response.defer()
    try:
        reply = groq_chat(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"[{name_for(str(interaction.user.id))}]: {message}"},
            ]
        )
    except Exception as e:
        print(f"Groq error: {e}")
        reply = "My pickles got tangled — give me a second and try again!"
    await interaction.followup.send(reply)


@tree.command(name="reset", description="Forget this conversation and start fresh")
async def reset(interaction: discord.Interaction):
    key = str(interaction.channel_id or f"dm:{interaction.user.id}")
    _histories.pop(key, None)
    last_used.pop(interaction.user.id, None)
    await interaction.response.send_message(
        "Fresh jar, fresh pickle! I forgot everything we said — new conversation, go ahead."
    )


def run_bot():
    """Entry point called from streamlit_app.py background thread."""
    if not TOKEN:
        raise RuntimeError("DISCORD_TOKEN is not set")
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    client.run(TOKEN, log_handler=None)

