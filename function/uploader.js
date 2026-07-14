import mime from 'mime-types';
import { fileTypeFromBuffer } from 'file-type';

// ── Provider list (urutan = prioritas) ────────────────────────────────────────
// Semua gratis, no-auth, support gambar & video
const PROVIDERS = [
    {
        name: 'Catbox',
        maxSize: 200 * 1024 * 1024, // 200MB
        supportedTypes: /image|video|audio|application/,
        upload: async (buffer, mimetype, ext) => {
            const form = new FormData();
            form.append('reqtype', 'fileupload');
            const blob = new Blob([buffer], { type: mimetype });
            form.append('fileToUpload', blob, `file.${ext}`);
            const res = await fetch('https://catbox.moe/user/api.php', {
                method: 'POST',
                body: form,
                headers: { 'User-Agent': 'Joy-Bot/1.0' },
                signal: AbortSignal.timeout(30000)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const url = (await res.text()).trim();
            if (!url.startsWith('http')) throw new Error('Response bukan URL: ' + url);
            return url;
        }
    },
    {
        name: 'Uguu',
        maxSize: 100 * 1024 * 1024, // 100MB
        supportedTypes: /image|video|audio|application/,
        upload: async (buffer, mimetype, ext) => {
            const form = new FormData();
            const blob = new Blob([buffer], { type: mimetype });
            form.append('files[]', blob, `file.${ext}`);
            const res = await fetch('https://uguu.se/upload', {
                method: 'POST',
                body: form,
                headers: { 'User-Agent': 'Joy-Bot/1.0' },
                signal: AbortSignal.timeout(30000)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const url = json?.files?.[0]?.url;
            if (!url) throw new Error('URL tidak ditemukan di response');
            return url;
        }
    },
    {
        name: 'TmpFiles',
        maxSize: 100 * 1024 * 1024, // 100MB
        supportedTypes: /image|video|audio|application/,
        upload: async (buffer, mimetype, ext) => {
            const form = new FormData();
            const blob = new Blob([buffer], { type: mimetype });
            form.append('file', blob, `file.${ext}`);
            const res = await fetch('https://tmpfiles.org/api/v1/upload', {
                method: 'POST',
                body: form,
                headers: { 'User-Agent': 'Joy-Bot/1.0' },
                signal: AbortSignal.timeout(30000)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const url = json?.data?.url;
            if (!url) throw new Error('URL tidak ditemukan di response');
            // tmpfiles.org → ubah ke direct link
            return url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
        }
    },
    {
        name: 'CloudSky',
        maxSize: 50 * 1024 * 1024, // 50MB (original provider)
        supportedTypes: /image|video|audio|application/,
        upload: async (buffer, mimetype, ext) => {
            const fileKey = `kurumi-bot/${Date.now()}.${ext}`;
            const presignRes = await fetch('https://api.cloudsky.biz.id/get-upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileKey, contentType: mimetype, fileSize: buffer.length }),
                signal: AbortSignal.timeout(15000)
            });
            if (!presignRes.ok) throw new Error(`Presign gagal: ${presignRes.status}`);
            const { uploadUrl } = await presignRes.json();
            if (!uploadUrl) throw new Error('uploadUrl kosong');
            const uploadRes = await fetch(uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': mimetype, 'x-amz-server-side-encryption': 'AES256' },
                body: buffer,
                signal: AbortSignal.timeout(30000)
            });
            if (!uploadRes.ok) throw new Error(`Upload S3 gagal: ${uploadRes.status}`);
            return `https://api.cloudsky.biz.id/file?key=${fileKey}`;
        }
    }
];

// ── Upload utama dengan fallback ───────────────────────────────────────────────
/**
 * Upload buffer ke URL publik. Otomatis fallback ke provider lain jika gagal.
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @returns {Promise<{url: string, provider: string}>}
 */
export async function uploadFile(buffer, mimetype = null) {
    if (!Buffer.isBuffer(buffer)) throw new Error('Buffer tidak valid');

    // Auto-detect mimetype
    if (!mimetype) {
        const ft = await fileTypeFromBuffer(buffer);
        mimetype = ft ? ft.mime : 'application/octet-stream';
    }

    const ext = mime.extension(mimetype) || 'bin';
    const fileSize = buffer.length;
    const MAX_GLOBAL = 200 * 1024 * 1024;

    if (fileSize > MAX_GLOBAL) {
        throw new Error(`File terlalu besar (${(fileSize / 1024 / 1024).toFixed(1)}MB). Maksimal 200MB`);
    }

    const errors = [];

    for (const provider of PROVIDERS) {
        if (fileSize > provider.maxSize) {
            errors.push(`[${provider.name}] Skip: file terlalu besar (max ${(provider.maxSize / 1024 / 1024).toFixed(0)}MB)`);
            continue;
        }
        if (!provider.supportedTypes.test(mimetype)) {
            errors.push(`[${provider.name}] Skip: tipe tidak didukung`);
            continue;
        }

        try {
            console.log(`📤 Mencoba upload ke ${provider.name}...`);
            const url = await provider.upload(buffer, mimetype, ext);
            console.log(`✅ Upload berhasil via ${provider.name}: ${url}`);
            return { url, provider: provider.name };
        } catch (e) {
            const msg = `[${provider.name}] Gagal: ${e.message}`;
            console.warn(`⚠️ ${msg}`);
            errors.push(msg);
        }
    }

    throw new Error(`Semua provider gagal:\n${errors.join('\n')}`);
}

// ── Retry wrapper ──────────────────────────────────────────────────────────────
export async function uploadWithRetry(buffer, mimetype = null, maxRetries = 2) {
    let lastError;
    for (let i = 1; i <= maxRetries; i++) {
        try {
            return await uploadFile(buffer, mimetype);
        } catch (e) {
            lastError = e;
            if (i < maxRetries) await new Promise(r => setTimeout(r, 1500 * i));
        }
    }
    throw lastError;
}

// ── Info file ──────────────────────────────────────────────────────────────────
export async function getFileInfo(buffer) {
    const ft   = await fileTypeFromBuffer(buffer);
    const size = buffer.length;
    return {
        mime: ft ? ft.mime : 'application/octet-stream',
        ext:  ft ? ft.ext  : 'bin',
        size,
        sizeFormatted: formatBytes(size)
    };
}

function formatBytes(bytes, decimals = 2) {
    if (!bytes) return '0 Bytes';
    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

export default { uploadFile, uploadWithRetry, getFileInfo };