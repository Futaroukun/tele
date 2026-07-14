import "./settings.js";
import path, { join } from "path";
import chalk from "chalk";
import platform from "process";
import lodash from "lodash";
import yargs from "yargs";
import syntaxerror from "syntax-error";
import { format } from "util";
import { fileURLToPath, pathToFileURL } from "url";
import { readdirSync, statSync, unlinkSync, existsSync, readFileSync, mkdirSync, watch } from "fs";
import Database from 'better-sqlite3';
import { Telegraf } from 'telegraf';
import { initCooldown } from "./function/cooldown.js";

global.__filename = function filename(pathURL = import.meta.url, rmPrefix = platform !== "win32") {
    return rmPrefix ? (/file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL) : pathToFileURL(pathURL).toString();
};
global.__dirname = function dirname(pathURL) {
    return path.dirname(global.__filename(pathURL, true));
};
const __dirname = global.__dirname(import.meta.url);

// Initialize DB
const dataFolder = join(__dirname, 'data');
if (!existsSync(dataFolder)) mkdirSync(dataFolder, { recursive: true });
global.sqlite = new Database(join(dataFolder, 'database.db'));
const sqlite = global.sqlite;

sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('cache_size = 10000');
sqlite.pragma('temp_store = MEMORY');
sqlite.pragma('mmap_size = 30000000000');
sqlite.pragma('wal_autocheckpoint = 1000');

sqlite.prepare(`CREATE TABLE IF NOT EXISTS users (jid TEXT PRIMARY KEY, data TEXT)`).run();
sqlite.prepare(`CREATE TABLE IF NOT EXISTS chats (jid TEXT PRIMARY KEY, data TEXT)`).run();
sqlite.prepare(`CREATE TABLE IF NOT EXISTS settings (jid TEXT PRIMARY KEY, data TEXT)`).run();
sqlite.prepare(`CREATE TABLE IF NOT EXISTS pluginSettings (jid TEXT PRIMARY KEY, data TEXT)`).run();

global.db = { data: { users: {}, chats: {}, settings: {} } };

global.saveData = (table, jid) => {
    try {
        let target;
        if (table === 'users' || table === 'chats' || table === 'settings') {
            target = global.db.data[table][jid];
        } else if (table === 'pluginSettings') {
            target = global.db.data.pluginSettings;
            jid = 'GLOBAL_CONFIG';
        }
        if (!target) return;
        sqlite.prepare(`INSERT OR REPLACE INTO ${table} (jid, data) VALUES (?, ?)`).run(jid, JSON.stringify(target));
    } catch (e) {
        console.error(`[SQLITE ERROR] ${table}:`, e.message);
    }
};

global.loadDatabase = async function () {
    const tables = ['users', 'chats', 'settings', 'pluginSettings'];
    const stmts = {};
    tables.forEach(t => { stmts[t] = sqlite.prepare(`SELECT * FROM ${t}`); });
    tables.forEach(t => {
        const rows = stmts[t].all();
        rows.forEach(row => {
            try {
                const parsed = JSON.parse(row.data);
                if (row.jid === 'GLOBAL_CONFIG') global.db.data.pluginSettings = parsed;
                else global.db.data[t][row.jid] = parsed;
            } catch (e) {
                console.error(chalk.red(`[DB ERROR] ${t}:${row.jid}`));
            }
        });
    });
};

await global.loadDatabase();
initCooldown();

const tmpFolder = join(process.cwd(), "tmp");
if (!existsSync(tmpFolder)) mkdirSync(tmpFolder, { recursive: true });

// Plugin system
global.plugins = {};
const pluginFolder = global.__dirname(join(__dirname, "./plugins/index"));
const pluginFilter = filename => filename && typeof filename === 'string' && /\.js$/.test(filename);

// Make sure plugins directory exists
if (!existsSync(pluginFolder)) mkdirSync(pluginFolder, { recursive: true });

async function featuresInit() {
    for (let filename of readdirSync(pluginFolder).filter(pluginFilter)) {
        try {
            const files  = global.__filename(join(pluginFolder, filename));
            const module = await import(files);
            global.plugins[filename] = module.default || module;

            if (!global.db.data?.pluginSettings) {
                global.db.data = { ...(global.db.data || {}), pluginSettings: {} };
            }
            const pluginSettings = global.db.data?.pluginSettings?.[filename];
            if (pluginSettings?.disabled) global.plugins[filename].disable = true;
        } catch (error) {
            console.log(`${chalk.white.bold(" [INFO]")} ${chalk.red.bold(`Plugin error: "${filename}"`)}`);
            delete global.plugins[filename];
        }
    }
}
await featuresInit();

const debounceMap = new Map();
global.reloadPlugins = async (_ev, filename) => {
    if (!pluginFilter(filename)) return;
    if (debounceMap.has(filename)) clearTimeout(debounceMap.get(filename));
    debounceMap.set(filename, setTimeout(async () => {
        debounceMap.delete(filename);
        const dir = global.__filename(join(pluginFolder, filename), true);

        if (filename in global.plugins) {
            if (existsSync(dir)) {
                console.log(`${chalk.white.bold(" [INFO]")} ${chalk.green.bold(`UPDATE "${filename}"`)}`);
            } else {
                console.log(`${chalk.white.bold(" [INFO]")} ${chalk.red.bold(`DELETE "${filename}"`)}`);
                return delete global.plugins[filename];
            }
        } else {
            console.log(`${chalk.white.bold(" [INFO]")} ${chalk.blue.bold(`ADD "${filename}"`)}`);
        }

        if (!existsSync(dir)) return;

        const error = syntaxerror(readFileSync(dir), filename, {
            sourceType: "module",
            allowAwaitOutsideFunction: true
        });
        if (error) {
            console.log(`${chalk.white.bold(" [INFO]")} ${chalk.yellow.bold(`SYNTAX ERROR "${filename}"`)}`);
            return;
        }

        try {
            const module = await import(`${global.__filename(dir)}?update=${Date.now()}`);
            global.plugins[filename] = module.default || module;
        } catch (e) {
            console.log(`${chalk.white.bold(" [INFO]")} ${chalk.green.bold(`ERROR "${filename}"`)}`);
            global.plugins[filename] = null;
        } finally {
            global.plugins = Object.fromEntries(
                Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b))
            );
        }
    }, 300));
};

Object.freeze(global.reloadPlugins);
await watch(pluginFolder, global.reloadPlugins);

// Setup dynamic global prefix pattern
global.prefix = new RegExp("^[/i!#%+£¢€¥^°¶∆×÷π√✓©®:;?&.\\-]");

// Start Telegram Bot
import("./handler.js").then(async (HandlerModule) => {
    await HandlerModule.initBot();
}).catch(err => {
    console.error(chalk.red(" [TELEGRAM] Gagal memuat handler:"), err);
});
