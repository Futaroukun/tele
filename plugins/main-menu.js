/*
- Feature: Menu / Help
- Description: Tampilkan daftar fitur bot berdasarkan kategori dengan info user untuk Telegram.
*/

import fs   from 'fs'
import { join, dirname } from 'path'
import os   from 'os'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url));
const packagePath = join(__dirname, '../package.json')
let _package = {}
try {
    if (fs.existsSync(packagePath)) _package = JSON.parse(fs.readFileSync(packagePath, 'utf-8'))
} catch {}

const tags = {
    group     : 'Groups Menu',
    sticker   : 'Sticker Menu',
    info      : 'Info Menu',
    owner     : 'Owner Menu',
    internet  : 'Internet Menu',
    downloader: 'Downloader Menu',
    tools     : 'Tools Menu',
    fun       : 'Fun Menu',
}

const defaultMenu = {
    before: `Hallo %namatag!\nSaya siap membantu kamu 24 jam.\n\n「 *INFO BOT* 」\n • Nama : %me\n • Platform : %platform\n • Versi : %version\n • Uptime : %uptime\n\n「 *INFO USER* 」\n • Nama : %name\n • Gender : %gender\n • Status : %status\n • Limit : %limit\n • Umur : %age\n%readmore\n`,
    header: '╭─「 *%category* 」',
    body  : '│ • %cmd',
    footer: '╰────\n',
    after : `> Powered by Rafli`
}

let _pluginCacheKey  = null
let _pluginCacheData = null

function getPluginHelp(isOwner) {
    const cacheKey = `${Object.keys(global.plugins).join(',')}:${isOwner}`
    if (_pluginCacheKey === cacheKey && _pluginCacheData) return _pluginCacheData

    const result = Object.values(global.plugins)
        .filter(p => p && p.help && !p.disable && (!(p.owner || p.rowner) || isOwner))
        .map(p => ({
            help   : Array.isArray(p.help) ? p.help : [p.help],
            tags   : Array.isArray(p.tags) ? p.tags : [p.tags],
            prefix : 'customPrefix' in p,
            limit  : p.limit,
            premium: p.premium
        }))

    _pluginCacheKey  = cacheKey
    _pluginCacheData = result
    return result
}

function clockString(ms) {
    const d = Math.floor(ms / 86400000)
    const h = Math.floor(ms / 3600000) % 24
    const m = Math.floor(ms / 60000) % 60
    const s = Math.floor(ms / 1000) % 60
    const parts = []
    if (d > 0) parts.push(`${d}d`)
    parts.push([h, m, s].map(v => v.toString().padStart(2, '0')).join(':'))
    return parts.join(' ')
}

