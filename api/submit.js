/**
 * Vercel Serverless Function：接收投题请求，验证后通过 GitHub API 追加到 data/*.json
 *
 * 必需的环境变量（在 Vercel Project Settings → Environment Variables 里配置）：
 *   - SUBMIT_SECRET   : 你设定的投题密钥（朋友填这个才能通过）
 *   - GITHUB_TOKEN    : GitHub Personal Access Token（需 contents:write 权限）
 *   - GITHUB_OWNER    : 你的 GitHub 用户名
 *   - GITHUB_REPO     : 仓库名
 *   - GITHUB_BRANCH   : 目标分支（默认 main）
 */

import { Octokit } from '@octokit/rest';

const MAX_CONTENT_LEN = 50;
const MAX_AUTHOR_LEN = 20;

const CATEGORY_META = {
  'grab-finger': {
    file: 'data/grab-finger.json',
    idPrefix: 'gf_',
    fieldName: 'content',
    pathType: 'flat',
  },
  'truth-kindergarten': {
    file: 'data/truth.json',
    idPrefix: 'tr_k_',
    fieldName: 'question',
    pathType: 'mode',
    mode: 'kindergarten',
  },
  'truth-highway': {
    file: 'data/truth.json',
    idPrefix: 'tr_h_',
    fieldName: 'question',
    pathType: 'mode',
    mode: 'highway',
  },
  'dare-kindergarten': {
    file: 'data/dare.json',
    idPrefix: 'da_k_',
    fieldName: 'task',
    pathType: 'mode',
    mode: 'kindergarten',
  },
  'dare-highway': {
    file: 'data/dare.json',
    idPrefix: 'da_h_',
    fieldName: 'task',
    pathType: 'mode',
    mode: 'highway',
  },
};

function sanitize(text) {
  return String(text || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
}

function getNextId(existingCards, idPrefix) {
  let maxNum = 0;
  const regex = new RegExp(`^${idPrefix.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(\\d+)$`);
  existingCards.forEach(card => {
    if (!card || !card.id) return;
    const m = card.id.match(regex);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  });
  const next = maxNum + 1;
  return `${idPrefix}${String(next).padStart(3, '0')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { secret, category, content, author } = req.body || {};

  if (!process.env.SUBMIT_SECRET) {
    return res.status(500).json({ error: '服务器未配置 SUBMIT_SECRET' });
  }
  if (sanitize(secret) !== process.env.SUBMIT_SECRET) {
    return res.status(401).json({ error: '密钥不正确' });
  }

  const meta = CATEGORY_META[category];
  if (!meta) {
    return res.status(400).json({ error: '未知分类' });
  }

  const cleanContent = sanitize(content);
  if (!cleanContent) {
    return res.status(400).json({ error: '题目内容不能为空' });
  }
  if ([...cleanContent].length > MAX_CONTENT_LEN) {
    return res.status(400).json({ error: `题目不能超过 ${MAX_CONTENT_LEN} 字` });
  }

  const cleanAuthor = sanitize(author);
  if (!cleanAuthor) {
    return res.status(400).json({ error: '请填写昵称' });
  }
  if ([...cleanAuthor].length > MAX_AUTHOR_LEN) {
    return res.status(400).json({ error: `昵称不能超过 ${MAX_AUTHOR_LEN} 字` });
  }

  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return res.status(500).json({ error: '服务器未配置 GitHub 相关环境变量' });
  }

  const octokit = new Octokit({ auth: GITHUB_TOKEN });

  try {
    // 1. 读取现有 JSON 文件内容及 SHA
    const fileRes = await octokit.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: meta.file,
      ref: branch,
    });

    if (Array.isArray(fileRes.data)) {
      return res.status(500).json({ error: '目标路径不是文件' });
    }

    const currentSha = fileRes.data.sha;
    const rawContent = Buffer.from(fileRes.data.content, 'base64').toString('utf-8');
    const json = JSON.parse(rawContent);

    // 2. 生成新条目并追加
    const existingCards = meta.pathType === 'mode'
      ? (json.cards?.[meta.mode] || [])
      : (json.cards || []);

    const newId = getNextId(existingCards, meta.idPrefix);
    const submittedAt = new Date().toISOString();

    const newCard = {
      id: newId,
      [meta.fieldName]: cleanContent,
      author: cleanAuthor,
      submittedAt,
    };

    if (meta.pathType === 'mode') {
      if (!json.cards) json.cards = {};
      if (!Array.isArray(json.cards[meta.mode])) json.cards[meta.mode] = [];
      json.cards[meta.mode].push(newCard);
    } else {
      if (!Array.isArray(json.cards)) json.cards = [];
      json.cards.push(newCard);
    }

    const updatedContent = JSON.stringify(json, null, 2) + '\n';
    const encodedContent = Buffer.from(updatedContent, 'utf-8').toString('base64');

    // 3. 提交到 GitHub（会自动触发 Vercel 重新部署）
    const commitMsg = `chore(data): add ${category} card ${newId} by ${cleanAuthor}`;
    await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: meta.file,
      message: commitMsg,
      content: encodedContent,
      sha: currentSha,
      branch,
    });

    return res.status(200).json({
      ok: true,
      id: newId,
      category,
      card: newCard,
      message: '提交成功！约 30 秒后对其他人可见。',
    });
  } catch (err) {
    console.error('[api/submit] Error:', err);
    const status = err.status || 500;
    const message = err.message || '服务器错误';
    return res.status(status).json({ error: message });
  }
}
