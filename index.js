import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage
} from "@whiskeysockets/baileys";

import pino from "pino";
import fs from "fs";
import os from "os";
import sharp from "sharp";

// ========================================
// methu MD CONFIG
// ========================================

const BOT_NAME = "methu MD";
const OWNER_NAME = "nadun";
const OWNER_NUMBER = "942290168";
const REPO_URL = "https://github.com/Methumdbot/Methu_md";
const DATA_FILE = "./methu-md-data.json";

const AUDIO = {
  mk: "AUD-20261002-WA0054.mp3",
  gm: "AUD-20261002-WA0056.mp3",
  gn: "AUD-20261002-WA0055.mp3"
};

const IMAGE = {
  menu: "Neon Hooded Cyber Bot Menu.png",
  setting: "file_00000000b24c8207bd3a9b02406eccd3.png",
  alive: "file_00000000feb0821191bb4c93b5655483.png"
};

const DEFAULT_SETTINGS = {
  autoVoice: false,
  autoReply: true,
  autoGreet: true,
  autoRead: false,
  voiceReply: false,
  ownerMode: false,
  autoOnline: false,
  autoOffline: false,
  autoWelcome: false,
  autoStatusSeen: false
};

const DEFAULT_FEATURES = {
  antiLink: false,
  antiSpam: false,
  autoReact: false,
  autoTyping: false,
  autoGoodbye: false
};

// ========================================
// SAVE SETTINGS / CUSTOM REPLIES
// ========================================

function loadData() {
  try {
    const saved = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    return {
      prefix:
        typeof saved.prefix === "string"
          ? saved.prefix
          : ".",

      mode:
        saved.mode === "private"
          ? "private"
          : "public",

      settings: {
        ...DEFAULT_SETTINGS,
        ...(saved.settings || {})
      },

      features: {
        ...DEFAULT_FEATURES,
        ...(saved.features || {})
      },

      replies:
        saved.replies &&
        typeof saved.replies === "object"
          ? saved.replies
          : {}
    };
  } catch {
    return {
      prefix: ".",
      mode: "public",
      settings: { ...DEFAULT_SETTINGS },
      features: { ...DEFAULT_FEATURES },
      replies: {}
    };
  }
}

const data = loadData();

let PREFIX = data.prefix;

const settings = data.settings;
const features = data.features;
const customReplies = data.replies;

// ========================================
// SAVE DATA
// ========================================

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        {
          prefix: PREFIX,
          mode: data.mode,
          settings,
          features,
          replies: customReplies
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error("Save data error:", error.message);
  }
}

// ========================================
// GLOBAL VARIABLES
// ========================================

const startedAt = Date.now();

const processed = new Set();
const spamTracker = new Map();

// AFK users
const afkUsers = new Map();

// Active reminder timers
const reminderTimers = new Set();

let sock;
let reconnectTimer = null;
let connecting = false;
let pairingRequested = false;

// ========================================
// BASIC FUNCTIONS
// ========================================

function exists(file) {
  return fs.existsSync(file);
}

