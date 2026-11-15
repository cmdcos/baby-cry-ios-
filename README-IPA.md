# iOS IPA 云构建（无需本地 Mac）

这个目录是一个 **GitHub Actions + Capacitor** 构建包，用 GitHub 的 macOS runner 产出 **unsigned IPA**，然后在 Windows 用 Sideloadly / AltStore 用你自己的 Apple ID 签名安装。

> 这里能产出 IPA 文件，但 **不能替你完成 Apple 签名**。签名必须在你的 Windows + iPhone 上完成，或使用付费 Apple Developer 账号 + 云签名。

## 目录

- `www/`：已经合并好的真实模型版网页（Storybook Crayon UI）
- `capacitor.config.json`：iOS App 配置
- `package.json`：Capacitor 依赖
- `.github/workflows/ios-unsigned.yml`：云构建脚本

## 前提

- 一个 GitHub 账号
- 一台 Windows 电脑
- 一台 iPhone
- 免费 Apple ID（7 天签名）或付费 Apple Developer（$99/年，1 年签名 / TestFlight）

## 一、上传到 GitHub

1. 新建一个空仓库（private/public 都行）
2. 把本目录全部文件推上去，确保：
   - `www/index.html`
   - `capacitor.config.json`
   - `.github/workflows/ios-unsigned.yml`
   都在仓库根目录
3. 打开仓库 **Actions → Build unsigned iOS IPA → Run workflow**

## 二、下载 IPA

Actions 跑完后：

1. 进入这次运行
2. 页面底部 **Artifacts → BabyCry-unsigned-ipa**
3. 下载并解压，得到 `BabyCry-unsigned.ipa`

> 这个 IPA 是**未签名**的，不能直接双击安装。

## 三、Windows 签名安装

1. 安装 [Sideloadly](https://sideloadly.io/) 或 [AltStore](https://altstore.io/)
2. iPhone 用数据线连接 Windows
3. 把 `BabyCry-unsigned.ipa` 拖进 Sideloadly
4. 输入你的 Apple ID（只在本机使用，不要把密码发给别人）
5. 开始签名安装
6. iPhone 设置 → 通用 → VPN 与设备管理 → 信任你的开发者证书
7. iOS 16+ 还需要：设置 → 隐私与安全性 → **开发者模式** → 打开并重启

## 免费 Apple ID 的限制

- 签名 **7 天有效**
- 到期后要重新签一次
- 最多 3 个 App
- 不能推送通知
- 适合个人测试

## 付费 Apple Developer

- 签名 **1 年有效**
- 可以 Ad Hoc 安装
- 可以走 TestFlight（90 天）
- 仍然不需要本地 Mac，CI 可以继续用 GitHub Actions

## 重要限制

- **未签名 IPA 不能上 App Store**
- WKWebView 的 Web Audio 在锁屏/后台仍可能被挂起；`UIBackgroundModes=audio` 只是允许后台音频，不能保证 Web Audio 一直运行
- 睡眠定时最好后续改成原生 `AVAudioPlayer` + 原生定时器
- 公开分发前请确认三首版权音乐的处理；这个构建包的 `www/` 已经**不含**三首版权音频
- 首次打开需要网络加载本地模型（8.3 MB），之后由 Service Worker 缓存；WKWebView 内 Service Worker 支持有限，模型缓存可能依赖 WebView 自身缓存

## 如果构建失败

优先检查：

1. `www/index.html` 是否存在
2. `package.json` 是否在根目录
3. Xcode / CocoaPods 步骤日志
4. `ios/App/App/Info.plist` 是否成功写入麦克风权限
5. Capacitor 6 与 macOS runner 的 Xcode 版本是否兼容

如果只是要最快在 iPhone 上用，不走 IPA，直接用 `dist-public/` 部署 PWA 更简单。
