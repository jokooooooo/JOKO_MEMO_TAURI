# JOKO_MEMO 
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
