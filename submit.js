/* ============================================================
 * 投题页交互逻辑
 *   - 分类选择（chip 单选）
 *   - 题目内容实时字数计数 + 超限标红
 *   - 提交前本地校验 + POST /api/submit
 *   - 成功后将本次新题写入 sessionStorage，供主页临时注入（30 秒内其他人看不到）
 * ============================================================ */

(() => {
  'use strict';

  const MAX_CONTENT = 50;
  const MAX_AUTHOR = 20;

  const $ = (sel) => document.querySelector(sel);

  const form = $('#submitForm');
  const textarea = $('#contentInput');
  const charCount = $('#charCount');
  const charCounter = $('#charCounter');
  const authorInput = $('#authorInput');
  const secretInput = $('#secretInput');
  const statusEl = $('#formStatus');
  const submitBtn = $('#submitBtn');
  const categoryChips = document.querySelectorAll('.category-chip');

  let selectedCategory = 'grab-finger';

  // 记住上次填写的昵称与密钥（密钥可选，为了方便朋友连续投）
  const LS_AUTHOR = 'cn_submit_author';
  const LS_SECRET = 'cn_submit_secret';

  function init() {
    const savedAuthor = localStorage.getItem(LS_AUTHOR);
    if (savedAuthor) authorInput.value = savedAuthor;
    const savedSecret = sessionStorage.getItem(LS_SECRET);
    if (savedSecret) secretInput.value = savedSecret;

    // 分类 chip 单选
    categoryChips.forEach(chip => {
      chip.addEventListener('click', () => {
        categoryChips.forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        selectedCategory = chip.dataset.category;
      });
    });

    // 字数计数
    textarea.addEventListener('input', updateCharCounter);
    updateCharCounter();

    // 提交
    form.addEventListener('submit', handleSubmit);
  }

  function updateCharCounter() {
    const len = [...textarea.value].length; // 按 codepoint 数（支持 emoji、多字节）
    charCount.textContent = String(len);

    charCounter.classList.remove('is-warn', 'is-over');
    textarea.classList.remove('is-over');

    if (len > MAX_CONTENT) {
      charCounter.classList.add('is-over');
      textarea.classList.add('is-over');
    } else if (len >= MAX_CONTENT - 5) {
      charCounter.classList.add('is-warn');
    }
  }

  function showStatus(message, type = 'error') {
    statusEl.textContent = message;
    statusEl.classList.remove('is-error', 'is-success');
    statusEl.classList.add(type === 'success' ? 'is-success' : 'is-error');
    statusEl.classList.add('is-visible');
  }

  function hideStatus() {
    statusEl.classList.remove('is-visible');
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.classList.toggle('is-loading', loading);
    const label = submitBtn.querySelector('.submit-btn-label');
    if (label) label.textContent = loading ? '提 交 中…' : '去 提 交';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    hideStatus();

    const content = textarea.value.trim();
    const author = authorInput.value.trim();
    const secret = secretInput.value.trim();

    if (!content) {
      showStatus('题目内容不能为空');
      textarea.focus();
      return;
    }
    if ([...content].length > MAX_CONTENT) {
      showStatus(`题目不能超过 ${MAX_CONTENT} 字`);
      textarea.focus();
      return;
    }
    if (!author) {
      showStatus('请填写昵称');
      authorInput.focus();
      return;
    }
    if ([...author].length > MAX_AUTHOR) {
      showStatus(`昵称不能超过 ${MAX_AUTHOR} 字`);
      authorInput.focus();
      return;
    }
    if (!secret) {
      showStatus('请填写投题密钥');
      secretInput.focus();
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: selectedCategory,
          content,
          author,
          secret,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        showStatus(json.error || `提交失败（${res.status}）`);
        setLoading(false);
        return;
      }

      // 本地保存昵称，方便下次；密钥只存 session 避免留痕
      localStorage.setItem(LS_AUTHOR, author);
      sessionStorage.setItem(LS_SECRET, secret);

      // 把本次新题塞进 sessionStorage，主页读取后临时注入 state.data
      // 这样提交者立刻能看到自己加的题；其他用户需等 Vercel 重新部署后刷新
      const pending = JSON.parse(sessionStorage.getItem('cn_pending_cards') || '[]');
      pending.push({
        category: selectedCategory,
        card: json.card,
      });
      sessionStorage.setItem('cn_pending_cards', JSON.stringify(pending));

      showStatus(
        `✓ 「${author}」的这张卡已加入题库！正在跳回首页…（其他人约 30 秒后可见）`,
        'success'
      );

      // 清空内容，跳回首页
      textarea.value = '';
      updateCharCounter();

      setTimeout(() => {
        window.location.href = './index.html?from=submit&category=' + encodeURIComponent(selectedCategory);
      }, 1200);
    } catch (err) {
      console.error('[submit] 请求失败:', err);
      showStatus('网络异常，请稍后重试');
      setLoading(false);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
