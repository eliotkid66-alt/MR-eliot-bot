const { db, saveDB, setSetting, getSetting } = require("../utils/database");

module.exports = {
    name: "config",
    description: "Gestion du bot : .config list / .config <clé> <valeur>",
    admin: true, // réservé au owner

    execute: async (sock, m, args, config, isOwner) => {
        const jid = m.key.remoteJid;

        if (!isOwner) {
            return sock.sendMessage(jid, { text: "⛔ Commande réservée au propriétaire." }, { quoted: m });
        }

        // Lister les paramètres
        if (args[0] === "list" || !args[0]) {
            const lines = Object.entries(db.settings)
                .map(([k, v]) => `├ 🔧 ${k} : ${v}`)
                .join("\n");
            return sock.sendMessage(jid, {
                text: `╭━━〔 ⚙️ CONFIGURATION 〕━⬣\n${lines}\n╰━━━━━━━━━━━━━━━━⬣\n\n💡 Change avec : .config <clé> <valeur>`
            }, { quoted: m });
        }

        // Modifier un paramètre
        const [key, ...rest] = args;
        const rawValue = rest.join(" ");
        let value = rawValue;
        if (rawValue === "true" || rawValue === "on") value = true;
        if (rawValue === "false" || rawValue === "off") value = false;
        else if (!isNaN(rawValue) && rawValue !== "") value = Number(rawValue);

        setSetting(key, value);
        await sock.sendMessage(jid, { text: `✅ \`${key}\` → \`${value}\`` }, { quoted: m });
    }
};