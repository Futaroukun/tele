/**
 * Helper untuk menerjemahkan struktur tombol (Buttons/Select List) WhatsApp
 * menjadi markup Inline Keyboard Telegram agar plugin WhatsApp dapat berjalan tanpa modifikasi.
 */

export function parseWhatsAppButtons(content) {
    if (!content || (!content.buttons && !content.templateButtons)) return null;
    
    const inline_keyboard = [];
    const buttons = content.buttons || content.templateButtons || [];
    
    for (const btn of buttons) {
        // 1. WhatsApp native "single_select" (List Menu)
        if (btn.name === 'single_select' && btn.buttonParamsJson) {
            try {
                const params = JSON.parse(btn.buttonParamsJson);
                const sections = params.sections || [];
                for (const section of sections) {
                    const rows = section.rows || [];
                    for (const row of rows) {
                        const buttonText = row.title || row.header || 'Pilih';
                        inline_keyboard.push([{
                            text: buttonText,
                            callback_data: `cmd ${row.id}`.slice(0, 64) // Maksimal callback_data Telegram adalah 64 byte
                        }]);
                    }
                }
            } catch (e) {
                console.error('[BUTTON PARSER] Gagal parsing single_select JSON:', e);
            }
        }
        // 2. WhatsApp native "quick_reply" (Quick Button)
        else if (btn.name === 'quick_reply' && btn.buttonParamsJson) {
            try {
                const params = JSON.parse(btn.buttonParamsJson);
                inline_keyboard.push([{
                    text: params.display_text || 'Pilih',
                    callback_data: `cmd ${params.id}`.slice(0, 64)
                }]);
            } catch (e) {
                console.error('[BUTTON PARSER] Gagal parsing quick_reply JSON:', e);
            }
        }
        // 2b. WhatsApp native "cta_url" (URL Button)
        else if (btn.name === 'cta_url' && btn.buttonParamsJson) {
            try {
                const params = JSON.parse(btn.buttonParamsJson);
                if (params.url) {
                    inline_keyboard.push([{
                        text: params.display_text || 'Buka Link',
                        url: params.url
                    }]);
                }
            } catch (e) {
                console.error('[BUTTON PARSER] Gagal parsing cta_url JSON:', e);
            }
        }
        // 3. Format tombol WhatsApp sederhana: [{ buttonId: "id", buttonText: { displayText: "text" } }]
        else if (btn.buttonId) {
            const text = btn.buttonText?.displayText || btn.buttonText || btn.buttonId;
            inline_keyboard.push([{
                text: text,
                callback_data: `cmd ${btn.buttonId}`.slice(0, 64)
            }]);
        }
    }
    
    return inline_keyboard.length > 0 ? { inline_keyboard } : null;
}

export default {
    parseWhatsAppButtons
};
