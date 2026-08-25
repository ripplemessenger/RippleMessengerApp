import React, { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { useSelector } from "react-redux";

import { dbAPI } from "../db";
import * as fileService from "../services/fileService";
import { FileImageExtRegex } from "../lib/AppConst";

/**
 * InlineImage — renders a bulletin/chat file inline when it is an image and
 * has been fully downloaded locally. Mirrors the Client's inline image
 * preview (BulletinFileViewer / ChatFileLink).
 *
 * Re-renders when the file finishes downloading: MessengerSlice.FileSavedMap
 * is bumped (setFileSavedToken) at every file-completion point, so a file that
 * arrives after mount appears here automatically.
 *
 * Props:
 *   hash  - file hash (the local storage key)
 *   ext   - file extension (e.g. ".png"); must match FileImageExtRegex
 *   style - optional RN style for the <Image>
 *   containerStyle - optional RN style for the wrapper
 */
export default function InlineImage({ hash, ext, style, containerStyle }) {
  // Re-render trigger: bumped when this hash finishes downloading.
  const savedToken = useSelector(
    (state) => state.Messenger.FileSavedMap?.[hash] ?? null,
  );

  const [localUri, setLocalUri] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!hash || !ext || !FileImageExtRegex.test(ext)) {
      setLocalUri(null);
      return;
    }
    (async () => {
      try {
        const file = await dbAPI.getFileByHash(hash);
        if (cancelled) return;
        if (file && file.is_saved) {
          const path = fileService.getFileFullPath(hash);
          const exists = await fileService.fileExists(path);
          if (!cancelled && exists) {
            setLocalUri(path);
            return;
          }
        }
        if (!cancelled) setLocalUri(null);
      } catch {
        if (!cancelled) setLocalUri(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hash, ext, savedToken]);

  if (!localUri) return null;

  return (
    <View style={containerStyle}>
      <Image
        source={{ uri: localUri }}
        style={[
          { width: "100%", borderRadius: 12, backgroundColor: "#00000010" },
          style,
        ]}
        resizeMode="contain"
      />
    </View>
  );
}
