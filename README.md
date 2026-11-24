# 教案生成器（网页版）

把排课清单粘进文本框，一键生成整月教案：**每节课一张 PNG** + **整月 .txt**，全部在浏览器里完成，不上传任何数据。

线上地址：<https://qqdesign.de5.net>

## 和桌面版的关系

| | 桌面版 `generate_plans.py` | 网页版 `web/` |
|---|---|---|
| 匹配规则 | Python 实现 | 同名逻辑用 JavaScript 重写，**输出逐字一致**（已比对 127 节课） |
| 截图 | Chrome headless 截 HTML | Canvas 直接绘制，PNG 宽度 1200px（2 倍图，手机更清晰） |
| 打包 | 生成到 `教案截图/` 文件夹 | 浏览器打成一个 ZIP 下载 |
| 历史档案 | 读 `9 月.txt` / `10 月.txt` 兜底 | 内置匿名版（298 条）+ 可导入自己的 txt |
| 年份 | 写死 2026 | 自动取当前年 |
| 打开方式 | 双击 `.app` | 双击 HTML 或线上网址，都能用 |

## 目录

```
web/
├── index.html          页面
├── 补充数据.txt        动作库（网站运行时 fetch 这个文件）
├── CNAME               自定义域名（GitHub Pages 用）
├── .nojekyll           关掉 Jekyll 处理
├── tools/build-library.py  把动作库/历史档案内联成 JS
└── assets/
    ├── style.css
    ├── engine.js       匹配引擎 + 轮换
    ├── render.js       Canvas 画卡片 PNG
    ├── zip.js          手写 ZIP（不压缩，UTF-8 文件名）
    ├── library.js      动作库的内置副本（双击打开时用）
    └── app.js          UI 与下载
```

## 本地打开（两种都行）

**方式一：直接双击 `index.html`** —— 现在可以用了。浏览器不允许 `file://` 下 fetch 本地文件，所以页面会自动退回 `assets/library.js` 里的内置动作库。

**方式二：起个本地服务** —— 这样读的是最新的 `补充数据.txt`：

```bash
cd web
python3 -m http.server 8931
# 浏览器打开 http://127.0.0.1:8931
```

> 改了 `补充数据.txt` 之后，如果还要用「双击」这种方式，记得跑一次
> `python3 tools/build-library.py` 更新内置副本；线上部署时不需要，网页会直接读 txt。

## 历史档案（兜底用）

补充数据里没有的课，会拿学员上过课的历史动作来兜底——和桌面版同一套逻辑。

- **内置**：`assets/history.js`，298 条，来自 `匿名数据/9 月.txt`、`10 月.txt`（假名）。
- **导入真实历史**：页面上点「导入我的历史」，选你自己的 `9 月.txt`、`10 月.txt`。
  文件只在浏览器里解析，**不会上传**，会存在本机 localStorage，点「清除导入」可移除。
  真实姓名流程完全不同的问题：输入框里写什么，导出的图片和文本就是什么，程序从不改名。

> 生成内置档案的源在项目根目录 `匿名数据/`（假名版），这样即使重新跑
> `python3 tools/build-library.py` 也不会把真实姓名打进网页。

## 手机上怎么拿到图片

- **一键存相册**：点「全部存到相册」，弹系统分享面板 → 选「存储图像」→ 回来点「继续存（10/127）」。
  iOS 规定一次点击只能触发一次分享，所以按每批 10 张走，127 节大约点 13 次；进度会一直记着，中断了也不会重来。
- **单张进相册**：卡片右上角「存相册」，同样走分享面板。
- **整月打包**：点「下载图片包」得到 ZIP。iPhone 打开「文件」App → 点 zip 自动解压成文件夹 → 全选 → 分享 → 存储图像。
- 电脑上同样有「全部存到相册」，走 macOS 的系统分享面板（可选「添加到照片」）；不想走面板就用「下载图片包」。
- 单张按钮在电脑上叫「存图」，点一下直接下载 PNG。

## 部署到 GitHub Pages（含自定义域名）

前提：仓库要 **public**（私有仓库开 Pages 需要 GitHub Pro）。

### ① 建仓库并推送

GitHub 上新建仓库，名字随意（下面以 `zuoye` 为例），**选 Public，不要勾 Add README / .gitignore**（会让本地 push 冲突）。

本地这个目录（`web/`）已经是 git 仓库、分支 `main`、有 5 个提交，只差一个远程：

```bash
cd "教案项目/web"
git remote add origin https://github.com/1770777/zuoye.git
git push -u origin main
```

推送时用户名填 `1770777`，密码要填 **Personal Access Token**（GitHub 不再接受账号密码）：
Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token → 勾 `repo` → 复制。

> 不想用命令行：装 GitHub Desktop → File → Add local repository 选 `web` 文件夹 →
> Publish repository（取消 Keep this code private）。
> 也不想装软件：在仓库页面用 "uploading an existing file" 把 `web/` 里的文件拖进去
> （`.git` 和 `.nojekyll` 是隐藏文件，拖不上去也没关系，功能不受影响）。

### ② 打开 Pages

仓库 → **Settings → Pages**

- Source：`Deploy from a branch`
- Branch：`main`，目录选 `/ (root)`
- 保存

等 1～2 分钟，先去 `https://1770777.github.io/zuoye/` 确认能打开（这一步不通，后面域名肯定不通）。

### ③ 绑自定义域名

仓库里已经有 `CNAME`（内容 `qqdesign.de5.net`），所以：

- Pages 设置页的 **Custom domain** 填 `qqdesign.de5.net` → 保存
  （如果提示 CNAME 文件冲突，以这里填的为准）

### ④ 加 DNS 解析

到 qqdesign.de5.net 的域名面板 → 添加解析：

| 主机记录 | 类型 | 记录值 | 备注 |
|---|---|---|---|
| `qqdesign` | CNAME | `1770777.github.io` | 面板若已定位到 `qqdesign.de5.net`，主机记录填 `@` 或留空 |

有的面板要求记录值带尾点：`1770777.github.io.`。加了就等生效（几分钟到几小时）：

```bash
dig qqdesign.de5.net CNAME +short   # 输出 1770777.github.io. 就对了
```

### ⑤ 开 HTTPS

DNS 生效后回到 Settings → Pages，**Enforce HTTPS** 会从灰色变成可勾选（证书签发要十几分钟）。

之后访问 <https://qqdesign.de5.net> 就是你的应用；手机 Safari 打开 → 分享 → 添加到主屏幕，用起来和 App 一样。

> 以后改完代码 `git push` 就行，Pages 会自动重新发布，不用再进设置页。

## 以后改动作库

直接改仓库里的 `补充数据.txt`（GitHub 网页上就能编辑），格式保持：

```
私教-腰腹 1：
泡沫轴松解腰方肌，前锯肌，髂腰肌
骨盆灵活，脊柱灵活
...

团课-核心激活
正位 调息
...
```

标题以 `私教-` / `团课-` / `波速球-` / `甜甜圈-` / `Tabata-` 开头即可，提交后刷新网页就生效，**不需要重新部署**。

注意：`web/补充数据.txt` 和项目根目录那份是两份拷贝，改完记得同步。

## 隐私

- 文本框里的姓名只在浏览器内存里，不会发到任何服务器（内容存在本机 localStorage，方便下次接着改）。
- 仓库里只放 `web/` 里的文件，那里没有学员信息。
- 项目里的 `待办.txt` / `9 月.txt` / `10 月.txt` 已**全部换成假名**（原文件备份在项目根目录 `原始备份_含真名/`，别公开、别提交）。
