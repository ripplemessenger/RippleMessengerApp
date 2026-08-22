import RNFS from 'react-native-fs'
import { Buffer } from 'buffer'

const APP_DIR = 'ripplemessenger/'
const AVATAR_DIR = 'avatars/'
const FILE_DIR = 'files/'

function getFullDir(): string {
  return (RNFS.DocumentDirectoryPath || '') + '/' + APP_DIR
}

export async function ensureDir(subdir?: string): Promise<void> {
  const dirPath = subdir ? getFullDir() + '/' + subdir : getFullDir()
  const exists = await RNFS.exists(dirPath)
  if (!exists) {
    await RNFS.mkdir(dirPath)
  }
}

export function getAvatarPath(address: string): string {
  return getFullDir() + AVATAR_DIR + address + '.png'
}

export function getFileFullPath(hash: string): string {
  return getFullDir() + FILE_DIR + hash
}

async function writeFileBase(
  path: string,
  content: Uint8Array | string,
): Promise<void> {
  const dir = path.substring(0, path.lastIndexOf('/') + 1)
  await ensureDir()

  if (typeof content === 'string') {
    await RNFS.writeFile(path, content)
  } else {
    // Binary - convert to base64 for react-native-fs
    let base64 = Buffer.from(content).toString('base64')
    await RNFS.writeFile(path, base64, 'base64')
  }
}

export async function writeFile(
  path: string,
  content: Uint8Array | string,
  append?: boolean
): Promise<void> {
  if (append) {
    // Read existing, append new
    const existing = await readFile(path).catch(() => new Uint8Array(0))
    const contentBytes = typeof content === 'string'
      ? new Uint8Array(Buffer.from(content))
      : content
    const combined = new Uint8Array(existing.length + contentBytes.length)
    combined.set(existing)
    combined.set(contentBytes, existing.length)
    await writeFileBase(path, combined)
  } else {
    await writeFileBase(path, content)
  }
}

export async function readFile(path: string): Promise<Uint8Array> {
  const base64 = await RNFS.readFile(path, 'base64')
  return Uint8Array.from(Buffer.from(base64, 'base64'))
}

export async function readFileAsString(path: string): Promise<string> {
  return RNFS.readFile(path, 'utf8')
}

export async function deleteFile(path: string): Promise<void> {
  try {
    await RNFS.unlink(path)
  } catch (e) {
    // File may not exist
  }
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    return await RNFS.exists(path)
  } catch {
    return false
  }
}

export async function statFile(path: string): Promise<{ size: number; exists: boolean }> {
  try {
    const stats = await RNFS.stat(path)
    return { size: stats.size, exists: true }
  } catch {
    return { size: 0, exists: false }
  }
}

export function getBaseDir(): string {
  return getFullDir()
}
