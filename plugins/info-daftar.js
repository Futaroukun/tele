/*
- Feature: Complex Account Registration Wizard with Permanent Birthdate
- Description: Pendaftaran akun interaktif menggunakan tombol dan dialog terpandu (Langkah 1: Nama, Langkah 2: Jenis Kelamin, Langkah 3: Tanggal Lahir (Permanen), Langkah 4: Konfirmasi).
*/

import moment from 'moment-timezone';

const sessions = {};

const DATE_FORMATS = [
    'DD-MM-YYYY', 'D-M-YYYY',
    'DD/MM/YYYY', 'D/M/YYYY',
    'DDMMYYYY',
    'DD-MMMM-YYYY', 'D-MMMM-YYYY',
    'DD MMMM YYYY', 'D MMMM YYYY',
    'DD-MMM-YYYY',  'D-MMM-YYYY',
    'DD MMM YYYY',  'D MMM YYYY',
];

function parseBirthDate(input) {
    if (!input) return null;
    moment.locale('id');
    const clean = input.trim();
    for (const fmt of DATE_FORMATS) {
        const parsed = moment(clean, fmt, 'id', true).tz('Asia/Jakarta');
        if (parsed.isValid()) return parsed;
    }
    const fallback = moment(clean, DATE_FORMATS, 'id', false).tz('Asia/Jakarta');
    return fallback.isValid() ? fallback : null;
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
    const user = global.db.data.users[m.sender];
    if (!user) return;
    const senderId = m.sender;
    
    // ── UNREGISTER ────────────────────────────────────────────────────────────
    if (/^(unreg|unregister|hapusakun|logout)$/i.test(command)) {
        if (!user.register) {
            return m.reply(`Kamu belum terdaftar di database bot.`);
        }
        
        // Show confirmation with buttons
        const inline_keyboard = [
            [
                { text: '❌ Ya, Hapus Akun', callback_data: 'cmd unreg_confirm yes' },
                { text: '🔙 Batalkan', callback_data: 'cmd unreg_confirm no' }
            ]
        ];
        
        return conn.sendMessage(m.chat, {
            text: `⚠️ *KONFIRMASI HAPUS AKUN*\n\nApakah kamu yakin ingin menghapus akunmu?\nSemua data nama dan akses premium (jika ada) akan dihapus secara permanen.\n\n*Catatan:* Tanggal lahir Anda akan dipertahankan karena bersifat permanen.`,
            reply_markup: { inline_keyboard }
        });
    }

    // ── GENDER CALLBACK ────────────────────────────────────────────────────────
    if (command === 'reg_gender') {
        const session = sessions[senderId];
        if (!session || session.step !== 'gender') return;
        
        const gender = text.trim();
        session.gender = gender;
        
        const genderText = gender === 'male' ? '👨 Laki-Laki' : '👩 Perempuan';
        
        // Jika user sudah pernah mengisi umur/tanggal lahir sebelumnya, skip langkah ini
        if (user.birthdate && user.age !== -1) {
            session.birthdate = user.birthdate;
            session.age = user.age;
            session.step = 'confirm';
            
            const msgText = 
                `*KONFIRMASI PENDAFTARAN*\n\n` +
                `ℹ️ _Anda sudah pernah mengisi umur sebelumnya, pengisian umur dilewati._\n\n` +
                `Silakan periksa kembali data Anda sebelum konfirmasi:\n\n` +
                `• *Nama:* ${session.name}\n` +
                `• *Gender:* ${genderText}\n` +
                `• *Tanggal Lahir:* ${session.birthdate}\n` +
                `• *Umur:* ${session.age} Tahun\n\n` +
                `Apakah data di atas sudah benar?`;
                
            const inline_keyboard = [
                [
                    { text: '✅ Ya, Sudah Benar', callback_data: 'cmd reg_confirm yes' },
                    { text: '🔄 Ulangi Pendaftaran', callback_data: 'cmd reg_confirm no' }
                ]
            ];
            
            if (m.isCallback) {
                await conn.sendMessage(m.chat, {
                    text: msgText,
                    reply_markup: { inline_keyboard }
                }, { quoted: m });
            } else {
                await conn.sendMessage(m.chat, {
                    text: msgText,
                    reply_markup: { inline_keyboard }
                });
            }
            return;
        }
        
        // Jika belum pernah mengisi tanggal lahir, lanjut ke langkah 3
        session.step = 'birthdate';
        
        const msgText = 
            `*FORM PENDAFTARAN AKUN*\n\n` +
            `• *Nama:* ${session.name}\n` +
            `• *Gender:* ${genderText}\n\n` +
            `⚠️ *PERINGATAN:* Tanggal lahir/umur hanya dapat diisi *SEKALI saja* secara permanen dan tidak dapat diubah di masa mendatang!\n\n` +
            `*Langkah 3: Masukkan Tanggal Lahir Anda*\n` +
            `Silakan ketik tanggal lahir Anda langsung di chat.\n` +
            `Contoh format: *14-06-2006* atau *14 Juni 2006*`;
            
        if (m.isCallback) {
            await conn.sendMessage(m.chat, { text: msgText }, { quoted: m });
        } else {
            await m.reply(msgText);
        }
        return;
    }

    // ── CONFIRMATION CALLBACK ──────────────────────────────────────────────────
    if (command === 'reg_confirm') {
        const session = sessions[senderId];
        if (!session || session.step !== 'confirm') return;
        
        const ans = text.trim();
        if (ans === 'yes') {
            user.name = session.name;
            user.gender = session.gender;
            user.birthdate = session.birthdate;
            user.age = session.age;
            user.register = true;
            user.regTime = Date.now();
            
            global.saveData('users', senderId);
            delete sessions[senderId];
            
            const successText = 
                `🎉 *PENDAFTARAN BERHASIL!*\n\n` +
                `Selamat datang, *${user.name}*!\n` +
                `• *Nama:* ${user.name}\n` +
                `• *Gender:* ${user.gender === 'male' ? '👨 Laki-Laki' : '👩 Perempuan'}\n` +
                `• *Tanggal Lahir:* ${user.birthdate}\n` +
                `• *Umur:* ${user.age} Tahun\n\n` +
                `Pendaftaran akun Anda telah selesai. Silakan ketik \`${usedPrefix}menu\` untuk melihat seluruh fitur bot.`;
                
            if (m.isCallback) {
                await conn.sendMessage(m.chat, { text: successText }, { quoted: m });
            } else {
                await m.reply(successText);
            }
        } else {
            sessions[senderId] = {
                step: 'name',
                name: '',
                gender: '',
                birthdate: '',
                age: -1
            };
            const restartText = 
                `*PENDAFTARAN DIULANG*\n\n` +
                `Silakan ketik ulang nama Anda langsung di chat (3 - 30 karakter).`;
            if (m.isCallback) {
                await conn.sendMessage(m.chat, { text: restartText }, { quoted: m });
            } else {
                await m.reply(restartText);
            }
        }
        return;
    }

    // ── UNREG CONFIRM CALLBACK ──────────────────────────────────────────────────
    if (command === 'unreg_confirm') {
        const ans = text.trim();
        if (ans === 'yes') {
            const oldName = user.name;
            
            // Hapus data nama & status registrasi, TAPI pertahankan birthdate dan age
            Object.assign(user, {
                name: '', gender: '',
                register: false, regTime: -1,
                premium: false, premiumDate: -1,
                limit: 10
            });
            global.saveData('users', senderId);
            
            const successUnreg = `✅ *AKUN BERHASIL DIHAPUS*\n\nSampai jumpa, *${oldName}*. Akun kamu telah dihapus secara permanen dari database.\n\n_Catatan: Umur dan tanggal lahir kamu dipertahankan secara permanen di database._`;
            if (m.isCallback) {
                await conn.sendMessage(m.chat, { text: successUnreg }, { quoted: m });
            } else {
                await m.reply(successUnreg);
            }
        } else {
            const cancelUnreg = `🔙 Penghapusan dibatalkan. Akun kamu tetap aman.`;
            if (m.isCallback) {
                await conn.sendMessage(m.chat, { text: cancelUnreg }, { quoted: m });
            } else {
                await m.reply(cancelUnreg);
            }
        }
        return;
    }

    // ── REGISTER INITIALIZATION ────────────────────────────────────────────────
    if (user.register) {
        const inline_keyboard = [
            [{ text: '❌ Hapus Akun', callback_data: 'cmd unreg' }]
        ];
        return conn.sendMessage(m.chat, {
            text: `*Kamu sudah terdaftar.*\n\n• *Nama:* ${user.name}\n• *Gender:* ${user.gender === 'male' ? '👨 Laki-Laki' : '👩 Perempuan'}\n• *Tanggal Lahir:* ${user.birthdate}\n• *Umur:* ${user.age} Tahun`,
            reply_markup: { inline_keyboard }
        });
    }
    
    sessions[senderId] = {
        step: 'name',
        name: '',
        gender: '',
        birthdate: '',
        age: -1
    };
    
    return m.reply(
        `*FORM PENDAFTARAN AKUN*\n\n` +
        `Selamat datang di proses pendaftaran bot! Silakan ikuti langkah-langkah di bawah ini.\n\n` +
        `*Langkah 1: Masukkan Nama Anda*\n` +
        `Silakan ketik nama Anda langsung di chat (3 - 30 karakter).`
    );
};

