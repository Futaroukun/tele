/*
- @Author: Rafli
- @Feature: GitHub Auto Update
- @Description: Push otomatis ke GitHub dengan smart commit per file. Support jadwal harian dan push manual.
*/

import cp from 'child_process'
import { promisify } from 'util'
import cron from 'node-cron'
import chalk from 'chalk'

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



const exec = promisify(cp.exec).bind(cp)

let cronJob     = null
let isProcessing = false

const CONFIG = {
    git      : { email: 'raflisetiawan093@gmail.com', name: 'Futaroukun' },
    schedule : '0 0 * * *',
    targetJid: '6283854551575@s.whatsapp.net',
    maxRetries: 3,
    retryDelay: 5000,
    timezone : 'Asia/Jakarta'
}

const getBotLid = () => {
    if (!global.db?.data?.settings) return null
    return Object.keys(global.db.data.settings).find(v => v.endsWith('@lid'))
}

setTimeout(async () => {
    const botLid = getBotLid()
    if (!botLid) return
    if (global.db.data.settings[botLid]?.autoupdate) {
        console.log(`${chalk.white.bold(' [SISTEM]')} ${chalk.cyan.bold('Melanjutkan jadwal Auto Update GitHub...')}`)
        startAutoUpdate(global.conn)
    }
}, 15000)

const sleep = ms => new Promise(r => setTimeout(r, ms))

function getTimestamp() {
    return new Date().toLocaleString('id-ID', {
        timeZone  : CONFIG.timezone,
        day       : '2-digit', month: 'short', year: 'numeric',
        hour      : '2-digit', minute: '2-digit', hour12: false
    })
}

async function runGit(command, retries = 0) {
    try {
        const { stdout, stderr } = await exec(command, {
            timeout  : 30000,
            maxBuffer: 1024 * 1024 * 10,
            cwd      : process.cwd()
        })
        return { success: true, stdout, stderr }
    } catch (error) {
        if (retries < CONFIG.maxRetries) {
            await sleep(CONFIG.retryDelay * (retries + 1))
            return runGit(command, retries + 1)
        }
        return { success: false, error }
    }
}

