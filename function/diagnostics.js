import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

function getGitSetupStatus() {
    const creds = global.db?.data?.pluginSettings?.['owner-update.js']?.credentials;
    if (creds && creds.username && creds.token) {
        return chalk.green('OK (Configured)');
    }
    return chalk.yellow('Not configured (.update login)');
}

function getDatabaseStatus() {
    try {
        if (!global.sqlite) return chalk.red('❌ DISCONNECTED');
        const res = global.sqlite.prepare('SELECT 1 as ok').get();
        if (res && res.ok === 1) {
            return chalk.green('SQLite WAL Mode -> OK');
        }
        return chalk.red('❌ QUERY FAILED');
    } catch (e) {
        return chalk.red(`❌ ERROR (${e.message})`);
    }
}

function getOwnerStatus() {
    const owners = global.owner || [];
    if (owners.length === 0) {
        return chalk.red('❌ NO OWNER DEFINED');
    }
    // Check if the owner array contains only the template default ID
    if (owners.includes('8679700912')) {
        return chalk.yellow('⚠️ DEFAULT (Please edit settings.js)');
    }
    return chalk.green('OK (Custom configured)');
}

function getPluginCount() {
    try {
        const pluginFolder = path.join(process.cwd(), 'plugins');
        if (!fs.existsSync(pluginFolder)) return chalk.red('0 (Folder missing)');
        const files = fs.readdirSync(pluginFolder).filter(f => f.endsWith('.js'));
        return chalk.green(`${files.length} Plugins loaded`);
    } catch (e) {
        return chalk.red('Error counting plugins');
    }
}

export function runDiagnostics(botInfo, error) {
    const termWidth = 60;
    
    // Status token / bot info
    let botNameLine = '';
    let tokenStatusLine = '';

    if (botInfo) {
        botNameLine = chalk.cyan(`${botInfo.first_name} (@${botInfo.username})`);
        tokenStatusLine = chalk.green('ACTIVE (VALID)');
    } else {
        botNameLine = chalk.red('❌ CONNECTION FAILED');
        const errStr = error?.message || 'Unknown network error';
        tokenStatusLine = chalk.red(`❌ ERROR (${errStr})`);
    }

    const sysInfo = `${os.platform()} (${os.arch()}) | Node.js ${process.version}`;

    // Gather all fields
    const diagnostics = [
        { label: '🤖 Bot Name', value: botNameLine },
        { label: '🔑 Token Status', value: tokenStatusLine },
        { label: '👑 Owner ID', value: getOwnerStatus() },
        { label: '🗄️ Database', value: getDatabaseStatus() },
        { label: '⚙️ Git Setup', value: getGitSetupStatus() },
        { label: '🔌 Plugins', value: getPluginCount() },
        { label: '🖥️ OS Platform', value: chalk.blue(sysInfo) }
    ];

    // Build the formatted UI
    const borderTop    = '┌────────────────────────────────────────────────────────┐';
    const titleLine    = '│               SISTEM KONTROL & DIAGNOSTIK              │';
    const divider      = '├────────────────────────────────────────────────────────┤';
    const borderBottom = '└────────────────────────────────────────────────────────┘';

    console.log('\n' + chalk.cyan.bold(borderTop));
    console.log(chalk.cyan.bold(titleLine));
    console.log(chalk.cyan.bold(divider));

    for (const item of diagnostics) {
        // Strip ANSI escape codes to calculate visual string lengths correctly
        const rawLabel = item.label;
        const cleanVal = item.value.replace(/\x1B\[\d+m/g, '');
        
        // Pad labels and values to align right edge
        const labelPad = 15;
        const valueFieldWidth = termWidth - labelPad - 7; // accounts for borders and padding
        
        const paddedLabel = rawLabel.padEnd(labelPad);
        const paddedValue = item.value + ' '.repeat(Math.max(0, valueFieldWidth - cleanVal.length));

        console.log(`${chalk.cyan.bold('│')}  ${paddedLabel}: ${paddedValue} ${chalk.cyan.bold('│')}`);
    }

    console.log(chalk.cyan.bold(borderBottom) + '\n');
}