function digits(value = "") {
  return String(value)
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

function isOwner(jid) {
  return digits(jid) === OWNER_NUMBER;
}

function sameUser(a, b) {
  return (
    a === b ||
    (
      digits(a) !== "" &&
      digits(a) === digits(b)
    )
  );
}

function uptime() {
  const total = Math.floor(
    (Date.now() - startedAt) / 1000
  );

  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function getText(message) {
  const m = message?.message;

  if (!m) return "";

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedId ||
    ""
  ).trim();
}

async function sendText(jid, text, quoted) {
  return sock.sendMessage(
    jid,
    { text },
    quoted ? { quoted } : {}
  );
}

async function sendImageOrText(
  jid,
  file,
  caption,
  quoted
) {
  if (exists(file)) {
    return sock.sendMessage(
      jid,
      {
        image: fs.readFileSync(file),
        caption
      },
      quoted ? { quoted } : {}
    );
  }

  return sendText(jid, caption, quoted);
}

async function sendVoice(jid, file, quoted) {
  if (!exists(file)) {
    return sendText(
      jid,
      `❌ Audio file not found: ${file}`,
      quoted
    );
  }

  return sock.sendMessage(
    jid,
    {
      audio: fs.readFileSync(file),
      mimetype: "audio/mpeg",
      ptt: false
    },
    quoted ? { quoted } : {}
  );
}

// ========================================
// QUOTED MESSAGE HELPERS
// ========================================

function getQuotedContext(message) {
  return message.message?.extendedTextMessage?.contextInfo;
}

function getQuotedMessageKey(message) {
  const context = getQuotedContext(message);

  if (!context?.stanzaId) {
    return null;
  }

  const key = {
    remoteJid: message.key.remoteJid,
    id: context.stanzaId,
    fromMe: false
  };

  if (
    message.key.remoteJid?.endsWith("@g.us") &&
    context.participant
  ) {
    key.participant = context.participant;
  }

  return key;
}

// ========================================
// MENU
// ========================================

function menuText() {
  return `
╭━━━〔 🤖 ${BOT_NAME} 〕━━━╮
┃
┃ 👑 Owner: ${OWNER_NAME}
┃ ⚡ Prefix: ${PREFIX}
┃ 🟢 Mode: ${data.mode.toUpperCase()}
┃ ⏱️ Uptime: ${uptime()}
┃
┣━━〔 BASIC COMMANDS 〕━━
┃ .menu
┃ .help
┃ .ping
┃ .alive
┃ .uptime
┃ .owner
┃ .repo
┃ .info
┃ .calc 25+25
┃ .getpp
┃
┣━━〔 MEDIA COMMANDS 〕━━
┃ .sticker
┃ .toimg
┃ .take name
┃
┣━━〔 AI & SEARCH 〕━━
┃ .ai question
┃ .ask question
┃ .yt song name
┃ .song song name
┃ .play song name
┃ .video video name
┃ .lyrics song name
┃ .translate en|si|text
┃
┣━━〔 GROUP COMMANDS 〕━━
┃ .groupinfo
┃ .admins
┃ .grouplink
┃ .groupdesc
┃ .setgroupname New Name
┃ .setdesc New Description
┃ .tagall
┃ .hidetag text
┃ .kick @user
┃ .add number
┃ .promote @user
┃ .demote @user
┃ .mute
┃ .unmute
┃ .open
┃ .close
┃ .delete
┃ .poll Question | Option 1 | Option 2
┃
┣━━〔 AFK & REMINDERS 〕━━
┃ .afk reason
┃ .back
┃ .remind 5 Drink water
┃
┣━━〔 AUTO REPLIES 〕━━
┃ .setreply trigger | reply
┃ .addreply trigger | reply
┃ .delreply trigger
┃ .listreply
┃
┣━━〔 FUN COMMANDS 〕━━
┃ .joke
┃ .fact
┃ .quote
┃ .8ball question
┃ .roll
┃ .goodnight
┃ .ship @user1 @user2
┃ .compliment
┃ .truth
┃ .dare
┃ .flip
┃ .choose A | B | C
┃
┣━━〔 OWNER COMMANDS 〕━━
┃ .mode public/private
┃ .setprefix !
┃ .restart
┃ .feature antilink on/off
┃ .feature antispam on/off
┃ .feature autoreact on/off
┃ .feature typing on/off
┃ .feature welcome on/off
┃ .feature goodbye on/off
┃
╰━━━━━━━━━━━━━━━━━━╯

💚 ${BOT_NAME} WhatsApp Bot
`;
}

// ========================================
// SETTINGS TEXT
// ========================================

function settingsText() {
  return `
⚙️ *${BOT_NAME} SETTINGS*

1. Auto Voice: ${settings.autoVoice ? "ON 🟢" : "OFF 🔴"}
2. Auto Reply: ${settings.autoReply ? "ON 🟢" : "OFF 🔴"}
3. Auto Greet: ${settings.autoGreet ? "ON 🟢" : "OFF 🔴"}
4. Auto Read: ${settings.autoRead ? "ON 🟢" : "OFF 🔴"}
5. Voice Reply: ${settings.voiceReply ? "ON 🟢" : "OFF 🔴"}
6. Owner Mode: ${settings.ownerMode ? "ON 🟢" : "OFF 🔴"}
7. Auto Online: ${settings.autoOnline ? "ON 🟢" : "OFF 🔴"}
8. Auto Offline: ${settings.autoOffline ? "ON 🟢" : "OFF 🔴"}
9. Auto Welcome: ${settings.autoWelcome ? "ON 🟢" : "OFF 🔴"}
10. Auto Status Seen: ${settings.autoStatusSeen ? "ON 🟢" : "OFF 🔴"}

🛡️ Anti-Link: ${features.antiLink ? "ON 🟢" : "OFF 🔴"}
🚫 Anti-Spam: ${features.antiSpam ? "ON 🟢" : "OFF 🔴"}
❤️ Auto React: ${features.autoReact ? "ON 🟢" : "OFF 🔴"}
⌨️ Auto Typing: ${features.autoTyping ? "ON 🟢" : "OFF 🔴"}
👋 Auto Goodbye: ${features.autoGoodbye ? "ON 🟢" : "OFF 🔴"}

Mode: ${data.mode.toUpperCase()}
Prefix: ${PREFIX}

Examples:
.setting 1 on
.setting 1 off
.feature antilink on
`;
}

// ========================================
// QUOTED MEDIA
// ========================================

async function getQuotedMedia(message) {
  const context =
    message.message?.extendedTextMessage?.contextInfo;

  if (!context?.quotedMessage) return null;

  return {
    key: {
      remoteJid: message.key.remoteJid,
      id: context.stanzaId,
      participant: context.participant
    },
    message: context.quotedMessage
  };
}

async function downloadQuotedMedia(message) {
  const quoted = await getQuotedMedia(message);

  if (!quoted) return null;

  try {
    return await downloadMediaMessage(
      quoted,
      "buffer",
      {},
      {
        logger: pino({ level: "silent" }),
        reuploadRequest: sock.updateMediaMessage
      }
    );
  } catch (error) {
    console.error("Media error:", error.message);
    return null;
  }
}

// ========================================
// AI COMMAND
// ========================================

async function askAI(prompt) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return "❌ GROQ_API_KEY is missing in GitHub Secrets.";
  }

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error?.message || "AI request failed"
    );
  }

  return (
    result.choices?.[0]?.message?.content ||
    "No answer received."
  );
}

// ========================================
// YOUTUBE SEARCH
// ========================================

async function youtubeSearch(query) {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return "❌ YOUTUBE_API_KEY is missing in GitHub Secrets.";
  }

  const url = new URL(
    "https://www.googleapis.com/youtube/v3/search"
  );

  url.search = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    maxResults: "5",
    key: apiKey
  });

  const response = await fetch(url);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error?.message || "YouTube search failed"
    );
  }

  if (!result.items?.length) {
    return "No results found.";
  }

  return result.items.map((item, index) => {
    return `${index + 1}. ${item.snippet.title}
https://www.youtube.com/watch?v=${item.id.videoId}`;
  }).join("\n\n");
}

// ========================================
// TRANSLATE
// ========================================

async function translateText(input) {
  const parts = input.split("|");

  if (parts.length < 3) {
    return "Use: .translate en|si|Hello";
  }

  const from = parts[0].trim();
  const to = parts[1].trim();
  const text = parts.slice(2).join("|").trim();

  const url = new URL(
    "https://api.mymemory.translated.net/get"
  );

  url.search = new URLSearchParams({
    q: text,
    langpair: `${from}|${to}`
  });

  const response = await fetch(url);
  const result = await response.json();

  return (
    result.responseData?.translatedText ||
    "Translation failed."
  );
}

// ========================================
// SAFE CALCULATOR
// ========================================

function calculateExpression(expression) {
  const cleaned = expression.replace(/\s+/g, "");

  if (!cleaned) {
    throw new Error("Enter a calculation.");
  }

  if (cleaned.length > 100) {
    throw new Error("Calculation is too long.");
  }

  // Only allow arithmetic characters.
  if (!/^[0-9+\-*/().%]+$/.test(cleaned)) {
    throw new Error("Only basic arithmetic is allowed.");
  }

  // Prevent consecutive unsupported operators.
  if (/[*/%]{2,}/.test(cleaned)) {
    throw new Error("Invalid arithmetic expression.");
  }

  // Use a restricted arithmetic expression.
  const result = Function(
    `"use strict"; return (${cleaned});`
  )();

  if (
    typeof result !== "number" ||
    !Number.isFinite(result)
  ) {
    throw new Error("Invalid calculation.");
  }

  return result;
}

// ========================================
// GROUP HELPERS
// ========================================

async function getGroup(jid) {
  if (!jid.endsWith("@g.us")) {
    throw new Error("This command works in groups only.");
  }

  return sock.groupMetadata(jid);
}

function participantFor(group, jid) {
  return group.participants.find(p =>
    sameUser(p.id, jid) ||
    sameUser(p.jid, jid) ||
    sameUser(p.phoneNumber, jid)
  );
}

function isAdmin(participant) {
  return Boolean(
    participant?.admin === "admin" ||
    participant?.admin === "superadmin" ||
    participant?.admin === true
  );
}

