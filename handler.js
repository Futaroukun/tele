import "./settings.js";
import { Telegraf } from 'telegraf';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { fileTypeFromBuffer } from 'file-type';
import { getCommandCooldown, checkCooldown, setCooldown, isCooldownNotified, setCooldownNotified } from './function/cooldown.js';
import { parseWhatsAppButtons } from './function/button.js';

// Mengubah format bold/italic WhatsApp (*text*, _text_) menjadi tag HTML Telegram (<b>text</b>, <i>text</i>) secara aman
function formatWhatsAppToHTML(text) {
    if (typeof text !== 'string') return text;
    
    // Escaping karakter HTML agar tidak menyebabkan parsing error di Telegram
    let escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
        
    // Konversi tag formatting WhatsApp ke HTML menggunakan word-boundary check agar tidak merusak username ber-underscore
    escaped = escaped.replace(/(?<![a-zA-Z0-9])\*([^\*\s](?:.*?[^\*\s])?)\*(?![a-zA-Z0-9])/g, '<b>$1</b>');
    escaped = escaped.replace(/(?<![a-zA-Z0-9])_([^\_\s](?:.*?[^\_\s])?)_(?![a-zA-Z0-9])/g, '<i>$1</i>');
    escaped = escaped.replace(/(?<![a-zA-Z0-9])~([^~\s](?:.*?[^\~\s])?)~(?![a-zA-Z0-9])/g, '<s>$1</s>');
    escaped = escaped.replace(/```([\s\S]+?)```/g, '<code>$1</code>');
    
    // Konversi blockquote WhatsApp (> text) ke <blockquote>text</blockquote> di Telegram
    escaped = escaped.replace(/(?:^|\n)&gt;\s*(.*?)(?=\n|$)/g, '\n<blockquote>$1</blockquote>');
    
    // Konversi markdown link [text](url) ke <a href="url">text</a> di Telegram
    escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2">$1</a>');
    
    return escaped;
}

global.dFail = (type, m, conn) => {
    let msg = {
        rowner: "*DEVELOPER ONLY*",
        owner: "*OWNER ONLY*",
        premium: "*PREMIUM ONLY*",
        group: "*GROUP CHAT ONLY*",
        private: "*PRIVATE CHAT ONLY*",
        admin: "*ADMIN ONLY*",
        botAdmin: "*BOT ADMIN REQUIRED*",
        sewa: "*PAID GROUP ONLY*",
        unreg: "*YOU ARE NOT REGISTERED YET*",
        restrict: "*RESTRICTED COMMAND*",
        disable: "*DISABLE COMMAND*"
    }[type];
    if (msg) return conn.reply(m.chat, msg, m);
};

