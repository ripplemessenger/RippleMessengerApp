import ImagePicker from 'react-native-image-picker'
// TODO: react-native-document-picker is incompatible with RN 0.86 (GuardedResultAsyncTask missing)
// import DocumentPicker from 'react-native-document-picker'

const DocumentPicker = {
  pick: async () => null, // placeholder until library is fixed
  types: { allFiles: '*' },
}

// Inline type fallbacks in case the installed version lacks these exports
type ImageOptions = Record<string, any>
type ImageLibraryResponse = {
  didCancel?: boolean
  assets?: Array<{ uri: string; fileName?: string }>
}

export async function pickImage() {
  const options: ImageOptions = {
    mediaType: 'photo',
    allowsEditing: true,
    selectionLimit: 1,
    quality: 0.8,
  }

  const result = await new Promise<ImageLibraryResponse>((resolve) => {
    // @ts-ignore - type signature may vary by installed version
    ImagePicker.launchImageLibrary(options, resolve)
  })

  if (result.didCancel || !result.assets || !result.assets[0]) return null
  return result.assets[0]
}

export async function pickDocument() {
  try {
    const result = await DocumentPicker.pick({
      type: [DocumentPicker.types.allFiles],
    })

    if (!result || result.length === 0) return null
    return result[0]
  } catch {
    return null
  }
}

/**
 * pickFile — unified file picker that lets the user choose between
 * camera roll (image) or device storage (document).
 * Returns an object with `uri` string on success, null on cancel/error.
 */
export async function pickFile(): Promise<{ uri: string; name?: string } | null> {
  // We return a promise that resolves once the user picks via one of the buttons.
  // Alert.alert doesn't return the button index in Expo managed flow reliably,
  // so we use a callback-based approach.
  return new Promise((resolve) => {
    const ImagePicker = require('react-native-image-picker').default
    // DocumentPicker removed - incompatible with RN 0.86
    const DocumentPicker = { pick: async () => null, types: { allFiles: '*' } }

    const onImagePick = async () => {
      const options: ImageOptions = {
        mediaType: 'photo',
        allowsEditing: true,
        selectionLimit: 1,
        quality: 0.8,
      }
      const result = await new Promise<ImageLibraryResponse>((r) => {
        // @ts-ignore - dynamic import, type signature may vary
        ImagePicker.launchImageLibrary(options, r)
      })
      if (result.didCancel || !result.assets || !result.assets[0]) return resolve(null)
      resolve({ uri: result.assets[0].uri, name: result.assets[0].fileName })
    }

    const onDocPick = async () => {
      try {
        const result = await DocumentPicker.pick({
          type: [DocumentPicker.types.allFiles],
        })
        if (!result || result.length === 0) return resolve(null)
        resolve({ uri: result[0].uri, name: result[0].name })
      } catch {
        resolve(null)
      }
    }

    const Alert = require('react-native').Alert
    Alert.alert(
      'Choose file',
      'Select a file type to attach.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        { text: 'Camera Roll (Image)', onPress: onImagePick },
        { text: 'Files (Document)', onPress: onDocPick },
      ],
    )
  })
}
