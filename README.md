# JOKO_MEMO 
<img width="1920" height="1032" alt="image" src="https://github.com/user-attachments/assets/2463f627-b846-450d-a4bf-a83a27d61a5b" />

<img width="1920" height="1032" alt="image" src="https://github.com/user-attachments/assets/65864eed-947d-4b23-a850-45c5de19d429" />
<img width="1920" height="1032" alt="image" src="https://github.com/user-attachments/assets/c59e6457-9249-4b50-9ac2-f9c8442b26e4" />
<img width="1920" height="1032" alt="image" src="https://github.com/user-attachments/assets/b504804c-349e-43f7-b7b4-334141202300" />
<img width="1920" height="1032" alt="image" src="https://github.com/user-attachments/assets/e5a76f9e-7d20-4a94-bc1c-69bf69f281fb" />


## 环境

Windows 下需要先安装：

1. Microsoft C++ Build Tools / Visual Studio Build Tools
2. WebView2 Runtime
3. Rust：
   ```powershell
   winget install Rustlang.Rustup
   ```

然后重新打开 PowerShell。

## 运行

```powershell
cd C:\app\JOKO_MEMO_TAURI
npm install
npm run dev
```

## 打包

```powershell
cd C:\app\JOKO_MEMO_TAURI
npm run build
```

产物位置通常在：

```text
src-tauri\target\release\bundle\
```

Tauri 产物一般会明显小于 Electron，但最终大小取决于系统 WebView2、图标资源、安装包格式等。

## 迁移范围

- 保留了 JOKO_MEMO 的 HTML/CSS/JS 视觉样式。
- 后端从 Electron 主进程迁移为 Tauri Rust commands。
- 数据保存为本地 JSON 文件。
- 保留主窗口、抽屉窗口、小图标窗口的基本交互。
  ## 作者与交流

- 项目品牌：JokoAI / joko-image
- 作者 / 站主：Joko
- QQ：935764227
- Telegram：https://t.me/jokoacoount
- 交流群：1076496247 

## 开源协议

本项目采用 MIT License 开源协议。

你可以自由使用、复制、修改、合并、发布、分发、再授权或销售本项目副本；使用时请保留原始版权声明和许可声明。项目按“现状”提供，不附带任何明示或暗示担保。

## Friendly Links

[![LINUXDO](https://img.shields.io/badge/%E7%A4%BE%E5%8C%BA-LINUXDO-0086c9?style=for-the-badge&labelColor=555555)](https://linux.d
