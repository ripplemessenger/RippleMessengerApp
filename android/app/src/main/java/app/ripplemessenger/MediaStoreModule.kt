package app.ripplemessenger

import android.content.ContentValues
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

class MediaStoreModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "RMMediaStore"

    private val IMAGE_EXTENSIONS = setOf("jpg", "jpeg", "png", "gif", "webp", "bmp")

    @ReactMethod
    fun saveToGallery(sourcePath: String, displayName: String, mimeType: String, promise: Promise) {
        try {
            val context = reactApplicationContext
            val sourceFile = File(sourcePath)
            if (!sourceFile.exists()) {
                promise.reject("FILE_NOT_FOUND", "Source file not found: $sourcePath")
                return
            }

            val ext = displayName.substringAfterLast('.', "").lowercase()
            val isImage = IMAGE_EXTENSIONS.contains(ext) || mimeType.startsWith("image/")

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val collectionUri = if (isImage) {
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                } else {
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI
                }

                // Delete existing file with same name to avoid duplicates
                val selection = MediaStore.MediaColumns.DISPLAY_NAME + " = ?"
                val selectionArgs = arrayOf(displayName)
                context.contentResolver.delete(collectionUri, selection, selectionArgs)

                // Insert new entry
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
                    put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                    if (isImage) {
                        put(MediaStore.Images.Media.IS_PENDING, 1)
                    }
                }

                val insertedUri = context.contentResolver.insert(collectionUri, values)
                    ?: run {
                        promise.reject("INSERT_FAILED", "MediaStore insert returned null")
                        return
                    }

                // Write file content
                context.contentResolver.openOutputStream(insertedUri)?.use { output ->
                    sourceFile.inputStream().use { input ->
                        input.copyTo(output)
                    }
                } ?: run {
                    context.contentResolver.delete(insertedUri, null, null)
                    promise.reject("WRITE_FAILED", "Could not open output stream")
                    return
                }

                // Mark as no longer pending (images only)
                if (isImage) {
                    val doneValues = ContentValues().apply {
                        put(MediaStore.Images.Media.IS_PENDING, 0)
                    }
                    val id = insertedUri.lastPathSegment ?: ""
                    context.contentResolver.update(
                        Uri.parse("$collectionUri/$id"),
                        doneValues,
                        null,
                        null
                    )
                }

                promise.resolve(displayName)
            } else {
                val dir = if (isImage) {
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
                } else {
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                }
                val destFile = File(dir, displayName)
                sourceFile.copyTo(destFile, overwrite = true)

                MediaScannerConnection.scanFile(
                    context,
                    arrayOf(destFile.absolutePath),
                    arrayOf(mimeType)
                ) { _, uri -> }

                promise.resolve(displayName)
            }
        } catch (e: Exception) {
            promise.reject("SAVE_FAILED", e.message ?: "Unknown error")
        }
    }
}
