/*
- @Author: Rafli & Antigravity
- @Feature: HD/Upscale (Interactive Flow)
- @Description: Tingkatkan kualitas gambar 2x atau 4x secara interaktif tanpa emoji.
*/

import { fileTypeFromBuffer } from 'file-type';
import { uploadFile } from '../function/uploader.js';

const sessions = {};

async function getILoveAuth() {
    try {
        const htmlRes = await fetch('https://www.iloveimg.com/upscale-image');
        const html = await htmlRes.text();
        const token = html.match(/"token":"(eyJ[^"]+)"/)?.[1];
        const task  = html.match(/ilovepdfConfig\.taskId\s*=\s*'([^']+)'/)?.[1];
        return { token, task };
    } catch { return null; }
}

async function processUpscale(m, conn, imgBuffer, mime, scale) {
    let loadingMsg = await m.reply(`_Memproses gambar ${scale}x, tunggu sebentar..._`)

    try {
        const auth = await getILoveAuth();
        if (!auth?.token) throw new Error('Auth iLoveIMG gagal.')

        let fileType = await fileTypeFromBuffer(imgBuffer);
        let ext = fileType ? fileType.ext : 'jpg';
        let filename  = `rafli_hd_${Date.now()}.${ext}`;

        const blob = new Blob([imgBuffer], { type: mime });
        const upForm = new FormData();
        upForm.append('name', filename);
        upForm.append('chunk', '0');
        upForm.append('chunks', '1');
        upForm.append('task', auth.task);
        upForm.append('preview', '1');
        upForm.append('v', 'web.0');
        upForm.append('file', blob, filename);

        const uploadRes = await fetch('https://api29g.iloveimg.com/v1/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${auth.token}`,
                'Origin': 'https://www.iloveimg.com',
                'Referer': 'https://www.iloveimg.com/'
            },
            body: upForm
        });

        if (!uploadRes.ok) {
            throw new Error(`Upload iLoveIMG gagal: ${uploadRes.status}`);
        }

        const uploadData = await uploadRes.json();

        const processForm = new FormData();
        processForm.append('task', auth.task);
        processForm.append('server_filename', uploadData.server_filename);
        processForm.append('scale', scale);

        const processRes = await fetch('https://api29g.iloveimg.com/v1/upscale', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${auth.token}`,
                'Origin': 'https://www.iloveimg.com',
                'Referer': 'https://www.iloveimg.com/'
            },
            body: processForm
        });

        if (!processRes.ok) {
            throw new Error(`Upscale iLoveIMG gagal: ${processRes.status}`);
        }

        const resultBuffer = Buffer.from(await processRes.arrayBuffer());

        if (loadingMsg) {
            const chatId = m.chat.replace('@t.me', '');
            const msgId = loadingMsg.message_id || (loadingMsg.key && loadingMsg.key.id);
            if (msgId) {
                await global.tgBot.telegram.deleteMessage(chatId, msgId).catch(() => {})
            }
        }

        await conn.sendMessage(m.chat, {
            image  : resultBuffer,
            caption: `*Gambar berhasil ditingkatkan ${scale}x.*`
        }, { quoted: m });

        // Tampilkan tombol penyelesaian
        const endText = `*PROSES SELESAI*\n\nGambar Anda telah berhasil ditingkatkan.`;
        const inline_keyboard = [
            [
                { text: 'Gambar Baru', callback_data: 'cmd hd_flow new_image' },
                { text: 'Ke Home', callback_data: 'cmd menu' }
            ]
        ];
        await conn.sendMessage(m.chat, {
            text: endText,
            reply_markup: { inline_keyboard }
        });

    } catch (e) {
        console.error(e.message);

        try {
            let fileUrl = await uploadFile(imgBuffer, mime);
            if (!fileUrl) throw new Error('Uploader gagal.')

            const gimitaUrl = `https://api.gimita.id/api/tools/upscale?url=${encodeURIComponent(fileUrl)}`;
            const res = await fetch(gimitaUrl);
            const resData = await res.json();

            if (!resData.success || !resData.data.url) throw new Error('Gimita gagal.')

            if (loadingMsg) {
                const chatId = m.chat.replace('@t.me', '');
                const msgId = loadingMsg.message_id || (loadingMsg.key && loadingMsg.key.id);
                if (msgId) {
                    await global.tgBot.telegram.deleteMessage(chatId, msgId).catch(() => {})
                }
            }

            await conn.sendMessage(m.chat, {
                image  : { url: res.data.data.url },
                caption: `*Gambar berhasil ditingkatkan.*\n_Menggunakan server cadangan._`
            }, { quoted: m });

            const endText = `*PROSES SELESAI*\n\nGambar Anda telah berhasil ditingkatkan.`;
            const inline_keyboard = [
                [
                    { text: 'Gambar Baru', callback_data: 'cmd hd_flow new_image' },
                    { text: 'Ke Home', callback_data: 'cmd menu' }
                ]
            ];
            await conn.sendMessage(m.chat, {
                text: endText,
                reply_markup: { inline_keyboard }
            });

        } catch (errBackup) {
            console.error(errBackup.message);
            if (loadingMsg) {
                const chatId = m.chat.replace('@t.me', '');
                const msgId = loadingMsg.message_id || (loadingMsg.key && loadingMsg.key.id);
                if (msgId) {
                    await global.tgBot.telegram.deleteMessage(chatId, msgId).catch(() => {})
                }
            }
            await m.reply(`*Gagal memproses gambar.*\n\nSemua server sedang tidak tersedia. Coba lagi nanti.`)
        }
    }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    // ── FLOW INTERAKTIF CALLBACK ──────────────────────────────────────────────
    if (command === 'hd_flow') {
        const action = text.trim();

        if (action === 'new_image') {
            sessions[m.sender] = { step: 'waiting_image', messageId: m.id };
            const msgText = `*HD / UPSCALE GAMBAR*\n\nSilakan kirimkan gambar yang ingin Anda tingkatkan kualitasnya langsung di obrolan ini.`;
            const inline_keyboard = [
                [{ text: 'Batalkan', callback_data: 'cmd hd_flow cancel' }]
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
            const msgText = `*HD / UPSCALE GAMBAR*\n\nPemrosesan dibatalkan.`;
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

        if (action.startsWith('scale_')) {
            const scale = action.replace('scale_', '');
            const session = sessions[m.sender];
            if (!session || !session.imgBuffer) {
                return m.reply('Sesi gambar kedaluwarsa. Silakan kirim gambar kembali.');
            }
            const { imgBuffer, mime } = session;
            delete sessions[m.sender];
            await processUpscale(m, conn, imgBuffer, mime, scale);
            return;
        }
        return;
    }

    // ── DIRECT COMMAND / INITIAL CHAT ─────────────────────────────────────────
    let q    = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || '';
    const isImage = /image\/(jpe?g|png|webp)/.test(mime);

    // Kasus 1: Ada gambar (dikirim langsung atau di-reply)
    if (isImage) {
        // Sub-kasus 1A: Skala langsung diberikan (misal /hd 2)
        if (text && ['2', '4'].includes(text.trim())) {
            const scale = text.trim();
            const imgBuffer = await q.download();
            return await processUpscale(m, conn, imgBuffer, mime, scale);
        }

        // Sub-kasus 1B: Tidak ada skala diberikan, tanyakan via button
        const imgBuffer = await q.download();
        sessions[m.sender] = {
            step: 'waiting_scale',
            imgBuffer,
            mime
        };

        const msgText = `*HD / UPSCALE GAMBAR*\n\nGambar diterima. Silakan pilih skala pembesaran yang Anda inginkan:`;
        const inline_keyboard = [
            [
                { text: '2x', callback_data: 'cmd hd_flow scale_2' },
                { text: '4x', callback_data: 'cmd hd_flow scale_4' }
            ],
            [{ text: 'Batalkan', callback_data: 'cmd hd_flow cancel' }]
        ];
        await conn.sendMessage(m.chat, {
            text: msgText,
            reply_markup: { inline_keyboard }
        });
        return;
    }

    // Kasus 2: Tidak ada gambar, mulai sesi tunggu gambar
    sessions[m.sender] = { step: 'waiting_image', messageId: m.id };
    const msgText = `*HD / UPSCALE GAMBAR*\n\nSilakan kirimkan gambar yang ingin Anda tingkatkan kualitasnya langsung di obrolan ini.`;
    const inline_keyboard = [
        [{ text: 'Batalkan', callback_data: 'cmd hd_flow cancel' }]
    ];
    await conn.sendMessage(m.chat, {
        text: msgText,
        reply_markup: { inline_keyboard }
    });
}

// Interceptor untuk menangkap gambar saat sesi aktif
handler.before = async function (m, { conn }) {
    const session = sessions[m.sender];
    if (!session || session.step !== 'waiting_image') return false;

    // Batalkan sesi jika mengetik perintah batal
    const inputClean = m.text?.trim() || '';
    if (inputClean.toLowerCase() === 'cancel' || inputClean.toLowerCase() === '/cancel') {
        delete sessions[m.sender];
        await m.reply('Sesi peningkatan gambar dibatalkan.');
        return true;
    }

    // Jangan tangkap jika itu perintah internal / callback
    if (m.text?.startsWith('/') || m.text?.startsWith('.')) {
        const cmd = m.text.slice(1).split(' ')[0].toLowerCase();
        if (['hd', 'hd_flow', 'upscale', 'menu'].includes(cmd)) {
            return false;
        }
    }

    let q    = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || '';
    const isImage = /image\/(jpe?g|png|webp)/.test(mime);

    if (!isImage) {
        await m.reply('Link atau format tidak valid. Silakan kirimkan file gambar (JPEG, PNG, WebP) yang ingin ditingkatkan atau ketik cancel untuk membatalkan.');
        return true; // Konsumsi pesan
    }

    // Simpan gambar dan minta skala
    const imgBuffer = await q.download();
    session.step = 'waiting_scale';
    session.imgBuffer = imgBuffer;
    session.mime = mime;
    const msgText = `*HD / UPSCALE GAMBAR*\n\nGambar diterima. Silakan pilih skala pembesaran yang Anda inginkan:`;
    const inline_keyboard = [
        [
            { text: '2x', callback_data: 'cmd hd_flow scale_2' },
            { text: '4x', callback_data: 'cmd hd_flow scale_4' }
        ],
        [{ text: 'Batalkan', callback_data: 'cmd hd_flow cancel' }]
    ];
    await conn.sendMessage(m.chat, {
        text: msgText,
        reply_markup: { inline_keyboard }
    });
    return true; // Konsumsi pesan
}

handler.help = ['hd *skala*'];
handler.tags = ['tools'];
handler.command = /^(hd|upscale|hd_flow)$/i;

export default handler;
