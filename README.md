# RippleMessenger App

RippleMessenger 的 Android 客户端，基于 **纯 React Native 0.86.0**（无 Expo）。

## 环境要求

- Node.js（含 npm）
- Android SDK + Android Studio 命令行工具（gradlew 会自动下载 Gradle）
- 模拟器或真机（x86_64 模拟器在 Windows x86_64 主机上运行最稳）

## 构建步骤

```bash
# 1. 安装依赖
npm install

# 2. 生成 JS bundle（必须步骤，bundle 不随仓库分发）
npx react-native bundle --platform android --dev false \
  --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle

# 3. 编译 APK
cd android && ./gradlew assembleDebug

# 4. 安装并启动（可选）
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.anonymous.RippleMessengerApp/.MainActivity
```

APK 输出位置：`android/app/build/outputs/apk/debug/app-debug.apk`

## 开发循环（重要）

**修改 `src/` 下任何 JS/TS 代码后，必须重新执行第 2 步生成 bundle，再执行第 3 步编译 APK。**
`src/` 的改动不会自动更新到 APK 内嵌的 bundle 中。

验证 bundle 是否更新：

```bash
grep -c "你刚加的字符串" android/app/src/main/assets/index.android.bundle
```

查看日志：

```bash
adb logcat -d | grep -i "ReactNativeJS\|Error"
```

## 常见错误

| 错误 | 原因 | 解决 |
| --- | --- | --- |
| "Cannot convert null value to object" | bundle 过期 | 重新生成 bundle |
| "Value is undefined, expected a String" | API 参数类型错误 | 检查 API 签名 |
| "Database already open" | 重复调用 `open()` | 用 `dbReady` 标志保护 |
| "arm64 not supported on x86_64" | 模拟器架构不对 | 使用 x86_64 模拟器 |

## 项目结构

```
src/
  components/   # React 组件
  screens/      # 页面
  store/        # Redux 状态
  lib/          # 协议、加密、工具库
  db/           # SQLite 数据层
  services/     # 服务层
  navigation/   # 路由
android/
  app/src/main/java/com/anonymous/RippleMessengerApp/  # Kotlin 原生代码
```

## License

见 [LICENSE](./LICENSE)