function sanitize(msg) {
    return msg.replace(/[`'"]/g, '').replace(/[\n\r\\]/g, ' ').trim().substring(0, 500)
}

function parseStatus(output) {
    const added = [], deleted = [], modified = [], renamed = [], untracked = []
    output.trim().split('\n').filter(Boolean).forEach(line => {
        const parts  = line.trim().split(/\s+/)
        const status = parts[0]
        const file   = parts.slice(1).join(' ')
        if (!file) return
        if (status === 'A')                   added.push(file)
        else if (status === '??' || status === '?') untracked.push(file)
        else if (status === 'D')              deleted.push(file)
        else if (status.includes('R'))        renamed.push(file)
        else if (status.includes('M'))        modified.push(file)
    })
    return { added, deleted, modified, renamed, untracked }
}

function formatDuration(seconds) {
    if (seconds < 1)  return `${(seconds * 1000).toFixed(0)}ms`
    if (seconds < 60) return `${seconds.toFixed(2)}s`
    return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`
}

async function getRepoInfo() {
    const r = await exec('git config --get remote.origin.url')
    if (!r.stdout) throw new Error('Repository tidak memiliki remote origin.')

    let url = r.stdout.trim()
        .replace(/(https?:\/\/)[^@]+@/, '$1')
        .replace(/^git@(.+):/, 'https://$1/')
        .replace(/\.git$/, '')

    const parts    = url.split('/')
    const username = parts[parts.length - 2] || 'unknown'
    const repoName = parts[parts.length - 1] || 'unknown'
    const branch   = (await exec('git branch --show-current')).stdout.trim() || 'main'

    let lastCommit = 'No commits yet'
    try { lastCommit = (await exec('git log -1 --format="%h - %s (%cr)"')).stdout.trim() } catch {}

    return { repoUrl: url, username, repoName, branch, lastCommit }
}

async function getChanges() {
    const r = await exec('git status -s')
    if (!r.stdout.trim()) return { hasChanges: false }
    const stats = parseStatus(r.stdout)
    const total = Object.values(stats).reduce((s, a) => s + a.length, 0)
    return { hasChanges: true, stats, total }
}

async function smartCommit(stats) {
    await runGit(`git config user.email "${CONFIG.git.email}"`)
    await runGit(`git config user.name "${CONFIG.git.name}"`)

    const results = []
    const groups  = [
        { files: [...stats.added, ...stats.untracked], type: 'Add'    },
        { files: stats.modified,                        type: 'Update' },
        { files: stats.deleted,                         type: 'Delete' },
        { files: stats.renamed,                         type: 'Rename' }
    ]

    for (const { files, type } of groups) {
        for (const file of files) {
            const add = await runGit(`git add "${file}"`)
            if (!add.success) continue
            const commit = await runGit(`git commit -m "${sanitize(`${type}: ${file}`)}"`)
            if (commit.success) results.push({ type: type.toLowerCase(), file })
        }
    }

    if (results.length === 0) throw new Error('NOTHING_TO_COMMIT')
    return results
}

async function gitPush(branch) {
    const r = await runGit(`git push origin ${branch}`)
    if (!r.success) {
        const msg = r.error.message
        if (msg.includes('Authentication failed'))    throw new Error('Autentikasi gagal. Periksa kredensial Git.')
        if (msg.includes('Could not resolve host'))   throw new Error('Tidak bisa terhubung ke GitHub. Cek koneksi internet.')
        if (msg.includes('rejected'))                 throw new Error('Push ditolak. Mungkin ada perubahan yang belum di-pull.')
        throw new Error(`Gagal push: ${msg}`)
    }
}

async function githubUpload(isAuto = false) {
    if (isProcessing) return {
        success: false,
        repoUrl: 'https://github.com',
        message: '*Upload dibatalkan.*\n\nProses upload lain sedang berjalan.'
    }

    isProcessing = true
    const startTime = Date.now()

    try {
        const repo    = await getRepoInfo()
        const changes = await getChanges()

        if (!changes.hasChanges) return {
            success: false,
            repoUrl: repo.repoUrl,
            message:
                `*Tidak ada perubahan.*\n\n` +
                `Repository: ${repo.repoName}\n` +
                `Branch: ${repo.branch}\n` +
                `Waktu: ${getTimestamp()}\n\n` +
                `Working directory bersih.`
        }

        const results  = await smartCommit(changes.stats)
        await gitPush(repo.branch)

        const hash     = (await exec('git rev-parse --short HEAD')).stdout.trim()
        const duration = formatDuration((Date.now() - startTime) / 1000)

        const addCount    = results.filter(r => r.type === 'add').length
        const updateCount = results.filter(r => r.type === 'update').length
        const deleteCount = results.filter(r => r.type === 'delete').length
        const renameCount = results.filter(r => r.type === 'rename').length

        let summary = '*Ringkasan Commit:*\n'
        if (addCount)    summary += `  Ditambahkan: ${addCount}\n`
        if (updateCount) summary += `  Diupdate: ${updateCount}\n`
        if (deleteCount) summary += `  Dihapus: ${deleteCount}\n`
        if (renameCount) summary += `  Direname: ${renameCount}\n`

        let details = '\n*Detail Commit:*\n'
        results.slice(0, 20).forEach(r => {
            details += `  ${r.type.charAt(0).toUpperCase() + r.type.slice(1)}: ${r.file}\n`
        })
        if (results.length > 20) details += `  ...dan ${results.length - 20} commit lainnya\n`

        return {
            success: true,
            repoUrl: repo.repoUrl,
            message:
                `*Push berhasil.*\n\n` +
                `Author: ${repo.username}\n` +
                `Repository: ${repo.repoName}\n` +
                `Branch: ${repo.branch}\n` +
                `Waktu: ${getTimestamp()}\n` +
                `Durasi: ${duration}\n` +
                `Mode: ${isAuto ? 'Otomatis' : 'Manual'}\n\n` +
                `${summary}\n` +
                `Hash: ${hash}\n` +
                `Total Commits: ${results.length}\n` +
                `${details}`
        }

    } catch (err) {
        if (err.message === 'NOTHING_TO_COMMIT') return {
            success: false,
            repoUrl: 'https://github.com',
            message:
                `*Tidak ada yang perlu di-commit.*\n\n` +
                `Semua perubahan sudah ter-commit sebelumnya.\n\n` +
                `Waktu: ${getTimestamp()}`
        }

        return {
            success: false,
            repoUrl: 'https://github.com',
            message:
                `*Push gagal.*\n\n` +
                `${err.message}\n\n` +
                `Waktu: ${getTimestamp()}`
        }
    } finally {
        isProcessing = false
    }
}

async function sendReport(conn, jid, result, mode = 'manual', quoted = null) {
    const header = mode === 'auto'
        ? (result.success ? 'UPDATE OTOMATIS' : 'ERROR AUTO UPDATE')
        : (result.success ? 'UPDATE MANUAL'   : 'UPDATE GAGAL')

    try {
        await conn.sendButton(jid, {
            header,
            image  : { url: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png' },
            body   : result.message,
            footer : 'GitHub Automation',
            buttons: [
                {
                    name            : 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: 'Buka Repository',
                        url         : result.repoUrl || 'https://github.com',
                        merchant_url: result.repoUrl || 'https://github.com'
                    })
                },
                {
                    name            : 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title   : 'Pilih Aksi',
                        sections: [{
                            title          : 'Opsi Sistem',
                            highlight_label: 'Menu',
                            rows           : [
                                { header: 'Status', title: 'Lihat Status',  description: 'Cek status auto update', id: '.autoupdate status' },
                                { header: 'Push',   title: 'Push Manual',   description: 'Upload perubahan manual', id: '.update'           }
                            ]
                        }]
                    })
                }
            ]
        }, { quoted })
    } catch (e) {
        console.error('[AUTOUPDATE] Gagal kirim notif:', e.message)
    }
}

