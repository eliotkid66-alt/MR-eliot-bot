module.exports = {
    name: "ping",
    description: "Latence + infos système",

    execute: async (sock, m) => {
        const jid = m.key.remoteJid;
        const start = Date.now();
        await sock.sendMessage(jid, { react: { text: "🏓", key: m.key } });
        const os = require("os");
        const uptime = process.uptime();
        const h = Math.floor(uptime / 3600), min = Math.floor((uptime % 3600) / 60);

        await sock.sendMessage(jid, {
            text:
`╭━━〔 🏓 PONG 〕━⬣
├ ⏱ Latence : ${Date.now() - start} ms
├ ⏳ Uptime : ${h}h ${min}m
├ 💾 RAM : ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB
├ 🖥 Plateforme : ${os.platform()}
╰━━━━━━━━━━━━━━━━⬣`
        }, { quoted: m });
    }
};