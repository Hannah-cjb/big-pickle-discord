import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const GEMINI_ENDPOINT =
  process.env.GEMINI_ENDPOINT ||
  'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const PORT = process.env.PORT || 3000;
const COOLDOWN_MS = Number(process.env.COOLDOWN_MS || 0);
const MAX_HISTORY = Number(process.env.MAX_HISTORY || 12);
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 600);
const ALLOWED_CHANNELS = (process.env.ALLOWED_CHANNELS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function loadPersona() {
  try {
    const personaPath = path.join(__dirname, 'persona.md');
    const loaded = fs
      .readFileSync(personaPath, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();
    if (loaded) return loaded;
  } catch {
    // persona.md missing — fall through to env
  }
  return process.env.SYSTEM_PROMPT || '';
}

function loadExtraRules() {
  try {
    const rulesPath = path.join(__dirname, 'extra-rules.md');
    const loaded = fs
      .readFileSync(rulesPath, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();
    if (!loaded) return '';
    return loaded;
  } catch {
    return '';
  }
}

function buildSystemPrompt() {
  const persona = loadPersona();
  const extra = loadExtraRules();
  if (extra) {
    return `${persona}\n\n## Additional instructions\n${extra}`;
  }
  return persona;
}

const SYSTEM_PROMPT = buildSystemPrompt();

function loadBlockedUsers() {
  const blocked = new Set();
  const addId = (id) => {
    const t = String(id).trim();
    if (/^\d{15,20}$/.test(t)) blocked.add(t);
  };
  try {
    const blockedPath = path.join(__dirname, 'blocked-users.txt');
    const content = fs.readFileSync(blockedPath, 'utf8');
    for (const line of content.split(/\r?\n/)) addId(line);
  } catch {
    // blocked-users.txt missing — fall through to env
  }
  for (const id of (process.env.BLOCKED_USERS || '').split(',')) addId(id);
  return blocked;
}

const BLOCKED_USERS = loadBlockedUsers();

const SLOW_MODE_MS = Number(process.env.SLOW_MODE_MS || 15000);

function loadSlowUsers() {
  const slow = new Set();
  const addId = (id) => {
    const t = String(id).trim();
    if (/^\d{15,20}$/.test(t)) slow.add(t);
  };
  try {
    const slowPath = path.join(__dirname, 'slow-users.txt');
    const content = fs.readFileSync(slowPath, 'utf8');
    for (const line of content.split(/\r?\n/)) addId(line);
  } catch {
    // slow-users.txt missing — fall through to env
  }
  for (const id of (process.env.SLOW_USERS || '').split(',')) addId(id);
  return slow;
}

const SLOW_USERS = loadSlowUsers();

const RESPECTED_MAX_TOKENS = Number(process.env.RESPECTED_MAX_TOKENS || 1000);

function loadRespectedUsers() {
  const respected = new Set();
  const addId = (id) => {
    const t = String(id).trim();
    if (/^\d{15,20}$/.test(t)) respected.add(t);
  };
  try {
    const respectedPath = path.join(__dirname, 'respected-users.txt');
    const content = fs.readFileSync(respectedPath, 'utf8');
    for (const line of content.split(/\r?\n/)) addId(line);
  } catch {
    // respected-users.txt missing — fall through to env
  }
  for (const id of (process.env.RESPECTED_USERS || '').split(',')) addId(id);
  return respected;
}

const RESPECTED_USERS = loadRespectedUsers();

function loadWatchedChannels() {
  const watched = new Set();
  const addId = (id) => {
    const t = String(id).trim();
    if (/^\d{15,20}$/.test(t)) watched.add(t);
  };
  try {
    const watchedPath = path.join(__dirname, 'watched-channels.txt');
    const content = fs.readFileSync(watchedPath, 'utf8');
    for (const line of content.split(/\r?\n/)) addId(line);
  } catch {
    // watched-channels.txt missing — fall through to env
  }
  for (const id of (process.env.WATCH_CHANNELS || '').split(',')) addId(id);
  return watched;
}

const WATCHED_CHANNELS = loadWatchedChannels();

function loadKnownUsers() {
  const map = new Map();
  try {
    const usersPath = path.join(__dirname, 'known-users.txt');
    const content = fs.readFileSync(usersPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.trim().match(/^(\d{15,20})[\s:-]+(.+)$/);
      if (m) map.set(m[1], m[2].trim());
    }
  } catch {
    // known-users.txt missing
  }
  return map;
}

const knownUsers = loadKnownUsers();

function recordUser(user) {
  if (!user?.id) return;
  const name = user.globalName || user.username;
  if (name && !knownUsers.has(user.id)) knownUsers.set(user.id, name);
}

async function resolveUserId(id) {
  if (knownUsers.has(id)) return knownUsers.get(id);
  try {
    const user = await client.users.fetch(id);
    const name = user.globalName || user.username;
    knownUsers.set(id, name);
    return name;
  } catch {
    return null;
  }
}

async function buildUserContext(userText) {
  for (const m of String(userText || '').match(/\d{15,20}/g) || []) {
    await resolveUserId(m);
  }
  const lines = [];
  const blocked = [...BLOCKED_USERS].sort();
  const slow = [...SLOW_USERS].sort();
  if (blocked.length) {
    lines.push('## Blocked users (never respond to these)');
    for (const id of blocked) {
      const name = (await resolveUserId(id)) || 'unknown';
      lines.push(`- ${id}: ${name}`);
    }
  }
  if (slow.length) {
    lines.push(`## Slow-mode users (max 1 reply every ${Math.round(SLOW_MODE_MS / 1000)}s)`);
    for (const id of slow) {
      const name = (await resolveUserId(id)) || 'unknown';
      lines.push(`- ${id}: ${name}`);
    }
  }
  const respected = [...RESPECTED_USERS].sort();
  if (respected.length) {
    lines.push('## Respected users (always treat these with extra care and respect, never refuse them)');
    for (const id of respected) {
      const name = (await resolveUserId(id)) || 'unknown';
      lines.push(`- ${id}: ${name}`);
    }
  }
  if (knownUsers.size) {
    lines.push('## Known Discord users (ID to username)');
    const entries = [...knownUsers.entries()].slice(0, 100).sort((a, b) => a[1].localeCompare(b[1]));
    for (const [id, name] of entries) lines.push(`- ${id}: ${name}`);
  }
  if (!lines.length) return '';
  return `\n\n=== LIVE USER CONTEXT — use this to answer questions about users, IDs, blocked, or slow-mode lists ===\n${lines.join('\n')}`;
}

if (!DISCORD_TOKEN) {
  console.error(
    'Missing DISCORD_TOKEN. Set it in the Render environment (or .env) before starting.',
  );
  process.exit(1);
}
if (!GEMINI_API_KEY) {
  console.error(
    'Missing GEMINI_API_KEY. Get a free key at https://aistudio.google.com/apikey',
  );
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
  ],
  partials: [Partials.Channel],
});

const conversationMemory = new Map();
const lastUsedAt = new Map();
const lastMarinatedAt = new Map();

function conversationKey(channel, authorId) {
  return channel.id || `dm:${authorId}`;
}

function getHistory(key) {
  return conversationMemory.get(key) || [];
}

function addToHistory(key, role, content) {
  if (!content) return;
  const history = getHistory(key);
  history.push({ role, content: String(content) });
  while (history.length > MAX_HISTORY) history.shift();
  conversationMemory.set(key, history);
  if (conversationMemory.size > 200) {
    const oldest = conversationMemory.keys().next().value;
    if (oldest !== undefined) conversationMemory.delete(oldest);
  }
}

function onCooldown(authorId, ms = COOLDOWN_MS) {
  const now = Date.now();
  const last = lastUsedAt.get(authorId) || 0;
  if (now - last < ms) return true;
  lastUsedAt.set(authorId, now);
  return false;
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || '').join('');
  }
  return String(content ?? '');
}

