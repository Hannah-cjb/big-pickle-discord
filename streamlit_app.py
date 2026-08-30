import os
import threading
import time

import streamlit as st

st.set_page_config(page_title="Big Pickle AI", page_icon="🥒", layout="centered")

# ---------------------------------------------------------------------------
# Start the Discord bot in a background thread so both the web UI and the
# Discord bot run inside the same Streamlit Cloud app.
#
#  1. The bot process must be a LONG-RUNNING thread that never blocks the
#     Streamlit web thread. We start it exactly once with a module-level guard
#     (Streamlit re-runs the script on every interaction).
#  2. The GET /ping-ish self-wake pattern from Render is replaced with an
#     in-app keep-alive thread that touches the Groq endpoint periodically.
#     NOTE: Streamlit Cloud sleeps the whole app when unused (free tier), so a
#     true 24/7 bot needs the GitHub keep-alive workflow too.
# ---------------------------------------------------------------------------

_bot_started = False
_bot_lock = threading.Lock()


def start_discord_bot_once():
    """Launch the Discord bot thread exactly once per app process."""
    global _bot_started
    with _bot_lock:
        if _bot_started:
            return
        if os.environ.get("BOT_DISABLED") == "1":
            st.warning("Discord bot is disabled via BOT_DISABLED env var.")
            return
        try:
            from discord_bot import run_bot
        except Exception as exc:  # pragma: no cover - defensive
            st.error(f"Could not import discord_bot: {exc}")
            return
        t = threading.Thread(target=run_bot, daemon=True, name="discord-bot")
        t.start()
        _bot_started = True


# ---------------------------------------------------------------------------
# AI chat (Groq)
# ---------------------------------------------------------------------------
def groq_chat(messages, max_tokens=600):
    import requests

    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GROQ_API_KEY")
    endpoint = os.environ.get("GEMINI_ENDPOINT") or "https://api.groq.com/openai/v1/chat/completions"
    model = os.environ.get("GEMINI_MODEL") or "llama-3.3-70b-versatile"

    if not key:
        return "Missing Groq API key. Set GEMINI_API_KEY/GROQ_API_KEY in Streamlit secrets."

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.8,
        "max_tokens": max_tokens,
    }
    resp = requests.post(
        endpoint,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json=payload,
        timeout=120,
    )
    if resp.status_code != 200:
        return f"Groq error {resp.status_code}: {resp.text[:200]}"
    data = resp.json()
    try:
        return data["choices"][0]["message"]["content"].strip()
    except Exception:
        return "Hmm, I got an empty reply from the model."


def load_persona():
    if os.path.exists("persona.md"):
        with open("persona.md", "r", encoding="utf-8") as f:
            text = f.read()
        import re
        text = re.sub(r"<!--[\s\S]*?-->", "", text)
        if text.strip():
            return text.strip()
    return os.environ.get("SYSTEM_PROMPT", "")


SYSTEM_PROMPT = load_persona()


# ---------------------------------------------------------------------------
# Web chat UI
# ---------------------------------------------------------------------------
st.title("🥒 Big Pickle AI")
st.caption("A clever, sassy-but-kind digital pickle. Chat from your browser.")

if "messages" not in st.session_state:
    st.session_state.messages = []

for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

if prompt := st.chat_input("Talk to Big Pickle..."):
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    history = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *st.session_state.messages[-12:],
    ]
    with st.chat_message("assistant"):
        with st.spinner("Brining some thoughts together..."):
            reply = groq_chat(history)
        st.markdown(reply)
    st.session_state.messages.append({"role": "assistant", "content": reply})

# ---------------------------------------------------------------------------
# Launch Discord bot in background
# ---------------------------------------------------------------------------
start_discord_bot_once()