export async function initBot() {
    if (!global.telegramToken) {
        console.log(chalk.yellow.bold("\n [TELEGRAM] Telegram Bot Token belum diatur di \"settings.js\"."));
        console.log(chalk.yellow("           Masukkan token bot Telegram Anda ke global.telegramToken untuk mengaktifkan."));
        return;
    }

    try {
        const bot = new Telegraf(global.telegramToken);
        const botInfo = await bot.telegram.getMe();
        console.log(`${chalk.white.bold(" [TELEGRAM]")} ${chalk.green.bold(`Bot Telegram Aktif! Username: @${botInfo.username}`)}`);
        
        global.tgBotInfo = botInfo;
        global.tgBot = bot;

        const tgConn = {
            user: {
                id: `${botInfo.id}@t.me`,
                name: botInfo.first_name,
                lid: `${botInfo.id}@t.me`
            },
            
            getFile: async function(PATH, saveToFile = false, fetchOptions = {}) {
                 let res, filename, isTemp = false;
                 const data = Buffer.isBuffer(PATH)
                    ? PATH
                    : PATH instanceof ArrayBuffer
                    ? PATH.toBuffer()
                    : /^data:.*?\/.*?;base64,/i.test(PATH)
                    ? Buffer.from(PATH.split`,`[1], "base64")
                    : /^https?:\/\//.test(PATH)
                    ? (res = await fetch(PATH, fetchOptions), Buffer.from(await res.arrayBuffer()))
                    : fs.existsSync(PATH)
                    ? ((filename = PATH), fs.readFileSync(PATH))
                    : typeof PATH === "string"
                    ? PATH
                    : Buffer.alloc(0);
                    
                 if (!Buffer.isBuffer(data)) throw new TypeError("Result is not a buffer");
                 const type = (await fileTypeFromBuffer(data)) || {
                    mime: "application/octet-stream",
                    ext: ".bin"
                 };
                 
                 if (data && saveToFile && !filename) {
                    filename = path.join(process.cwd(), "tmp", `${new Date() * 1}.${type.ext}`);
                    await fs.promises.writeFile(filename, data);
                    isTemp = true;
                 }
                    
                 return {
                    res,
                    filename,
                    ...type,
                    data,
                    deleteFile() {
                       return (isTemp && filename) ? fs.promises.unlink(filename) : Promise.resolve(false);
                    }
                 };
            },
            
            sendMedia: async function(chatId, method, file, extra, fetchOptions = {}) {
                const isUrl = typeof file === 'string' && /^https?:\/\//.test(file);
                
                if (isUrl) {
                    try {
                        return await bot.telegram[method](chatId, file, extra);
                    } catch (urlError) {
                        console.warn(`[TELEGRAM] Gagal kirim URL langsung (${file}), mendownload ke buffer... Error: ${urlError.message}`);
                    }
                }
                
                // Fallback / Buffer / Path Lokal
                const type = await this.getFile(file, true, fetchOptions);
                const { data, ext } = type;
                
                if (data.length > 50 * 1024 * 1024) {
                    if (type.deleteFile) await type.deleteFile().catch(() => {});
                    throw new Error("Ukuran file melebihi batas Telegram Bot API (50 MB)");
                }
                
                const fileSource = { source: data, filename: `file${ext}` };
                
                try {
                    return await bot.telegram[method](chatId, fileSource, extra);
                } finally {
                    if (type.deleteFile) await type.deleteFile().catch(() => {});
                }
            },
            
            sendMessage: async function(chat, content, options = {}) {
                const chat_id = chat.replace('@t.me', '');
                let reply_to = null;
                if (options.quoted && options.quoted.id) {
                    reply_to = { message_id: parseInt(options.quoted.id) };
                }
                
                let replyMarkup = options.reply_markup || content.reply_markup;
                if (!replyMarkup && content.buttons) {
                    replyMarkup = parseWhatsAppButtons(content);
                }
                
                const parseMode = options.parse_mode || content.parse_mode || 'HTML';
                const extra = {
                    ...(reply_to ? { reply_parameters: reply_to } : {}),
                    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
                    ...(parseMode ? { parse_mode: parseMode } : {})
                };
                
                if (content.text) {
                    const text = parseMode === 'HTML' ? formatWhatsAppToHTML(content.text) : content.text;
                    if (options.quoted && options.quoted.isMenuNavigation) {
                        try {
                            const messageId = parseInt(options.quoted.id);
                            if (options.quoted.msg && (options.quoted.msg.photo || options.quoted.msg.document || options.quoted.msg.video)) {
                                return await bot.telegram.editMessageCaption(chat_id, messageId, null, text, extra);
                            } else {
                                return await bot.telegram.editMessageText(chat_id, messageId, null, text, extra);
                            }
                        } catch (e) {
                            console.warn("[TELEGRAM EDIT TEXT ERROR] Gagal edit, fallback kirim baru:", e.message);
                        }
                    }
                    return await bot.telegram.sendMessage(chat_id, text, extra);
                }
                if (content.image) {
                    const photo = content.image.url || content.image;
                    const caption = parseMode === 'HTML' ? formatWhatsAppToHTML(content.caption || '') : (content.caption || '');
                    return await this.sendMedia(chat_id, 'sendPhoto', photo, { ...extra, caption }, options.fetchOptions || content.fetchOptions || {});
                }
                if (content.video) {
                    const video = content.video.url || content.video;
                    const caption = parseMode === 'HTML' ? formatWhatsAppToHTML(content.caption || '') : (content.caption || '');
                    return await this.sendMedia(chat_id, 'sendVideo', video, { ...extra, caption }, options.fetchOptions || content.fetchOptions || {});
                }
                if (content.document) {
                    const document = content.document.url || content.document;
                    const caption = parseMode === 'HTML' ? formatWhatsAppToHTML(content.caption || '') : (content.caption || '');
                    return await this.sendMedia(chat_id, 'sendDocument', document, { ...extra, caption }, options.fetchOptions || content.fetchOptions || {});
                }
                if (content.audio) {
                    const audio = content.audio.url || content.audio;
                    const caption = parseMode === 'HTML' ? formatWhatsAppToHTML(content.caption || '') : (content.caption || '');
                    return await this.sendMedia(chat_id, 'sendAudio', audio, { ...extra, caption }, options.fetchOptions || content.fetchOptions || {});
                }
                if (content.sticker) {
                    const sticker = content.sticker.url || content.sticker;
                    return await this.sendMedia(chat_id, 'sendSticker', sticker, extra, options.fetchOptions || content.fetchOptions || {});
                }
                if (content.react) {
                    const msgId = options.key?.id || content.react.key?.id;
                    if (msgId) {
                        try {
                            return await bot.telegram.setMessageReaction(chat_id, parseInt(msgId), [{
                                type: 'emoji',
                                emoji: content.react.text
                            }]);
                        } catch {}
                    }
                }
            },
            
            sendFile: async function(chat, path, filename = "", caption = "", quoted, ptt = false, options = {}) {
                const chat_id = chat.replace('@t.me', '');
                let reply_to = null;
                if (quoted && quoted.id) {
                    reply_to = { message_id: parseInt(quoted.id) };
                }
                
                const parseMode = options.parse_mode || 'HTML';
                const formattedCaption = parseMode === 'HTML' ? formatWhatsAppToHTML(caption) : caption;
                
                const extra = {
                    ...(reply_to ? { reply_parameters: reply_to } : {}),
                    ...(formattedCaption ? { caption: formattedCaption } : {}),
                    ...(options.reply_markup ? { reply_markup: options.reply_markup } : {}),
                    ...(parseMode ? { parse_mode: parseMode } : {})
                };
                
                if (quoted && quoted.isMenuNavigation) {
                    const messageId = parseInt(quoted.id);
                    try {
                        if (quoted.msg && (quoted.msg.photo || quoted.msg.document || quoted.msg.video)) {
                            return await bot.telegram.editMessageCaption(chat_id, messageId, null, formattedCaption, {
                                reply_markup: options.reply_markup,
                                parse_mode: parseMode
                            });
                        }
                    } catch (e) {
                        console.warn("[TELEGRAM EDIT CAPTION ERROR] Gagal edit caption, fallback kirim baru:", e.message);
                    }
                }
                
                let method = 'sendDocument';
                const fileStr = typeof path === 'string' ? path.toLowerCase() : '';
                if (fileStr.endsWith('.jpg') || fileStr.endsWith('.jpeg') || fileStr.endsWith('.png') || fileStr.includes('image')) {
                    method = 'sendPhoto';
                } else if (fileStr.endsWith('.mp4') || fileStr.includes('video')) {
                    method = 'sendVideo';
                } else if (fileStr.endsWith('.mp3') || fileStr.includes('audio')) {
                    method = ptt ? 'sendVoice' : 'sendAudio';
                } else if (fileStr.endsWith('.webp') || fileStr.includes('sticker')) {
                    method = 'sendSticker';
                }
                
                return await this.sendMedia(chat_id, method, path, extra, options.fetchOptions || {});
            },
            
            reply: async function(chat, text = '', quoted, options) {
                return await this.sendMessage(chat, { text, ...options }, { quoted, ...options });
            },
            
            sendButton: async function(chat, content, options = {}) {
                const chat_id = chat.replace('@t.me', '');
                let text = typeof content === 'string' ? content : content?.body || content?.text || content?.caption || '';
                
                const parseMode = options.parse_mode || 'HTML';
                const formattedText = parseMode === 'HTML' ? formatWhatsAppToHTML(text) : text;
                
                let replyMarkup = options.reply_markup;
                if (!replyMarkup && content?.buttons) {
                    replyMarkup = parseWhatsAppButtons(content);
                }
                
                let reply_to = null;
                if (options.quoted && options.quoted.id) {
                    reply_to = { message_id: parseInt(options.quoted.id) };
                }
                
                const extra = {
                    ...(reply_to ? { reply_parameters: reply_to } : {}),
                    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
                    ...(parseMode ? { parse_mode: parseMode } : {})
                };
                
                let mime = null;
                if (content?.image) mime = 'image';
                else if (content?.video) mime = 'video';
                else if (content?.document) mime = 'document';
                else if (content?.audio) mime = 'audio';
                
                if (mime) {
                    const mediaFile = content[mime].url || content[mime];
                    const method = mime === 'image' ? 'sendPhoto' : mime === 'video' ? 'sendVideo' : mime === 'audio' ? 'sendAudio' : 'sendDocument';
                    return await this.sendMedia(chat_id, method, mediaFile, { ...extra, caption: formattedText }, options.fetchOptions || content.fetchOptions || {});
                }
                
                return await bot.telegram.sendMessage(chat_id, formattedText, extra);
            },
            
            sendPresenceUpdate: async function(action, chat) {
                if (!chat) return;
                const chat_id = chat.replace('@t.me', '');
                const act = action === 'composing' ? 'typing' : action === 'recording' ? 'record_voice' : 'typing';
                try {
                    await bot.telegram.sendChatAction(chat_id, act);
                } catch {}
            },
            
            getName: async function(jid) {
                if (!jid) return 'Unknown';
                const idStr = jid.replace('@t.me', '');
                
                // 1. Cek jika bot itu sendiri
                if (jid === this.user.id || idStr === botInfo.id.toString()) {
                    return this.user.name || botInfo.first_name;
                }
                
                // 2. Cek dari database user
                if (global.db?.data?.users?.[jid]?.name) {
                    return global.db.data.users[jid].name;
                }
                
                // 3. Ambil dari API Telegram getChat
                try {
                    const chatId = parseInt(idStr);
                    if (!isNaN(chatId)) {
                        const chat = await bot.telegram.getChat(chatId);
                        if (chat) {
                            return chat.title || (chat.first_name + (chat.last_name ? ' ' + chat.last_name : ''));
                        }
                    }
                } catch (e) {
                    console.warn(`[TELEGRAM getName ERROR] Gagal mengambil chat ${idStr}:`, e.message);
                }
                
                return idStr;
            },
            
            sendAlbum: async function(chat, albumItems, options = {}) {
                const chat_id = chat.replace('@t.me', '');
                let reply_to = null;
                if (options.quoted && options.quoted.id) {
                    reply_to = { message_id: parseInt(options.quoted.id) };
                }
                
                const parseMode = options.parse_mode || 'HTML';
                const extra = {
                    ...(reply_to ? { reply_parameters: reply_to } : {})
                };
                
                const mediaGroup = [];
                const tempFiles = [];
                
                try {
                    for (const item of albumItems) {
                        let type = 'photo';
                        let media = '';
                        let caption = '';
                        
                        if (item.image) {
                            type = 'photo';
                            media = item.image.url || item.image;
                            caption = item.caption || '';
                        } else if (item.video) {
                            type = 'video';
                            media = item.video.url || item.video;
                            caption = item.caption || '';
                        } else {
                            continue;
                        }
                        
                        const formattedCaption = parseMode === 'HTML' ? formatWhatsAppToHTML(caption) : caption;
                        
                        const fileType = await this.getFile(media, true, options.fetchOptions || {});
                        if (fileType.deleteFile) tempFiles.push(fileType);
                        
                        const { data, ext } = fileType;
                        if (data.length > 50 * 1024 * 1024) {
                            throw new Error("Ukuran file melebihi batas Telegram Bot API (50 MB)");
                        }
                        
                        mediaGroup.push({
                            type,
                            media: { source: data, filename: `file${ext}` },
                            ...(formattedCaption ? { caption: formattedCaption } : {}),
                            parse_mode: parseMode
                        });
                    }
                    
                    if (mediaGroup.length === 0) return;
                    
                    return await bot.telegram.sendMediaGroup(chat_id, mediaGroup, extra);
                } finally {
                    for (const temp of tempFiles) {
                        if (temp.deleteFile) await temp.deleteFile().catch(() => {});
                    }
                }
            }
        };

        // Fungsi pemroses pesan modular utama
        async function processMessage(ctx, incomingMessage = null) {
            const message = incomingMessage || ctx.message;
            if (!message) return;

            // 1. Tipe pesan
            let mtype = '';
            if (message.text) mtype = 'conversation';
            else if (message.photo) mtype = 'imageMessage';
            else if (message.video) mtype = 'videoMessage';
            else if (message.audio) mtype = 'audioMessage';
            else if (message.voice) mtype = 'audioMessage';
            else if (message.document) mtype = 'documentMessage';
            else if (message.sticker) mtype = 'stickerMessage';
            
            // 2. Chat & Sender Identifiers
            const chatJid = `${ctx.chat.id}@t.me`;
            const senderJid = `${ctx.from.id}@t.me`;
            const senderNumber = ctx.from.id.toString();
            const fromMe = ctx.from.id === botInfo.id;
            
            function getFileIdFromMessage(msg) {
                if (msg.photo) return msg.photo[msg.photo.length - 1].file_id;
                if (msg.video) return msg.video.file_id;
                if (msg.audio) return msg.audio.file_id;
                if (msg.voice) return msg.voice.file_id;
                if (msg.document) return msg.document.file_id;
                if (msg.sticker) return msg.sticker.file_id;
                return null;
            }
            
            async function downloadTelegramFile(fileId) {
                const file = await bot.telegram.getFile(fileId);
                const url = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`Gagal mengunduh file Telegram: ${res.statusText}`);
                return Buffer.from(await res.arrayBuffer());
            }
            
            // 3. Konstruksi objek 'm' yang kompatibel dengan WhatsApp
            let mimetype = '';
            if (message.photo) mimetype = 'image/jpeg';
            else if (message.video) mimetype = 'video/mp4';
            else if (message.document) mimetype = message.document.mime_type || '';
            else if (message.audio) mimetype = message.audio.mime_type || 'audio/mp3';
            else if (message.voice) mimetype = message.voice.mime_type || 'audio/ogg';
            else if (message.sticker) mimetype = 'image/webp';

            const m = {
                key: {
                    remoteJid: chatJid,
                    fromMe: fromMe,
                    id: message.message_id.toString(),
                    participant: senderJid
                },
                id: message.message_id.toString(),
                chat: chatJid,
                sender: senderJid,
                fromMe: fromMe,
                isGroup: ctx.chat.type !== 'private',
                text: message.text || message.caption || '',
                mtype: mtype,
                mimetype: mimetype,
                msg: {
                    ...message,
                    mimetype: mimetype
                },
                isBaileys: false,
                isCallback: message.isCallback || false,
                isMenuNavigation: message.isMenuNavigation || false,
                reply: function(text, chatId, options) {
                    return tgConn.reply(chatId ? chatId : this.chat, text, this, options);
                },
                react: function(emoji) {
                    return tgConn.sendMessage(this.chat, {
                        react: {
                            text: emoji,
                            key: this.key
                        }
                    });
                },
                edit: function(text, key) {
                    const msgId = key?.id || this.id;
                    const chat_id = this.chat.replace('@t.me', '');
                    return bot.telegram.editMessageText(chat_id, parseInt(msgId), null, text);
                },
                download: async function() {
                    const fileId = getFileIdFromMessage(message);
                    if (!fileId) throw new Error('Tidak ada media yang ditemukan di pesan ini.');
                    return await downloadTelegramFile(fileId);
                }
            };
            
            // Handler pesan balasan (quoted message)
            if (message.reply_to_message) {
                let quotedType = '';
                const qm = message.reply_to_message;
                if (qm.text) quotedType = 'conversation';
                else if (qm.photo) quotedType = 'imageMessage';
                else if (qm.video) quotedType = 'videoMessage';
                else if (qm.audio) quotedType = 'audioMessage';
                else if (qm.voice) quotedType = 'audioMessage';
                else if (qm.document) quotedType = 'documentMessage';
                else if (qm.sticker) quotedType = 'stickerMessage';
                
                let qMime = '';
                if (qm.photo) qMime = 'image/jpeg';
                else if (qm.video) qMime = 'video/mp4';
                else if (qm.document) qMime = qm.document.mime_type || '';
                else if (qm.audio) qMime = qm.audio.mime_type || 'audio/mp3';
                else if (qm.voice) qMime = qm.voice.mime_type || 'audio/ogg';
                else if (qm.sticker) qMime = 'image/webp';

                m.quoted = {
                    id: qm.message_id.toString(),
                    chat: chatJid,
                    sender: `${qm.from?.id}@t.me`,
                    fromMe: qm.from?.id === botInfo.id,
                    text: qm.text || qm.caption || '',
                    mtype: quotedType,
                    mimetype: qMime,
                    msg: {
                        ...qm,
                        mimetype: qMime
                    },
                    download: async function() {
                        const fileId = getFileIdFromMessage(qm);
                        if (!fileId) throw new Error('Tidak ada media yang ditemukan di pesan balasan.');
                        return await downloadTelegramFile(fileId);
                    }
                };
            }
            
            // 4. Inisialisasi Database
            if (global.db.data == null) await global.loadDatabase();
            
            let userDb = global.db.data.users[senderJid];
            if (typeof userDb !== "object") {
                global.db.data.users[senderJid] = {
                    name: ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : ''),
                    age: -1,
                    level: 0,
                    exp: 0,
                    limit: 10,
                    birthdate: "",
                    afk: false,
                    afkReason: "",
                    register: false,
                    premium: false,
                    banned: false,
                    afkTime: -1,
                    regTime: -1,
                    premiumDate: -1,
                    bannedDate: -1
                };
                userDb = global.db.data.users[senderJid];
            }
            
            // Logika Owner & Premium
            const isROwner = global.owner.includes(senderNumber);
            const isOwner = isROwner || fromMe || false;
            const isPremium = isOwner || userDb.premium === true;
            if (isOwner || isPremium) {
                userDb.limit = Infinity;
            }
            
            if (m.isGroup) {
                let chatDb = global.db.data.chats[chatJid];
                if (typeof chatDb !== "object") {
                    global.db.data.chats[chatJid] = {
                        antilink: false,
                        antidelete: false,
                        antivirtex: false,
                        mute: false,
                        detect: true,
                        sambutan: true,
                        sewa: false,
                        sWelcome: "",
                        sBye: "",
                        sPromote: "",
                        sDemote: "",
                        sewaDate: -1,
                        jualan: false,
                        jualanItems: {}
                    };
                }
            }
            
            // 5. Informasi Admin Grup (Akan di-load secara lazy jika dibutuhkan)
            let isAdmin = false;
            let isBotAdmin = false;
            
            // 6. Jalankan Plugin
            const cmdPref = (global.prefix.exec(m.text) || [])[0];
            const isCommand = !!cmdPref;
            let usedPrefix = cmdPref || '';
            
            const hasCustomPrefix = Object.values(global.plugins).some(p => 
              p?.customPrefix instanceof RegExp && p.customPrefix.test(m.text)
            );
            
            for (let name in global.plugins) {
                let plugin = global.plugins[name];
                if (!plugin) continue;
                if (plugin?.disable) continue;
                
                const ___dirname = path.join(process.cwd(), "./plugins");
                const __filename = path.join(___dirname, name);
                const str2Regex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
                let _prefix = plugin.customPrefix ? plugin.customPrefix : global.prefix;
                
                let match = (
                    _prefix instanceof RegExp
                        ? [[_prefix.exec(m.text), _prefix]]
                        : Array.isArray(_prefix)
                        ? _prefix.map(p => {
                              let re = p instanceof RegExp ? p : new RegExp(str2Regex(p));
                              return [re.exec(m.text), re];
                          })
                        : typeof _prefix === "string"
                        ? [[new RegExp(str2Regex(_prefix)).exec(m.text), new RegExp(str2Regex(_prefix))]]
                        : [[[], new RegExp()]]
                ).find(p => p[1]);
                
                // Jalankan fungsi "before" jika ada
                if (typeof plugin.before === "function") {
                    try {
                        if (await plugin.before.call(tgConn, m, {
                            match,
                            conn: tgConn,
                            isROwner,
                            isOwner,
                            isAdmin,
                            isBotAdmin,
                            isPremium,
                            __dirname: ___dirname,
                            __filename
                        })) continue;
                    } catch (e) {
                        console.error('[TELEGRAM PLUGIN BEFORE ERROR]:', e);
                    }
                }
                
                if (!isCommand && !hasCustomPrefix && m.isGroup) continue;
                if (typeof plugin !== "function") continue;
                
                let noPrefix = '';
                let matchCommand = false;
                
                if ((usedPrefix = (match?.[0] || "")[0])) {
                    noPrefix = m.text.replace(usedPrefix, "");
                    matchCommand = true;
                } else if (!m.isGroup && !plugin.customPrefix) {
                    noPrefix = m.text;
                    usedPrefix = '';
                    matchCommand = true;
                }
                
                if (matchCommand) {
                    let [command, ...args] = noPrefix
                        .trim()
                        .split(` `)
                        .filter(v => v);
                    args = args || [];
                    let _args = noPrefix.trim().split(` `).slice(1);
                    let text = _args.join(` `);
                    command = (command || "").toLowerCase();
                    
                    let isAccept =
                        plugin.command instanceof RegExp
                            ? plugin.command.test(command)
                            : Array.isArray(plugin.command)
                            ? plugin.command.some(cmd => (cmd instanceof RegExp ? cmd.test(command) : cmd === command))
                            : typeof plugin.command === "string"
                            ? plugin.command === command
                            : false;

                    if (!isAccept && !usedPrefix && !m.isGroup) {
                        let fullStripped = noPrefix.replace(/\s+/g, '').toLowerCase();
                        let isAcceptFull =
                            plugin.command instanceof RegExp
                                ? plugin.command.test(fullStripped)
                                : Array.isArray(plugin.command)
                                ? plugin.command.some(cmd => (cmd instanceof RegExp ? cmd.test(fullStripped) : cmd === fullStripped))
                                : typeof plugin.command === "string"
                                ? plugin.command === fullStripped
                                : false;
                                
                        if (isAcceptFull) {
                            command = fullStripped;
                            args = [];
                            text = '';
                            isAccept = true;
                        }
                    }
                            
                    if (!isAccept) continue;
                    m.plugin = name;
                    
                    // Filter Akses & Role
                    if (plugin.rowner && plugin.owner && !(isROwner || isOwner)) {
                        global.dFail("owner", m, tgConn);
                        continue;
                    }
                    if (plugin.rowner && !isROwner) {
                        global.dFail("rowner", m, tgConn);
                        continue;
                    }
                    if (plugin.owner && !isOwner) {
                        global.dFail("owner", m, tgConn);
                        continue;
                    }
                    if (plugin.premium && !isPremium) {
                        global.dFail("premium", m, tgConn);
                        continue;
                    }
                    if (plugin.group && !m.isGroup) {
                        global.dFail("group", m, tgConn);
                        continue;
                    }
                    // Fetch group admin status lazily only when command matches and it's a group
                    if (m.isGroup && (plugin.admin || plugin.botAdmin) && !isAdmin && !isBotAdmin) {
                        try {
                            const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
                            isAdmin = ['administrator', 'creator'].includes(member.status);
                            
                            const botMember = await ctx.telegram.getChatMember(ctx.chat.id, botInfo.id);
                            isBotAdmin = ['administrator', 'creator'].includes(botMember.status);
                        } catch {}
                    }

                    if (plugin.botAdmin && !isBotAdmin) {
                        global.dFail("botAdmin", m, tgConn);
                        continue;
                    }
                    if (plugin.admin && !isAdmin) {
                        global.dFail("admin", m, tgConn);
                        continue;
                    }
                    if (plugin.private && m.isGroup) {
                        global.dFail("private", m, tgConn);
                        continue;
                    }
                    if (plugin.register && !userDb.register) {
                        global.dFail("unreg", m, tgConn);
                        continue;
                    }
                    
                    m.isCommand = true;
                    
                    // Cek Cooldown
                    let primaryCommand = 
                      plugin.command instanceof RegExp ? plugin.command.source
                      : Array.isArray(plugin.command)
                        ? (typeof plugin.command[0] === 'string' ? plugin.command[0] : name)
                        : typeof plugin.command === 'string' ? plugin.command
                        : command;
                        
                    const pluginCategory = plugin.tags || plugin.category || 'other';
                    const cooldownMs = getCommandCooldown(primaryCommand, pluginCategory);
                    const cdResult = await checkCooldown(senderJid, primaryCommand, cooldownMs, isOwner, isPremium);
                    
                    if (!cdResult.canUse) {
                        if (!isCooldownNotified(senderJid, primaryCommand)) {
                            let featureName = '';
                            if (plugin.help) {
                                const h = Array.isArray(plugin.help) ? plugin.help[0] : plugin.help;
                                featureName = h.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                            } else {
                                featureName = primaryCommand.toUpperCase();
                            }
                            
                            await m.reply(
                                `*COOLDOWN AKTIF!*\n\n` +
                                `*Fitur:* ${featureName}\n` +
                                `*Tunggu:* ${cdResult.remaining} detik lagi\n\n` +
                                `_Anti-spam protection untuk kualitas layanan yang lebih baik_`
                            );
                            setCooldownNotified(senderJid, primaryCommand);
                        }
                        continue;
                    }
                    
                    // Eksekusi Plugin
                    try {
                        // Set Cooldown sebelum eksekusi
                        setCooldown(senderJid, primaryCommand);

                        await plugin.call(tgConn, m, {
                            conn: tgConn,
                            text,
                            args,
                            noPrefix,
                            usedPrefix,
                            command,
                            isROwner,
                            isOwner,
                            isAdmin,
                            isBotAdmin,
                            isPremium,
                            chatUpdate: ctx,
                            __dirname: ___dirname,
                            __filename
                        });
                    } catch (e) {
                        console.error(`[TELEGRAM EXECUTE ERROR] Plugin: ${name}`, e);
                        m.reply(`*Terjadi kesalahan saat memproses fitur ini.*\n\n_${e.message}_`);
                    } finally {
                        // Simpan DB sesudah perintah
                        global.saveData('users', senderJid);
                        if (m.isGroup) global.saveData('chats', chatJid);
                    }
                    break;
                }
            }
        }

        // Listener pesan standar
        bot.on('message', async (ctx) => {
            await processMessage(ctx);
        });

        // Listener Callback Query untuk penanganan button klik
        bot.on('callback_query', async (ctx) => {
            const data = ctx.callbackQuery.data;
            if (!data) return;
            
            // Jawab callback query segera
            try {
                await ctx.answerCbQuery();
            } catch {}

            let fakeText = '';
            let isMenuNavigation = false;
            
            if (data === 'menu' || data.startsWith('menu ')) {
                const tag = data === 'menu' ? '' : data.replace('menu ', '');
                fakeText = `/menu ${tag}`.trim();
                isMenuNavigation = true;
            } else if (data.startsWith('cmd ')) {
                fakeText = data.replace('cmd ', '');
                if (!global.prefix.test(fakeText)) {
                    fakeText = '/' + fakeText;
                }
            } else {
                return;
            }
            
            // Buat fake message untuk memicu perintah
            const fakeMessage = {
                ...ctx.callbackQuery.message,
                text: fakeText,
                from: ctx.callbackQuery.from,
                message_id: ctx.callbackQuery.message.message_id,
                isCallback: true,
                isMenuNavigation: isMenuNavigation
            };

            // Proses dengan fake text
            await processMessage(ctx, fakeMessage);
        });

        bot.launch().catch(err => {
            console.error(chalk.red(" [TELEGRAM ERROR] Gagal memulai polling Telegraf:"), err.message);
        });
        
    } catch (e) {
        console.error(chalk.red(" [TELEGRAM ERROR] Gagal inisialisasi bot:"), e.message);
    }
}