function parseRetryMs(data) {
  const msg = data?.error?.message || '';
  const m = msg.match(/retry in\s+([\d.]+)\s*s/i);
  if (m) return Math.ceil(parseFloat(m[1]) * 1000) + 500;
  const delay = data?.error?.retryDelay || data?.error?.details?.[0]?.retryDelay;
  if (typeof delay === 'string') {
    const d = delay.match(/^([\d.]+)s$/);
    if (d) return Math.ceil(parseFloat(d[1]) * 1000) + 500;
  }
  return 0;
}

async function callGemini(messages, maxTokens = MAX_TOKENS) {
  const body = {
    model: GEMINI_MODEL,
    messages,
    temperature: 0.8,
    max_tokens: maxTokens,
  };
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      const waitMs = lastError?.retryAfterMs || [2000, 5000][attempt - 1] || 8000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    try {
      const res = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GEMINI_API_KEY}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastError = new Error(
          `Gemini API ${res.status}: ${data?.error?.message || JSON.stringify(data)}`,
        );
        if (res.status === 429) {
          lastError.retryAfterMs = parseRetryMs(data);
          if (lastError.retryAfterMs) console.log(`[gemini] rate-limited, retrying in ${lastError.retryAfterMs}ms`);
        }
        if (res.status === 429 || res.status >= 500) continue;
        throw lastError;
      }
      const text = extractText(data?.choices?.[0]?.message?.content);
      if (!text) throw new Error('Empty response from Gemini API');
      return text.trim();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Gemini request failed');
}

