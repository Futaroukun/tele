import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import chalk from "chalk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_FILE = path.join(__dirname, "main.js");

const RESTART_EXIT_CODE = 42;
const MAX_CRASH_RESTART = 5;
const CRASH_WINDOW_MS   = 60_000;
const RESTART_DELAY_MS  = 2_000;

let crashCount       = 0;
let crashWindowStart = Date.now();
let currentProcess   = null;

function log(msg, color = chalk.white) {
    console.log(chalk.white.bold(" [SISTEM]"), color(msg));
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function startBot() {
    currentProcess = spawn(process.argv[0], [MAIN_FILE, ...process.argv.slice(2)], {
        stdio: ["inherit", "inherit", "inherit", "ipc"],
        env: { ...process.env }
    });

    currentProcess.on("error", err => {
        log(`Spawn error: ${err.message}`, chalk.red);
    });

    currentProcess.on("exit", async (code, signal) => {
        currentProcess = null;

        // Restart disengaja dari plugin
        if (code === RESTART_EXIT_CODE) {
            log("Restart diminta, memulai ulang...", chalk.yellow);
            await delay(RESTART_DELAY_MS);
            crashCount       = 0;
            crashWindowStart = Date.now();
            return startBot();
        }

        // Shutdown normal
        if (code === 0 || signal === "SIGTERM" || signal === "SIGINT") {
            log("Bot berhenti.", chalk.gray);
            process.exit(0);
        }

        // Crash
        const now = Date.now();
        if (now - crashWindowStart > CRASH_WINDOW_MS) {
            crashCount       = 0;
            crashWindowStart = now;
        }

        crashCount++;
        log(`Bot crash (code: ${code ?? signal}). Crash ke-${crashCount}/${MAX_CRASH_RESTART}`, chalk.red);

        if (crashCount >= MAX_CRASH_RESTART) {
            log(`Terlahu banyak crash dalam ${CRASH_WINDOW_MS / 1000}s, berhenti.`, chalk.red.bold);
            process.exit(1);
        }

        const wait = RESTART_DELAY_MS * crashCount;
        log(`Restart ulang dalam ${wait / 1000}s...`, chalk.yellow);
        await delay(wait);
        startBot();
    });
}

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => {
        if (currentProcess) currentProcess.kill(sig);
        else process.exit(0);
    });
}

await startBot();