// Interceptor untuk menangkap input teks user selama sesi pendaftaran berlangsung
handler.before = async function (m, { conn }) {
    const senderId = m.sender;
    const session = sessions[senderId];
    if (!session) return false;
    
    // Jangan tangkap jika ini adalah perintah internal pendaftaran
    if (m.text?.startsWith('/') || m.text?.startsWith('.')) {
        const cmd = m.text.slice(1).split(' ')[0].toLowerCase();
        if (['reg_gender', 'reg_confirm', 'unreg_confirm', 'daftar', 'register', 'unreg'].includes(cmd)) {
            return false;
        }
    }
    
    // Tangkap input berdasarkan langkah (step)
    if (session.step === 'name') {
        const nameInput = m.text?.trim() || '';
        if (nameInput.length < 3 || nameInput.length > 30) {
            await m.reply("❌ Nama harus terdiri dari 3 hingga 30 karakter. Silakan ketik nama yang valid.");
            return true;
        }
        session.name = nameInput;
        session.step = 'gender';
        
        const inline_keyboard = [
            [
                { text: '👨 Laki-Laki', callback_data: 'cmd reg_gender male' },
                { text: '👩 Perempuan', callback_data: 'cmd reg_gender female' }
            ]
        ];
        
        await conn.sendMessage(m.chat, {
            text: `*FORM PENDAFTARAN AKUN*\n\n• *Nama:* ${session.name}\n\n*Langkah 2: Pilih Jenis Kelamin*\nSilakan pilih jenis kelamin Anda dengan menekan tombol di bawah ini.`,
            reply_markup: { inline_keyboard }
        });
        return true;
    }
    
    if (session.step === 'birthdate') {
        const dateInput = m.text?.trim() || '';
        const parsedDate = parseBirthDate(dateInput);
        if (!parsedDate) {
            await m.reply(
                `❌ Format tanggal lahir salah atau tidak valid.\n\n` +
                `*Format yang didukung:*\n` +
                `\`14-06-2006\` \`14/06/2006\` \`14062006\`\n` +
                `\`14 Juni 2006\``
            );
            return true;
        }
        
        if (parsedDate.isAfter(moment())) {
            await m.reply("❌ Tanggal lahir tidak boleh di masa depan. Silakan ketik ulang.");
            return true;
        }
        
        const age = moment().diff(parsedDate, 'years');
        if (age < 5 || age > 100) {
            await m.reply("❌ Umur harus di antara 5 hingga 100 tahun. Silakan ketik ulang tanggal lahir yang benar.");
            return true;
        }
        
        session.birthdate = parsedDate.format('DD-MM-YYYY');
        session.age = age;
        session.step = 'confirm';
        
        const inline_keyboard = [
            [
                { text: '✅ Ya, Sudah Benar', callback_data: 'cmd reg_confirm yes' },
                { text: '🔄 Ulangi Pendaftaran', callback_data: 'cmd reg_confirm no' }
            ]
        ];
        
        await conn.sendMessage(m.chat, {
            text: 
                `*KONFIRMASI PENDAFTARAN*\n\n` +
                `Silakan periksa kembali data Anda sebelum konfirmasi:\n\n` +
                `• *Nama:* ${session.name}\n` +
                `• *Gender:* ${session.gender === 'male' ? '👨 Laki-Laki' : '👩 Perempuan'}\n` +
                `• *Tanggal Lahir:* ${parsedDate.format('DD MMMM YYYY')}\n` +
                `• *Umur:* ${session.age} Tahun\n\n` +
                `Apakah data di atas sudah benar?`,
            reply_markup: { inline_keyboard }
        });
        return true;
    }
    
    return false;
};

handler.help = ['daftar', 'unreg'];
handler.tags = ['info'];
handler.command = /^(daftar|register|reg|unreg|unregister|hapusakun|logout|reg_gender|reg_confirm|unreg_confirm)$/i;

export default handler;