let handler = async (m, { conn, usedPrefix, command, text, isOwner }) => {
    try {
        if (command.toLowerCase() === 'start') command = 'menu';
        const user = global.db.data.users[m.sender]
        if (!user) return

        const name    = user.name || 'Pengguna Baru'
        const namatag = m.msg.from.username ? `@${m.msg.from.username}` : `[${name}](tg://user?id=${m.sender.split('@')[0]})`
        const age     = user.age === -1 ? 'Belum input umur' : `${user.age} Tahun`
        const limit   = user.limit === Infinity ? 'Unlimited' : (user.limit || 0)
        const gender  = user.gender === 'male' ? 'Laki-Laki' : user.gender === 'female' ? 'Perempuan' : 'Belum input gender'

        let status = 'Standard User'
        if      (user.banned)  status = 'Banned'
        else if (isOwner)      status = 'Developer'
        else if (user.premium) status = 'Premium User'

        const botname  = global.info?.namabot || 'Joy Telegram Bot'
        const d        = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
        const locale   = 'id-ID'
        const date     = d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
        const year     = d.toLocaleDateString(locale, { year: 'numeric' })
        const uptime   = clockString(process.uptime() * 1000)
        const platform = os.platform()

        const help       = getPluginHelp(isOwner)
        const activeTags = new Set()

        for (const plugin of help) {
            for (const tag of (plugin.tags || [])) {
                if (!tag) continue
                activeTags.add(tag)
                if (!(tag in tags)) tags[tag] = `${tag.charAt(0).toUpperCase() + tag.slice(1)} Menu`
            }
        }

        const readMore = '\n' + '.'.repeat(100) + '\n' // Simulasi readmore di Telegram
        const replace  = {
            '%': '%', p: usedPrefix, name, limit, age,
            date, year, uptime, platform, mode: 'Publik',
            me: botname, version: _package.version || '1.0.0',
            readmore: readMore, status, namatag, gender
        }

        const menuType = text?.toLowerCase().trim() || ''
        const { before, header, body, footer, after } = defaultMenu
        let menuText = []

        if (!menuType) {
            const tagList = Object.keys(tags)
                .filter(tag => activeTags.has(tag))
                .sort()
                .map(tag => `│ • ${usedPrefix + command} ${tag}`)
                .join('\n')

            menuText = [
                before,
                `Berikut daftar menu yang tersedia:`,
                `╭─「 *DAFTAR MENU* 」`,
                `│ • ${usedPrefix + command} all`,
                tagList,
                footer,
                `Ketik ${usedPrefix + command} <nama_menu> untuk melihat fiturnya.\n*Contoh:* ${usedPrefix + command} sticker`,
                `\n\n` + after
            ]

        } else if (menuType === 'all' || (tags[menuType] && activeTags.has(menuType))) {
            const categories = menuType === 'all'
                ? Object.keys(tags).filter(t => activeTags.has(t)).sort()
                : [menuType]

            menuText.push(before)

            for (const tag of categories) {
                if (!tags[tag]) continue
                const filtered = help.filter(p => p.tags?.includes(tag) && p.help)
                if (!filtered.length) continue

                menuText.push(header.replace(/%category/g, tags[tag]))
                menuText.push(
                    filtered.map(p =>
                        p.help.map(cmd =>
                            body.replace(/%cmd/g,
                                `${p.prefix ? '' : usedPrefix}${cmd}${p.premium ? ' (P)' : ''}${p.limit ? ' (L)' : ''}`
                            )
                        ).join('\n')
                    ).join('\n')
                )
                menuText.push(footer)
            }
            menuText.push(after)

        } else {
            return m.reply(
                `Menu \`${text}\` tidak ditemukan atau tidak memiliki fitur aktif.\n\n` +
                `Ketik \`${usedPrefix + command}\` untuk melihat daftar menu.`
            )
        }

        const textToSend = menuText.join('\n').replace(
            /%([a-zA-Z0-9]+)/g,
            (match, key) => replace[key] ?? match
        )

        // Konstruksi Inline Keyboard untuk Telegram dengan tombol fitur dinamis
        let inlineMarkup = null;
        if (!menuType) {
            const tagList = Object.keys(tags)
                .filter(tag => activeTags.has(tag))
                .sort();
                
            const buttons = [];
            for (let i = 0; i < tagList.length; i += 2) {
                const row = [];
                row.push({ text: tags[tagList[i]], callback_data: `menu ${tagList[i]}` });
                if (tagList[i+1]) {
                    row.push({ text: tags[tagList[i+1]], callback_data: `menu ${tagList[i+1]}` });
                }
                buttons.push(row);
            }
            buttons.push([{ text: 'Tampilkan Semua Fitur', callback_data: 'menu all' }]);
            inlineMarkup = { inline_keyboard: buttons };
        } else if (menuType !== 'all' && tags[menuType] && activeTags.has(menuType)) {
            const tag = menuType;
            const filtered = help.filter(p => p.tags?.includes(tag) && p.help);
            
            const cmdButtons = [];
            for (const p of filtered) {
                for (const helpStr of p.help) {
                    const cmdName = helpStr.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
                    if (!cmdName) continue;
                    
                    const btnText = cmdName.charAt(0).toUpperCase() + cmdName.slice(1);
                    
                    cmdButtons.push({
                        text: btnText,
                        callback_data: `cmd ${cmdName}`
                    });
                }
            }
            
            const buttons = [];
            for (let i = 0; i < cmdButtons.length; i += 2) {
                const row = [];
                row.push(cmdButtons[i]);
                if (cmdButtons[i+1]) {
                    row.push(cmdButtons[i+1]);
                }
                buttons.push(row);
            }
            
            buttons.push([{ text: 'Kembali ke Menu Utama', callback_data: 'menu' }]);
            inlineMarkup = { inline_keyboard: buttons };
        } else {
            inlineMarkup = {
                inline_keyboard: [
                    [{ text: 'Kembali ke Menu Utama', callback_data: 'menu' }]
                ]
            };
        }

        // Tentukan path thumbnail (utamakan file lokal src/thumbnail.jpg yang sudah dicopy dari WA)
        const localThumbnail = join(__dirname, '../src/thumbnail.jpg');
        const thumbnailSource = fs.existsSync(localThumbnail) ? localThumbnail : (global.thum || null);

        // Kirim sebagai foto atau teks biasa dengan parse_mode HTML
        const options = { parse_mode: 'HTML' };
        if (inlineMarkup) options.reply_markup = inlineMarkup;

        if (thumbnailSource) {
            // Batas maksimal caption foto di Telegram adalah 1024 karakter
            if (textToSend.length <= 1024) {
                await conn.sendFile(m.chat, thumbnailSource, 'menu.jpg', textToSend, m, false, options);
            } else {
                // Jika menu terlalu panjang, kirim gambar terlebih dahulu, lalu kirim teks lengkapnya agar tidak error
                await conn.sendFile(m.chat, thumbnailSource, 'menu.jpg', '', m, false);
                await conn.sendMessage(m.chat, { text: textToSend }, { quoted: m, ...options });
            }
        } else {
            await conn.sendMessage(m.chat, { text: textToSend }, { quoted: m, ...options });
        }

    } catch (e) {
        console.error('[MENU]', e)
        m.reply('Terjadi kesalahan saat menampilkan menu.')
    }
}

handler.command = /^(menu|help|start)$/i

export default handler