async function autoUpdate(conn) {
    const now     = new Date()
    const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: CONFIG.timezone })
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: CONFIG.timezone })

    try {
        const result = await githubUpload(true)
        await sendReport(conn, CONFIG.targetJid, result, 'auto')
    } catch (e) {
        console.error('[AUTOUPDATE]', e.message)
        await sendReport(conn, CONFIG.targetJid, {
            success: false,
            repoUrl: 'https://github.com',
            message: `*Auto update error.*\n\n${e.message}\n\nWaktu: ${getTimestamp()}`
        }, 'auto')
    }
}

function startAutoUpdate(conn) {
    if (cronJob) return false
    cronJob = cron.schedule(CONFIG.schedule, () => autoUpdate(conn), { timezone: CONFIG.timezone })
    const botLid = getBotLid()
    if (botLid && global.db.data.settings[botLid]) global.db.data.settings[botLid].autoupdate = true
    console.log(`${chalk.white.bold(' [SISTEM]')} ${chalk.cyan.bold('Auto Update GitHub aktif.')}`)
    return true
}

function stopAutoUpdate() {
    if (!cronJob) return false
    cronJob.stop()
    cronJob = null
    const botLid = getBotLid()
    if (botLid && global.db.data.settings[botLid]) global.db.data.settings[botLid].autoupdate = false
    return true
}

