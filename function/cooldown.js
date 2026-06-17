import chalk from 'chalk'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const COOLDOWN_FILE    = './data/cooldown.json'
const CLEANUP_INTERVAL = 5 * 60 * 1000
const SAVE_DEBOUNCE_MS = 5000

export const DEFAULT_CONFIG = {
    global: 5000,

    categories: {
        'owner':      0,
        'ai':         10000,
        'downloader': 8000,
        'tools':      3000,
        'sticker':    5000,
        'group':      5000,
        'store':      3000,
        'internet':   6000,
        'info':       2000,
        'keuangan':   5000,
        'islam':      4000,
        'other':      5000,
    },

    commands:          {},
    nonPremiumPenalty: 2000,
    enabled:           true,
    cleanupInterval:   CLEANUP_INTERVAL
}

let cooldownData = { users: {}, global: {} }
let activeConfig  = { ...DEFAULT_CONFIG }
let saveTimeout   = null
const lockMap = new Map()

const cdKey       = cmd => cmd
const notifiedKey = cmd => `${cmd}__notified`

function debouncedSave() {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
        saveCooldownData()
        saveTimeout = null
    }, SAVE_DEBOUNCE_MS)
}

async function withLock(key, fn) {
  while (lockMap.has(key)) {
    await new Promise(r => setTimeout(r, 10))
  }
  lockMap.set(key, true)
  try {
    return await fn()
  } finally {
    lockMap.delete(key)
  }
}

export function loadCooldownData() {
    try {
        if (existsSync(COOLDOWN_FILE)) {
            const raw = readFileSync(COOLDOWN_FILE, 'utf8')
            cooldownData = JSON.parse(raw)
            if (!cooldownData.users)  cooldownData.users  = {}
            if (!cooldownData.global) cooldownData.global = {}
        }
    } catch (e) {
        console.log(chalk.yellow(' [COOLDOWN]'), 'Failed to load data, using default')
        cooldownData = { users: {}, global: {} }
    }
    return cooldownData
}

export function saveCooldownData() {
    try {
        const dir = dirname(COOLDOWN_FILE)
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        writeFileSync(COOLDOWN_FILE, JSON.stringify(cooldownData, null, 2))
    } catch (e) {
        console.log(chalk.red(' [COOLDOWN ERROR]'), 'Failed to save data:', e.message)
        setTimeout(() => {
            try {
              writeFileSync(COOLDOWN_FILE, JSON.stringify(cooldownData, null, 2))
            } catch (retryErr) {
              console.log(chalk.red(' [COOLDOWN ERROR]'), 'Retry failed:', retryErr.message)
            }
          }, 1000)
    }
}

export function getCooldownConfig(customConfig = {}) {
    return {
        ...DEFAULT_CONFIG,
        ...customConfig,
        categories: {
            ...DEFAULT_CONFIG.categories,
            ...(customConfig.categories || {})
        },
        commands: {
            ...DEFAULT_CONFIG.commands,
            ...(customConfig.commands || {})
        }
    }
}

export function updateActiveConfig(newConfig = {}) {
    activeConfig = getCooldownConfig(newConfig)
    return activeConfig
}

export function getCommandCooldown(command, pluginCategory = 'other', config = null) {
    const cfg = config ? getCooldownConfig(config) : activeConfig
    if (cfg.commands[command]          !== undefined) return cfg.commands[command]
    if (cfg.categories[pluginCategory] !== undefined) return cfg.categories[pluginCategory]
    return cfg.global
}

