# Botdom 发布

在对应平台安装构建工具和依赖后，在项目根目录执行：

```sh
pnpm package:mac
pnpm package:win
pnpm package:linux
```

macOS 公开分发需要 Developer ID 签名和 Apple 公证。Linux DEB 打包需要配置项目主页。安装包当前没有内置自动更新源，用户需要手动安装后续版本。

GitHub Pages 工作流发布产品主页。安装包应在签名、公证和检查后上传到 GitHub Releases。
