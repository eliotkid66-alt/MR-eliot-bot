const styles = {
    bold:    { A: 0x1D400 },
    script:  { A: 0x1D4D0 },
    double:  { A: 0x1D538 },
    mono:    { A: 0x1D670 },
    gothic:  { A: 0x1D504 }
};

function convert(text, style) {
    const s = styles[style];
    if (!s) return text;
    return [...text].map(c => {
        const code = c.toUpperCase().charCodeAt(0);
        if (code >= 65 && code <= 90) {
            let ch = String.fromCodePoint(s.A + (code - 65));
            return c === c.toLowerCase() && c !== c.toUpperCase() ? ch : ch;
        }
        return c;
    }).join("");
}

module.exports = {
    name: "style",
    description: "Stylise un texte : .style <script|gothic|mono|double> <texte>",

    execute: async (sock, m, args) => {
        const jid = m.key.remoteJid;
        const style = args[0]?.toLowerCase();
        const text = args.slice(1).join(" ");

        if (!text || !styles[style]) {
            return sock.sendMessage(jid, {
                text: "❌ Utilisation : .style <script|gothic|mono|double> <texte>"
            }, { quoted: m });
        }

        await sock.sendMessage(jid, { text: convert(text, style) }, { quoted: m });
    }
};