async function requireGroupAdmin(jid, sender) {
  const group = await getGroup(jid);

  const senderParticipant =
    participantFor(group, sender);

  if (!isAdmin(senderParticipant)) {
    throw new Error(
      "Only group admins can use this command."
    );
  }

  const botParticipant =
    participantFor(group, sock.user?.id);

  if (!isAdmin(botParticipant)) {
    throw new Error(
      "Please make methu MD a group admin first."
    );
  }

  return group;
}

function mentionedTargets(message) {
  const context =
    message.message?.extendedTextMessage?.contextInfo;

  const targets = [
    ...(context?.mentionedJid || [])
  ];

  if (context?.participant) {
    targets.push(context.participant);
  }

  return [...new Set(targets.filter(Boolean))];
}

// ========================================
// FUN CONTENT
// ========================================

const jokes = [
  "Why did the phone need glasses? It lost its contacts. 😂",
  "I told my computer I needed a break. It went to sleep. 😴",
  "Why was the math book sad? It had too many problems. 🤓",
  "My Wi-Fi and I have something in common: we disappear when needed. 📶"
];

const facts = [
  "Octopuses have three hearts. 🐙",
  "Honeybees communicate food locations through a waggle dance. 🐝",
  "A day on Venus is longer than its year. 🪐",
  "Bananas are botanically classified as berries. 🍌"
];

const quotes = [
  "Small steps every day lead to big changes. ✨",
  "Be kind, even when nobody is watching. 💚",
  "Your future is built by what you do today. 🌟",
  "Progress, not perfection. 💫"
];

// ========================================
// COMMAND HANDLER
// ========================================

