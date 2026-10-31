
const express = require("express");
const pino = require("pino");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("METHU-MD WhatsApp Bot is Running ❤️");
});

app.listen(PORT, () => {
  console.log("METHU-MD Server Started!");
});

async function startBot() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./session");

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["METHU-MD", "Chrome", "1.0.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("METHU-MD CONNECTED ❤️");
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;

      if (code !== DisconnectReason.loggedOut) {
        setTimeout(startBot, 5000);
      } else {
        console.log("WhatsApp logged out. Pair again.");
      }
    }
  });

  if (!state.creds.registered) {
    const number = process.env.PHONE_NUMBER;

    if (number) {
      try {
        const code = await sock.requestPairingCode(number);
        console.log("METHU-MD PAIRING CODE:", code);
      } catch (error) {
        console.log("Pairing error:", error.message);
      }
    } else {
      console.log("PHONE_NUMBER environment variable is missing.");
    }
  }

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];

    if (!msg?.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    if (text.toLowerCase() === "hi") {
      await sock.sendMessage(from, {
        text: "Hello! Welcome to METHU-MD ❤️"
      });
    }
  });
}

startBot().catch(console.error);
