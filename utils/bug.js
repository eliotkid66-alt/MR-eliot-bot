module.exports = {
    name: "bug",
    description: "Signaler un bug au créateur : .bug <description>",

    execute: async (sock, m, args, config) => {
        const jid = m.key.remoteJid;
        const sender = m.key.participant || jid;
        const report = args.join(" ");

        if (!report) {
            return sock.sendMessage(jid, { text: "❌ Décris le bug : .bug la commande ping ne répond pas" }, { quoted: m });
        }

        const ownerJid = config.ownerNumber.replace(/\D/g, "") + "@s.whatsapp.net";
        const msg =
`🐞 *NOUVEAU RAPPORT DE BUG*
━━━━━━━━━━━━━━━━
📅 Date : ${new Date().toLocaleString("fr-FR")}
👤 Utilisateur : wa.me/${sender.split("@")[0]}
💬 Chat : ${jid}
📝 Description :
${report}
━━━━━━━━━━━━━━━━
🤖 ${config.botName}`;

        await sock.sendMessage(ownerJid, { text: msg });
        await sock.sendMessage(jid, { text: "✅ Bug signalé au créateur, merci !" }, { quoted: m });
    }
};