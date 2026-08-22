import RNFS from 'react-native-fs'

const AUTH_FILE = (RNFS.DocumentDirectoryPath || '') + '/ripplemessenger/session.json'
console.log('[AuthStorage] AUTH_FILE path:', AUTH_FILE)

export async function saveSession(seed, address) {
  const dir = AUTH_FILE.substring(0, AUTH_FILE.lastIndexOf('/') + 1)
  const exists = await RNFS.exists(dir).catch(() => false)
  if (!exists) {
    await RNFS.mkdir(dir)
  }
  await RNFS.writeFile(AUTH_FILE, JSON.stringify({ seed, address }))
}

export async function loadSession() {
  try {
    console.log('[AuthStorage] loadSession checking:', AUTH_FILE);
    const exists = await RNFS.exists(AUTH_FILE)
    console.log('[AuthStorage] loadSession exists:', exists);
    if (!exists) return null
    const json = await RNFS.readFile(AUTH_FILE, 'utf8')
    console.log('[AuthStorage] loadSession read:', json);
    const data = JSON.parse(json)
    if (data.seed && data.address) {
      return { seed: data.seed, address: data.address }
    }
    return null
  } catch {
    return null
  }
}

export async function clearSession() {
  try {
    await RNFS.unlink(AUTH_FILE)
  } catch {
    // File may not exist
  }
}
