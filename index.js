const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    jidNormalizedUser
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const readline = require("readline");
const fs = require("fs-extra");
const config = require("./config");

/* ================== MINI BASE DE DONNÉES ================== */
const DB_PATH = "./db.json";
let db = fs.readJSONSync(DB_PATH);
const saveDB = () => fs.writeJSONSync(DB_PATH, db, { spaces: 2 });

/* ================== SAISIE DU NUMÉRO DANS LE TERMINAL ================== */
const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(text, (ans) => { rl.close(); resolve(ans); }));
};

/* ================== CONNEXION ================== */
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,          // ← pas de QR
        logger: pino({ level: "silent" }),
        browser: ["Chrome (Linux)", "", ""] // ← important pour activer le pairing code
    });

    // Si pas encore de session enregistrée → demander le code de jumelage
    if (!sock.authState.creds.registered) {
        const numero = await question("📱 Entre ton numéro WhatsApp (format international sans +, ex : 2250700000000) : ");
        const code = await sock.requestPairingCode(numero.replace(/\D/g, ""));
        console.log(`\n🔑 TON CODE DE JUMELAGE : ${code?.match(/.{1,4}/g)?.join("-") || code}\n`);
        console.log("👉 WhatsApp > Appareils connectés > Connecter avec le numéro de téléphone\n");
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
        if (connection === "open") {
            console.log(`✅ ${config.botName} connecté avec succès !`);
        }
        if (connection === "close") {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                console.log("🔄 Reconnexion en cours...");
                startBot();
            } else {
                console.log("❌ Session déconnectée. Supprime le dossier ./session et relance.");
            }
        }
    });

    /* ================== GESTION DES MESSAGES ================== */
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const jid = m.key.remoteJid;
        const sender = jidNormalizedUser(m.key.participant || jid);
        const body = m.message.conversation ||
                     m.message.extendedTextMessage?.text ||
                     m.message.imageMessage?.caption || "";

        if (!body) return;
        const prefix = config.prefix;
        if (!body.startsWith(prefix)) return;

        const args = body.slice(prefix.length).trim().split(/ +/);
        const cmd = args.shift().toLowerCase();
        const isOwner = sender.replace(/\D/g, "") === config.ownerNumber.replace(/\D/g, "");

        const reply = (text) => sock.sendMessage(jid, { text }, { quoted: m });

        console.log(`[CMD] ${cmd} | De : ${sender}`);

        try {
            switch (cmd) {
                case "menu":
                    await reply(
`╭━━〔 ${config.botName} 〕━⬣
┃ 🤖 Préfixe : ${prefix}
┃ 👑 Owner : ${config.ownerName}
╰━━━━━━━━━━━━━━━━⬣
📌 *COMMANDES DISPONIBLES :*
├ ${prefix}menu — Afficher ce menu
├ ${prefix}ping — Vérifier la latence
├ ${prefix}info — Infos du bot
├ ${prefix}owner — Contacter le créateur
╰━━━━━━━━━━━━━━━━⬣`);
                    break;

                case "ping": {
                    const start = Date.now();
                    await reply("🏓 Pong !");
                    await sock.sendMessage(jid, { text: `⏱ Latence : ${Date.now() - start} ms` }, { quoted: m });
                    break;
                }

                case "info":
                    await reply(
`🤖 *${config.botName}* v${config.VERSION}
📱 Fonctionne avec Baileys
👑 Propriétaire : ${config.ownerName}`);
                    break;

                case "owner":
                    await reply(`👑 Owner : wa.me/${config.ownerNumber.replace(/\D/g, "")}`);
                    break;

                default:
                    await reply(`❓ Commande inconnue. Tape ${prefix}menu`);
            }
        } catch (e) {
            console.error("Erreur commande :", e);
            await reply("⚠️ Une erreur est survenue.");
        }

        // anti-link (groupes)
        if (db.settings.antilink && jid.endsWith("@g.us") && /chat\.whatsapp\.com\/\S+/i.test(body)) {
            if (!isOwner) {
                await sock.sendMessage(jid, { delete: m.key });
                await reply("🚫 Les liens de groupe sont interdits ici !");
            }
        }

        saveDB();
    });

    /* ================== BIENVENUE (GROUPES) ================== */
    sock.ev.on("group-participants.update", async ({ id, participants, action }) => {
        if (!db.settings.welcome) return;
        for (const p of participants) {
            if (action === "add") {
                await sock.sendMessage(id, {
                    text: `👋 Bienvenue @${p.split("@")[0]} dans le groupe !\n🤖 — ${config.botName}`,
                    mentions: [p]
                });
            }
        }
    });
}

startBot();