async function handleCommand(
  jid,
  sender,
  text,
  message,
  isGroup
) {
  const body = text.slice(PREFIX.length).trim();
  const space = body.search(/\s/);

  const command = (
    space < 0 ? body : body.slice(0, space)
  ).toLowerCase();

  const argText = (
    space < 0 ? "" : body.slice(space + 1)
  ).trim();

  const args = argText
    ? argText.split(/\s+/)
    : [];

  const owner = isOwner(sender);

  if (
    (data.mode === "private" || settings.ownerMode) &&
    !owner &&
    !["setting", "menu", "help"].includes(command)
  ) {
    return sendText(
      jid,
      "🔒 methu MD is in private/owner mode.",
      message
    );
  }

  switch (command) {

    // ========================================
    // BASIC COMMANDS
    // ========================================

    case "menu":
    case "help":
      return sendImageOrText(
        jid,
        IMAGE.menu,
        menuText(),
        message
      );

    case "setting": {
      const number = Number(args[0]);
      const state = (args[1] || "").toLowerCase();

      const keys = [
        "autoVoice",
        "autoReply",
        "autoGreet",
        "autoRead",
        "voiceReply",
        "ownerMode",
        "autoOnline",
        "autoOffline",
        "autoWelcome",
        "autoStatusSeen"
      ];

      if (
        number >= 1 &&
        number <= keys.length &&
        ["on", "off"].includes(state)
      ) {
        const key = keys[number - 1];

        if (key === "ownerMode" && !owner) {
          return sendText(
            jid,
            "Only the owner can change Owner Mode.",
            message
          );
        }

        settings[key] = state === "on";
        saveData();

        return sendText(
          jid,
          `✅ ${key}: ${state.toUpperCase()}\n\n${settingsText()}`,
          message
        );
      }

      return sendImageOrText(
        jid,
        IMAGE.setting,
        settingsText(),
        message
      );
    }

    case "feature": {
      if (!owner) {
        return sendText(
          jid,
          "👑 Only the owner can change bot features.",
          message
        );
      }

      const featureName = (args[0] || "").toLowerCase();
      const state = (args[1] || "").toLowerCase();

      const aliases = {
        antilink: "antiLink",
        antispam: "antiSpam",
        autoreact: "autoReact",
        typing: "autoTyping",
        goodbye: "autoGoodbye",
        welcome: "autoWelcome"
      };

      const key = aliases[featureName];

      if (!key || !["on", "off"].includes(state)) {
        return sendText(
          jid,
          "Use: .feature antilink|antispam|autoreact|typing|welcome|goodbye on/off",
          message
        );
      }

      if (key in settings) {
        settings[key] = state === "on";
      } else {
        features[key] = state === "on";
      }

      saveData();

      return sendText(
        jid,
        `✅ ${featureName} is ${state.toUpperCase()}.`,
        message
      );
    }

    case "ping":
      return sendText(
        jid,
        "🏓 Pong!\nmethu MD is online!",
        message
      );

    case "uptime":
      return sendText(
        jid,
        `⏱️ Uptime: ${uptime()}`,
        message
      );

    case "alive":
      return sendImageOrText(
        jid,
        IMAGE.alive,
        `✅ *${BOT_NAME} IS ALIVE!*\n\n⏱️ Uptime: ${uptime()}\n👑 Owner: ${OWNER_NAME}`,
        message
      );

    case "owner":
      return sendText(
        jid,
        `👑 Owner: ${OWNER_NAME}\nhttps://wa.me/${OWNER_NUMBER}`,
        message
      );

    case "repo":
      return sendText(
        jid,
        `📦 methu MD Repository:\n${REPO_URL}`,
        message
      );

    case "info":
      return sendText(
        jid,
        `🤖 ${BOT_NAME}\nNode: ${process.version}\nPlatform: ${os.platform()}\nUptime: ${uptime()}\nMode: ${data.mode}`,
        message
      );

    // ========================================
    // NEW COMMAND: CALCULATOR
    // ========================================

    case "calc":
    case "calculate": {
      if (!argText) {
        return sendText(
          jid,
          "🧮 Use: .calc 25+25\nExamples: .calc 100/4 | .calc (5+5)*2",
          message
        );
      }

      try {
        const answer = calculateExpression(argText);

        return sendText(
          jid,
          `🧮 *methu MD CALCULATOR*\n\n${argText} = *${answer}*`,
          message
        );
      } catch (error) {
        return sendText(
          jid,
          `❌ ${error.message}`,
          message
        );
      }
    }

    // ========================================
    // NEW COMMAND: GET PROFILE PICTURE
    // ========================================

    case "getpp":
    case "profilepic": {
      try {
        const targets = mentionedTargets(message);
        const target = targets[0] || sender;

        let pictureUrl;

        try {
          pictureUrl = await sock.profilePictureUrl(
            target,
            "image"
          );
        } catch {
          pictureUrl = null;
        }

        if (!pictureUrl) {
          return sendText(
            jid,
            "❌ Profile picture not found or it is private.",
            message
          );
        }

        return sock.sendMessage(
          jid,
          {
            image: { url: pictureUrl },
            caption: `🖼️ Profile picture\nUser: @${digits(target)}`,
            mentions: [target]
          },
          { quoted: message }
        );
      } catch (error) {
        return sendText(
          jid,
          `Profile picture error: ${error.message}`,
          message
        );
      }
    }

    // ========================================
    // NEW COMMAND: DELETE QUOTED MESSAGE
    // ========================================

    case "delete":
    case "del": {
      const quotedKey = getQuotedMessageKey(message);

      if (!quotedKey) {
        return sendText(
          jid,
          "❌ Reply to the message you want to delete, then send .delete",
          message
        );
      }

      try {
        if (isGroup) {
          await requireGroupAdmin(jid, sender);
        }

        await sock.sendMessage(
          jid,
          { delete: quotedKey }
        );

        return;
      } catch (error) {
        return sendText(
          jid,
          `❌ Delete failed: ${error.message}\nIn groups, the bot may need admin permission.`,
          message
        );
      }
    }

    // ========================================
    // AI COMMAND
    // ========================================

    case "ai":
    case "ask":
      if (!argText) {
        return sendText(
          jid,
          `Use: ${PREFIX}${command} your question`,
          message
        );
      }

      try {
        return sendText(
          jid,
          await askAI(argText),
          message
        );
      } catch (error) {
        return sendText(
          jid,
          `AI Error: ${error.message}`,
          message
        );
      }

    // ========================================
    // YOUTUBE SEARCH
    // ========================================

    case "yt":
    case "song":
    case "play":
    case "video":
      if (!argText) {
        return sendText(
          jid,
          `Use: ${PREFIX}${command} song/video name`,
          message
        );
      }

      try {
        return sendText(
          jid,
          await youtubeSearch(argText),
          message
        );
      } catch (error) {
        return sendText(
          jid,
          `Search Error: ${error.message}`,
          message
        );
      }

    case "lyrics":
      return sendText(
        jid,
        `🎵 Song: ${argText || "Not provided"}\nSearch the song title online for licensed lyrics.`,
        message
      );

    case "translate":
      if (!argText) {
        return sendText(
          jid,
          "Use: .translate en|si|Hello",
          message
        );
      }

      try {
        return sendText(
          jid,
          await translateText(argText),
          message
        );
      } catch (error) {
        return sendText(
          jid,
          `Translate Error: ${error.message}`,
          message
        );
      }

    // ========================================
    // STICKERS
    // ========================================

    case "sticker": {
      const media = await downloadQuotedMedia(message);

      if (!media) {
        return sendText(
          jid,
          "Reply to an image with .sticker",
          message
        );
      }

      try {
        const sticker = await sharp(media)
          .resize(512, 512, {
            fit: "contain",
            background: {
              r: 0,
              g: 0,
              b: 0,
              alpha: 0
            }
          })
          .webp()
          .toBuffer();

        return sock.sendMessage(
          jid,
          { sticker },
          { quoted: message }
        );
      } catch (error) {
        return sendText(
          jid,
          `Sticker Error: ${error.message}`,
          message
        );
      }
    }

    case "toimg": {
      const media = await downloadQuotedMedia(message);

      if (!media) {
        return sendText(
          jid,
          "Reply to a sticker with .toimg",
          message
        );
      }

      try {
        const image = await sharp(media)
          .png()
          .toBuffer();

        return sock.sendMessage(
          jid,
          {
            image,
            caption: "✅ Converted to image."
          },
          { quoted: message }
        );
      } catch (error) {
        return sendText(
          jid,
          `Conversion Error: ${error.message}`,
          message
        );
      }
    }

    case "take": {
      const media = await downloadQuotedMedia(message);

      if (!media) {
        return sendText(
          jid,
          "Reply to an image/sticker with .take name",
          message
        );
      }

      try {
        const sticker = await sharp(media)
          .resize(512, 512, {
            fit: "contain",
            background: {
              r: 0,
              g: 0,
              b: 0,
              alpha: 0
            }
          })
          .webp()
          .toBuffer();

        return sock.sendMessage(
          jid,
          { sticker },
          { quoted: message }
        );
      } catch (error) {
        return sendText(
          jid,
          `Sticker Error: ${error.message}`,
          message
        );
      }
    }

    // ========================================
    // GROUP INFO
    // ========================================

    case "groupinfo": {
      try {
        const group = await getGroup(jid);

        return sendText(
          jid,
          `👥 *${group.subject}*\nMembers: ${group.participants.length}`,
          message
        );
      } catch (error) {
        return sendText(
          jid,
          `Group Error: ${error.message}`,
          message
        );
      }
    }

    case "admins": {
      try {
        const group = await getGroup(jid);
        const admins = group.participants.filter(isAdmin);
        const mentions = admins.map(p => p.id);

        const lines = admins
          .map(p => `@${digits(p.id)}`)
          .join("\n");

        return sock.sendMessage(
          jid,
          {
            text: `👑 *Group Admins*\n${lines || "No admins found."}`,
            mentions
          },
          { quoted: message }
        );
      } catch (error) {
        return sendText(
          jid,
          `Admins Error: ${error.message}`,
          message
        );
      }
    }

    // ========================================
    // NEW COMMAND: GROUP LINK
    // ========================================

    case "grouplink":
    case "linkgroup": {
      if (!isGroup) {
        return sendText(
          jid,
          "This command works in groups only.",
          message
        );
      }

      try {
        await requireGroupAdmin(jid, sender);

        const code = await sock.groupInviteCode(jid);

        if (!code) {
          return sendText(
            jid,
            "❌ Could not retrieve the group invite code.",
            message
          );
        }

        return sendText(
          jid,
          `🔗 *${BOT_NAME} GROUP LINK*\n\nhttps://chat.whatsapp.com/${code}`,
          message
        );
      } catch (error) {
        return sendText(
          jid,
          `❌ ${error.message}`,
          message
        );
      }
    }

    // ========================================
    // NEW COMMAND: SHOW GROUP DESCRIPTION
    // ========================================

    case "groupdesc": {
      try {
        const group = await getGroup(jid);

        return sendText(
          jid,
          `📝 *GROUP DESCRIPTION*\n\n${group.desc || "No group description has been set."}`,
          message
        );
      } catch (error) {
        return sendText(
          jid,
          `Group description error: ${error.message}`,
          message
        );
      }
    }

    // ========================================
    // NEW COMMAND: CHANGE GROUP NAME
    // ========================================

    case "setgroupname":
    case "setname": {
      if (!isGroup) {
        return sendText(
          jid,
          "This command works in groups only.",
          message
        );
      }

      if (!argText) {
        return sendText(
          jid,
          "Use: .setgroupname New Group Name",
          message
        );
      }

      try {
        await requireGroupAdmin(jid, sender);

        await sock.groupUpdateSubject(jid, argText);

        return sendText(
          jid,
          `✅ Group name changed to:\n${argText}`,
          message
        );
      } catch (error) {
        return sendText(
          jid,
          `❌ Group name update failed: ${error.message}`,
          message
        );
      }
    }

    // ========================================
    // NEW COMMAND: CHANGE GROUP DESCRIPTION
    // ========================================

    case "setdesc": {
      if (!isGroup) {
        return sendText(
          jid,
          "This command works in groups only.",
          message
        );
      }

      if (!argText) {
        return sendText(
          jid,
          "Use: .setdesc Your new group description",
          message
        );
      }

      try {
        await requireGroupAdmin(jid, sender);

        await sock.groupUpdateDescription(jid, argText);

        return sendText(
          jid,
          "✅ Group description updated.",
          message
        );
      } catch (error) {
        return sendText(
          jid,
          `❌ Description update failed: ${error.message}`,
          message
        );
      }
    }

    // ========================================
    // TAG ALL / HIDETAG
    // ========================================

    case "tagall":
    case "hidetag": {
      if (!isGroup) {
        return sendText(
          jid,
          "This command works in groups only.",
          message
        );
      }

      try {
        const group = await requireGroupAdmin(jid, sender);
        const mentions = group.participants.map(p => p.id);

        const names = mentions
          .map(id => `@${digits(id)}`)
          .join(" ");

        return sock.sendMessage(
          jid,
          {
            text: `${argText || "📢 Attention everyone"}\n\n${names}`,
            mentions
          },
          { quoted: message }
        );
      } catch (error) {
        return sendText(jid, error.message, message);
      }
    }

    // ========================================
    // KICK / PROMOTE / DEMOTE
    // ========================================

    case "kick":
    case "promote":
    case "demote": {
      if (!isGroup) {
        return sendText(
          jid,
          "This command works in groups only.",
          message
        );
      }

      try {
        await requireGroupAdmin(jid, sender);

        const targets = mentionedTargets(message);

        if (!targets.length) {
          return sendText(
            jid,
            `Use: ${PREFIX}${command} @user (mention or reply to the member)`,
            message
          );
        }

        const action =
          command === "kick" ? "remove" : command;

        await sock.groupParticipantsUpdate(
          jid,
          targets,
          action
        );

        return sendText(
          jid,
          `✅ ${command} request sent.`,
          message
        );
      } catch (error) {
        return sendText(
          jid,
          `❌ ${error.message}`,
          message
        );
      }
    }

    // ========================================
    // ADD MEMBER
    // ========================================

    case "add": {
      if (!isGroup) {
        return sendText(
          jid,
          "This command works in groups only.",
          message
        );
      }

      if (!argText) {
        return sendText(
          jid,
          "Use: .add 947XXXXXXXX",
          message
        );
      }

      try {
        await requireGroupAdmin(jid, sender);

        const number = digits(argText);

        if (number.length < 8) {
          return sendText(
            jid,
            "Enter a valid number with country code.",
            message
          );
        }

        await sock.groupParticipantsUpdate(
          jid,
          [`${number}@s.whatsapp.net`],
          "add"
        );

        return sendText(
          jid,
          `📨 Add request processed for ${number}. WhatsApp may require an invite link or approval.`,
          message
        );
      } catch (error) {
        return sendText(
          jid,
          `❌ ${error.message}`,
          message
        );
      }
    }

    // ========================================
    // MUTE / UNMUTE / OPEN / CLOSE
    // ========================================

    case "mute":
    case "close":
    case "unmute":
    case "open": {
      if (!isGroup) {
        return sendText(
          jid,
          "This command works in groups only.",
          message
        );
      }

      try {
        await requireGroupAdmin(jid, sender);

        const onlyAdmins =
          command === "mute" || command === "close";

        await sock.groupSettingUpdate(
          jid,
          onlyAdmins
            ? "announcement"
            : "not_announcement"
        );

        return sendText(
          jid,
          onlyAdmins
            ? "🔒 Only admins can send messages now."
            : "🔓 All group members can send messages now.",
          message
        );
      } catch (error) {
        return sendText(
          jid,
          `❌ ${error.message}`,
          message
        );
      }
    }

    // ========================================
    // POLL
    // ========================================

    case "poll": {
      if (!isGroup) {
        return sendText(
          jid,
          "This command works in groups only.",
          message
        );
      }

      const parts = argText
        .split("|")
        .map(s => s.trim())
        .filter(Boolean);

      if (parts.length < 3) {
        return sendText(
          jid,
          "Use: .poll Question | Option 1 | Option 2",
          message
        );
      }

      if (parts.length > 13) {
        return sendText(
          jid,
          "A poll can have at most 12 options.",
          message
        );
      }

      return sock.sendMessage(
        jid,
        {
          poll: {
            name: parts[0],
            values: parts.slice(1),
            selectableCount: 1
          }
        },
        { quoted: message }
      );
    }

    // ========================================
    // CUSTOM AUTO REPLIES
    // ========================================

    case "setreply":
    case "addreply": {
      if (!owner) {
        return sendText(
          jid,
          "Only the owner can manage custom replies.",
          message
        );
      }

      const index = argText.indexOf("|");

      if (index < 0) {
        return sendText(
          jid,
          `Use: ${PREFIX}${command} trigger | reply text`,
          message
        );
      }

      const trigger =
        argText.slice(0, index).trim().toLowerCase();

      const reply =
        argText.slice(index + 1).trim();

      if (!trigger || !reply) {
        return sendText(
          jid,
          "Both trigger and reply are required.",
          message
        );
      }

      customReplies[trigger] = reply;
      saveData();

      return sendText(
        jid,
        `✅ Custom reply saved:\n${trigger} → ${reply}`,
        message
      );
    }

    case "delreply": {
      if (!owner) {
        return sendText(
          jid,
          "Only the owner can manage custom replies.",
          message
        );
      }

      const trigger = argText.toLowerCase().trim();

      if (!trigger) {
        return sendText(
          jid,
          "Use: .delreply trigger",
          message
        );
      }

      if (!(trigger in customReplies)) {
        return sendText(
          jid,
          "That trigger was not found.",
          message
        );
      }

      delete customReplies[trigger];
      saveData();

      return sendText(
        jid,
        `🗑️ Deleted custom reply: ${trigger}`,
        message
      );
    }

    case "listreply": {
      const entries = Object.entries(customReplies);

      if (!entries.length) {
        return sendText(
          jid,
          "No custom replies saved yet.",
          message
        );
      }

      return sendText(
        jid,
        "💬 *Custom Replies*\n" +
          entries
            .map(([key, value]) => `• ${key} → ${value}`)
            .join("\n"),
        message
      );
    }

    // ========================================
    // NEW COMMAND: AFK
    // ========================================

    case "afk": {
      const userKey = digits(sender);

      afkUsers.set(userKey, {
        jid: sender,
        reason: argText || "No reason provided",
        since: Date.now()
      });

      return sendText(
        jid,
        `💤 *AFK MODE ENABLED*\n\nReason: ${argText || "No reason provided"}\n\nUse .back when you return.`,
        message
      );
    }

    // ========================================
    // NEW COMMAND: BACK
    // ========================================

    case "back": {
      const userKey = digits(sender);
      const wasAfk = afkUsers.get(userKey);

      if (!wasAfk) {
        return sendText(
          jid,
          "ℹ️ You are not marked as AFK.",
          message
        );
      }

      afkUsers.delete(userKey);

      const duration = Math.max(
        0,
        Math.floor((Date.now() - wasAfk.since) / 1000)
      );

      return sendText(
        jid,
        `✅ Welcome back!\nYou were away for ${duration} seconds. 💚`,
        message
      );
    }

    // ========================================
    // NEW COMMAND: REMINDER
    // ========================================

    case "remind":
    case "reminder": {
      const match = argText.match(/^(\d+)\s+([\s\S]+)$/);

      if (!match) {
        return sendText(
          jid,
          "⏰ Use: .remind 5 Drink water\nThe number is minutes.",
          message
        );
      }

      const minutes = Number(match[1]);
      const reminderText = match[2].trim();

      if (
        !Number.isInteger(minutes) ||
        minutes < 1 ||
        minutes > 10080
      ) {
        return sendText(
          jid,
          "❌ Choose a reminder time between 1 minute and 7 days.",
          message
        );
      }

      const delay = minutes * 60 * 1000;

      const timer = setTimeout(async () => {
        reminderTimers.delete(timer);

        try {
          await sendText(
            jid,
            `⏰ *DEW MD REMINDER*\n\n${reminderText}`,
            null
          );
        } catch (error) {
          console.error("Reminder error:", error.message);
        }
      }, delay);

      reminderTimers.add(timer);

      return sendText(
        jid,
        `⏰ Reminder set!\n\nIn: ${minutes} minute(s)\nReminder: ${reminderText}\n\n⚠️ This reminder will be lost if the bot restarts.`,
        message
      );
    }

    // ========================================
    // EXISTING FUN COMMANDS
    // ========================================

    case "joke":
      return sendText(
        jid,
        jokes[Math.floor(Math.random() * jokes.length)],
        message
      );

    case "fact":
      return sendText(
        jid,
        facts[Math.floor(Math.random() * facts.length)],
        message
      );

    case "quote":
      return sendText(
        jid,
        quotes[Math.floor(Math.random() * quotes.length)],
        message
      );

    case "8ball":
    case "8-ball": {
      if (!argText) {
        return sendText(
          jid,
          "Use: .8ball your question",
          message
        );
      }

      const answers = [
        "Yes, definitely! 🎯",
        "Looks promising. ✨",
        "Ask again later. 🔮",
        "Probably not. 🌧️",
        "I can't tell right now. 🤔",
        "Absolutely! 💚"
      ];

      return sendText(
        jid,
        `🎱 ${answers[Math.floor(Math.random() * answers.length)]}`,
        message
      );
    }

    case "roll": {
      const sides = Math.min(
        100,
        Math.max(2, Number(args[0]) || 6)
      );

      return sendText(
        jid,
        `🎲 You rolled: ${Math.floor(Math.random() * sides) + 1} (1-${sides})`,
        message
      );
    }

    case "goodnight":
    case "gnight":
      return sendText(
        jid,
        "🌙 Good night! Sweet dreams! 💖✨\nMay tomorrow bring you happiness and beautiful moments. 💚",
        message
      );

    case "ship": {
      const targets = mentionedTargets(message);

      if (targets.length < 2) {
        return sendText(
          jid,
          "💞 *DEW MD COMPATIBILITY GAME* 💞\n\nUse: .ship @user1 @user2\n\nMention two users in your message!",
          message
        );
      }

      const first = targets[0];
      const second = targets[1];

      const percentage = Math.floor(Math.random() * 101);

      let result;

      if (percentage >= 80) {
        result = "Perfect match! 💖💕";
      } else if (percentage >= 60) {
        result = "Looking good! 🥰💞";
      } else if (percentage >= 40) {
        result = "Good friendship vibes! 💚✨";
      } else {
        result = "Just friends for now! 😄🤝";
      }

      return sock.sendMessage(
        jid,
        {
          text:
            `💞 *methu MD COMPATIBILITY GAME* 💞\n\n` +
            `👤 @${digits(first)}\n❤️ + ❤️\n👤 @${digits(second)}\n\n` +
            `💘 Fun score: ${percentage}%\n${result}\n\n` +
            `⚠️ Just for fun — not a real compatibility test!`,
          mentions: [first, second]
        },
        { quoted: message }
      );
    }

    case "compliment": {
      const targets = mentionedTargets(message);

      if (targets.length > 0) {
        const target = targets[0];

        const compliments = [
          "You spread positive energy wherever you go! ✨",
          "Your kindness makes a difference! 💚",
          "Keep being your wonderful self! 🌟",
          "You deserve happiness and success! 💖",
          "Your smile can brighten someone's day! 😊",
          "You have the power to achieve great things! 🚀"
        ];

        const compliment =
          compliments[Math.floor(Math.random() * compliments.length)];

        return sock.sendMessage(
          jid,
          {
            text: `💖 Hey @${digits(target)}!\n\n${compliment}`,
            mentions: [target]
          },
          { quoted: message }
        );
      }

      const compliments = [
        "You are amazing just the way you are! 💖",
        "Keep smiling and spreading kindness! 😊💚",
        "Believe in yourself and keep going! 🌟",
        "You deserve good things in life! ✨",
        "Your kindness matters! 💕"
      ];

      return sendText(
        jid,
        `💖 ${compliments[Math.floor(Math.random() * compliments.length)]}`,
        message
      );
    }

    case "truth": {
      const questions = [
        "What is one thing that always makes you smile? 😊",
        "What is your favourite memory? 💭",
        "What is one skill you want to learn? 🌟",
        "What is your favourite song right now? 🎵",
        "What is one goal you want to achieve? 🚀",
        "What is the funniest thing that happened to you recently? 😂",
        "Which place would you love to visit someday? 🌍",
        "What is something you are proud of? 💚"
      ];

      return sendText(
        jid,
        `🎯 *TRUTH TIME!*\n\n${questions[Math.floor(Math.random() * questions.length)]}\n\n💚 You can skip any question.`,
        message
      );
    }

    case "dare": {
      const dares = [
        "Send your favourite emoji! 😎",
        "Share your favourite song title! 🎵",
        "Say one nice thing about a friend! 💚",
        "Tell everyone your favourite movie! 🎬",
        "Write a positive message for the group! ✨",
        "Share three things you enjoy! 🌟",
        "Send a funny but friendly joke! 😂",
        "Give someone a genuine compliment! 💖"
      ];

      return sendText(
        jid,
        `😈 *DARE TIME!*\n\n${dares[Math.floor(Math.random() * dares.length)]}\n\n💚 Keep it fun, safe and respectful!`,
        message
      );
    }

    case "flip":
    case "coinflip": {
      const result =
        Math.random() < 0.5 ? "HEADS 🪙" : "TAILS 🪙";

      return sendText(
        jid,
        `🪙 *methu MD COIN FLIP*\n\nResult: ${result}`,
        message
      );
    }

    case "choose": {
      const options = argText
        .split("|")
        .map(option => option.trim())
        .filter(Boolean);

      if (options.length < 2) {
        return sendText(
          jid,
          "🎲 *methu MD CHOICE MAKER*\n\nUse:\n.choose Pizza | Burger | Kottu",
          message
        );
      }

      if (options.length > 20) {
        return sendText(
          jid,
          "❌ Please provide no more than 20 options.",
          message
        );
      }

      const selected =
        options[Math.floor(Math.random() * options.length)];

      return sendText(
        jid,
        `🎲 *methu MD HAS CHOSEN!*\n\n${options.map((option, index) => `${index + 1}. ${option}`).join("\n")}\n\n💚 My choice: *${selected}*`,
        message
      );
    }

    // ========================================
    // OWNER MODE
    // ========================================

    case "mode": {
      if (!owner) {
        return sendText(
          jid,
          "👑 Only the owner can change mode.",
          message
        );
      }

      const mode = (args[0] || "").toLowerCase();

      if (!["public", "private"].includes(mode)) {
        return sendText(
          jid,
          "Use: .mode public OR .mode private",
          message
        );
      }

      data.mode = mode;
      settings.ownerMode = mode === "private";

      saveData();

      return sendText(
        jid,
        `✅ methu MD mode set to ${mode.toUpperCase()}.`,
        message
      );
    }

    // ========================================
    // CHANGE PREFIX
    // ========================================

    case "setprefix": {
      if (!owner) {
        return sendText(
          jid,
          "👑 Only the owner can change prefix.",
          message
        );
      }

      const newPrefix = argText.trim();

      if (
        !newPrefix ||
        newPrefix.length > 4 ||
        /\s/.test(newPrefix)
      ) {
        return sendText(
          jid,
          "Use: .setprefix ! (1–4 characters, no spaces)",
          message
        );
      }

      PREFIX = newPrefix;
      data.prefix = newPrefix;

      saveData();

      return sendText(
        jid,
        `✅ Prefix changed to: ${PREFIX}\nExample: ${PREFIX}menu`,
        message
      );
    }

    // ========================================
    // RESTART NOTE
    // ========================================

    case "restart": {
      if (!owner) {
        return sendText(
          jid,
          "👑 Only the owner can use this command.",
          message
        );
      }

      return sendText(
        jid,
        "⚠️ GitHub Actions cannot safely restart its own running workflow using this command. Open GitHub Actions and stop/rerun the workflow to restart DEW MD.",
        message
      );
    }

    default:
      return;
  }
}

