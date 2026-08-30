# RippleMessenger App

RippleMessenger 的 Android 客户端，基于 **React Native 0.75.4**（无 Expo），从 `Client/`（Tauri 桌面端）移植。

## 功能

- **公告（Bulletin）**：Portal 列表、详情、发布、引用/转发、书签、关注、标签、地址公告页（含从服务器逐条拉取整链）
- **私聊**：ECDH 握手 + AES-CBC 加密，已读回执高亮
- **群聊**：最多 16 成员，创建/解散/清除群数据
- **文件传输**：1MB 分块、SHA-512 校验、断点续传（启动 + 进入页面自动恢复）、下载进度显示
- **视频**：聊天内联缩略图 + 全屏播放器（`react-native-video`）
- **联系人**：昵称管理、QR 扫码添加（`react-native-vision-camera`）、二维码名片（`地址@服务器`）
- **多语言**：9 种语言（en/zh/ja/ko/de/es/fr/pt/ru）
- **设置**：深色模式、自动下载开关、服务器管理、存储管理、Bulletin 缓存管理（删除保护：自己的/bookmarked/followed 不可删）

## 环境要求

- Node.js（含 npm）
- Android SDK（gradlew 会自动下载 Gradle）
- 模拟器或真机（Windows x86_64 主机用 x86_64 模拟器）

## 构建步骤

```bash
# 1. 安装依赖
npm install

# 2. 生成 JS bundle（必须步骤，bundle 不随仓库分发）
npx react-native bundle --platform android --dev false \
  --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle

# 3. 编译 APK
cd android && ./gradlew assembleDebug      # 调试
cd android && ./gradlew assembleRelease    # 发布

# 4. 安装并启动（可选）
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n app.ripplemessenger/.MainActivity
```

APK 输出位置：

- Debug：`android/app/build/outputs/apk/debug/app-debug.apk`
- Release：`android/app/build/outputs/apk/release/app-release.apk`

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

```text
src/
  components/   # React 组件（Bulletin/Chat/common 分类）
  screens/      # 页面
  store/        # Redux 状态（slices + sagas，messenger.* 按功能拆分）
  lib/          # 协议、加密、工具库
  db/           # SQLite 数据层（NitroSQLite）
  services/     # 服务层
  navigation/   # 路由
  i18n/         # 9 语言包
android/
  app/src/main/java/app/ripplemessenger/  # Kotlin 原生代码
docs/
  porting-status.md        # 功能移植进度（每次改动必更新）
  component-conventions.md # UI 组件规范（开发前必读）
  pages-features.md        # 页面功能清单
```

## 技术栈

- React Native 0.75.4 + nativewind 4（Tailwind 样式）
- Redux Toolkit + Redux-Saga（状态 + 副作用）
- NitroSQLite（本地数据库）
- `ripple-keypairs` / `crypto-js` / `elliptic`（XRPL 签名、AES、ECDH）
- `react-native-video`（视频播放）、`react-native-vision-camera`（QR 扫码）

## License

见 [LICENSE](./LICENSE)
