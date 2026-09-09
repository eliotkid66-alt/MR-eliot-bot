const jidNormalizedUser = require("@whiskeysockets/baileys").jidNormalizedUser;
const os = require("os");

/* Logs colorés */
const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", c: "\x1b[36m", m: "\x1b[35m", x: "\x1b[0m" };
const ts = () => new Date().toLocaleTimeString("fr-FR");
const log = {
    msg: (u, t) => console.log(`${C.c}[MSG ${ts()}]${C.x} ${u} : ${t.slice(0, 60)}`),
    cmd: (u, c) => console.log(`${C.m}[CMD ${ts()}]${C.x} ${c} ← ${u}`),
    err: (m) => console.log(`${C.r}[ERREUR ${ts()}]${C.x} ${m}`)
};

/* Auto-react : état par chat (persistant en mémoire) */
const autoReact = {};

/* Emojis pour l'auto-react */
const REACT_EMOJIS = ["👍", "🔥", "😂", "❤️", "😮", "👏"];

/* ================== HANDLER PRINCIPAL ================== */
async function messageHandler(sock, { messages, type }, ctx) {
    if (type !== "notify") return;
    const m = messages[0];
    if (!m.message || m.key.fromMe) return;

    const { config, commands, db, saveDB } = ctx;

    const jid = m.key.remoteJid;
    const sender = jidNormalizedUser(m.key.participant || jid);
    const isGroup = jid.endsWith("@g.us");
    const isOwner = sender.replace(/\D/g, "") === config.ownerNumber.replace(/\D/g, "");

    /* Extraction du texte selon le type de message */
    const body =
        m.message.conversation ||
        m.message.extendedTextMessage?.text ||
        m.message.imageMessage?.caption ||
        m.message.videoMessage?.caption ||
        m.message.documentMessage?.caption ||
        "";

    const pushName = m.pushName || "Inconnu";

    /* Log de chaque message */
    if (body) log.msg(`${pushName} (${sender.split("@")[0]})`, body);

    /* ---------- AUTO-REACT ---------- */
    if (autoReact[jid] && body) {
        sock.sendMessage(jid, {
            react: { text: REACT_EMOJIS[Math.floor(Math.random() * REACT_EMOJIS.length)], key: m.key }
        }).catch(() => {});
    }

    /* ---------- STATISTIQUES / XP ---------- */
    if (!db.users[sender]) db.users[sender] = { name: pushName, messages: 0, warnings: 0, banned: false, xp: 0 };
    db.users[sender].messages++;
    db.users[sender].xp += Math.floor(Math.random() * 5) + 1;
    if (isGroup && !db.chats[jid]) db.chats[jid] = { messages: 0 };
    if (isGroup) db.chats[jid].messages++;
    saveDB();

    /* ---------- UTILISATEUR BANNI ---------- */
    if (db.users[sender].banned && !isOwner) return;

    /* ---------- ANTI-LINK (groupes) ---------- */
    if (isGroup && db.settings.antilink && !isOwner && /chat\.whatsapp\.com\/\S+/i.test(body)) {
        await sock.sendMessage(jid, { delete: m.key }).catch(() => {});
        await sock.sendMessage(jid, {
            text: `🚫 @${sender.split("@")[0]} les liens de groupe sont interdits !`,
            mentions: [sender]
        });
        return;
    }

    /* ---------- PAS UNE COMMANDE ? STOP ---------- */
    const prefix = config.prefix;
    if (!body.startsWith(prefix)) return;

    const args = body.slice(prefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    log.cmd(`${pushName} (${sender.split("@")[0]})`, prefix + cmd);

    const reply = (text) => sock.sendMessage(jid, { text }, { quoted: m });

    try {
        /* ---------- COMMANDES INTERNES ---------- */
        switch (cmd) {
            case "menu": {
                const cmdList = Object.keys(commands)
                    .map(c => `├ ${prefix}${c} — ${commands[c].description || ""}`)
                    .join("\n");
                await reply(
`╭━━〔 ${config.botName} 〕━⬣
┃ 🤖 Préfixe : ${prefix}
┃ 👑 Owner : ${config.ownerName}
┃ 📦 Commandes : ${Object.keys(commands).length + 4}
╰━━━━━━━━━━━━━━━━⬣
📌 *COMMANDES :*
├ ${prefix}menu — Afficher ce menu
├ ${prefix}info — Infos du bot
├ ${prefix}stats — Tes statistiques
├ ${prefix}owner — Contacter le créateur
${cmdList}
╰━━━━━━━━━━━━━━━━⬣`);
                break;
            }

            case "info": {
                const up = process.uptime();
                await reply(
`🤖 *${config.botName}* v${config.VERSION}
📱 Propulsé par Baileys
👑 Propriétaire : ${config.ownerName}
⏳ Uptime : ${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m
💾 RAM : ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB
🖥 Plateforme : ${os.platform()}`);
                break;
            }

            case "owner":
                await reply(`👑 Owner : wa.me/${config.ownerNumber.replace(/\D/g, "")}`);
                break;

            case "stats": {
                const u = db.users[sender];
                await reply(`📊 Stats de ${pushName} :\n├ Messages : ${u.messages}\n├ XP : ${u.xp}\n├ Warnings : ${u.warnings}`);
                break;
            }

            case "ban":
            case "unban": {
                if (!isOwner) return reply("⛔ Réservé au propriétaire.");
                if (!args[0]) return reply(`❌ Utilisation : ${prefix}${cmd} <numéro>`);
                const target = args[0].replace(/\D/g, "") + "@s.whatsapp.net";
                db.users[target] = db.users[target] || { name: "", messages: 0, warnings: 0, banned: false, xp: 0 };
                db.users[target].banned = (cmd === "ban");
                saveDB();
                await reply(`✅ Utilisateur ${cmd === "ban" ? "banni" : "débanni"}.`);
                break;
            }

            /* ---------- COMMANDES EXTERNES (commands/) ---------- */
            default: {
                if (commands[cmd]) {
                    // Cas spécial : react auto géré ici pour la persistance
                    if (cmd === "react" && args[0]?.toLowerCase() === "auto") {
                        autoReact[jid] = !autoReact[jid];
                        return reply(`✅ Réaction auto ${autoReact[jid] ? "activée" : "désactivée"} ici.`);
                    }
                    await commands[cmd].execute(sock, m, args, config, isOwner, db);
                } else {
                    await reply(`❓ Commande inconnue. Tape ${prefix}menu`);
                }
            }
        }
    } catch (e) {
        log.err(`Commande ${cmd} : ${e.message}`);
        await reply("⚠️ Une erreur est survenue.");
    }
}

module.exports = messageHandler;