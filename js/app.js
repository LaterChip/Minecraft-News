/* ========================================================================
   Minecraft 每日信息站 - 主逻辑
   依赖: 无 (纯原生 JS)
   ======================================================================== */

(() => {
  'use strict';

  // ==================== 工具函数 ====================

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const safeText = (v, fallback = '—') => {
    if (v === null || v === undefined || v === '') return fallback;
    return String(v);
  };

  const fmtDate = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
        hour12: false, timeZone: 'Asia/Shanghai',
      });
    } catch { return iso; }
  };

  const fmtDateShort = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleDateString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        timeZone: 'Asia/Shanghai',
      });
    } catch { return iso; }
  };

  const escapeHTML = (s) => {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const debounce = (fn, delay = 200) => {
    let t = null;
    return (...args) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  };

  // ==================== 状态 ====================

  const STATE = {
    data: null,
    meta: null,
    settings: {
      anim: true,
      newsLimit: 12,
      clock24: true,
      density: false,
    },
  };

  // 从 localStorage 加载设置
  const loadSettings = () => {
    try {
      const raw = localStorage.getItem('mcnews-settings');
      if (raw) {
        const s = JSON.parse(raw);
        Object.assign(STATE.settings, s);
      }
    } catch (e) { /* ignore */ }
  };

  const saveSettings = () => {
    try {
      localStorage.setItem('mcnews-settings', JSON.stringify(STATE.settings));
    } catch (e) { /* ignore */ }
  };

  // ==================== Toast ====================

  const toasts = $('#toasts');
  const toast = (msg, kind = 'ok', ttl = 3000) => {
    if (!toasts) return;
    const el = document.createElement('div');
    el.className = 'toast' + (kind === 'err' ? ' err' : kind === 'warn' ? ' warn' : '');
    el.innerHTML = `<span aria-hidden="true">${kind === 'err' ? '⚠' : kind === 'warn' ? '⚠' : '✓'}</span><span>${escapeHTML(msg)}</span>`;
    toasts.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s, transform .3s';
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(() => el.remove(), 300);
    }, ttl);
  };

  // ==================== 时钟 ====================

  const updateClock = () => {
    const now = new Date();
    const time = STATE.settings.clock24
      ? now.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'Asia/Shanghai' })
      : now.toLocaleTimeString('en-US', { hour12: true, timeZone: 'Asia/Shanghai' });
    const date = now.toLocaleDateString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
      timeZone: 'Asia/Shanghai',
    });
    const tEl = $('#clock-time');
    const dEl = $('#clock-date');
    if (tEl) tEl.textContent = time;
    if (dEl) dEl.textContent = date;
  };

  // ==================== 数据加载 ====================

  const loadData = async () => {
    try {
      const res = await fetch(`data/latest.json?_t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      STATE.data = data;
      STATE.meta = data.meta || {};
      render();
      toast('数据已加载');
    } catch (e) {
      console.error('loadData failed', e);
      toast('数据加载失败, 尝试从子文件加载...', 'warn');
      // fallback: 逐个加载
      await loadFallback();
    }
  };

  const loadFallback = async () => {
    try {
      const [java, bedrock, netease] = await Promise.all([
        fetch('data/java.json').then(r => r.ok ? r.json() : null),
        fetch('data/bedrock.json').then(r => r.ok ? r.json() : null),
        fetch('data/netease.json').then(r => r.ok ? r.json() : null),
      ]);
      if (!java && !bedrock && !netease) {
        toast('所有数据文件均不可用', 'err');
        return;
      }
      STATE.data = {
        java, bedrock, netease,
        meta: { generated_at: new Date().toISOString(), generator: 'fallback' },
      };
      render();
      toast('已加载分版本数据', 'warn');
    } catch (e) {
      console.error('fallback failed', e);
      toast('数据完全不可用, 请检查 data/ 目录', 'err', 5000);
    }
  };

  // ==================== 渲染 ====================

  const render = () => {
    if (!STATE.data) return;
    const intro = $('#intro-fetched');
    if (intro && STATE.meta && STATE.meta.generated_at) {
      intro.textContent = `上次抓取: ${fmtDate(STATE.meta.generated_at)} · 耗时: ${STATE.meta.elapsed_seconds || '?'}s`;
    }
    renderKPI();
    renderEdition('java');
    renderEdition('bedrock');
    renderEdition('netease');
    renderMeta();
  };

  const renderKPI = () => {
    const d = STATE.data;
    const m = STATE.meta || {};
    const stats = m.stats || {};

    // Java
    const javaLatest = d.java && d.java.latest_version;
    const javaSnap = d.java && d.java.upcoming_version;
    if (javaLatest && javaLatest.number) {
      $('[data-kpi="java-release"]').textContent = javaLatest.number;
      $('[data-kpi="java-release-sub"]').textContent = `发布: ${fmtDateShort(javaLatest.released)}`;
    } else {
      $('[data-kpi="java-release"]').textContent = '—';
      $('[data-kpi="java-release-sub"]').textContent = '暂无数据';
    }
    if (javaSnap && javaSnap.number) {
      $('[data-kpi="java-snap"]').textContent = javaSnap.number;
      $('[data-kpi="java-snap-sub"]').textContent = `发布: ${fmtDateShort(javaSnap.released)}`;
    } else {
      $('[data-kpi="java-snap"]').textContent = '—';
      $('[data-kpi="java-snap-sub"]').textContent = '暂无数据';
    }

    // Bedrock
    const bedLatest = d.bedrock && d.bedrock.latest_version;
    const bedPreview = d.bedrock && d.bedrock.upcoming_version;
    if (bedLatest && bedLatest.number) {
      $('[data-kpi="bedrock-release"]').textContent = bedLatest.number;
      $('[data-kpi="bedrock-release-sub"]').textContent = `发布: ${fmtDateShort(bedLatest.released) || '近期'}`;
    } else {
      $('[data-kpi="bedrock-release"]').textContent = '—';
      $('[data-kpi="bedrock-release-sub"]').textContent = '暂无数据';
    }
    if (bedPreview && bedPreview.number) {
      $('[data-kpi="bedrock-preview"]').textContent = bedPreview.number;
      $('[data-kpi="bedrock-preview-sub"]').textContent = `发布: ${fmtDateShort(bedPreview.released) || '近期'}`;
    } else {
      $('[data-kpi="bedrock-preview"]').textContent = '—';
      $('[data-kpi="bedrock-preview-sub"]').textContent = '暂无数据';
    }

    // Netease
    const ne = d.netease;
    if (ne && ne.latest_version && ne.latest_version.number) {
      $('[data-kpi="netease-status"]').textContent = '运营中';
      $('[data-kpi="netease-status-sub"]').textContent = '网易版持续更新中';
    } else {
      $('[data-kpi="netease-status"]').textContent = '—';
      $('[data-kpi="netease-status-sub"]').textContent = '暂无数据';
    }

    // Total
    const total = (stats.java_versions || 0) + (stats.bedrock_versions || 0) + (stats.netease_news || 0)
                + (stats.java_news || 0) + (stats.bedrock_news || 0)
                + (stats.java_features || 0) + (stats.bedrock_features || 0) + (stats.netease_features || 0);
    $('[data-kpi="total"]').textContent = total;
    $('[data-kpi="total-sub"]').textContent =
      `${stats.java_versions || 0} 版本 / ${(stats.java_news || 0) + (stats.bedrock_news || 0) + (stats.netease_news || 0)} 动态 / ${(stats.java_features || 0) + (stats.bedrock_features || 0) + (stats.netease_features || 0)} 特性`;
  };

  const renderEdition = (key) => {
    const ed = STATE.data[key];
    if (!ed) {
      $$(`[data-${key}]`).forEach(el => {
        if (el.classList.contains('empty')) return;
      });
      return;
    }

    // Stats chips
    $(`#${key}-stat-versions`).textContent = `${(ed.recent_versions || []).length} 版本`;
    $(`#${key}-stat-news`).textContent = `${(ed.recent_news || []).length} 动态`;
    $(`#${key}-stat-features`).textContent = `${(ed.features || []).length} 特性`;

    // VerCard
    const lv = ed.latest_version || {};
    const uv = ed.upcoming_version || {};
    setText(`[data-${key}="latest-num"]`, lv.number || '—');
    setText(`[data-${key}="latest-type"]`, lv.type || '—');
    setText(`[data-${key}="latest-date"]`, fmtDateShort(lv.released));
    setText(`[data-${key}="latest-source"]`, ed.source || '—');
    setHref(`[data-${key}="latest-link"]`, lv.url || '#');
    setText(`[data-${key}="upcoming-num"]`, uv.number || '—');
    setText(`[data-${key}="upcoming-type"]`, uv.type || '—');
    setText(`[data-${key}="upcoming-date"]`, fmtDateShort(uv.released));
    setHref(`[data-${key}="upcoming-link"]`, uv.url || '#');

    // Notes
    const noteEl = $(`[data-${key}="notes"]`);
    if (noteEl) {
      if (ed.notes && ed.notes.length) {
        noteEl.style.display = 'block';
        noteEl.innerHTML = ed.notes.map(n => `<div>📌 ${escapeHTML(n)}</div>`).join('');
        noteEl.className = 'callout info';
      } else {
        noteEl.style.display = 'none';
      }
    }

    // Features
    const fEl = $(`[data-${key}="features"]`);
    if (fEl) {
      const fs = ed.features || [];
      if (fs.length === 0) {
        fEl.innerHTML = '<div class="empty">暂无特性数据</div>';
      } else {
        fEl.innerHTML = fs.map(renderFeature).join('');
      }
    }

    // Timeline
    const tEl = $(`[data-${key}="timeline"]`);
    if (tEl) {
      const vs = (ed.recent_versions || []).slice(0, 12);
      if (vs.length === 0) {
        tEl.innerHTML = '<div class="empty">暂无版本数据</div>';
      } else {
        tEl.innerHTML = vs.map(renderTimelineItem).join('');
      }
    }

    // News
    const nEl = $(`[data-${key}="news"]`);
    const countEl = $(`#${key}-news-count`);
    if (nEl) {
      let news = ed.recent_news || [];
      if (STATE.settings.newsLimit && news.length > 12) news = news.slice(0, 12);
      if (countEl) countEl.textContent = `${(ed.recent_news || []).length}`;
      if (news.length === 0) {
        nEl.innerHTML = '<div class="empty">暂无新闻数据</div>';
      } else {
        nEl.innerHTML = news.map(renderNews).join('');
      }
    }

    // Bedrock table
    if (key === 'bedrock') {
      const tBody = $(`[data-bedrock="table"] tbody`);
      if (tBody) {
        const vs = (ed.recent_versions || []);
        if (vs.length === 0) {
          tBody.innerHTML = '<tr><td colspan="5" class="empty">暂无版本数据</td></tr>';
        } else {
          tBody.innerHTML = vs.map(v => `
            <tr>
              <td class="ver">${escapeHTML(v.number || '—')}</td>
              <td>${escapeHTML(v.type || '—')}</td>
              <td>${escapeHTML(fmtDateShort(v.released))}</td>
              <td>${escapeHTML(v.summary || '—')}</td>
              <td>${v.url ? `<a class="btn sm stone" href="${escapeHTML(v.url)}" target="_blank" rel="noopener">查看</a>` : ''}</td>
            </tr>
          `).join('');
        }
      }
    }
  };

  const setText = (sel, text) => {
    const el = $(sel);
    if (el) el.textContent = text;
  };
  const setHref = (sel, href) => {
    const el = $(sel);
    if (el) el.setAttribute('href', href || '#');
  };

  const renderFeature = (f) => {
    return `
      <div class="feature">
        <div class="icon">${escapeHTML(f.icon || '🌟')}</div>
        <h4>${escapeHTML(f.title || '')}</h4>
        <p>${escapeHTML(f.description || '')}</p>
        ${f.category ? `<span class="feat-tag">${escapeHTML(f.category)}</span>` : ''}
      </div>
    `;
  };

  const renderTimelineItem = (v) => {
    const date = fmtDateShort(v.released);
    const type = v.type || 'version';
    return `
      <div class="tl-item">
        <div class="when">${escapeHTML(date)}</div>
        <div class="what">${escapeHTML(v.number || v.name || '—')}</div>
        <div class="desc">${escapeHTML(v.summary || '')}</div>
        <div>
          <span class="badge">${escapeHTML(type)}</span>
          ${v.url ? `<a href="${escapeHTML(v.url)}" target="_blank" rel="noopener" style="font-size:11px;">Wiki ↗</a>` : ''}
        </div>
      </div>
    `;
  };

  const renderNews = (n) => {
    return `
      <a class="news" href="${escapeHTML(n.url || '#')}" target="_blank" rel="noopener">
        <div class="ico">📰</div>
        <div class="body">
          <div class="title">${escapeHTML(n.title || '')}</div>
          ${n.summary ? `<div class="sum">${escapeHTML(n.summary)}</div>` : ''}
          <div class="meta">
            <span>${escapeHTML(n.source || '')}</span>
            ${n.date ? `<span>·</span><span>${escapeHTML(n.date)}</span>` : ''}
            ${n.category ? `<span>·</span><span>${escapeHTML(n.category)}</span>` : ''}
          </div>
        </div>
      </a>
    `;
  };

  const renderMeta = () => {
    const m = STATE.meta || {};
    const stats = m.stats || {};
    const sources = m.sources || {};

    $('#meta-fetched').textContent = m.generated_at ? `抓取: ${fmtDate(m.generated_at)}` : '—';
    $('#meta-elapsed').textContent = m.elapsed_seconds ? `耗时: ${m.elapsed_seconds}s` : '—';

    const srcHTML = Object.entries(sources).map(([k, v]) => `
      <div style="padding:6px 0; border-bottom: 1px dashed var(--c-border);">
        <strong style="text-transform:uppercase; color: var(--c-gold); font-family: var(--font-mono); font-size:11px;">${escapeHTML(k)}</strong>
        <div style="font-size:12px; margin-top:2px; word-break: break-all;">
          <a href="${escapeHTML(v)}" target="_blank" rel="noopener">${escapeHTML(v)}</a>
        </div>
      </div>
    `).join('');
    $('#meta-sources').innerHTML = srcHTML || '<div class="empty">暂无数据</div>';

    const statsHTML = Object.entries(stats).map(([k, v]) => `
      <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom: 1px dashed var(--c-border);">
        <span style="font-family: var(--font-mono); font-size:11px; color: var(--c-text-dim); text-transform:uppercase;">${escapeHTML(k)}</span>
        <span style="font-family: var(--font-pixel); color: var(--c-gold);">${escapeHTML(String(v))}</span>
      </div>
    `).join('');
    $('#meta-stats').innerHTML = statsHTML || '<div class="empty">暂无数据</div>';

    $('#footer-meta').textContent =
      `Minecraft Daily · 数据更新于 ${fmtDate(m.generated_at) || '—'}`;
  };

  // ==================== 主题切换 ====================

  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('mcnews-theme', theme); } catch {}
  };
  const getTheme = () => document.documentElement.getAttribute('data-theme') || 'dark';
  const toggleTheme = () => {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    toast('主题已切换: ' + (next === 'dark' ? '深色' : '浅色'));
  };

  // ==================== 设置 ====================

  const applySettingsToUI = () => {
    const s = STATE.settings;
    const aEl = $('#set-anim'); if (aEl) aEl.checked = !!s.anim;
    const nEl = $('#set-news-limit'); if (nEl) nEl.checked = !!s.newsLimit;
    const cEl = $('#set-clock-24'); if (cEl) cEl.checked = !!s.clock24;
    const dEl = $('#set-density'); if (dEl) dEl.checked = !!s.density;
    document.body.classList.toggle('compact', !!s.density);
  };

  const bindSettings = () => {
    const aEl = $('#set-anim'); if (aEl) aEl.addEventListener('change', e => { STATE.settings.anim = e.target.checked; saveSettings(); });
    const nEl = $('#set-news-limit'); if (nEl) nEl.addEventListener('change', e => { STATE.settings.newsLimit = e.target.checked; saveSettings(); render(); });
    const cEl = $('#set-clock-24'); if (cEl) cEl.addEventListener('change', e => { STATE.settings.clock24 = e.target.checked; saveSettings(); updateClock(); });
    const dEl = $('#set-density'); if (dEl) dEl.addEventListener('change', e => { STATE.settings.density = e.target.checked; saveSettings(); applySettingsToUI(); });
  };

  // ==================== 模态框 ====================

  const openModal = (id) => {
    const m = $('#' + id);
    if (m) m.classList.add('show');
  };
  const closeModal = (id) => {
    const m = $('#' + id);
    if (m) m.classList.remove('show');
  };
  const bindModals = () => {
    $$('[data-close]').forEach(b => {
      b.addEventListener('click', () => closeModal(b.getAttribute('data-close')));
    });
    $$('.modal-bg').forEach(m => {
      m.addEventListener('click', e => {
        if (e.target === m) m.classList.remove('show');
      });
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        $$('.modal-bg.show').forEach(m => m.classList.remove('show'));
      }
    });
  };

  // ==================== 搜索 ====================

  const doSearch = (q) => {
    const out = [];
    if (!q || !STATE.data) return out;
    const ql = q.toLowerCase();
    const editions = ['java', 'bedrock', 'netease'];
    for (const ed of editions) {
      const d = STATE.data[ed];
      if (!d) continue;
      (d.recent_versions || []).forEach(v => {
        if ((v.number || '').toLowerCase().includes(ql) ||
            (v.summary || '').toLowerCase().includes(ql) ||
            (v.type || '').toLowerCase().includes(ql)) {
          out.push({ kind: `${ed} 版本`, title: v.number, desc: v.summary, url: v.url });
        }
      });
      (d.recent_news || []).forEach(n => {
        if ((n.title || '').toLowerCase().includes(ql) ||
            (n.summary || '').toLowerCase().includes(ql)) {
          out.push({ kind: `${ed} 动态`, title: n.title, desc: n.summary, url: n.url });
        }
      });
      (d.features || []).forEach(f => {
        if ((f.title || '').toLowerCase().includes(ql) ||
            (f.description || '').toLowerCase().includes(ql)) {
          out.push({ kind: `${ed} 特性`, title: f.title, desc: f.description, url: null });
        }
      });
    }
    return out;
  };

  const renderSearchResults = (q) => {
    const r = doSearch(q);
    const c = $('#search-results');
    if (!c) return;
    if (r.length === 0) {
      c.innerHTML = '<div class="empty">无匹配结果</div>';
      return;
    }
    c.innerHTML = r.slice(0, 60).map(item => `
      <a class="news" href="${escapeHTML(item.url || '#')}" ${item.url ? 'target="_blank" rel="noopener"' : ''}>
        <div class="ico">🔍</div>
        <div class="body">
          <div class="title">${escapeHTML(item.title)}</div>
          <div class="sum">${escapeHTML(item.desc || '')}</div>
          <div class="meta"><span>${escapeHTML(item.kind)}</span></div>
        </div>
      </a>
    `).join('');
  };

  // ==================== 导出数据 ====================

  const exportData = () => {
    if (!STATE.data) {
      toast('暂无数据可导出', 'err');
      return;
    }
    const blob = new Blob([JSON.stringify(STATE.data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `minecraft-daily-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('已导出');
  };

  // ==================== 滚动跳转 ====================

  const bindScrollNav = () => {
    $$('.topbar-nav .chip').forEach(c => {
      c.addEventListener('click', () => {
        const id = c.getAttribute('data-jump');
        const t = id ? document.getElementById(id) : null;
        if (t) {
          t.scrollIntoView({ behavior: 'smooth', block: 'start' });
          $$('.topbar-nav .chip').forEach(x => x.classList.remove('active'));
          c.classList.add('active');
        }
      });
    });
  };

  // ==================== 初始化 ====================

  const init = async () => {
    loadSettings();
    applySettingsToUI();
    bindSettings();
    bindModals();
    bindScrollNav();

    // 按钮
    const r1 = $('#btn-refresh'); if (r1) r1.addEventListener('click', loadData);
    const r2 = $('#act-refresh'); if (r2) r2.addEventListener('click', loadData);
    const s1 = $('#btn-settings'); if (s1) s1.addEventListener('click', () => openModal('modal-settings'));
    const s2 = $('#act-about'); if (s2) s2.addEventListener('click', () => openModal('modal-about'));
    const s3 = $('#act-night'); if (s3) s3.addEventListener('click', toggleTheme);
    const s4 = $('#act-search'); if (s4) s4.addEventListener('click', () => {
      openModal('modal-search');
      setTimeout(() => { const i = $('#search-input'); if (i) i.focus(); }, 100);
    });
    const s5 = $('#act-export'); if (s5) s5.addEventListener('click', exportData);
    const s6 = $('#set-export'); if (s6) s6.addEventListener('click', exportData);
    const s7 = $('#act-clear-cache'); if (s7) s7.addEventListener('click', () => {
      try {
        localStorage.clear();
        toast('已清空本地缓存', 'warn');
      } catch (e) { toast('清空失败', 'err'); }
    });
    const s8 = $('#set-clear-storage'); if (s8) s8.addEventListener('click', () => {
      try {
        localStorage.clear();
        toast('已清空本地存储', 'warn');
      } catch (e) { toast('清空失败', 'err'); }
    });

    // 搜索框
    const si = $('#search-input');
    if (si) si.addEventListener('input', debounce(e => renderSearchResults(e.target.value), 200));

    // 时钟
    updateClock();
    setInterval(updateClock, 1000);

    // 加载数据
    await loadData();
  };

  // 等待 DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 暴露给调试
  window.MC = { STATE, loadData, exportData, toggleTheme };
})();