const handler = async (m, { conn, args, command, usedPrefix }) => {
    if (command === 'autoupdate') {
        const action = args[0]?.toLowerCase()

        if (action === 'start' || action === 'on') {
            const ok = startAutoUpdate(conn)
            return m.reply(ok
                ? `*Auto Update diaktifkan.*\n\nJadwal: Setiap hari jam 00:00 WIB\nGunakan \`${usedPrefix}autoupdate status\` untuk monitoring.`
                : `Auto Update sudah berjalan.\nGunakan \`${usedPrefix}autoupdate status\` untuk detail.`
            )
        }

        if (action === 'stop' || action === 'off') {
            const ok = stopAutoUpdate()
            return m.reply(ok
                ? `*Auto Update dinonaktifkan.*\n\nWaktu: ${getTimestamp()}\nGunakan \`${usedPrefix}autoupdate start\` untuk mengaktifkan kembali.`
                : `Auto Update tidak sedang berjalan.\nGunakan \`${usedPrefix}autoupdate start\` untuk mengaktifkan.`
            )
        }

        if (action === 'status') {
            const isActive = cronJob !== null
            const repo     = await getRepoInfo().catch(() => ({ repoName: 'Unknown', branch: 'Unknown', lastCommit: 'N/A' }))
            const botLid   = getBotLid()
            const dbStatus = global.db.data.settings[botLid]?.autoupdate ? 'AKTIF' : 'NONAKTIF'

            return conn.sendButton(m.chat, {
                header : 'STATUS AUTO UPDATE',
                body   :
                    `*Status Cron:* ${isActive ? 'AKTIF' : 'NONAKTIF'}\n` +
                    `*Status DB:* ${dbStatus}\n` +
                    `*Jadwal:* 00:00 WIB setiap hari\n` +
                    `*Notif Ke:* ${CONFIG.targetJid.replace('@s.whatsapp.net', '')}\n\n` +
                    `*Repository:* ${repo.repoName}\n` +
                    `*Branch:* ${repo.branch}\n` +
                    `*Last Commit:* ${repo.lastCommit}`,
                footer : 'GitHub Automation',
                buttons: [{
                    name            : 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title   : 'Pengaturan',
                        sections: [{
                            title          : 'Pengaturan Auto Update',
                            highlight_label: 'Opsi',
                            rows           : [
                                {
                                    header     : isActive ? 'Stop' : 'Start',
                                    title      : isActive ? 'Nonaktifkan' : 'Aktifkan',
                                    description: isActive ? 'Hentikan jadwal' : 'Jalankan jadwal',
                                    id         : isActive ? `${usedPrefix}autoupdate stop` : `${usedPrefix}autoupdate start`
                                },
                                { header: 'Push', title: 'Push Manual', description: 'Upload perubahan manual', id: `${usedPrefix}update` }
                            ]
                        }]
                    })
                }]
            }, { quoted: m })
        }

        const isActive = cronJob !== null
        return conn.sendButton(m.chat, {
            header : 'AUTO UPDATE MENU',
            body   :
                `*Status:* ${isActive ? 'AKTIF' : 'NONAKTIF'}\n` +
                `*Jadwal:* 00:00 WIB (Daily)\n\n` +
                `Pilih aksi di bawah untuk mengelola sistem auto update.`,
            footer : 'GitHub Automation',
            buttons: [{
                name            : 'single_select',
                buttonParamsJson: JSON.stringify({
                    title   : 'Pilih Aksi',
                    sections: [{
                        title          : 'Menu Auto Update',
                        highlight_label: 'Menu',
                        rows           : [
                            isActive
                                ? { header: 'Stop',   title: 'Nonaktifkan', description: 'Hentikan jadwal otomatis', id: `${usedPrefix}autoupdate stop`   }
                                : { header: 'Start',  title: 'Aktifkan',    description: 'Jalankan jadwal otomatis', id: `${usedPrefix}autoupdate start`  },
                            { header: 'Status', title: 'Cek Status', description: 'Lihat status sistem',      id: `${usedPrefix}autoupdate status` },
                            { header: 'Push',   title: 'Push Manual', description: 'Upload perubahan manual', id: `${usedPrefix}update`            }
                        ]
                    }]
                })
            }]
        }, { quoted: m })
    }

    const loading = await m.reply('_Memproses upload ke GitHub, tunggu sebentar..._')

    try {
        const result = await githubUpload(false)
        await deleteMsg(conn, m, loading)
        await sendReport(conn, m.chat, result, 'manual', m)
    } catch (e) {
        console.error('[UPDATE]', e)
        await deleteMsg(conn, m, loading)
        m.reply(`*Terjadi kesalahan.*\n\n${e.message}`)
    }
}

handler.help    = ['update [commit]', 'autoupdate']
handler.tags    = ['owner']
handler.command = /^(update|push|u|autoupdate)$/i
handler.owner   = true

export default handler