function chunkText(text, limit = 1900) {
  const chunks = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit / 2) cut = limit;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

async function replyAsMessage(message, text) {
  const chunks = chunkText(text);
  for (let i = 0; i < chunks.length; i++) {
    if (i === 0) {
      await message.reply(chunks[i]);
    } else {
      await message.channel.send(chunks[i]);
    }
  }
}

async function replyAsInteraction(interaction, text) {
  const chunks = chunkText(text);
  await interaction.editReply(chunks[0]);
  for (const chunk of chunks.slice(1)) {
    await interaction.followUp(chunk);
  }
}

async function respond(key, authorId, userText, sink) {
  try {
    const isRespected = RESPECTED_USERS.has(authorId);
    const isSlow = SLOW_USERS.has(authorId) && !isRespected;
    const cooldownMs = isSlow ? SLOW_MODE_MS : COOLDOWN_MS;
    if (onCooldown(authorId, cooldownMs)) {
      if (!isSlow) {
        const now = Date.now();
        if (now - (lastMarinatedAt.get(authorId) || 0) > 10000) {
          lastMarinatedAt.set(authorId, now);
          await sink.send('Big Pickle is marinating — give me a second and try again!');
        }
      }
      return;
    }
    addToHistory(key, 'user', userText);
    const history = getHistory(key);
    const userContext = await buildUserContext(userText);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + userContext },
      ...history.slice(-MAX_HISTORY),
    ];
    await sink.typing();
    let replyText;
    try {
      replyText = await callGemini(messages, isRespected ? RESPECTED_MAX_TOKENS : MAX_TOKENS);
    } catch (err) {
      console.error('Gemini error:', err.message);
      replyText = 'My pickles got tangled — give me a second and try again!';
    }
    addToHistory(key, 'assistant', replyText);
    await sink.send(replyText);
  } catch (err) {
    console.error('respond error:', err.message);
  }
}

async function handleMessage(message) {
  try {
    if (message.author.bot) return;
    if (!message.content?.trim()) return;

    recordUser(message.author);

    if (!RESPECTED_USERS.has(message.author.id) && BLOCKED_USERS.has(message.author.id)) {
      console.log(`[block] ignoring ${message.author.username} (${message.author.id})`);
      return;
    }

    if (message.channel?.partial) {
      try {
        await message.channel.fetch();
      } catch {
        return;
      }
    }

    const isDm = !message.guildId;
    if (!isDm && ALLOWED_CHANNELS.length && !ALLOWED_CHANNELS.includes(message.channel.id)) {
      return;
    }

    const mentioned = message.mentions.has(client.user.id) && !message.mentions.everyone;
    let repliedToBot = false;
    if (message.reference?.messageId && !isDm) {
      try {
        const referenced = await message.channel.messages.fetch(message.reference.messageId);
        repliedToBot = referenced.author.id === client.user.id;
      } catch {
        // referenced message unavailable — ignore
      }
    }

    if (!isDm && !mentioned && !repliedToBot && !WATCHED_CHANNELS.has(message.channel.id)) {
      return;
    }

    console.log(
      `[trigger] ${message.author.username} in #${message.channel.id}${isDm ? ' (DM)' : ''}: ${message.content.slice(0, 80)}`,
    );

    const key = isDm ? `dm:${message.author.id}` : message.channel.id;
    const sink = {
      typing: () => message.channel.sendTyping().catch(() => {}),
      send: (text) => replyAsMessage(message, text),
    };
    await respond(key, message.author.id, message.content, sink);
  } catch (err) {
    console.error('Message handler error:', err.message);
  }
}

