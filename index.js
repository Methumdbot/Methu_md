
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const pino = require("pino");

async function startBot() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./session");

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["METHU-MD", "Chrome", "1.0.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("METHU-MD CONNECTED!");
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;

      if (code !== DisconnectReason.loggedOut) {
        startBot();
      } else {
        console.log("Please pair WhatsApp again.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];

    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    if (text.toLowerCase() === "hi") {
      await sock.sendMessage(from, {
        text: "Hello! 👋 Welcome to METHU-MD BOT ❤️"
      });
    }
  });
}

startBot();
