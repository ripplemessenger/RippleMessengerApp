import RNFS from 'react-native-fs'

import { useEffect, useRef, useState } from 'react'

import { dbAPI } from '../db'
import { GenesisHash } from '../lib/MessengerConst'
import * as fileService from '../services/fileService'

/**
 * useAvatarData — loads avatar image for a given XRPL address.
 *
 * Lifecycle:
 *   1. Look up avatar record in SQLite (getAvatarByAddress)
 *   2. If is_saved=true and file exists on disk, read PNG and create data URI
 *   3. If not saved or file missing, return null (caller shows fallback initials)
 *
 * @param address - XRPL address (empty string | null to skip)
 * @returns string|null — data URI for React Native Image.source, or null
 */
export function useAvatarData(address: string | undefined | null): string | null {
  const [imageUri, setImageUri] = useState<string | null>(null)

  useEffect(() => {
    if (!address) {
      setImageUri(null)
      return
    }

    let mounted = true

    const loadAvatar = async () => {
      try {
        // Check DB for avatar metadata
        const avatar = await dbAPI.getAvatarByAddress(address)
        if (!avatar || !avatar.is_saved) {
          if (mounted) setImageUri(null)
          return
        }

        // Avatar is saved — read PNG file from disk as base64
        const avatarPath = fileService.getAvatarPath(address)
        const exists = await fileService.fileExists(avatarPath)
        if (!exists || !mounted) {
          if (mounted) setImageUri(null)
          return
        }

        // Read binary file as base64 string
        const base64 = await RNFS.readFile(avatarPath, 'base64')

        if (!mounted) return
        setImageUri(`data:image/png;base64,${base64}`)
      } catch {
        if (mounted) setImageUri(null)
      }
    }

    loadAvatar()

    return () => {
      mounted = false
    }
  }, [address])

  return imageUri
}
