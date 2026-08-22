package app.ripplemessenger

import android.os.Build
import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "main"

  override fun invokeDefaultOnBackPressed() {
    if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
      if (!moveTaskToBack(false)) {
        super.invokeDefaultOnBackPressed()
      }
      return
    }
    super.invokeDefaultOnBackPressed()
  }
}
