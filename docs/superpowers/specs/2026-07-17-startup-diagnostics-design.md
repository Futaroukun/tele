# Design Spec: Startup Diagnostics Dashboard

This document details the design for a startup diagnostics dashboard in the Telegram bot repository (`tele`). It will analyze the configuration, database state, plugin status, system environment, and Telegram API connectivity on launch, outputting a clear, formatted summary to the console.

## 1. Diagnostics Features

The diagnostics suite will perform the following checks on startup:
* **Telegram Bot Info & Token Check:**
  * Try to call `bot.telegram.getMe()`.
  * If successful, display the bot name, active username (`@username`), and status `ACTIVE (VALID)`.
  * If a connection or authorization error occurs (e.g. 401 Unauthorized, invalid token, or DNS resolution failure), capture the error message and display `❌ ERROR (<error_code>: <error_message>)` or `❌ OFFLINE (Check connection)`.
* **Owner Configuration Check:**
  * Check if the ID in `global.owner` is still the default `["8679700912"]` from the repository template.
  * If default, show a warning: `⚠️ DEFAULT (Please edit settings.js)`.
  * If changed, show: `OK (Custom ID configured)`.
* **Database Verification:**
  * Test if `global.sqlite` is initialized.
  * Execute a simple DB query check to confirm write/read viability.
  * Show status: `WAL Mode -> OK` or `❌ DISCONNECTED`.
* **Plugins Audit:**
  * Scan the `/plugins/` directory and count all JavaScript files ending in `.js`.
  * Show count: `N Plugins Loaded`.
* **Git Update Configuration:**
  * Check if credentials exist in `global.db.data.pluginSettings['owner-update.js']?.credentials`.
  * Show status: `OK (Configured)` or `Not configured (.update login to setup)`.
* **System Environment Summary:**
  * Display Platform OS name (e.g. Android/Termux, Linux, Windows), system architecture, and Node.js version.

## 2. Architecture & File Layout
* Create a dedicated helper module: `function/diagnostics.js` containing `runDiagnostics(botInfo, error)`.
* Modify `handler.js:initBot()` to load diagnostics under all conditions:
  * When login succeeds: `runDiagnostics(botInfo, null)`
  * When login fails: `runDiagnostics(null, error)`

## 3. UI Console Layout Mockup (Success State)
```text
┌────────────────────────────────────────────────────────┐
│               SISTEM KONTROL & DIAGNOSTIK              │
├────────────────────────────────────────────────────────┤
│  🤖 Bot Name    : Joy Telegram (@annonny_bot)          │
│  🔑 Token Status: ACTIVE (VALID)                       │
│  👑 Owner ID    : OK (Custom owner configured)         │
│  🗄️ Database    : SQLite WAL Mode -> OK                │
│  ⚙️ Git Setup   : OK (Configured)                      │
│  🔌 Plugins     : 15 Plugins loaded                    │
│  🖥️ OS Platform : Linux (Node.js v20.11.0)              │
└────────────────────────────────────────────────────────┘
```

## 4. UI Console Layout Mockup (Error State)
```text
┌────────────────────────────────────────────────────────┐
│               SISTEM KONTROL & DIAGNOSTIK              │
├────────────────────────────────────────────────────────┤
│  🤖 Bot Name    : ❌ CONNECTION FAILED                 │
│  🔑 Token Status: ❌ ERROR (401: Unauthorized)         │
│  👑 Owner ID    : ⚠️ DEFAULT (Please edit settings.js)  │
│  🗄️ Database    : SQLite WAL Mode -> OK                │
│  ⚙️ Git Setup   : Not configured (.update login)       │
│  🔌 Plugins     : 15 Plugins loaded                    │
│  🖥️ OS Platform : Linux (Node.js v20.11.0)              │
└────────────────────────────────────────────────────────┘
```
