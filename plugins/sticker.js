/*
- Feature: Sticker Maker (Debounced)
- Description: Mengubah gambar menjadi stiker Telegram. Otomatis memproses stiker 1.5 detik setelah pengguna selesai mengirim gambar (tidak memerlukan perintah /done).
*/

import sharp from 'sharp';
import fs from 'fs';

// Penyimpanan sesi stiker per pengguna (berdasarkan sender JID)
const sessions = {};

const handler = async (m, { conn, usedPrefix, command }) => {
    const senderId = m.sender; // format: "123456789@t.me"
    
    // Cek apakah ada media yang di-reply atau dilampirkan langsung
    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || '';
    
    if (mime && /image/.test(mime)) {
        await m.reply("⏳ Sedang memproses gambar menjadi stiker...");
        try {
            const media = await q.download();
            if (!media) throw new Error("Gagal mengunduh gambar.");
            const sticker = await convertToStickerBuffer(media);
            await conn.sendMessage(m.chat, { sticker }, { quoted: m });
        } catch (e) {
            console.error(e);
            m.reply(`❌ Gagal membuat stiker: ${e.message}`);
        }
        return;
    }
    
    // Jika tidak ada media, buat sesi baru untuk menunggu gambar
    if (!sessions[senderId]) {
        sessions[senderId] = {
            images: [],
            timer: null
        };
        await m.reply(
            `*PEMBUAT STIKER / STIKER PACK*\n\n` +
            `Silakan kirimkan gambar-gambar yang ingin kamu jadikan stiker.\n` +
            `• Jika mengirim *1 - 5 gambar*, bot akan mengirimkan stiker individu secara terpisah.\n` +
            `• Jika mengirim *lebih dari 5 gambar*, bot akan mengemasnya menjadi *Sticker Pack* Telegram.\n\n` +
            `Bot akan otomatis memproses setelah kamu selesai mengirim seluruh gambar.`
        );
    } else {
        m.reply("Sesi stiker kamu sudah aktif. Silakan langsung kirim gambarnya.");
    }
};

// Fungsi pembantu untuk meresize gambar ke spesifikasi stiker Telegram (salah satu sisi harus tepat 512px, sisi lainnya <= 512px)
async function convertToStickerBuffer(imageBuffer) {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 512;
    const height = metadata.height || 512;
    
    let targetWidth = 512;
    let targetHeight = 512;
    
    if (width > height) {
        targetHeight = Math.round((height / width) * 512);
    } else {
        targetWidth = Math.round((width / height) * 512);
    }
    
    return await sharp(imageBuffer)
        .resize(targetWidth, targetHeight, {
            fit: 'fill',
            kernel: sharp.kernel.lanczos3
        })
        .webp({ quality: 85 })
        .toBuffer();
}

// Fungsi utama pemroses sesi stiker
async function processStickerSession(m, conn, senderId) {
    const session = sessions[senderId];
    if (!session) return;
    
    // Hapus timer untuk mencegah pemrosesan ganda
    if (session.timer) {
        clearTimeout(session.timer);
    }
    
    const imageBuffers = session.images;
    const count = imageBuffers.length;
    
    // Bersihkan sesi terlebih dahulu agar tidak memblokir pengiriman berikutnya
    delete sessions[senderId];
    
    await conn.sendMessage(m.chat, { text: `⏳ Memproses ${count} stiker, mohon tunggu...` });
    
    try {
        const stickers = [];
        for (let i = 0; i < count; i++) {
            const stickerBuf = await convertToStickerBuffer(imageBuffers[i]);
            stickers.push(stickerBuf);
        }
        
        if (count <= 5) {
            // Kirim stiker individu secara terpisah
            for (const sticker of stickers) {
                await conn.sendMessage(m.chat, { sticker });
            }
        } else {
            // Buat Sticker Pack Telegram
            const userId = parseInt(senderId.split('@')[0]);
            const fromUser = m.msg?.from || {};
            const username = fromUser.username || fromUser.first_name || 'user';
            
            // Upload setiap buffer stiker untuk mendapatkan file_id Telegram
            const fileIds = [];
            for (let i = 0; i < stickers.length; i++) {
                const uploadRes = await global.tgBot.telegram.uploadStickerFile(
                    userId,
                    { source: stickers[i] },
                    'static'
                );
                fileIds.push(uploadRes.file_id);
            }
            
            const botUsername = global.tgBotInfo?.username || 'Jangchaerin_bot';
            const packName = `pack_${userId}_${Date.now()}_by_${botUsername}`;
            const packTitle = `Pack Stiker @${username}`;
            
            const inputStickers = fileIds.map(fileId => ({
                sticker: fileId,
                format: 'static',
                emoji_list: ['😀']
            }));
            
            await global.tgBot.telegram.createNewStickerSet(
                userId,
                packName,
                packTitle,
                {
                    stickers: inputStickers
                }
            );
            
            const packLink = `https://t.me/addstickers/${packName}`;
            await conn.sendMessage(m.chat, {
                text: `*STIKER PACK BERHASIL DIBUAT!*\n\n` +
                      `*Jumlah Stiker:* ${count}\n` +
                      `*Link Sticker Pack:* [Klik di Sini untuk Menambahkan](${packLink})\n\n` +
                      `Klik link di atas untuk menambahkan sticker pack tersebut ke Telegram kamu.`,
                parse_mode: 'HTML'
            });
        }
    } catch (e) {
        console.error('[STICKER SESSION ERROR]', e);
        conn.sendMessage(m.chat, { text: `❌ Gagal memproses stiker: ${e.message}` });
    }
}

// Interceptor pesan untuk mengumpulkan gambar yang dikirim pengguna selama sesi aktif
handler.before = async function (m, { conn }) {
    const senderId = m.sender;
    const session = sessions[senderId];
    if (!session) return false; // Sesi tidak aktif, lewatkan ke plugin lain
    
    const q = m.quoted ? m.quoted : m;
    const mime = (q.msg || q).mimetype || '';
    
    // Intersep hanya jika pesan berupa gambar
    if (mime && /image/.test(mime)) {
        try {
            const media = await q.download();
            if (media) {
                session.images.push(media);
                
                // Beri tahu sistem sedang mengetik / mengirim file
                await conn.sendPresenceUpdate('composing', m.chat);
                
                // Reset/Set timer debounce (1.5 detik setelah gambar terakhir diterima)
                if (session.timer) clearTimeout(session.timer);
                
                session.timer = setTimeout(async () => {
                    if (sessions[senderId] && sessions[senderId].images.length > 0) {
                        await processStickerSession(m, conn, senderId);
                    }
                }, 1500); // Debounce 1.5 detik
                
            } else {
                await m.reply("❌ Gagal mengunduh gambar. Silakan kirim ulang gambar tersebut.");
            }
        } catch (e) {
            console.error('[STICKER BEFORE ERROR]', e);
            await m.reply(`❌ Terjadi kesalahan: ${e.message}`);
        }
        return true; // Hentikan alur pencocokan ke plugin lain untuk pesan gambar ini
    }
    
    return false;
};

handler.help = ['stiker']
handler.tags = ['sticker']
handler.command = /^(s|stiker|sticker)$/i

export default handler;
