# Botdom

Botdom 是一个本地优先的 AI Bot 团队工作空间。你可以与 Bot 私聊，也可以在群聊里由主管组织多个 Bot 协作，并在任务看板中查看进度。

## 项目结构

- `src/`、`public/`：桌面界面、主页和使用指南
- `server/`、`shared/`：本地服务、执行调度与共享数据类型
- `electron/`、`build/`：桌面客户端和安装包配置
- `scripts/`：构建、开发及验证脚本
- `docs/`：项目文档
- `third_party/`、`NOTICE`：第三方许可和声明

## 本地开发

需要 Node.js 24、pnpm 10 和项目依赖。安装依赖后，在项目目录运行：

```sh
pnpm install --frozen-lockfile
npm run botdom:start
```

此命令构建界面并启动本地服务。界面、API 和聊天更新共用 `127.0.0.1:8820`。

在 macOS 上，可通过以下脚本创建开发用桌面应用，再从 `~/Applications/Botdom Next.app` 打开：

```sh
python3 scripts/botdom/create-desktop-app.py
```

脚本不会覆盖已有的同名应用。开发工作区数据保存在 `~/.botdom-next`，桌面应用配置保存在 `~/Library/Application Support/Botdom Next`。

前端修改后可以运行 `npm run botdom:build-ui`，再重新加载桌面窗口。使用指南的内容位于 [public/guide/content.json](public/guide/content.json)。

## 检查与打包

```sh
npm run typecheck
pnpm package:mac
```

macOS 打包需要相应的构建工具及原生依赖。公开分发前还需要配置开发者签名和公证。安装包目前未配置自动更新渠道，后续版本需要手动安装。

## 开源许可

项目使用 [Apache License 2.0](LICENSE)。版权及第三方声明见 [NOTICE](NOTICE) 和 [third_party](third_party/)。
