/*
- @Author: Antigravity
- @Feature: Keyboard Test
- @Description: Fitur untuk menguji Reply Keyboard (tombol bawah chat) dan menghapusnya kembali tanpa emoji.
*/

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (command === 'kbon') {
        await conn.sendMessage(m.chat, {
            text: 'Papan tombol pengganti keyboard diaktifkan. Silakan gunakan tombol di bawah ini.'
        }, {
            quoted: m,
            reply_markup: {
                keyboard: [
                    [{ text: 'Menu' }, { text: 'Tiktok' }],
                    [{ text: 'HD' }, { text: 'Cek User' }],
                    [{ text: 'Kboff' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
        return;
    }

    if (command === 'kboff') {
        await conn.sendMessage(m.chat, {
            text: 'Papan tombol pengganti keyboard dinonaktifkan. Keyboard ketik manual ditampilkan kembali.'
        }, {
            quoted: m,
            reply_markup: {
                remove_keyboard: true
            }
        });
        return;
    }
}

handler.help = ['kbon', 'kboff']
handler.tags = ['tools']
handler.command = /^(kbon|kboff)$/i

export default handler
