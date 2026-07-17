# Startup Diagnostics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a console diagnostics dashboard on startup to help new repository owners verify their token validity, owner configuration, database status, plugin load counts, and system environment.

**Architecture:** Create a separate helper `function/diagnostics.js` containing the check and display logic, and import it inside `handler.js:initBot()` where it is executed under both success and error catch blocks.

**Tech Stack:** JavaScript (ESM), Node.js (OS, filesystem module), chalk.

---

## Global Constraints
- Target workspace: `/data/data/com.termux/files/home/tele`
- Do NOT modify any files inside the WhatsApp bot `Joy` directory.
- Dashboard lines must use precise formatting and alignment.

---

### Task 1: Create Diagnostics Checker Module

**Files:**
- Create: `/data/data/com.termux/files/home/tele/function/diagnostics.js`

**Interfaces:**
- Consumes: `global.owner`, `global.sqlite`, database pluginSettings.
- Produces: `runDiagnostics(botInfo, error)` function.

- [ ] **Step 1: Create diagnostics.js file**
  Create `/data/data/com.termux/files/home/tele/function/diagnostics.js` with the checking logic and layout drawer using box-drawing characters and `chalk` styling:

```javascript
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
```

- [ ] **Step 2: Verify Syntax**
  Verify the new file compiles cleanly.
  Run: `node --check /data/data/com.termux/files/home/tele/function/diagnostics.js`
  Expected: Success, no output.

- [ ] **Step 3: Commit file**
  Run:
  ```bash
  git add function/diagnostics.js
  git commit -m "feat(diagnostics): add diagnostics dashboard utility"
  ```

---

### Task 2: Integrate Diagnostics into handler.js

**Files:**
- Modify: `/data/data/com.termux/files/home/tele/handler.js`

**Interfaces:**
- Consumes: `runDiagnostics` function.
- Produces: Connection attempt wrapping with diagnostics calls.

- [ ] **Step 1: Import diagnostics function**
  Modify `/data/data/com.termux/files/home/tele/handler.js` to import the diagnostics function at the top:

```javascript
import { runDiagnostics } from './function/diagnostics.js';
```

- [ ] **Step 2: Update initBot to run diagnostics in try and catch blocks**
  Locate `initBot()` starting at line 53 and rewrite it to load diagnostics under success and failure states:

```javascript
export async function initBot() {
    if (!global.telegramToken) {
        console.log(chalk.yellow.bold("\n [TELEGRAM] Telegram Bot Token belum diatur di \"settings.js\"."));
        console.log(chalk.yellow("           Masukkan token bot Telegram Anda ke global.telegramToken untuk mengaktifkan."));
        return;
    }

    try {
        const bot = new Telegraf(global.telegramToken);
        const botInfo = await bot.telegram.getMe();
        
        global.tgBotInfo = botInfo;
        global.tgBot = bot;

        // Run success diagnostics
        runDiagnostics(botInfo, null);
```

And in the catch block:

```javascript
        // ... (keep the rest of initBot connection configuration setup as is)

        bot.launch().catch(err => {
            console.error(chalk.red(" [TELEGRAM ERROR] Gagal memulai polling Telegraf:"), err.message);
        });
        
    } catch (e) {
        // Run failed connection diagnostics
        runDiagnostics(null, e);
    }
}
```

- [ ] **Step 3: Verify syntax of handler.js**
  Check the entire Telegram codebase for syntax compile issues.
  Run: `node --check /data/data/com.termux/files/home/tele/handler.js`
  Expected: Success.

- [ ] **Step 4: Check if other entrypoints compile**
  Check `main.js`.
  Run: `node --check /data/data/com.termux/files/home/tele/main.js`
  Expected: Success.

- [ ] **Step 5: Run a test launch of tele/main.js to verify console output**
  Run: `node main.js`
  Verify that the diagnostics dashboard prints beautifully on startup and shows active token state.

- [ ] **Step 6: Commit integration**
  Run:
  ```bash
  git add handler.js
  git commit -m "feat(diagnostics): integrate diagnostics console dashboard into initBot"
  ```