// ========================================
// START BOT
// ========================================

async function startBot() {
  if (connecting) return;

  connecting = true;

  try {
    const { state, saveCreds } =
      await useMultiFileAuthState("./session");

    const currentSock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      browser: [BOT_NAME, "Chrome", "1.0.0"],
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: settings.autoOnline
    });

    sock = currentSock;

    currentSock.ev.on("creds.update", saveCreds);

    // ========================================
    // CONNECTION
    // ========================================

    currentSock.ev.on(
      "connection.update",
      async ({ connection, lastDisconnect }) => {

        if (
          connection === "connecting" &&
          !state.creds.registered &&
          !pairingRequested
        ) {
          pairingRequested = true;

          setTimeout(async () => {
            try {
              if (
                !state.creds.registered &&
                currentSock.requestPairingCode
              ) {
                const code =
                  await currentSock.requestPairingCode(
                    OWNER_NUMBER
                  );

                console.log("PAIRING CODE:", code);
                console.log(
                  "WhatsApp > Linked devices > Link with phone number"
                );
              }
            } catch (error) {
              console.error(
                "Pairing error:",
                error.message
              );

              pairingRequested = false;
            }
          }, 5000);
        }

        if (connection === "open") {
          connecting = false;
          pairingRequested = false;

          console.log(`✅ ${BOT_NAME} connected!`);
          console.log(`🤖 ${BOT_NAME} is online!`);
        }

        if (connection === "close") {
          connecting = false;

          const statusCode =
            lastDisconnect?.error?.output?.statusCode;

          console.log(
            "Connection closed:",
            statusCode || "unknown"
          );

          if (
            statusCode === DisconnectReason.loggedOut
          ) {
            console.log(
              "Logged out. Relink only if WhatsApp requires it."
            );

            return;
          }

          if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              pairingRequested = false;

              startBot().catch(error => {
                console.error(
                  "Reconnect error:",
                  error.message
                );
              });
            }, 5000);
          }
        }
      }
    );

    // ========================================
    // GROUP WELCOME / GOODBYE EVENTS
    // ========================================

    currentSock.ev.on(
      "group-participants.update",
      async update => {
        try {
          const groupJid = update.id;

          if (!groupJid) return;

          if (
            update.action === "add" &&
            settings.autoWelcome
          ) {
            for (const participant of update.participants) {
              await currentSock.sendMessage(
                groupJid,
                {
                  text: `👋 Welcome @${digits(participant)} to the group! 💚`,
                  mentions: [participant]
                }
              ).catch(() => {});
            }
          }

          if (
            update.action === "remove" &&
            features.autoGoodbye
          ) {
            for (const participant of update.participants) {
              await currentSock.sendMessage(
                groupJid,
                {
                  text: `👋 @${digits(participant)} has left the group.`,
                  mentions: [participant]
                }
              ).catch(() => {});
            }
          }
        } catch (error) {
          console.error(
            "Group update error:",
            error.message
          );
        }
      }
    );

    // ========================================
    // INCOMING MESSAGES
    // ========================================

    currentSock.ev.on(
      "messages.upsert",
      async ({ messages, type }) => {
        if (type !== "notify") return;

        for (const message of messages) {
          try {
            if (
              !message.message ||
              message.key.fromMe
            ) {
              continue;
            }

            const jid = message.key.remoteJid;

            if (
              !jid ||
              jid === "status@broadcast"
            ) {
              continue;
            }

            const messageId = message.key.id;

            if (
              messageId &&
              processed.has(messageId)
            ) {
              continue;
            }

            if (messageId) {
              processed.add(messageId);

              if (processed.size > 2000) {
                processed.clear();
              }
            }

            const sender =
              message.key.participant || jid;

            const text = getText(message);
            const lower = text.toLowerCase().trim();
            const isGroup = jid.endsWith("@g.us");

            // ========================================
            // AUTO READ
            // ========================================

            if (settings.autoRead) {
              await currentSock
                .readMessages([message.key])
                .catch(() => {});
            }

            // ========================================
            // AFK: WELCOME BACK
            // ========================================

            const senderKey = digits(sender);
            const senderAfk = afkUsers.get(senderKey);

            if (
              senderAfk &&
              text &&
              !text.startsWith(PREFIX)
            ) {
              afkUsers.delete(senderKey);

              await sendText(
                jid,
                `✅ @${senderKey} is back online! 💚`,
                null
              ).catch(() => {});
            }

            // ========================================
            // AFK: NOTIFY IF SOMEONE MENTIONS AFK USER
            // ========================================

            const context = getQuotedContext(message);
            const mentioned = context?.mentionedJid || [];

            for (const mentionedJid of mentioned) {
              const afk = afkUsers.get(digits(mentionedJid));

              if (afk) {
                await sendText(
                  jid,
                  `💤 @${digits(mentionedJid)} is currently AFK.\nReason: ${afk.reason}`,
                  null
                ).catch(() => {});
              }
            }

            // ========================================
            // AUTO TYPING
            // ========================================

            if (features.autoTyping && text) {
              await currentSock.sendPresenceUpdate(
                "composing",
                jid
              ).catch(() => {});

              await new Promise(resolve =>
                setTimeout(resolve, 700)
              );

              await currentSock.sendPresenceUpdate(
                "paused",
                jid
              ).catch(() => {});
            }

            // ========================================
            // ANTI-LINK
            // ========================================

            if (
              isGroup &&
              features.antiLink &&
              /(https?:\/\/|www\.|chat\.whatsapp\.com\/)/i.test(text)
            ) {
              try {
                const group =
                  await currentSock.groupMetadata(jid);

                const senderParticipant =
                  participantFor(group, sender);

                const botParticipant =
                  participantFor(group, currentSock.user?.id);

                if (
                  !isAdmin(senderParticipant) &&
                  isAdmin(botParticipant)
                ) {
                  await currentSock.sendMessage(
                    jid,
                    { delete: message.key }
                  ).catch(() => {});

                  await sendText(
                    jid,
                    "🛡️ Anti-Link: links are not allowed here."
                  ).catch(() => {});

                  continue;
                }
              } catch (error) {
                console.error(
                  "Anti-link error:",
                  error.message
                );
              }
            }

            // ========================================
            // ANTI-SPAM
            // ========================================

            if (
              isGroup &&
              features.antiSpam &&
              text
            ) {
              const key = `${jid}:${digits(sender)}`;
              const now = Date.now();
              const previous = spamTracker.get(key) || [];

              const recent = previous.filter(
                time => now - time < 5000
              );

              recent.push(now);
              spamTracker.set(key, recent);

              if (recent.length >= 6) {
                try {
                  const group =
                    await currentSock.groupMetadata(jid);

                  const senderParticipant =
                    participantFor(group, sender);

                  const botParticipant =
                    participantFor(group, currentSock.user?.id);

                  if (
                    !isAdmin(senderParticipant) &&
                    isAdmin(botParticipant)
                  ) {
                    await currentSock.sendMessage(
                      jid,
                      { delete: message.key }
                    ).catch(() => {});

                    await sendText(
                      jid,
                      "🚫 Anti-Spam: please slow down."
                    ).catch(() => {});

                    continue;
                  }
                } catch (error) {
                  console.error(
                    "Anti-spam error:",
                    error.message
                  );
                }
              }
            }

            // ========================================
            // AUTO REACT
            // ========================================

            if (features.autoReact) {
              const reactions = ["💚", "✨", "🔥", "❤️"];

              const emoji =
                reactions[
                  Math.floor(Math.random() * reactions.length)
                ];

              await currentSock.sendMessage(
                jid,
                {
                  react: {
                    text: emoji,
                    key: message.key
                  }
                }
              ).catch(() => {});
            }

            // ========================================
            // COMMANDS
            // ========================================

            if (text.startsWith(PREFIX)) {
              await handleCommand(
                jid,
                sender,
                text,
                message,
                isGroup
              );

              continue;
            }

            // ========================================
            // CUSTOM AUTO REPLIES
            // ========================================

            if (
              lower &&
              Object.prototype.hasOwnProperty.call(
                customReplies,
                lower
              )
            ) {
              await sendText(
                jid,
                customReplies[lower],
                message
              );

              continue;
            }

            // ========================================
            // AUTO VOICE
            // ========================================

            if (
              settings.autoVoice ||
              settings.voiceReply
            ) {
              if (lower === "mk") {
                await sendVoice(
                  jid,
                  AUDIO.mk,
                  message
                );
              } else if (lower === "gm") {
                await sendVoice(
                  jid,
                  AUDIO.gm,
                  message
                );
              } else if (lower === "gn") {
                await sendVoice(
                  jid,
                  AUDIO.gn,
                  message
                );
              }
            }

            // ========================================
            // AUTO TEXT REPLIES
            // ========================================

            if (
              lower === "mk" &&
              settings.autoReply
            ) {
              await sendText(
                jid,
                "Mokuth na ithin",
                message
              );
            }

            if (
              lower === "gm" &&
              settings.autoGreet
            ) {
              await sendText(
                jid,
                "Good morning 💞",
                message
              );
            }

            if (
              lower === "gn" &&
              settings.autoGreet
            ) {
              await sendText(
                jid,
                "Good night 💞",
                message
              );
            }

          } catch (error) {
            console.error(
              "Message handler error:",
              error.message
            );
          }
        }
      }
    );

  } catch (error) {
    connecting = false;

    console.error(
      "Bot startup error:",
      error.message
    );

    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;

        startBot().catch(err => {
          console.error(
            "Restart error:",
            err.message
          );
        });
      }, 10000);
    }
  }
}

// ========================================
// ERROR HANDLING
// ========================================

process.on(
  "unhandledRejection",
  error => {
    console.error("Unhandled rejection:", error);
  }
);

process.on(
  "uncaughtException",
  error => {
    console.error("Uncaught exception:", error);
  }
);

// ========================================
// RUN BOT
// ========================================

startBot().catch(error => {
  console.error("Fatal startup error:", error);
});
