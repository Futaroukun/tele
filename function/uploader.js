import { fileTypeFromBuffer } from 'file-type';

/**
 * Upload file ke CloudSky Storage
 * Kunjungi: https://www.cloudsky.biz.id/
 * @param {Buffer} buffer - File buffer
 * @param {string} mimetype - MIME type (opsional, akan auto-detect jika kosong)
 * @returns {Promise<string>} - URL file yang diupload
 */
export async function uploadFile(buffer, mimetype = null) {
    try {
        if (!Buffer.isBuffer(buffer)) {
            throw new Error('Buffer tidak valid');
        }

        if (!mimetype) {
            const fileType = await fileTypeFromBuffer(buffer);
            mimetype = fileType ? fileType.mime : 'application/octet-stream';
        }

        const extMap = {
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'image/gif': 'gif',
            'application/pdf': 'pdf'
        };
        const ext = extMap[mimetype] || mimetype.split('/')[1] || 'bin';
        const fileKey = `kurumi-bot/${Date.now()}.${ext}`;
        const fileSize = buffer.length;

        const MAX_SIZE = 50 * 1024 * 1024; // 50MB
        if (fileSize > MAX_SIZE) {
            throw new Error(`Ukuran file terlalu besar (${(fileSize / 1024 / 1024).toFixed(2)}MB). Maksimal 50MB`);
        }

        console.log(`Uploading ${fileKey} (${(fileSize / 1024).toFixed(2)} KB)...`);

        const presignResponse = await fetch('https://api.cloudsky.biz.id/get-upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileKey: fileKey,
                contentType: mimetype,
                fileSize: fileSize
            })
        });

        if (!presignResponse.ok) {
            throw new Error(`Failed to get presigned URL: ${await presignResponse.text()}`);
        }

        const { uploadUrl } = await presignResponse.json();
        
        if (!uploadUrl) {
            throw new Error('No uploadUrl received from API');
        }

        const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': mimetype,
                'x-amz-server-side-encryption': 'AES256'
            },
            body: buffer
        });
        
        if (!uploadResponse.ok) {
            throw new Error(`File upload failed: ${await uploadResponse.text()}`);
        }

        const fileUrl = `https://api.cloudsky.biz.id/file?key=${fileKey}`;
        console.log(`Upload success: ${fileUrl}`);
        return fileUrl;

    } catch (error) {
        console.error('CloudSky Upload Error:', error);
        throw new Error(`Gagal upload ke CloudSky: ${error.message}`);
    }
}

export async function uploadWithRetry(buffer, mimetype = null, maxRetries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Upload attempt ${attempt}/${maxRetries}...`);
            const url = await uploadFile(buffer, mimetype);
            return url;
        } catch (error) {
            lastError = error;
            console.log(`Attempt ${attempt} failed: ${error.message}`);
            if (attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw new Error(`Upload gagal setelah ${maxRetries} percobaan: ${lastError.message}`);
}

export default {
    uploadFile,
    uploadWithRetry
};