export async function checkCooldown(jid, primaryCommand, cooldownMs, isOwner = false, isPremium = false) {
      const lockKey = `${jid}:${primaryCommand}`
      
      return await withLock(lockKey, async () => {
        if (!activeConfig.enabled) return { canUse: true, remaining: 0 }
        if (isOwner || isPremium)  return { canUse: true, remaining: 0 }
        
        if (!cooldownData.users[jid]) cooldownData.users[jid] = {}
      
        const now      = Date.now()
        const lastUsed = cooldownData.users[jid][cdKey(primaryCommand)] || 0
        const elapsed  = now - lastUsed
     
        const penalty = (!isPremium && activeConfig.nonPremiumPenalty > 0)
        ? activeConfig.nonPremiumPenalty
        : 0
        const effectiveCooldown = cooldownMs + penalty
      
        if (elapsed >= effectiveCooldown) return { canUse: true, remaining: 0 }
     
        return {
          canUse:    false,
          remaining: Math.ceil((effectiveCooldown - elapsed) / 1000)
        }
    })
}

export function setCooldown(jid, command) {
    if (!cooldownData.users[jid]) cooldownData.users[jid] = {}
    cooldownData.users[jid][cdKey(command)]       = Date.now()
    cooldownData.users[jid][notifiedKey(command)] = false
    debouncedSave()
}

export function setCooldownNotified(jid, command) {
    if (!cooldownData.users[jid]) cooldownData.users[jid] = {}
    cooldownData.users[jid][notifiedKey(command)] = true
}

export function isCooldownNotified(jid, command) {
    return cooldownData.users[jid]?.[notifiedKey(command)] === true
}

export function resetUserCooldown(jid, command = null) {
    if (!cooldownData.users[jid]) return
    if (command) {
        delete cooldownData.users[jid][cdKey(command)]
        delete cooldownData.users[jid][notifiedKey(command)]
    } else {
        delete cooldownData.users[jid]
    }
    debouncedSave()
}

export function resetGlobalCooldown(command = null) {
    if (command) {
        delete cooldownData.global[command]
    } else {
        cooldownData.global = {}
    }
    debouncedSave()
}

export function resetAllCooldown() {
    cooldownData.users  = {}
    cooldownData.global = {}
    debouncedSave()
}

export function cleanupExpiredCooldown() {
    const now    = Date.now()
    const maxAge = 24 * 60 * 60 * 1000
    let cleaned  = 0

    for (const jid in cooldownData.users) {
        for (const key in cooldownData.users[jid]) {
            if (key.endsWith('__notified')) continue

            const val = cooldownData.users[jid][key]
            if (typeof val === 'number' && now - val > maxAge) {
                delete cooldownData.users[jid][key]
                delete cooldownData.users[jid][notifiedKey(key)]
                cleaned++
            }
        }
        if (Object.keys(cooldownData.users[jid]).length === 0) {
            delete cooldownData.users[jid]
        }
    }

    if (cleaned > 0) {
        debouncedSave()
    }
}

export function startCooldownAutoCleanup() {
    if (activeConfig.cleanupInterval > 0) {
        setInterval(cleanupExpiredCooldown, activeConfig.cleanupInterval)
    }
}

export function getCooldownStats() {
    let totalUsers   = 0
    let totalEntries = 0
    for (const jid in cooldownData.users) {
        totalUsers++
        totalEntries += Object.keys(cooldownData.users[jid])
            .filter(k => !k.endsWith('__notified')).length
    }
    return {
        totalUsers,
        totalEntries,
        data: cooldownData
    }
}

export function initCooldown(customConfig = {}) {
    loadCooldownData()

    const savedConfig  = global.db?.data?.pluginSettings?.['cooldown.json']?.config
    const mergedConfig = savedConfig
        ? getCooldownConfig({ ...savedConfig, ...customConfig })
        : getCooldownConfig(customConfig)

    activeConfig = mergedConfig
    startCooldownAutoCleanup()
    return activeConfig
}

export default {
    loadCooldownData,
    saveCooldownData,
    getCooldownConfig,
    updateActiveConfig,
    getCommandCooldown,
    checkCooldown,
    setCooldown,
    setCooldownNotified,
    isCooldownNotified,
    resetUserCooldown,
    resetGlobalCooldown,
    resetAllCooldown,
    cleanupExpiredCooldown,
    startCooldownAutoCleanup,
    getCooldownStats,
    initCooldown,
    DEFAULT_CONFIG
}
