import { uploadFile, getFileInfo } from '../function/uploader.js'

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


let handler = async (m, { conn, usedPrefix, command }) => {
    let q    = m.quoted ? m.quoted : m
    let mime = (q.msg || q).mimetype || q.mediaType || ''

    if (!/image|video|audio|sticker|document/.test(mime)) {
        return m.reply(
            `*UPLOAD KE URL*\n\n` +
            `Upload media apapun dan dapatkan link permanen.\n\n` +
            `*Cara Pakai:*\n` +
            `Kirim media dengan caption \`${usedPrefix + command}\`\n` +
            `Atau reply media yang ada dengan \`${usedPrefix + command}\`\n\n` +
            `*Format yang didukung:* Gambar, Video, Audio, Stiker, Dokumen\n` +
            `*Batas ukuran:* 50MB`
        )
    }

    let loadingMsg = null
    try {
        loadingMsg = await m.reply('_Mengupload file, tunggu sebentar..._')

        let media = await q.download?.()
        if (!media) throw new Error('Gagal mengunduh media.')

        const fileInfo = await getFileInfo(media)
        const { url, provider } = await uploadFile(media, mime)

        await deleteMsg(conn, m, loadingMsg)
        loadingMsg = null

        await conn.sendMessage(m.chat, {
            text:
                `*UPLOAD BERHASIL* ✅\n\n` +
                `*Format:* ${fileInfo.ext.toUpperCase()}\n` +
                `*Ukuran:* ${fileInfo.sizeFormatted}\n` +
                `*Provider:* ${provider}\n\n` +
                `*Link:*\n${url}\n\n` +
                `_Link bersifat permanen._`,
            contextInfo: {
                externalAdReply: {
                    title      : 'File Berhasil Diupload',
                    body       : `${fileInfo.ext.toUpperCase()} • ${fileInfo.sizeFormatted} • ${provider}`,
                    thumbnailUrl: /image/.test(mime) ? url : 'https://qu.ax/NvoLP.jpg',
                    sourceUrl  : url,
                    mediaType  : 1,
                    renderLargerThumbnail: true
                },
                mentionedJid: [m.sender]
            }
        }, { quoted: m })

    } catch (error) {
        console.error('ToURL Error:', error)

        await deleteMsg(conn, m, loadingMsg)
        loadingMsg = null

        m.reply(`*Upload gagal.*\n\n${error.message}`)
    }
}

handler.help    = ['tourl']
handler.tags    = ['tools']
handler.command = /^(tourl|upload)$/i
handler.limit   = false

export default handler