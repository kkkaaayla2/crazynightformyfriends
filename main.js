/* ============================================================
 * 深夜局 · LATE NIGHT — 主交互逻辑
 *
 * 模块组成：
 *   - DataLoader     : 加载 4 个 JSON 数据
 *   - TicketRenderer : 渲染不同类型的票根卡片
 *   - TabController  : 底部 Tab 切换 + Pane 切换
 *   - ModeController : 幼儿园 ↔ 上高速 模式切换
 *   - StageController: 卡片切换、随机抽取、避免连续重复
 *   - SwipeHandler   : 触摸滑动切卡
 * ============================================================ */

(() => {
  'use strict';

  /* ---------- 全局状态 ---------- */
  const state = {
    data: {
      'grab-finger': null,
      'truth': null,
      'dare': null,
      'other-games': null,
    },
    activeTab: 'grab-finger',
    modes: {
      truth: 'kindergarten',
      dare: 'kindergarten',
    },
    lastCardIds: {
      'grab-finger': null,
      'truth-kindergarten': null,
      'truth-highway': null,
      'dare-kindergarten': null,
      'dare-highway': null,
      'other-games': null,
    },
    // 刚投的题目，下一次 renderStage 对应分类时优先展示（一次性）
    pendingShow: null,
  };

  // category → stage/mode 映射（投题 API 用的 category key）
  const CATEGORY_ROUTE = {
    'grab-finger': { stage: 'grab-finger', mode: null, lastKey: 'grab-finger' },
    'truth-kindergarten': { stage: 'truth', mode: 'kindergarten', lastKey: 'truth-kindergarten' },
    'truth-highway': { stage: 'truth', mode: 'highway', lastKey: 'truth-highway' },
    'dare-kindergarten': { stage: 'dare', mode: 'kindergarten', lastKey: 'dare-kindergarten' },
    'dare-highway': { stage: 'dare', mode: 'highway', lastKey: 'dare-highway' },
  };

  /* ---------- 工具函数 ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function pickRandom(arr, excludeId = null) {
    if (!arr || arr.length === 0) return null;
    if (arr.length === 1) return arr[0];
    let pick;
    let attempts = 0;
    do {
      pick = arr[Math.floor(Math.random() * arr.length)];
      attempts += 1;
    } while (excludeId && pick.id === excludeId && attempts < 8);
    return pick;
  }

  function padSerial(num, len = 3) {
    return String(num).padStart(len, '0');
  }

  function extractSerial(id) {
    const m = id && id.match(/(\d+)\s*$/);
    return m ? padSerial(parseInt(m[1], 10)) : '000';
  }

  /* ---------- 数据加载 ---------- */
  async function loadData() {
    const files = {
      'grab-finger': './data/grab-finger.json',
      'truth': './data/truth.json',
      'dare': './data/dare.json',
      'other-games': './data/other-games.json',
    };

    try {
      const entries = await Promise.all(
        Object.entries(files).map(async ([key, path]) => {
          const res = await fetch(`${path}?v=${Date.now()}`);
          if (!res.ok) throw new Error(`加载 ${path} 失败：${res.status}`);
          const json = await res.json();
          return [key, json];
        })
      );
      entries.forEach(([key, json]) => {
        state.data[key] = json;
      });
      return true;
    } catch (err) {
      console.error('[DataLoader] 加载数据失败：', err);
      showLoadError(err.message);
      return false;
    }
  }

  function showLoadError(msg) {
    const stages = $$('.card-stage');
    stages.forEach(stage => {
      stage.innerHTML = `
        <div class="ticket is-blood" style="transform: rotate(-1deg);">
          <div class="ticket-body">
            <div class="ticket-eyebrow">
              <span class="ticket-tag">SYSTEM</span>
              <span class="ticket-no">#ERR-001</span>
            </div>
            <div class="ticket-title">系统提示</div>
            <div class="ticket-content">
              数据加载失败<br/><br/>
              <span style="font-size: 14px; opacity: 0.8;">请通过本地服务器访问，例如：<br/>
              <code style="font-family: var(--font-mono); font-size: 12px;">python -m http.server</code><br/>
              然后打开 http://localhost:8000</span>
            </div>
          </div>
          <div class="ticket-perforation"></div>
          <div class="ticket-stub">
            <div class="stub-info">
              <span class="stub-label">ERROR</span>
              <span class="stub-serial">404</span>
            </div>
            <div class="stub-stamp"><span class="stamp-text">SYSTEM<br/>ERROR</span></div>
          </div>
        </div>
      `;
    });
  }

  /* ---------- 票根渲染 ---------- */
  const TICKET_PRESETS = {
    'grab-finger': {
      title: 'GRAB · 抓手指',
      tag: 'FINGER',
      stampText: '干杯<br/>CHEERS',
      themeClass: '',
    },
    'truth-kindergarten': {
      title: 'TRUTH · 真心话',
      tag: 'KINDER',
      stampText: '幼儿园<br/>SAFE',
      themeClass: '',
    },
    'truth-highway': {
      title: 'TRUTH · 真心话',
      tag: 'HIGHWAY',
      stampText: '上高速<br/>WILD',
      themeClass: 'is-blood',
    },
    'dare-kindergarten': {
      title: 'DARE · 大冒险',
      tag: 'KINDER',
      stampText: '幼儿园<br/>SAFE',
      themeClass: '',
    },
    'dare-highway': {
      title: 'DARE · 大冒险',
      tag: 'HIGHWAY',
      stampText: '上高速<br/>WILD',
      themeClass: 'is-fire',
    },
    'other-games': {
      title: 'GAME · 玩点别的',
      tag: 'EXTRA',
      stampText: '无需<br/>道具',
      themeClass: 'is-kraft',
    },
  };

  /**
   * 普通卡片字号策略（统一基础字号 24px + 超长兜底）
   *   ≤ 50 字：24px（统一基础字号）
   *   > 50 字：20px（兜底，避免撑爆卡片；现有题库极少数超长题才会触发）
   *
   * 新增题目硬上限：50 字
   */
  function getContentSizeClass(text) {
    const len = (text || '').length;
    if (len <= 50) return '';
    return 'size-fallback';
  }

  /**
   * 玩点别的卡片字号分档（基于总字符数：标题+描述+所有规则）
   * ≤ 130 字：默认 / 131-200 字：md / > 200 字：sm
   */
  function getGameSizeClass(data) {
    const totalLen = (data.gameName || '').length
      + (data.description || '').length
      + (data.rules || []).join('').length;
    if (totalLen <= 130) return '';
    if (totalLen <= 200) return 'size-md';
    return 'size-sm';
  }

  function buildTicket(stageKey, presetKey, data) {
    const preset = TICKET_PRESETS[presetKey];

    let bodyHTML = '';
    let extraTicketClass = '';

    if (stageKey === 'other-games') {
      const sizeCls = getGameSizeClass(data);
      if (sizeCls) extraTicketClass = sizeCls;
      const rulesHTML = (data.rules || []).map(r => `<li>${r}</li>`).join('');
      bodyHTML = `
        <div class="ticket-title">${preset.title}</div>
        <h2 class="ticket-game-name">${data.gameName}</h2>
        <p class="ticket-game-desc">${data.description || ''}</p>
        <ol class="ticket-game-rules">${rulesHTML}</ol>
      `;
    } else {
      const text = data.content || data.question || data.task || '';
      const sizeCls = getContentSizeClass(text);
      bodyHTML = `
        <div class="ticket-title">${preset.title}</div>
        <div class="ticket-content ${sizeCls}">${text}</div>
      `;
    }

    return `
      <article class="ticket ${preset.themeClass} ${extraTicketClass} enter">
        <div class="ticket-body">${bodyHTML}</div>
        <div class="ticket-perforation"></div>
        <div class="ticket-stub">
          <div class="stub-stamp">
            <span class="stamp-text">${preset.stampText}</span>
          </div>
        </div>
      </article>
    `;
  }

  /* ---------- 取卡 / 渲染舞台 ---------- */
  function getCardsForStage(stageKey) {
    const data = state.data[stageKey];
    if (!data) return { cards: [], presetKey: stageKey, lastKey: stageKey };

    if (stageKey === 'truth' || stageKey === 'dare') {
      const mode = state.modes[stageKey];
      return {
        cards: data.cards[mode] || [],
        presetKey: `${stageKey}-${mode}`,
        lastKey: `${stageKey}-${mode}`,
      };
    }

    return {
      cards: data.cards || [],
      presetKey: stageKey,
      lastKey: stageKey,
    };
  }

  function renderStage(stageKey, { animateOut = false } = {}) {
    const stage = document.querySelector(`.card-stage[data-stage="${stageKey}"]`);
    if (!stage) return;

    const { cards, presetKey, lastKey } = getCardsForStage(stageKey);
    if (cards.length === 0) return;

    let card = null;
    // 若投题回跳刚好匹配当前分类，优先展示这张新题（一次性）
    if (
      state.pendingShow &&
      state.pendingShow.lastKey === lastKey
    ) {
      card = cards.find(c => c.id === state.pendingShow.cardId) || null;
      state.pendingShow = null;
    }
    if (!card) {
      const lastId = state.lastCardIds[lastKey];
      card = pickRandom(cards, lastId);
    }
    if (!card) return;
    state.lastCardIds[lastKey] = card.id;

    const ticketHTML = buildTicket(stageKey, presetKey, card);
    const commit = () => {
      stage.innerHTML = ticketHTML;
      // 渲染完成后的下一帧再检测 overflow（要等浏览器完成 layout）
      requestAnimationFrame(() => {
        const body = stage.querySelector('.ticket-body');
        updateScrollableState(body);
      });
    };

    if (animateOut && stage.firstElementChild) {
      const oldTicket = stage.firstElementChild;
      oldTicket.classList.remove('enter');
      oldTicket.classList.add('leave');
      setTimeout(commit, 240);
    } else {
      commit();
    }
  }

  /* ---------- 滚动条按需显示 ----------
   * 用户原话："只在文字部分无法一屏展示时，才给出滚条"
   * 默认 .ticket-body 的滚动条样式被 CSS 隐藏；
   * 只有真正 scrollHeight > clientHeight 时，才加 .is-scrollable 把滚条显出来。 */
  function updateScrollableState(body) {
    if (!body || !body.isConnected) return;
    // 2px 容差，避免 subpixel 渲染误判
    const overflows = body.scrollHeight - body.clientHeight > 2;
    body.classList.toggle('is-scrollable', overflows);
  }

  function recheckAllBodies() {
    document.querySelectorAll('.ticket-body').forEach(updateScrollableState);
  }

  /* ---------- Tab 切换 ---------- */
  function initTabs() {
    const tabBar = $('.tab-bar');
    const panes = $$('.tab-pane');

    tabBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-item');
      if (!btn) return;
      const tabKey = btn.dataset.tab;
      if (!tabKey || tabKey === state.activeTab) return;

      state.activeTab = tabKey;

      $$('.tab-item').forEach(t => {
        const active = t.dataset.tab === tabKey;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      panes.forEach(p => {
        p.classList.toggle('is-active', p.dataset.pane === tabKey);
      });

      const stage = $(`.card-stage[data-stage="${tabKey}"]`);
      if (stage && !stage.firstElementChild) {
        renderStage(tabKey);
      } else if (stage) {
        // 已渲染过的 pane 之前可能因 display 隐藏导致 overflow 检测错误，
        // 切回时重新评估
        requestAnimationFrame(() => {
          updateScrollableState(stage.querySelector('.ticket-body'));
        });
      }
    });
  }

  /* ---------- 模式切换（点击两侧 + 横向拖拽） ---------- */
  function initModeSwitchers() {
    $$('.mode-switcher').forEach(switcher => {
      const stageKey = switcher.dataset.modeSwitcher;

      function setMode(target) {
        if (!target || state.modes[stageKey] === target) return;
        state.modes[stageKey] = target;
        switcher.dataset.mode = target;
        switcher.querySelectorAll('.mode-side').forEach(side => {
          side.classList.toggle('is-active', side.dataset.modeTarget === target);
        });
        renderStage(stageKey, { animateOut: true });
      }

      let startX = 0;
      let startY = 0;
      let isDragging = false;
      let dragMoved = false;
      const DRAG_THRESHOLD = 8;
      const SWITCH_THRESHOLD = 30;

      const onDown = (e) => {
        const p = e.touches ? e.touches[0] : e;
        startX = p.clientX;
        startY = p.clientY;
        isDragging = true;
        dragMoved = false;
        if (e.pointerId !== undefined && switcher.setPointerCapture) {
          try { switcher.setPointerCapture(e.pointerId); } catch (_) {}
        }
      };

      const onMove = (e) => {
        if (!isDragging) return;
        const p = e.touches ? e.touches[0] : e;
        const dx = p.clientX - startX;
        const dy = p.clientY - startY;
        if (!dragMoved && Math.abs(dx) > DRAG_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
          dragMoved = true;
        }
        if (dragMoved && e.cancelable) e.preventDefault();
      };

      const onUp = (e) => {
        if (!isDragging) return;
        isDragging = false;
        const p = e.changedTouches ? e.changedTouches[0] : e;
        const dx = p.clientX - startX;
        const dy = p.clientY - startY;
        if (Math.abs(dx) > SWITCH_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
          setMode(dx > 0 ? 'highway' : 'kindergarten');
        }
      };

      // 优先用 pointer events（桌面 + 移动一致）
      if (window.PointerEvent) {
        switcher.addEventListener('pointerdown', onDown);
        switcher.addEventListener('pointermove', onMove);
        switcher.addEventListener('pointerup', onUp);
        switcher.addEventListener('pointercancel', onUp);
      } else {
        switcher.addEventListener('touchstart', onDown, { passive: true });
        switcher.addEventListener('touchmove', onMove, { passive: false });
        switcher.addEventListener('touchend', onUp, { passive: true });
        switcher.addEventListener('touchcancel', onUp, { passive: true });
      }

      // 点击两侧文字也能切换；拖动判定后吞掉本次 click
      switcher.addEventListener('click', (e) => {
        if (dragMoved) {
          dragMoved = false;
          e.stopPropagation();
          e.preventDefault();
          return;
        }
        const btn = e.target.closest('.mode-side');
        if (!btn) return;
        setMode(btn.dataset.modeTarget);
      });
    });
  }

  /* ---------- 卡片切换：点击 / 按钮 ---------- */
  function initShuffle() {
    $$('.shuffle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const stageKey = btn.dataset.shuffle;
        dismissSwipeHint();
        markSwiped();
        renderStage(stageKey, { animateOut: true });
      });
    });

    $$('.card-stage').forEach(stage => {
      const stageKey = stage.dataset.stage;
      stage.addEventListener('click', (e) => {
        const ticket = e.target.closest('.ticket');
        if (!ticket) return;
        if (ticket.classList.contains('leave')) return;
        dismissSwipeHint();
        markSwiped();
        renderStage(stageKey, { animateOut: true });
      });
    });
  }

  /* ---------- 滑动手势引导：卡片首次 peek 动画 ----------
   * 反思旧方案：弹一个手指图标的胶囊提示是典型的 "AI 自动加 onboarding"，
   *   ① 挡视线 ② 与设计语言（牛皮纸票根 + amber）格格不入 ③ 显得不自信
   * 新方案：进入页面 1.4s 后，让卡片本身做一次"被左滑"的小动作
   *   —— 比任何文字提示都直观地告诉"这玩意儿能左右滑"
   * 触发条件：每个 session 仅 1 次；用户提前做出任何手势/点击即取消并标记。 */
  const HINT_KEY = 'cn_swipe_hint_seen';
  const PEEK_DELAY = 1400;  // 让 enter 动画走完（520ms）+ 留出阅读时间
  const PEEK_DURATION = 1100; // 与 CSS 动画时长保持一致
  let peekTriggerTimer = null;
  let peekTicketEl = null;

  function showSwipeHintIfNeeded() {
    try {
      if (sessionStorage.getItem(HINT_KEY)) return;
    } catch (_) { /* 隐私模式可能抛错，忽略 */ }

    // 初次渲染后 ticket 在 DOM 里要再等一下 enter 动画
    peekTriggerTimer = setTimeout(() => {
      const stage = document.querySelector('.tab-pane.is-active .card-stage');
      const ticket = stage && stage.querySelector('.ticket');
      if (!ticket) return;

      peekTicketEl = ticket;
      ticket.classList.add('first-visit-peek');

      // 动画结束后清理 class，并标记已看过
      const cleanup = () => {
        ticket.classList.remove('first-visit-peek');
        peekTicketEl = null;
        try { sessionStorage.setItem(HINT_KEY, '1'); } catch (_) {}
      };
      ticket.addEventListener('animationend', cleanup, { once: true });
      // 兜底：万一 animationend 没触发，超时清理
      setTimeout(cleanup, PEEK_DURATION + 200);
    }, PEEK_DELAY);
  }

  function dismissSwipeHint() {
    if (peekTriggerTimer) {
      clearTimeout(peekTriggerTimer);
      peekTriggerTimer = null;
    }
    if (peekTicketEl) {
      peekTicketEl.classList.remove('first-visit-peek');
      peekTicketEl = null;
    }
    try { sessionStorage.setItem(HINT_KEY, '1'); } catch (_) {}
  }

  /* 用户做出第一次有效手势后，把页面级 affordance 永久淡出。
   * 用 sessionStorage 记忆，避免后续刷新又跳出来。 */
  const SWIPE_DONE_KEY = 'cn_swipe_done';
  function markSwiped() {
    const app = document.getElementById('app');
    if (app && !app.classList.contains('has-swiped')) {
      app.classList.add('has-swiped');
    }
    try { sessionStorage.setItem(SWIPE_DONE_KEY, '1'); } catch (_) {}
  }
  function restoreSwipedState() {
    try {
      if (sessionStorage.getItem(SWIPE_DONE_KEY)) {
        const app = document.getElementById('app');
        if (app) app.classList.add('has-swiped');
      }
    } catch (_) {}
  }

  /* ---------- 滑动手势 ----------
   * 架构反思（V4）：
   *   - card-stage 自身不滚动；只有内部 .ticket-body 在内容超长时纵向滚动
   *   - touchmove 非 passive：一旦判定为横向手势就 preventDefault，
   *     避免被 ticket-body 的纵向滚动抢走
   *   - 阈值 35px：小幅滑动也能切卡，避免「拖一点点没反应」
   *   - dx >= dy 就算横向（比之前 1.2 倍宽容）：
   *     用户左上对角拖也会切卡，对应"图1：往左上拖应该切下一张"的诉求
   */
  function initSwipe() {
    $$('.card-stage').forEach(stage => {
      const stageKey = stage.dataset.stage;
      const SWIPE_THRESHOLD = 35;
      const HORIZONTAL_LOCK = 8;
      let startX = 0;
      let startY = 0;
      let isTracking = false;
      let isHorizontal = false;

      stage.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isTracking = true;
        isHorizontal = false;
      }, { passive: true });

      stage.addEventListener('touchmove', (e) => {
        if (!isTracking || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        if (!isHorizontal && Math.abs(dx) > HORIZONTAL_LOCK && Math.abs(dx) >= Math.abs(dy)) {
          isHorizontal = true;
        }
        if (isHorizontal && e.cancelable) {
          e.preventDefault();
        }
      }, { passive: false });

      stage.addEventListener('touchend', (e) => {
        if (!isTracking) return;
        isTracking = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) >= Math.abs(dy)) {
          dismissSwipeHint();
          markSwiped();
          renderStage(stageKey, { animateOut: true });
        }
      }, { passive: true });

      stage.addEventListener('touchcancel', () => {
        isTracking = false;
        isHorizontal = false;
      }, { passive: true });
    });
  }

  /* ---------- 投题回跳：合并 sessionStorage 中的新题，切换到对应分类 ---------- */
  function injectPendingCard(category, card) {
    if (!card || !card.id) return;
    const route = CATEGORY_ROUTE[category];
    if (!route) return;
    const root = state.data[route.stage];
    if (!root) return;
    if (route.mode) {
      if (!root.cards) root.cards = {};
      if (!Array.isArray(root.cards[route.mode])) root.cards[route.mode] = [];
      if (root.cards[route.mode].some(c => c.id === card.id)) return;
      root.cards[route.mode].push(card);
    } else {
      if (!Array.isArray(root.cards)) root.cards = [];
      if (root.cards.some(c => c.id === card.id)) return;
      root.cards.push(card);
    }
  }

  function mergePendingCards() {
    try {
      const raw = sessionStorage.getItem('cn_pending_cards');
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (!Array.isArray(pending) || pending.length === 0) {
        sessionStorage.removeItem('cn_pending_cards');
        return;
      }
      pending.forEach(item => {
        if (item && item.category && item.card) {
          injectPendingCard(item.category, item.card);
        }
      });
    } catch (err) {
      console.warn('[pending] 合并本地新题失败：', err);
    }
  }

  function switchToTab(tabKey) {
    if (!tabKey || tabKey === state.activeTab) return;
    state.activeTab = tabKey;
    $$('.tab-item').forEach(t => {
      const active = t.dataset.tab === tabKey;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    $$('.tab-pane').forEach(p => {
      p.classList.toggle('is-active', p.dataset.pane === tabKey);
    });
  }

  function handleFromSubmit() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('from') !== 'submit') return;
    const category = params.get('category');
    const route = CATEGORY_ROUTE[category];
    if (!route) return;

    // 从 pending 列表里拿到最近一条匹配的卡，设置为"优先展示"
    try {
      const raw = sessionStorage.getItem('cn_pending_cards');
      if (raw) {
        const pending = JSON.parse(raw);
        const match = [...pending].reverse().find(p => p && p.category === category);
        if (match && match.card && match.card.id) {
          state.pendingShow = { lastKey: route.lastKey, cardId: match.card.id };
        }
      }
    } catch (_) {}

    // 切到对应 tab
    switchToTab(route.stage);

    // 若是真心话/大冒险，切到对应模式
    if (route.mode && (route.stage === 'truth' || route.stage === 'dare')) {
      state.modes[route.stage] = route.mode;
      const switcher = $(`.mode-switcher[data-mode-switcher="${route.stage}"]`);
      if (switcher) {
        switcher.dataset.mode = route.mode;
        switcher.querySelectorAll('.mode-side').forEach(s => {
          s.classList.toggle('is-active', s.dataset.modeTarget === route.mode);
        });
      }
    }

    // 立刻渲染新题
    renderStage(route.stage);

    // 清除 URL 参数，避免刷新再次触发
    window.history.replaceState({}, '', window.location.pathname);
  }

  /* ---------- 品牌文字：根据当天星期几更新 ---------- */
  function setBrandWeekday() {
    const days = ['天', '一', '二', '三', '四', '五', '六'];
    const weekday = days[new Date().getDay()];
    const text = `疯狂星期${weekday}`;
    const el = document.getElementById('brandCnText');
    if (el) el.textContent = text;
    document.title = `${text} · CRAZY NIGHT`;
  }

  /* ---------- 初始化 ---------- */
  async function init() {
    setBrandWeekday();

    const ok = await loadData();
    if (!ok) return;

    // 合并本地刚投递、但远端尚未同步的新题
    mergePendingCards();

    initTabs();
    initModeSwitchers();
    initShuffle();
    initSwipe();
    restoreSwipedState();

    // 优先处理投题回跳（会切 tab、切模式、渲染刚投的题）
    const fromSubmit = new URLSearchParams(window.location.search).get('from') === 'submit';
    if (fromSubmit) {
      handleFromSubmit();
    } else {
      renderStage('grab-finger');
    }

    // 显示首次访问的滑动手势引导
    showSwipeHintIfNeeded();

    // viewport 变化（旋屏 / 软键盘）后重新检测每张卡片的溢出
    window.addEventListener('resize', recheckAllBodies);
    // 字体加载完成后再校一次 —— webfont 加载会改变文字高度，
    // 第一次 layout 时拿到的可能是 fallback 字号
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(recheckAllBodies);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
