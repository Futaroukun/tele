/*
- @Author: Rafli & Antigravity
- @Feature: TikTok Downloader (Interactive Flow)
- @Description: Download video, slide foto, dan audio tanpa watermark dengan dialog interaktif.
*/

import * as cheerio from 'cheerio'
import axios from 'axios'

const sessions = {};

async function savetik(url) {
    const body = new URLSearchParams({
        q: url,
        cursor: '0',
        page: '0',
        lang: 'id'
    }).toString()

    const res = await fetch('https://savetik.io/api/ajaxSearch', {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'x-requested-with': 'XMLHttpRequest',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'origin': 'https://savetik.io',
            'referer': 'https://savetik.io/id/download-tiktok-photos',
            'accept': '*/*'
        },
        body
    })

    const json = await res.json()
    const html = typeof json.data === 'string' ? json.data : ''
    if (!html) throw new Error('Gagal mengambil data dari SaveTik.')

    const $ = cheerio.load(html)

    const mp4 =
        $('a:contains("Unduh MP4 [1]")').attr('href') ||
        $('a:contains("Unduh MP4 [2]")').attr('href') ||
        $('a:contains("Unduh MP4 HD")').attr('href') ||
        null

    const mp3 = $('a:contains("Unduh MP3")').attr('href') || null

    const images = []
    $('.photo-list ul.download-box li').each((_, el) => {
        const img = $(el).find("a[title='Unduh Gambar']").attr('href')
        if (img) images.push(img)
    })

    const caption =
        $('.content .clearfix h3').text().trim() ||
        $('.content h3').text().trim() ||
        $('h3').first().text().trim() ||
        null

    const videoId = $('#TikTokId').val() || null

    return { mp4, mp3, images, caption, videoId }
}

async function tikwm(url) {
    try {
        const res = await axios.get(`https://tikwm.com/api/?hd=1&url=${encodeURIComponent(url)}`)
        if (res.data?.code === 0) return res.data.data
        return null
    } catch {
        return null
    }
}

