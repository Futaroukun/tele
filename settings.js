import chalk from "chalk";
import { watchFile, unwatchFile } from "fs";
import { fileURLToPath } from "url";

// ===== CONFIG =====
global.owner = ["8679700912"]; // Ganti dengan ID Telegram numerik Anda
global.telegramToken = "8320243362:AAE71Y3O6UBFCCZgYWdKCs51HNDYMJHeJQM";

global.info = {
    namabot: "Joy Telegram",
    namaowner: "Rafli",
    namaownerLink: "https://t.me/raff_editz2" // Username Telegram owner atau link profil
}

// ===== THUMBNAIL =====
global.thum = "https://raw.githubusercontent.com/Futaroukun/tele/main/src/thumbnail.jpg";

// ===== LINK ====
global.lgh = "https://github.com/Futaroukun"; // Github
global.lig = "https://www.instagram.com/raff_editz2"; // Instagram

let file = fileURLToPath(import.meta.url);
watchFile(file, async () => {
    unwatchFile(file);
    console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.green.bold(`FILE DIUPDATE "settings.js"`)}`);
    import(`${file}?update=${Date.now()}`);
});
