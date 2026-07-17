# Git Credentials Verification Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement verification via the GitHub API before saving configured credentials to the database, ensuring typing errors or expired tokens are immediately caught.

**Architecture:** Use `axios` to call `https://api.github.com/user` using the provided token. Verify the username matching and return helpful error messages. Integrate the call inside the `handler.before` confirm step.

**Tech Stack:** JavaScript (ESM), axios.

---

## Global Constraints
- Target workspace: `/data/data/com.termux/files/home/tele`
- Do NOT modify any files inside the WhatsApp bot `Joy` directory.
- Avoid writing raw tokens or logs.

---

### Task 1: Implement verifyGitHubCredentials & Integrate in handler.before

**Files:**
- Modify: `/data/data/com.termux/files/home/tele/plugins/owner-update.js`

**Interfaces:**
- Consumes: None
- Produces: `verifyGitHubCredentials(username, token)` and updated `handler.before`.

- [ ] **Step 1: Import axios & Implement verifyGitHubCredentials**
  At the top of `/data/data/com.termux/files/home/tele/plugins/owner-update.js`, import `axios` (or update existing imports) and define `verifyGitHubCredentials`:

```javascript
import cp from 'child_process'
import { promisify } from 'util'
import cron from 'node-cron'
import chalk from 'chalk'
import axios from 'axios'
```

And below `saveCredentials`:

```javascript
async function verifyGitHubCredentials(username, token) {
    try {
        const response = await axios.get('https://api.github.com/user', {
            headers: {
                'Authorization': `token ${token}`,
                'User-Agent': 'NodeJS-GitHub-Client'
            },
            timeout: 10000
        });
        
        const login = response.data?.login;
        if (login && login.toLowerCase() === username.toLowerCase()) {
            return { valid: true, realUsername: login };
        }
        return { valid: false, reason: `Username tidak cocok. Anda menginput "${username}", sedangkan Token ini terdaftar atas nama akun "@${login}".` };
    } catch (e) {
        const status = e.response?.status;
        if (status === 401 || status === 403) {
            return { valid: false, reason: 'Token Personal Access Token (PAT) salah atau sudah kedaluwarsa.' };
        }
        return { valid: false, reason: `Gagal terhubung ke GitHub: ${e.message} (Periksa jaringan/koneksi internet).` };
    }
}
```

- [ ] **Step 2: Update handler.before to verify credentials on confirmation**
  Update the `confirm` step in `handler.before` inside `/data/data/com.termux/files/home/tele/plugins/owner-update.js`:

```javascript
    if (session.step === 'confirm') {
        if (/^(ya|yes|ok|simpan)$/i.test(textInput)) {
            await m.reply('⏳ _Sedang memverifikasi kredensial Anda ke GitHub..._');
            
            const check = await verifyGitHubCredentials(session.username, session.token);
            if (!check.valid) {
                delete sessions[senderId];
                await m.reply(`❌ *VALIDASI GAGAL*\n\nDetail kesalahan:\n${check.reason}\n\nKonfigurasi dibatalkan. Silakan ketik \`.update login\` jika ingin mengulang kembali.`);
                return true;
            }

            saveCredentials(session.email, check.realUsername, session.token);
            delete sessions[senderId];
            await m.reply(`🎉 *KREDENSIAL GITHUB BERHASIL DISIMPAN!*\n\nKredensial Anda terverifikasi sebagai @${check.realUsername} dan disimpan di database. Silakan jalankan perintah \`.update\` kembali untuk memulai proses update.`);
        } else if (/^(batal|cancel|tidak|no)$/i.test(textInput)) {
            delete sessions[senderId];
            await m.reply('❌ Konfigurasi kredensial dibatalkan.');
        } else {
            await m.reply('Ketik *YA* untuk mengonfirmasi, atau *BATAL* untuk membatalkan pendaftaran.');
        }
        return true;
    }
```

- [ ] **Step 3: Verify Syntax**
  Verify the file compiles cleanly.
  Run: `node --check /data/data/com.termux/files/home/tele/plugins/owner-update.js`
  Expected: Success, no output.

- [ ] **Step 4: Commit changes**
  Run:
  ```bash
  git add plugins/owner-update.js
  git commit -m "feat(update): verify github credentials via API before saving to database"
  ```
