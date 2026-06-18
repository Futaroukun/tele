/*
- @Author: Antigravity
- @Feature: User Info Checker
- @Description: Cek informasi detail pengguna dari database bot dan API Telegram.
*/

const handler = async (m, { conn, text, usedPrefix, command }) => {
    let targetId = null;
    let usernameTarget = null;
    
    if (m.quoted && m.quoted.sender) {
        targetId = m.quoted.sender.replace('@t.me', '');
    } else if (text) {
        const cleanText = text.trim();
        if (/^\d+$/.test(cleanText)) {
            targetId = cleanText;
        } else if (cleanText.startsWith('@')) {
            usernameTarget = cleanText;
        } else {
            return m.reply('Format salah. Masukkan ID angka, username @username, atau balas pesan pengguna.');
        }
    } else {
        targetId = m.sender.replace('@t.me', '');
    }

    try {
        let chat = null;
        if (usernameTarget) {
            chat = await global.tgBot.telegram.getChat(usernameTarget);
            targetId = chat.id.toString();
        } else {
            chat = await global.tgBot.telegram.getChat(parseInt(targetId));
        }

        if (!chat) {
            return m.reply('Pengguna tidak ditemukan di Telegram.');
        }

        const targetJid = `${targetId}@t.me`;
        const dbUser = global.db.data.users[targetJid];

        let textToSend = `<b>INFORMASI PENGGUNA</b>\n\n`;
        textToSend += `<b>DATA TELEGRAM:</b>\n`;
        textToSend += `- ID: ${chat.id}\n`;
        textToSend += `- Nama Depan: ${chat.first_name || 'Tidak ada'}\n`;
        textToSend += `- Nama Belakang: ${chat.last_name || 'Tidak ada'}\n`;
        textToSend += `- Username: ${chat.username ? '@' + chat.username : 'Tidak ada'}\n`;
        if (chat.bio) {
            textToSend += `- Bio: ${chat.bio}\n`;
        }

        textToSend += `\n<b>DATA DATABASE BOT:</b>\n`;
        if (dbUser) {
            textToSend += `- Terdaftar: ${dbUser.register ? 'Ya' : 'Tidak'}\n`;
            textToSend += `- Nama Database: ${dbUser.name || 'Tidak ada'}\n`;
            textToSend += `- Gender: ${dbUser.gender === 'male' ? 'Laki-Laki' : dbUser.gender === 'female' ? 'Perempuan' : 'Belum input'}\n`;
            textToSend += `- Umur: ${dbUser.age === -1 ? 'Belum input' : dbUser.age + ' Tahun'}\n`;
            textToSend += `- Limit: ${dbUser.limit === Infinity ? 'Unlimited' : dbUser.limit}\n`;
            textToSend += `- Premium: ${dbUser.premium ? 'Ya' : 'Tidak'}\n`;
            textToSend += `- Banned: ${dbUser.banned ? 'Ya' : 'Tidak'}\n`;
        } else {
            textToSend += `- Terdaftar: Tidak terdaftar di database\n`;
        }

        let photoFileId = null;
        try {
            const photos = await global.tgBot.telegram.getUserProfilePhotos(parseInt(targetId), 0, 1);
            if (photos && photos.total_count > 0) {
                photoFileId = photos.photos[0][0].file_id;
            }
        } catch (photoError) {
            console.warn('Gagal mendapatkan foto profil:', photoError.message);
        }

        const chatId = m.chat.replace('@t.me', '');
        const extra = {
            parse_mode: 'HTML',
            reply_to_message_id: parseInt(m.id)
        };

        if (photoFileId) {
            await global.tgBot.telegram.sendPhoto(chatId, photoFileId, {
                ...extra,
                caption: textToSend
            });
        } else {
            await global.tgBot.telegram.sendMessage(chatId, textToSend, extra);
        }

    } catch (e) {
        console.error('Cek User Error:', e);
        return m.reply(`Gagal memeriksa pengguna. Pastikan username/ID benar dan bot pernah berinteraksi dengannya.\n\nDetail: ${e.message}`);
    }
}

handler.help = ['cekuser', 'whois']
handler.tags = ['info']
handler.command = /^(cekuser|whois|userinfo|user)$/i

export default handler
