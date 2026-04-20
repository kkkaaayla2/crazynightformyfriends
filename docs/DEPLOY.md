# 部署手册 · 疯狂星期X

本项目采用 **GitHub + Vercel** 的方案：

- 静态资源（HTML/CSS/JS/JSON）由 Vercel CDN 分发
- 投题功能通过 Vercel Serverless Function（`/api/submit`）调用 GitHub API，把新题以 commit 形式写回仓库
- 每次投题成功 → GitHub 有新 commit → Vercel 自动重新部署（约 30 秒）→ 所有人都能看到新题

---

## 一、初次部署（只做一次，约 15 分钟）

### 步骤 1：把项目推到 GitHub

```bash
# 在项目根目录
git init
git add .
git commit -m "chore: initial commit"

# 在 GitHub 上新建一个空仓库（假设叫 crazy-night），然后：
git branch -M main
git remote add origin https://github.com/<你的用户名>/crazy-night.git
git push -u origin main
```

### 步骤 2：创建 GitHub Personal Access Token（PAT）

这是让 Vercel Function 代表你提交 commit 的凭证。

1. 打开 https://github.com/settings/tokens?type=beta
2. 点 **Generate new token** → **Fine-grained tokens**
3. 配置：
   - **Token name**：`crazy-night-submit-api`
   - **Expiration**：按需选（建议 1 年或无过期）
   - **Repository access** → **Only select repositories** → 选 `crazy-night` 仓库
   - **Permissions** → **Repository permissions** → 把以下两项设为 **Read and write**：
     - `Contents`
     - （其他保持默认 No access）
4. 点 **Generate token**，**立刻复制 token**（只显示一次，关了就看不到）

### 步骤 3：在 Vercel 导入仓库

1. 登录 https://vercel.com
2. **Add New** → **Project**
3. 选刚刚推到 GitHub 的 `crazy-night` 仓库，点 **Import**
4. 不用改任何设置（Framework Preset 选 **Other** 即可），点 **Deploy**
5. 等 1-2 分钟，拿到默认域名 `https://crazy-night-xxx.vercel.app`

### 步骤 4：在 Vercel 配置环境变量

这一步**非常关键**，没配好投题会 500。

1. 打开 Vercel 项目 → **Settings** → **Environment Variables**
2. 逐个添加（4 条都选 **Production / Preview / Development** 都勾上）：

| Name | Value | 说明 |
|------|-------|------|
| `SUBMIT_SECRET` | 你自己起的密码，比如 `crazy2026` | 朋友投题要填的密钥 |
| `GITHUB_TOKEN` | 步骤 2 复制的那串 `github_pat_...` | |
| `GITHUB_OWNER` | 你的 GitHub 用户名，如 `yourname` | |
| `GITHUB_REPO` | `crazy-night` | 仓库名 |

（可选）`GITHUB_BRANCH` 默认 `main`，不用配。

3. 添加完后，回到 **Deployments**，点最新那次部署右边 `⋯` → **Redeploy**（让新变量生效）

### 步骤 5：测试投题

1. 打开你的网站 `https://crazy-night-xxx.vercel.app`
2. 点右上角 `+` 按钮 → 进入投题页
3. 选分类 → 写题 → 填昵称 → 填密钥 → 投出
4. 看到 "✓ 已投递" → 1-2 秒后自动跳回首页，立刻看到这张新题
5. 打开 GitHub 仓库 → **Commits** → 应该能看到一条新 commit `chore(data): add xxx by 你`
6. 等 30 秒左右，**换一个无痕浏览器** 打开网站 → 也能看到这张新题（说明全球同步完成）

---

## 二、日常操作

### 更新投题密钥

1. Vercel → Settings → Environment Variables → 改 `SUBMIT_SECRET` → Save
2. 回到 Deployments → 最新部署 → Redeploy（10 秒生效）
3. 把新密钥发给朋友

### 查看/删除某条朋友加的题

1. GitHub 打开仓库 → `data/xxx.json` → 点铅笔图标直接在网页编辑
2. 删掉某条 → Commit → 30 秒后线上同步

### 手动加题（不走投题页）

还是老办法：在 Cursor 里改 `data/xxx.json` → git commit + push → 30 秒后线上生效。

### 换新域名

Vercel → Settings → Domains → Add 你自己买的域名（需要改 DNS），或者 Vercel 提供的免费子域名即可。

---

## 三、本地开发

### 静态开发（不含投题功能）

```bash
# 在项目根目录
python -m http.server 8000 --bind 127.0.0.1
# 浏览器打开 http://127.0.0.1:8000
```

此时 `/submit.html` 能打开，但点投题会 404（因为本地没有 Serverless Function）。

### 含投题 API 的本地开发（可选）

```bash
# 第一次：安装 Vercel CLI
npm install -g vercel

# 登录
vercel login

# 项目目录下安装依赖
npm install

# 本地开发模式（含 Function 模拟）
vercel dev
# 默认 http://localhost:3000
```

此时投题也能用，但仍会真的往 GitHub 提 commit（本地也走真实 API）。

---

## 四、排错

| 症状 | 可能原因 | 排查 |
|------|---------|------|
| 投题返回 401 密钥不正确 | 密钥拼错 or 环境变量没部署 | 确认 Vercel Redeploy 过一次 |
| 投题返回 500 `未配置 GitHub 相关环境变量` | 环境变量缺字段 | 检查 4 个变量都有 |
| 投题返回 401 `Bad credentials` | `GITHUB_TOKEN` 过期或权限不对 | 重新生成 PAT，Contents: Read and write |
| 投题返回 404 | `GITHUB_OWNER` / `GITHUB_REPO` 拼错 | 确认仓库全名 |
| 投题成功但 30 秒后其他人看不到 | Vercel 没自动重新部署 | Vercel → Deployments 看有没有新部署在进行 |
| 提交者自己看不到刚加的题 | sessionStorage 被清了 | 浏览器开发者模式看 Application → Session Storage |

---

## 五、安全注意

- `GITHUB_TOKEN` **绝对不能提交进 git 仓库**。只放在 Vercel 环境变量里。
- `SUBMIT_SECRET` 也尽量别公开。朋友私下问你要。
- 如果 token 泄漏了，去 GitHub 删掉那个 token 重新生成即可。
- `data/*.json` 里会存朋友的 `author` 昵称。如果某位朋友希望匿名，告诉他随便填个化名即可。

---

## 六、扩展思路（以后想做再说）

- **审核机制**：新题先进 `data/pending.json`，你审核后手动合并到正式题库
- **多密钥**：每个朋友一个独立密钥（改 `SUBMIT_SECRET` 为 JSON 映射）
- **删题接口**：加一个 `/api/delete` 让你在线删题（需要主人密钥）
- **统计面板**：看看谁加的题被抽中最多
- **微信分享优化**：加 Open Graph meta，分享到微信时有漂亮预览图
