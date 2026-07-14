import axios from 'axios';

async function deleteMsg(conn, m, msg) {
    if (!msg) return;
    try {
        const chatId = m.chat.replace('@t.me', '');
        if (global.tgBot && msg.message_id) {
            await global.tgBot.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
        } else if (msg.key) {
            await conn.sendMessage(m.chat, { delete: msg.key }).catch(() => {});
        }
    } catch (e) {}
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
    const query = text?.trim();
    if (!query) {
        return m.reply(`*WIKIPEDIA SEARCH*\n\nContoh penggunaan:\n\`${usedPrefix + command} Joko Widodo\``);
    }

    let loadingMsg = await m.reply(`_Mencari "${query}" di Wikipedia..._`);

    try {
        // 1. Search page on Wikipedia (Indonesian version)
        const searchUrl = `https://id.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
        const searchRes = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 10000
        });

        const results = searchRes.data?.query?.search;
        if (!results || results.length === 0) {
            await deleteMsg(conn, m, loadingMsg);
            loadingMsg = null;
            return m.reply('❌ Tidak ada hasil ditemukan di Wikipedia.');
        }

        const bestTitle = results[0].title;

        // 2. Fetch page summary extract & main image thumbnail
        const detailsUrl = `https://id.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro=1&explaintext=1&titles=${encodeURIComponent(bestTitle)}&redirects=1&pithumbsize=500&format=json`;
        const detailsRes = await axios.get(detailsUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 10000
        });

        const pages = detailsRes.data?.query?.pages;
        let extract = '';
        let thumbnail = null;

        if (pages) {
            const pageId = Object.keys(pages)[0];
            extract = pages[pageId]?.extract || '';
            thumbnail = pages[pageId]?.thumbnail?.source || null;
        }

        await deleteMsg(conn, m, loadingMsg);
        loadingMsg = null;

        if (!extract.trim()) {
            return m.reply(`❌ Gagal memuat ringkasan untuk "${bestTitle}".`);
        }

        const caption = `*📖 WIKIPEDIA: ${bestTitle.toUpperCase()}*\n` +
                        `────────────────────────────\n\n` +
                        `${extract}\n\n` +
                        `*Sumber:* https://id.wikipedia.org/wiki/${encodeURIComponent(bestTitle.replace(/ /g, '_'))}`;

        const safeCaption = caption.length > 3800 ? caption.substring(0, 3800) + '...' : caption;

        if (thumbnail) {
            if (caption.length > 950) {
                // Send thumbnail with short caption to bypass Telegram 1024 char caption limit
                const shortCaption = `*📖 WIKIPEDIA: ${bestTitle.toUpperCase()}*\n\n*Sumber:* https://id.wikipedia.org/wiki/${encodeURIComponent(bestTitle.replace(/ /g, '_'))}`;
                await conn.sendMessage(m.chat, {
                    image: { url: thumbnail },
                    caption: shortCaption
                }, { quoted: m });
                
                // Follow up with full text
                await m.reply(safeCaption);
            } else {
                await conn.sendMessage(m.chat, {
                    image: { url: thumbnail },
                    caption: safeCaption
                }, { quoted: m });
            }
        } else {
            await m.reply(safeCaption);
        }

    } catch (error) {
        console.error('[WIKI ERROR]', error);
        await deleteMsg(conn, m, loadingMsg);
        m.reply(`❌ *Terjadi kesalahan:* ${error.message}`);
    }
};

handler.help = ['wiki *query*'];
handler.tags = ['internet'];
handler.command = /^(wiki|wikipedia)$/i;
handler.limit = false;

export default handler;
