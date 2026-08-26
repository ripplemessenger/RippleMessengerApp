import { launchImageLibrary } from "react-native-image-picker";
import RNFS from "react-native-fs";
import Logger from "../lib/Logger";

/**
 * KNOWN LIMITATION: react-native-document-picker is incompatible with RN 0.75.
 * Document picking returns null. Only image picking via Camera Roll works.
 * Fix planned: migrate to expo-file-system or react-native-doc-viewer.
 */

// Inline type fallbacks in case the installed version lacks these exports
type ImageOptions = Record<string, unknown>;
type ImageLibraryResponse = {
  didCancel?: boolean;
  assets?: Array<{ uri: string; fileName?: string; fileSize?: number }>;
};

/**
 * Copy a content:// or file:// URI to the app's local directory.
 * Returns the local file path.
 */
async function copyToLocal(uri: string): Promise<string> {
  // If it's already a local file path, return as-is
  if (uri.startsWith("file://") || uri.startsWith("/")) {
    // Strip file:// prefix if present
    const localPath = uri.replace(/^file:\/\//, "");
    if (await RNFS.exists(localPath)) return localPath;
  }

  // Copy to local temp directory
  const ext = uri.includes(".") ? uri.substring(uri.lastIndexOf(".")) : ".jpg";
  const destPath =
    (RNFS.DocumentDirectoryPath || "") +
    "/ripplemessenger/tmp/pick_" +
    Date.now() +
    ext;
  const dir = destPath.substring(0, destPath.lastIndexOf("/") + 1);
  if (!(await RNFS.exists(dir))) await RNFS.mkdir(dir);
  await RNFS.copyFile(uri, destPath);
  return destPath;
}

export async function pickImage() {
  const options: ImageOptions = {
    mediaType: "photo",
    allowsEditing: false,
    selectionLimit: 1,
    quality: 0.8,
  };

  const result = await new Promise<any>((resolve) => {
    launchImageLibrary(options as any, resolve as any);
  });

  if (result.didCancel || !result.assets || !result.assets[0]) return null;
  const asset = result.assets[0];
  const localPath = await copyToLocal(asset.uri);
  return { ...asset, uri: localPath };
}

export async function pickDocument() {
  // Document picking is disabled — react-native-document-picker incompatible with RN 0.75
  Logger.warn(
    "[mediaPicker] pickDocument is disabled due to library incompatibility",
  );
  return null;
}

/**
 * pickFile — unified file picker that lets the user choose between
 * camera roll (image) or device storage (document).
 * Returns an object with `uri` string on success, null on cancel/error.
 */
export async function pickFile(): Promise<{
  uri: string;
  name?: string;
} | null> {
  // We return a promise that resolves once the user picks via one of the buttons.
  // Alert.alert doesn't return the button index in Expo managed flow reliably,
  // so we use a callback-based approach.
  return new Promise((resolve) => {
    const { launchImageLibrary } = require("react-native-image-picker");
    // DocumentPicker removed - incompatible with RN 0.86
    const DocumentPicker = { pick: async () => null, types: { allFiles: "*" } };

    const onImagePick = async () => {
      const options: ImageOptions = {
        mediaType: "photo",
        allowsEditing: true,
        selectionLimit: 1,
        quality: 0.8,
      };
      const result = await new Promise<ImageLibraryResponse>((r) => {
        launchImageLibrary(options, r);
      });
      if (result.didCancel || !result.assets || !result.assets[0])
        return resolve(null);
      resolve({ uri: result.assets[0].uri, name: result.assets[0].fileName });
    };

    const onDocPick = async () => {
      try {
        const result = await (DocumentPicker.pick as any)({
          type: [DocumentPicker.types.allFiles],
        });
        if (!result || result.length === 0) return resolve(null);
        resolve({ uri: result[0].uri, name: result[0].name });
      } catch {
        resolve(null);
      }
    };

    const Alert = require("react-native").Alert;
    Alert.alert("Choose file", "Select a file type to attach.", [
      { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
      { text: "Camera Roll (Image)", onPress: onImagePick },
      { text: "Files (Document)", onPress: onDocPick },
    ]);
  });
}
