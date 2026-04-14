import { copyFileSync, unlinkSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { pbkdf2Sync, createDecipheriv } from 'crypto'
import { session } from 'electron'
import { getChromeKeychainPassword } from './keychain'
import { profilePath } from './profiles'
import { CONTEX_HOME } from '../paths'

const TEMP_DIR = join(CONTEX_HOME, 'chrome-sync-temp')
const SALT = 'saltysalt'
const ITERATIONS = 1003
const KEY_LENGTH = 16
const IV = Buffer.alloc(16, 0x20) // Chromium os_crypt_mac.mm: iv(kBlockSize, ' ')

interface RawCookie {
  host_key: string
  name: string
  path: string
  encrypted_value: Buffer
  expires_utc: number
  is_secure: number
  is_httponly: number
  samesite: number
  has_expires: number
}

function deriveKey(password: string): Buffer {
  return pbkdf2Sync(password, SALT, ITERATIONS, KEY_LENGTH, 'sha1')
}

function decryptValue(encrypted: Buffer, key: Buffer): string {
  if (!encrypted || encrypted.length === 0) return ''

  // v10 prefix = macOS Keychain encryption
  if (encrypted.slice(0, 3).toString() === 'v10') {
    const data = encrypted.slice(3)
    try {
      const decipher = createDecipheriv('aes-128-cbc', key, IV)
      const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
      return decrypted.toString('utf-8')
    } catch {
      return ''
    }
  }

  // Unencrypted fallback
  return encrypted.toString('utf-8')
}

function sameSiteMap(val: number): 'unspecified' | 'no_restriction' | 'lax' | 'strict' {
  switch (val) {
    case -1: return 'unspecified'
    case 0: return 'no_restriction'
    case 1: return 'lax'
    case 2: return 'strict'
    default: return 'unspecified'
  }
}

// Chrome epoch: microseconds since 1601-01-01. Convert to Unix seconds.
const CHROME_EPOCH_OFFSET = 11644473600n

function chromeTimeToUnix(chromeTime: number): number {
  if (!chromeTime || chromeTime === 0) return 0
  const seconds = BigInt(chromeTime) / 1000000n - CHROME_EPOCH_OFFSET
  return Number(seconds)
}

export async function syncCookiesToPartition(
  profileDir: string,
  partition: string,
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = []

  // Ensure temp dir exists
  if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true })

  const srcDb = join(profilePath(profileDir), 'Cookies')
  if (!existsSync(srcDb)) {
    return { count: 0, errors: ['Chrome Cookies database not found'] }
  }

  const tempDb = join(TEMP_DIR, `cookies-${Date.now()}.sqlite`)

  try {
    // Copy to avoid Chrome's file lock
    copyFileSync(srcDb, tempDb)

    // Get decryption key
    const password = await getChromeKeychainPassword()
    const key = deriveKey(password)

    // Read cookies — dynamic import since better-sqlite3 is native
    const Database = (await import('better-sqlite3')).default
    const db = new Database(tempDb, { readonly: true })

    const rows = db.prepare(
      'SELECT host_key, name, path, encrypted_value, expires_utc, is_secure, is_httponly, samesite, has_expires FROM cookies',
    ).all() as RawCookie[]

    db.close()

    // Inject into the target Electron session
    const ses = session.fromPartition(partition)
    const now = Date.now() / 1000

    let count = 0
    const BATCH = 100
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const promises = batch.map(async (row) => {
        const value = decryptValue(row.encrypted_value, key)
        if (!value) return

        // Skip expired cookies
        const expiresUnix = chromeTimeToUnix(row.expires_utc)
        if (row.has_expires && expiresUnix > 0 && expiresUnix < now) return

        const domain = row.host_key.startsWith('.') ? row.host_key.slice(1) : row.host_key
        const scheme = row.is_secure ? 'https' : 'http'
        const url = `${scheme}://${domain}${row.path}`

        try {
          await ses.cookies.set({
            url,
            name: row.name,
            value,
            domain: row.host_key,
            path: row.path,
            secure: Boolean(row.is_secure),
            httpOnly: Boolean(row.is_httponly),
            expirationDate: expiresUnix > 0 ? expiresUnix : undefined,
            sameSite: sameSiteMap(row.samesite),
          })
          count++
        } catch (e: any) {
          // Some cookies fail (invalid domain, etc.) — skip silently
        }
      })
      await Promise.all(promises)
    }

    return { count, errors }
  } catch (e: any) {
    errors.push(e.message || String(e))
    return { count: 0, errors }
  } finally {
    try { unlinkSync(tempDb) } catch {}
  }
}
