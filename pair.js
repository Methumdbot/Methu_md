
const {
  default: makeWASocket,
  useMultiFileAuthState
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function start() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./session");

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["METHU-MD", "Chrome", "1.0.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  if (!state.creds.registered) {
    rl.question("Enter WhatsApp number with country code: ", async (number) => {
      const code = await sock.requestPairingCode(number.trim());
      console.log("METHU-MD PAIRING CODE:", code);
      rl.close();
    });
  }
}

start();
