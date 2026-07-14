import axios from 'axios';
import * as cheerio from 'cheerio';

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

export async function resolveWikiDetails(query) {
    try {
        const url = `https://search.yahoo.com/search?p=${encodeURIComponent(query + ' fandom wiki')}`;
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });

        const $ = cheerio.load(res.data);
        let resolved = null;

        $('a').each((i, el) => {
            try {
                const href = $(el).attr('href') || '';
                
                // 1. Direct link check
                if (href.includes('.fandom.com/wiki/')) {
                    const urlMatch = href.match(/https?:\/\/([a-zA-Z0-9\-]+)\.fandom\.com\/wiki\/(.+)/i);
                    if (urlMatch) {
                        resolved = {
                            wikiName: urlMatch[1],
                            title: decodeURIComponent(urlMatch[2].split('?')[0].split('#')[0])
                        };
                        return false; // break loop
                    }
                }

                // 2. Redirect fallback
                const matchRu = href.match(/[\?&]RU=([^&/]+)/i) || href.match(/\/RU=([^/&]+)/i);
                if (matchRu) {
                    const realUrl = decodeURIComponent(matchRu[1]);
                    if (realUrl.includes('.fandom.com/wiki/')) {
                        const urlMatch = realUrl.match(/https?:\/\/([a-zA-Z0-9\-]+)\.fandom\.com\/wiki\/(.+)/i);
                        if (urlMatch) {
                            resolved = {
                                wikiName: urlMatch[1],
                                title: decodeURIComponent(urlMatch[2].split('?')[0].split('#')[0])
                            };
                            return false; // break loop
                        }
                    }
                }
            } catch (loopErr) {
                // Ignore malformed URI decode errors for individual links to keep searching
            }
        });

        return resolved;
    } catch (e) {
        console.error('[Yahoo Search Fandom Error]', e.message);
        return null;
    }
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
    const query = text?.trim();
    if (!query) {
        return m.reply(`*FANDOM SEARCH*\n\nContoh penggunaan:\n\`${usedPrefix + command} genshin impact zhongli\`\n\`${usedPrefix + command} gotoubun miku\``);
    }

    let loadingMsg = await m.reply(`_Mencari "${query}" di Fandom Wiki..._`);

    try {
        // 1. Resolve subdomain and page title via Yahoo Search
        const resolved = await resolveWikiDetails(query);
        if (!resolved) {
            await deleteMsg(conn, m, loadingMsg);
            loadingMsg = null;
            return m.reply('❌ Gagal menemukan halaman Fandom yang cocok untuk kata kunci tersebut.');
        }

        const { wikiName, title: initialTitle } = resolved;

        // 2. Perform search inside the local wiki to find the best match title
        const searchUrl = `https://${wikiName}.fandom.com/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
        const searchRes = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 10000
        });

        let bestTitle = initialTitle;
        const searchResults = searchRes.data?.query?.search;
        if (searchResults && searchResults.length > 0) {
            bestTitle = searchResults[0].title;
        }

        // 3. Fetch parsed text (full page HTML) and page image (thumbnail)
        const parseUrl = `https://${wikiName}.fandom.com/api.php?action=parse&page=${encodeURIComponent(bestTitle)}&prop=text&format=json`;
        const imgUrl = `https://${wikiName}.fandom.com/api.php?action=query&prop=pageimages&titles=${encodeURIComponent(bestTitle)}&pithumbsize=500&format=json`;

        const [parseRes, imgRes] = await Promise.all([
            axios.get(parseUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, timeout: 10000 }),
            axios.get(imgUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, timeout: 10000 })
        ]);

        const html = parseRes.data?.parse?.text?.['*'];
        if (!html) {
            await deleteMsg(conn, m, loadingMsg);
            loadingMsg = null;
            return m.reply(`❌ Gagal memuat data Fandom untuk "${bestTitle}".`);
        }

        const $ = cheerio.load(html);

        // Parse Infobox
        const infoboxItems = [];
        const ignoredLabels = ['manga', 'anime', 'media', 'story', 'main characters', 'chapters & volumes', 'episodes', 'debut', 'gallery', 'links'];
        $('aside.portable-infobox').each((i, el) => {
            $(el).find('.pi-data').each((j, item) => {
                const label = $(item).find('.pi-data-label').text().trim().replace(/:$/, '');
                const value = $(item).find('.pi-data-value').text().trim().replace(/\s+/g, ' ');
                if (label && value && value.length < 200) {
                    const labelLower = label.toLowerCase();
                    if (!ignoredLabels.some(ignored => labelLower.includes(ignored))) {
                        infoboxItems.push(`• *${label}:* ${value}`);
                    }
                }
            });
        });

        // Parse Sections dynamically
        const sections = [];
        let currentSection = { title: 'Introduction', paragraphs: [] };
        $('.mw-parser-output').children().each((i, el) => {
            const tagName = el.tagName.toLowerCase();
            if (tagName === 'h2') {
                const titleText = $(el).find('.mw-headline').text().trim() || $(el).text().replace('[edit]', '').trim();
                const titleLower = titleText.toLowerCase();
                const utilityTitles = ['references', 'external links', 'navigation', 'site navigation', 'gallery', 'see also', 'footnotes', 'notes', 'quotes', 'trivia'];
                if (titleText && !utilityTitles.some(t => titleLower.includes(t))) {
                    if (currentSection.paragraphs.length > 0) {
                        sections.push(currentSection);
                    }
                    currentSection = { title: titleText, paragraphs: [] };
                }
            } else if (tagName === 'p') {
                const pText = $(el).text().replace(/\[\d+\]/g, '').trim();
                if (pText.length > 20) {
                    currentSection.paragraphs.push(pText);
                }
            }
        });
        if (currentSection.paragraphs.length > 0) {
            sections.push(currentSection);
        }

        // Fetch pageimage thumbnail
        const pages = imgRes.data?.query?.pages;
        let thumbnail = null;
        if (pages) {
            const pageId = Object.keys(pages)[0];
            thumbnail = pages[pageId]?.thumbnail?.source || null;
        }

        await deleteMsg(conn, m, loadingMsg);
        loadingMsg = null;

        const cleanTitle = bestTitle.replace(/_/g, ' ');
        let caption = `*🎮 FANDOM WIKI: ${cleanTitle.toUpperCase()} (${wikiName.toUpperCase()})*\n`;
        caption += `────────────────────────────\n\n`;

        if (infoboxItems.length > 0) {
            caption += `*📋 PROFIL / DETAIL DATA*\n`;
            caption += infoboxItems.join('\n') + `\n\n`;
            caption += `────────────────────────────\n\n`;
        }

        // Format sections
        let addedSectionsCount = 0;
        for (const sec of sections) {
            if (sec.title === 'Introduction') {
                if (sec.paragraphs.length > 0) {
                    caption += `*📖 PENDAHULUAN*\n`;
                    caption += sec.paragraphs.slice(0, 2).join('\n\n') + `\n\n`;
                }
            } else {
                if (addedSectionsCount >= 3) break;
                caption += `*📌 ${sec.title.toUpperCase()}*\n`;
                caption += sec.paragraphs.slice(0, 2).join('\n\n') + `\n\n`;
                addedSectionsCount++;
            }
        }

        caption += `*Sumber:* https://${wikiName}.fandom.com/wiki/${encodeURIComponent(bestTitle.replace(/ /g, '_'))}`;

        const safeCaption = caption.length > 3800 ? caption.substring(0, 3800) + '...' : caption;

        if (thumbnail) {
            if (caption.length > 950) {
                // Send thumbnail with short caption to bypass Telegram 1024 char caption limit
                const shortCaption = `*🎮 FANDOM WIKI: ${cleanTitle.toUpperCase()} (${wikiName.toUpperCase()})*\n\n*Sumber:* https://${wikiName}.fandom.com/wiki/${encodeURIComponent(bestTitle.replace(/ /g, '_'))}`;
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
        console.error('[FANDOM ERROR]', error);
        await deleteMsg(conn, m, loadingMsg);
        m.reply(`❌ *Terjadi kesalahan:* ${error.message}`);
    }
};

handler.help = ['fandom *query*'];
handler.tags = ['internet'];
handler.command = /^(fandom|wikia)$/i;
handler.limit = false;

export default handler;
