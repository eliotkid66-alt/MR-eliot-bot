module.exports = {
    name: "react",
    description: "Réagit à un message : .react 😎 (ou .react auto pour réagir à tout)",
    admin: false,

    execute: async (sock, m, args) => {
        const jid = m.key.remoteJid;
        const emoji = args[0];

        if (!emoji) {
            return sock.sendMessage(jid, { text: "❌ Utilisation : .react <emoji>" }, { quoted: m });
        }

        if (emoji.toLowerCase() === "auto") {
            // active le mode réaction automatique pour ce chat
            sock.autoReact = sock.autoReact || {};
            sock.autoReact[jid] = !sock.autoReact[jid];
            return sock.sendMessage(jid, {
                text: `✅ Réaction auto ${sock.autoReact[jid] ? "activée" : "désactivée"} ici.`
            }, { quoted: m });
        }

        await sock.sendMessage(jid, { react: { text: emoji, key: m.key } });
    }
};