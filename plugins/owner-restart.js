/*
- Feature: Owner Restart
- Description: Memungkinkan owner me-restart proses bot secara aman.
*/

import { exec } from 'child_process';
import { promisify } from 'util';

const execute = promisify(exec);
const RESTART_EXIT_CODE = 42;

function isPM2() {
    return process.env.pm_id !== undefined;
}

const handler = async (m, { conn, isOwner }) => {
    if (!isOwner) return m.reply('Fitur ini khusus untuk owner.');

    if (isPM2()) {
        const pmId   = process.env.pm_id;
        const pmName = process.env.name || 'bot';

        await m.reply(`Memulai restart...\n_PM2 · ${pmName} (id: ${pmId})_`);

        try {
            await execute(`pm2 restart ${pmId}`);
        } catch (e) {
            await conn.reply(m.chat, `Restart gagal.\n\n_${e.message}_`, m);
        }

    } else {
        await m.reply('Memulai restart...\n_Runtime: node_');
        setTimeout(() => process.exit(RESTART_EXIT_CODE), 500);
    }
};

handler.help    = ['restart'];
handler.tags    = ['owner'];
handler.command = /^(restart|reboot)$/i;
handler.owner   = true;

export default handler;
