/*
- Feature: Ping & Status
- Description: Menampilkan status sistem, performa, dan info bot secara realtime di Telegram.
*/

import { performance }      from 'perf_hooks'
import { cpus as _cpus, totalmem, freemem, arch, platform, release, hostname, uptime as _osUptime } from 'os'

function clockString(ms) {
    if (isNaN(ms)) return '--'
    const d = Math.floor(ms / 86400000)
    const h = Math.floor(ms / 3600000) % 24
    const m = Math.floor(ms / 60000) % 60
    const s = Math.floor(ms / 1000) % 60
    return [
        d > 0 ? `${d} Hari`   : '',
        h > 0 ? `${h} Jam`    : '',
        m > 0 ? `${m} Menit`  : '',
        `${s} Detik`
    ].filter(Boolean).join(' ')
}

const handler = async (m, { conn }) => {
    const old = performance.now()
    await conn.sendPresenceUpdate('composing', m.chat)
    const ping = Math.round(performance.now() - old)

    const totalMem      = totalmem()
    const freeMem       = freemem()
    const usedMem       = totalMem - freeMem
    const memPct        = ((usedMem / totalMem) * 100).toFixed(1)
    const botMem        = process.memoryUsage().heapUsed

    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const text =
        `*STATUS SISTEM & PERFORMA BOT TELEGRAM*\n\n` +

        `*BOT INFO*\n` +
        `*Nama Bot:* ${global.info.namabot}\n` +
        `*Bot Uptime:* ${clockString(process.uptime() * 1000)}\n\n` +

        `*SERVER INFO*\n` +
        `*Hostname:* ${hostname()}\n` +
        `*Platform:* ${platform()} (${release()})\n` +
        `*Arsitektur:* ${arch()}\n` +
        `*System Uptime:* ${clockString(_osUptime() * 1000)}\n\n` +

        `*PERFORMANCE*\n` +
        `*Response Time:* ${ping} ms\n\n` +

        `*MEMORY*\n` +
        `*RAM Bot:* ${formatBytes(botMem)}\n` +
        `*RAM Sistem:* ${formatBytes(usedMem)} / ${formatBytes(totalMem)} (*${memPct}%*)\n` +
        `*RAM Free:* ${formatBytes(freeMem)}`;

    await m.reply(text);
}

handler.help    = ['ping']
handler.tags    = ['info']
handler.command = /^(ping|status|stats)$/i

export default handler
