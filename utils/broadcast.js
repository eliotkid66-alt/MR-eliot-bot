module.exports = {
    name: "bc",
    description: "Diffuser un message : .bc <texte>",
    admin: true,

    execute: async (sock, m, args, config, isOwner, db) => {
        const jid = m.key.remoteJid;
        if (!isOwner) {
            return sock.sendMessage(jid, { text: "⛔ Commande réservée au propriétaire." }, { quoted: m });
        }

        const text = args.join(" ");
        if (!text) return sock.sendMessage(jid, { text: "❌ Écris le message : .bc Maintenance du bot à 22h" }, { quoted: m });

        const knownChats = [...new Set([...Object.keys(db.users || {}), ...Object.keys(db.chats || {})])];
        let sent = 0;

        for (const chat of knownChats) {
            try {
                await sock.sendMessage(chat, { text: `📢 *${config.botName}*\n\n${text}` });
                sent++;
                await new Promise(r => setTimeout(r, 1500)); // délai anti-ban
            } catch (e) { /* ignore */ }
        }

        await sock.sendMessage(jid, { text: `✅ Message diffusé à ${sent} chat(s).` }, { quoted: m });
    }
};