const formatNumber = (num) => {
    if (!num) return '0'
    if (num >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
    if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
    if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
    return num.toString()
}

const formatDuration = (seconds) => {
    if (!seconds) return null
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m}m ${s}s` : `${s}s`
}

const extractTikTokUrl = (text) => {
    const patterns = [
        /https?:\/\/(www\.)?(vt|vm|www)\.tiktok\.com\/[^\s]+/gi,
        /https?:\/\/(www\.)?tiktok\.com\/@[^\/]+\/video\/\d+/gi,
        /https?:\/\/[^\s]*tiktok[^\s]*/gi
    ]
    for (const pattern of patterns) {
        const match = text.match(pattern)
        if (match) return match[0]
    }
    return null
}

async function processDownload(m, conn, tiktokUrl) {
    let loadingMsg = await m.reply('_Memproses, tunggu sebentar..._')

    try {
        const [savetikResult, tikwmData] = await Promise.all([
            savetik(tiktokUrl),
            tikwm(tiktokUrl)
        ])

        const { mp4, mp3, images, caption: savetikCaption, videoId } = savetikResult

        if (!mp4 && images.length === 0) {
            if (loadingMsg) {
                const chatId = m.chat.replace('@t.me', '');
                const msgId = loadingMsg.message_id || (loadingMsg.key && loadingMsg.key.id);
                if (msgId) {
                    await global.tgBot.telegram.deleteMessage(chatId, msgId).catch(() => {})
                }
            }
            return m.reply('Tidak ada media yang ditemukan. Coba cek link atau coba lagi nanti.')
        }

        const title    = tikwmData?.title || savetikCaption || null
        const author   = tikwmData?.author
                            ? `${tikwmData.author.nickname} (@${tikwmData.author.unique_id})`
                            : null
        const region   = tikwmData?.region || null
        const duration = tikwmData?.duration ? formatDuration(tikwmData.duration) : null
        const stats    = tikwmData ? {
            views:    formatNumber(tikwmData.play_count),
            likes:    formatNumber(tikwmData.digg_count),
            comments: formatNumber(tikwmData.comment_count),
            shares:   formatNumber(tikwmData.share_count),
        } : null

        if (!mp4 && images.length > 0) {
            let captionText =
                `*TIKTOK SLIDESHOW*\n` +
                (title  ? `\n*Caption:* ${title}\n`  : '') +
                (author ? `*Creator:* ${author}\n`   : '') +
                (region ? `*Region:* ${region}\n`   : '') +
                `\n*Total foto:* ${images.length}` +
                (videoId ? `\n*ID:* ${videoId}` : '')

            if (stats) {
                captionText +=
                    `\n\n*Stats:*\n` +
                    `- Views: ${stats.views}\n` +
                    `- Likes: ${stats.likes}\n` +
                    `- Shares: ${stats.shares}`
            }

            captionText += `\n\n> Media: SaveTik | Info: TikWM`

            const albumItems = images.map((img, i) => ({
                image: { url: img },
                caption: i === 0 ? captionText : ''
            }))

            await conn.sendAlbum(m.chat, albumItems, {
                quoted: m,
                delay: 1000,
                fetchOptions: {
                    headers: {
                        'Referer': 'https://www.tiktok.com/'
                    }
                }
            })

            if (mp3) {
                await conn.sendMessage(m.chat, {
                    audio: { url: mp3 },
                    mimetype: 'audio/mpeg'
                }, {
                    quoted: m,
                    fetchOptions: {
                        headers: {
                            'Referer': 'https://www.tiktok.com/'
                        }
                    }
                })
            }

        } else if (mp4) {
            let captionText =
                `*TIKTOK DOWNLOADER*\n` +
                (title    ? `\n*Caption:* ${title}\n`    : '') +
                (author   ? `*Creator:* ${author}\n`     : '') +
                (region   ? `*Region:* ${region}\n`     : '') +
                (duration ? `*Durasi:* ${duration}\n`   : '')

            if (stats) {
                captionText +=
                    `\n*Stats:*\n` +
                    `- Views: ${stats.views}\n` +
                    `- Likes: ${stats.likes}\n` +
                    `- Comments: ${stats.comments}\n` +
                    `- Shares: ${stats.shares}`
            }

            captionText +=
                (videoId ? `\n\n*ID:* ${videoId}` : '') +
                `\n> Media: SaveTik | Info: TikWM`

            await conn.sendMessage(m.chat, {
                video: { url: mp4 },
                caption: captionText
            }, {
                quoted: m,
                fetchOptions: {
                    headers: {
                        'Referer': 'https://www.tiktok.com/'
                    }
                }
            })

            if (mp3) {
                await conn.sendMessage(m.chat, {
                    audio: { url: mp3 },
                    mimetype: 'audio/mpeg'
                }, {
                    quoted: m,
                    fetchOptions: {
                        headers: {
                            'Referer': 'https://www.tiktok.com/'
                        }
                    }
                })
            }
        }

        if (loadingMsg) {
            const chatId = m.chat.replace('@t.me', '');
            const msgId = loadingMsg.message_id || (loadingMsg.key && loadingMsg.key.id);
            if (msgId) {
                await global.tgBot.telegram.deleteMessage(chatId, msgId).catch(() => {})
            }
            loadingMsg = null;
        }

        // Tampilkan tombol penyelesaian tanpa emoji
        const endText = `*UNDUHAN SELESAI!*\n\nApakah Anda ingin mengunduh media TikTok lainnya?`;
        const inline_keyboard = [
            [
                { text: 'Video Baru', callback_data: 'cmd tiktok_flow continue_new' },
                { text: 'Ke Home', callback_data: 'cmd menu' }
            ]
        ];
        await conn.sendMessage(m.chat, {
            text: endText,
            reply_markup: { inline_keyboard }
        });

    } catch (error) {
        console.error('TikTok Download Error:', error)

        if (loadingMsg) {
            const chatId = m.chat.replace('@t.me', '');
            const msgId = loadingMsg.message_id || (loadingMsg.key && loadingMsg.key.id);
            if (msgId) {
                await global.tgBot.telegram.deleteMessage(chatId, msgId).catch(() => {})
            }
        }

        await m.reply(
            `*Gagal mengunduh.*\n\n` +
            `${error.message}\n\n` +
            `Coba cek link atau coba lagi nanti.`
        )

        // Tampilkan tombol jika gagal (tanpa emoji)
        const failText = `*PILIHAN LAIN:*`;
        const inline_keyboard = [
            [
                { text: 'Coba Lagi', callback_data: 'cmd tiktok_flow continue_new' },
                { text: 'Ke Home', callback_data: 'cmd menu' }
            ]
        ];
        await conn.sendMessage(m.chat, {
            text: failText,
            reply_markup: { inline_keyboard }
        });
    }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    // ── FLOW INTERAKTIF CALLBACK ──────────────────────────────────────────────
    if (command === 'tiktok_flow') {
        const action = text.trim();
        if (action === 'continue' || action === 'continue_new') {
            sessions[m.sender] = { step: 'waiting_url', messageId: m.id }
            const msgText = `*TIKTOK DOWNLOADER*\n\nSilakan kirimkan link/URL video atau slideshow TikTok yang ingin diunduh langsung di obrolan ini.`;
            const inline_keyboard = [
                [{ text: 'Batalkan', callback_data: 'cmd tiktok_flow cancel' }]
            ];
            await conn.sendMessage(m.chat, {
                text: msgText,
                reply_markup: { inline_keyboard }
            }, {
                quoted: {
                    id: m.id,
                    isMenuNavigation: true
                }
            });
            return;
        }

        if (action === 'cancel') {
            delete sessions[m.sender];
            const msgText = `*TIKTOK DOWNLOADER*\n\nUnduhan dibatalkan.`;
            const inline_keyboard = [
                [{ text: 'Ke Home', callback_data: 'cmd menu' }]
            ];
            await conn.sendMessage(m.chat, {
                text: msgText,
                reply_markup: { inline_keyboard }
            }, {
                quoted: {
                    id: m.id,
                    isMenuNavigation: true
                }
            });
            return;
        }
        return;
    }

    // ── DIRECT COMMAND ────────────────────────────────────────────────────────
    const tiktokUrl = extractTikTokUrl(text || '')
    if (tiktokUrl) {
        // Jika langsung dipanggil dengan URL, proses langsung
        return await processDownload(m, conn, tiktokUrl);
    }

    // Jika dipanggil tanpa URL, tampilkan panel sambutan awal (tanpa emoji)
    const msgText = 
        `*TIKTOK DOWNLOADER*\n\n` +
        `Download video & slideshow TikTok tanpa watermark.\n\n` +
        `Silakan klik tombol Lanjutkan di bawah ini untuk memulai.`;
    const inline_keyboard = [
        [{ text: 'Lanjutkan', callback_data: 'cmd tiktok_flow continue' }]
    ];
    await conn.sendMessage(m.chat, {
        text: msgText,
        reply_markup: { inline_keyboard }
    });
}

// Interceptor untuk menangkap input teks berupa URL selama sesi aktif
handler.before = async function (m, { conn }) {
    const session = sessions[m.sender];
    if (!session || session.step !== 'waiting_url') return false;

    // Batalkan sesi jika mengetik perintah batal (tanpa emoji)
    const inputClean = m.text?.trim() || '';
    if (inputClean.toLowerCase() === 'cancel' || inputClean.toLowerCase() === '/cancel') {
        delete sessions[m.sender];
        await m.reply('Sesi unduhan TikTok dibatalkan.');
        return true;
    }

    // Jangan tangkap jika itu perintah internal / callback
    if (m.text?.startsWith('/') || m.text?.startsWith('.')) {
        const cmd = m.text.slice(1).split(' ')[0].toLowerCase();
        if (['tiktok', 'tiktok_flow', 'menu', 'tt', 'ttdl'].includes(cmd)) {
            return false;
        }
    }

    const tiktokUrl = extractTikTokUrl(inputClean);
    if (!tiktokUrl) {
        await m.reply('Link tidak valid. Pastikan link berasal dari TikTok.\nSilakan kirim ulang atau ketik cancel untuk membatalkan.');
        return true; // Konsumsi pesan
    }

    // Hapus sesi agar tidak double trigger
    delete sessions[m.sender];

    // Jalankan pengunduhan
    await processDownload(m, conn, tiktokUrl);
    return true; // Konsumsi pesan
}

handler.help = ['tiktok *url*']
handler.tags = ['downloader']
handler.command = /^(tt|tiktok|ttdl|tiktok_flow)$/i

export default handler