async function handleInteraction(interaction) {
  try {
    if (!interaction.isChatInputCommand()) return;
    recordUser(interaction.user);
    if (!RESPECTED_USERS.has(interaction.user.id) && BLOCKED_USERS.has(interaction.user.id)) return;

    if (interaction.commandName === 'reset') {
      const key = interaction.channel?.id || `dm:${interaction.user.id}`;
      conversationMemory.delete(key);
      lastUsedAt.delete(interaction.user.id);
      await interaction.reply(
        'Fresh jar, fresh pickle! I forgot everything we said — new conversation, go ahead.',
      );
      return;
    }

    if (interaction.commandName === 'respond' || interaction.commandName === 'unrespond') {
      const isAdmin =
        interaction.memberPermissions?.has('ManageGuild') ||
        interaction.memberPermissions?.has('Administrator');
      if (!isAdmin) {
        await interaction.reply('Only server admins can manage where I respond.');
        return;
      }
      const channel = interaction.options.getChannel('channel');
      const id = channel?.id;
      if (!id) {
        await interaction.reply('Pick a text channel in this server.');
        return;
      }
      if (interaction.commandName === 'respond') {
        WATCHED_CHANNELS.add(id);
        await interaction.reply(`Got it — I'll respond to every message in <#${id}>.`);
      } else {
        WATCHED_CHANNELS.delete(id);
        await interaction.reply(`Okay, I'll stop auto-responding in <#${id}>.`);
      }
      return;
    }

    if (interaction.commandName !== 'ask') return;

    const prompt = (interaction.options.getString('message') || '').slice(0, 1900);
    const key = interaction.channel?.id || `dm:${interaction.user.id}`;
    const sink = {
      typing: async () => {},
      send: (text) => replyAsInteraction(interaction, text),
    };
    console.log(`[trigger] /ask from ${interaction.user.username}`);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }
    await respond(key, interaction.user.id, prompt, sink);
  } catch (err) {
    console.error('Interaction handler error:', err.message);
  }
}

let discordStatus = 'connecting';
let lastDisconnectAt = 0;

const rest = new REST().setToken(DISCORD_TOKEN);

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);

  const askCommand = new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Chat with Big Pickle AI')
    .addStringOption((opt) =>
      opt
        .setName('message')
        .setDescription('What do you want to say?')
        .setRequired(true),
    );
  const resetCommand = new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Forget this conversation and start fresh');
  const respondCommand = new SlashCommandBuilder()
    .setName('respond')
    .setDescription('Auto-respond to every message in a channel')
    .addChannelOption((opt) =>
      opt.setName('channel').setDescription('Channel to watch').setRequired(true),
    );
  const unrespondCommand = new SlashCommandBuilder()
    .setName('unrespond')
    .setDescription('Stop auto-responding in a channel')
    .addChannelOption((opt) =>
      opt.setName('channel').setDescription('Channel to stop watching').setRequired(true),
    );
  try {
    await rest.put(Routes.applicationCommands(c.user.id), {
      body: [
        askCommand.toJSON(),
        resetCommand.toJSON(),
        respondCommand.toJSON(),
        unrespondCommand.toJSON(),
      ],
    });
    console.log('Registered /ask, /reset, /respond, /unrespond slash commands');
  } catch (err) {
    console.error('Failed to register slash commands:', err.message);
  }

  const pingLoop = () => {
    if (!PUBLIC_URL) return;
    fetch(`${PUBLIC_URL}/ping`).catch(() => {});
  };
  setInterval(pingLoop, 4 * 60 * 1000);
  pingLoop();
  discordStatus = 'connected';
});

client.on(Events.MessageCreate, handleMessage);
client.on(Events.InteractionCreate, handleInteraction);

const server = http.createServer((req, res) => {
  if (req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('big pickle is online');
    return;
  }
  if (req.url === '/health') {
    const body = JSON.stringify({
      ok: true,
      discord: discordStatus,
      uptimeSec: Math.floor(process.uptime()),
      now: new Date().toISOString(),
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Big Pickle AI is running.');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    console.log(`Received ${signal}, shutting down...`);
    server.close();
    await client.destroy().catch(() => {});
    process.exit(0);
  });
}

client.on(Events.Error, (err) => {
  console.error('Client error:', err?.message || err);
});

client.on(Events.ShardDisconnect, (event, id) => {
  discordStatus = 'reconnecting';
  lastDisconnectAt = Date.now();
  console.log(`[gateway] shard ${id} disconnected (code ${event?.code}), reconnecting...`);
});
client.on(Events.ShardReconnect, (id) => {
  discordStatus = 'reconnecting';
  console.log(`[gateway] shard ${id} reconnecting...`);
});
client.on(Events.ShardResume, (id) => {
  discordStatus = 'connected';
  console.log(`[gateway] shard ${id} resumed`);
});

setInterval(() => {
  if (discordStatus === 'connected') return;
  const since = Date.now() - lastDisconnectAt;
  if (since > 5 * 60 * 1000) {
    console.error(
      `[watchdog] not connected to Discord for ${Math.floor(since / 1000)}s — restarting`,
    );
    process.exit(1);
  }
}, 60 * 1000);

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  server.listen(PORT, () => console.log(`HTTP keep-alive server listening on ${PORT}`));
  client
    .login(DISCORD_TOKEN)
    .catch((err) => {
      console.error('Failed to log in:', err.message);
      server.close();
      process.exit(1);
    });
}

export { callGemini, extractText, chunkText, loadPersona, SYSTEM_PROMPT };
