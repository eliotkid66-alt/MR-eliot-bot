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

/* ================== BASE DE DONNÉES ================== */
const DB_PATH = "./db.json";
let db = fs.readJSONSync(DB_PATH);
const saveDB = () => fs.writeJSONSync(DB_PATH, db, { spaces: 2 });

/* ================== LOGS COLORÉS ================== */
const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", c: "\x1b[36m", m: "\x1b[35m", x: "\x1b[0m" };
const ts = () => new Date().toLocaleTimeString("fr-FR");
const log = {
    info: (m) => console.log(`${C.c}[INFO ${ts()}]${C.x} ${m}`),
    ok: (m) => console.log(`${C.g}[OK ${ts()}]${C.x} ${m}`),
    warn: (m) => console.log(`${C.y}[WARN ${ts()}]${C.x} ${m}`),
    err: (m) => console.log(`${C.r}[ERREUR ${ts()}]${C.x} ${m}`),
    cmd: (u, c) => console.log(`${C.m}[CMD ${ts()}]${C.x} ${c} ← ${u}`)
};

/* ================== SAISIE TERMINAL ================== */
const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(text, (ans) => { rl.close(); resolve(ans); }));
};

/* ================== CHARGEMENT AUTOMATIQUE DES COMMANDES ================== */
const commands = {};
if (fs.existsSync("./commands")) {
    fs.readdirSync("./commands").filter(f => f.endsWith(".js")).forEach(file => {
        try {
            const cmd = require(`./commands/${file}`);
            commands[cmd.name] = cmd;
            log.ok(`Commande chargée : .${cmd.name}`);
        } catch (e) {
            log.err(`Échec du chargement : ${file} → ${e.message}`);
        }
    });
    log.info(`📦 ${Object.keys(commands).length} commande(s) : ${Object.keys(commands).join(", ")}`);
} else {
    log.warn("Dossier ./commands introuvable — seules les commandes internes fonctionnent.");
}

/* ================== AUTO-REACT (par chat) ================== */
const autoReact = {}; // { jid: true/false }

/* ================== CONNEXION ================== */
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: ["Chrome (Linux)", "", ""] // requis pour le pairing code
    });

    // Pairing code si pas de session enregistrée
    if (!sock.authState.creds.registered) {
        const numero = await question("📱 Entre ton numéro WhatsApp (sans +, ex : 2250700000000) : ");
        const code = await sock.requestPairingCode(numero.replace(/\D/g, ""));
        console.log(`\n🔑 TON CODE DE JUMELAGE : ${code?.match(/.{1,4}/g)?.join("-") || code}\n`);
        console.log("👉 WhatsApp > Appareils connectés > Connecter avec le numéro de téléphone\n");
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
        if (connection === "open") log.ok(`${config.botName} connecté avec succès !`);
        if (connection === "close") {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                log.warn("Reconnexion en cours...");
                startBot();
            } else {
                log.err("Session déconnectée. Supprime le dossier ./session et relance.");
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

        const isGroup = jid.endsWith("@g.us");
        const isOwner = sender.replace(/\D/g, "") === config.ownerNumber.replace(/\D/g, "");

        /* --- Auto-react --- */
        if (autoReact[jid]) {
            const emojis = ["👍", "🔥", "😂", "❤️", "😮", "👏"];
            await sock.sendMessage(jid, {
                react: { text: emojis[Math.floor(Math.random() * emojis.length)], key: m.key }
            }).catch(() => {});
        }

        /* --- Compteur de messages / XP --- */
        if (!db.users[sender]) db.users[sender] = { messages: 0, warnings: 0, banned: false, xp: 0 };
        db.users[sender].messages++;
        db.users[sender].xp += Math.floor(Math.random() * 5) + 1;
        if (isGroup && !db.chats[jid]) db.chats[jid] = { name: "", antilink: db.settings.antilink };
        saveDB();

        /* --- Utilisateur banni ? --- */
        if (db.users[sender].banned && !isOwner) return;

        /* --- Anti-link (groupes) --- */
        if (isGroup && db.settings.antilink && !isOwner && /chat\.whatsapp\.com\/\S+/i.test(body)) {
            await sock.sendMessage(jid, { delete: m.key }).catch(() => {});
            await sock.sendMessage(jid, { text: `🚫 @${sender.split("@")[0]} les liens sont interdits !`, mentions: [sender] });
            return;
        }

        /* --- Commandes --- */
        const prefix = config.prefix;
        if (!body.startsWith(prefix)) return;

        const args = body.slice(prefix.length).trim().split(/ +/);
        const cmd = args.shift().toLowerCase();
        log.cmd(sender.split("@")[0], prefix + cmd);

        const reply = (text) => sock.sendMessage(jid, { text }, { quoted: m });

        try {
            /* Commandes internes */
            if (cmd === "menu") {
                const cmdList = Object.keys(commands).map(c => `├ ${prefix}${c} — ${commands[c].description || ""}`).join("\n");
                await reply(
`╭━━〔 ${config.botName} 〕━⬣
┃ 🤖 Préfixe : ${prefix}
┃ 👑 Owner : ${config.ownerName}
┃ 📦 Commandes : ${Object.keys(commands).length + 1}
╰━━━━━━━━━━━━━━━━⬣
📌 *COMMANDES :*
├ ${prefix}menu — Afficher ce menu
${cmdList}
╰━━━━━━━━━━━━━━━━⬣`);
            }
            else if (cmd === "info") {
                const os = require("os");
                const up = process.uptime();
                await reply(
`🤖 *${config.botName}* v${config.VERSION}
📱 Propulsé par Baileys
👑 Propriétaire : ${config.ownerName}
⏳ Uptime : ${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m
💾 RAM : ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB
🖥 Plateforme : ${os.platform()}`);
            }
            else if (cmd === "owner") {
                await reply(`👑 Owner : wa.me/${config.ownerNumber.replace(/\D/g, "")}`);
            }
            else if (cmd === "stats") {
                const u = db.users[sender];
                await reply(`📊 Tes stats :\n├ Messages : ${u.messages}\n├ XP : ${u.xp}\n├ Warnings : ${u.warnings}`);
            }
            else if (cmd === "ban" || cmd === "unban") {
                if (!isOwner) return reply("⛔ Réservé au propriétaire.");
                const target = (args[0] || "").replace(/\D/g, "") + "@s.whatsapp.net";
                if (!args[0]) return reply(`❌ Utilisation : ${prefix}${cmd} <numéro>`);
                db.users[target] = db.users[target] || { messages: 0, warnings: 0, banned: false, xp: 0 };
                db.users[target].banned = (cmd === "ban");
                saveDB();
                await reply(`✅ Utilisateur ${cmd === "ban" ? "banni" : "débanni"}.`);
            }
            /* Commandes externes (dossier commands/) */
            else if (commands[cmd]) {
                // react : gérer l'auto-react ici pour la persistance
                if (cmd === "react" && args[0]?.toLowerCase() === "auto") {
                    autoReact[jid] = !autoReact[jid];
                    return reply(`✅ Réaction auto ${autoReact[jid] ? "activée" : "désactivée"} ici.`);
                }
                await commands[cmd].execute(sock, m, args, config, isOwner, db);
            }
            else {
                await reply(`❓ Commande inconnue. Tape ${prefix}menu`);
            }
        } catch (e) {
            log.err(`Commande ${cmd} : ${e.message}`);
            await reply("⚠️ Une erreur est survenue.");
        }
    });

    /* ================== BIENVENUE (GROUPES) ================== */
    sock.ev.on("group-participants.update", async ({ id, participants, action }) => {
        if (!db.settings.welcome) return;
        for (const p of participants) {
            if (action === "add") {
                await sock.sendMessage(id, {
                    text: `👋 Bienvenue @${p.split("@")[0]} dans le groupe !\n🤖 — ${config.botName}`,
                    mentions: [p]
                }).catch(() => {});
            } else if (action === "remove") {
                await sock.sendMessage(id, { text: `😢 @${p.split("@")[0]} a quitté le groupe.` }).catch(() => {});
            }
        }
    });

    /* ================== SAUVEGARDE PÉRIODIQUE ================== */
    setInterval(saveDB, 60000); // toutes les 60s
}

startBot();