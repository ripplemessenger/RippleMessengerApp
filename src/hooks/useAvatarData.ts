import RNFS from "react-native-fs";

import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";

import { dbAPI } from "../db";
import * as fileService from "../services/fileService";

/**
 * useAvatarData — loads avatar image for a given XRPL address.
 *
 * Priority order:
 *   1. Check DB image_base64 column (fastest, no file I/O)
 *   2. Read PNG file from disk as base64 data URI
 *   3. Return null (caller shows fallback initials)
 *
 * @param address - XRPL address (empty string | null to skip)
 * @returns string|null — data URI for React Native Image.source, or null
 */
export function useAvatarData(
  address: string | undefined | null,
): string | null {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Bumped by setAvatarSavedToken when the avatar image finishes saving,
  // so this hook re-runs and picks up the newly stored image (mirrors
  // InlineImage's FileSavedMap subscription).
  const savedToken = useSelector((state: any) =>
    address ? (state.Messenger.AvatarSavedMap?.[address] ?? null) : null,
  );

  useEffect(() => {
    if (!address) {
      setImageUri(null);
      return;
    }

    let mounted = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const loadAvatar = async () => {
      try {
        // Check DB for avatar metadata
        const avatar = await dbAPI.getAvatarByAddress(address);
        if (!avatar) {
          if (mounted) setImageUri(null);
          return;
        }

        // Priority 1: Use image_base64 from DB (fastest)
        const base64FromDb = await dbAPI.getAvatarImageBase64(address);
        if (base64FromDb && mounted) {
          setImageUri(`data:image/png;base64,${base64FromDb}`);
          return;
        }

        // Priority 2: Read PNG file from disk
        if (avatar.is_saved) {
          const avatarPath = fileService.getAvatarPath(address);
          const exists = await fileService.fileExists(avatarPath);
          if (exists && mounted) {
            const base64 = await RNFS.readFile(avatarPath, "base64");
            setImageUri(`data:image/png;base64,${base64}`);
            return;
          }
        }

        // Not saved or file missing — show fallback
        if (mounted) setImageUri(null);

        // Retry up to 5 times every 2 seconds (avatar may be downloading)
        if (!avatar.is_saved && retryCount < 5) {
          pollTimer = setTimeout(() => {
            if (mounted) setRetryCount((c) => c + 1);
          }, 2000);
        }
      } catch {
        if (mounted) setImageUri(null);
      }
    };

    loadAvatar();

    return () => {
      mounted = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [address, retryCount, savedToken]);

  return imageUri;
}
