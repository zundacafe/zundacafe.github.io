/* ================================================================
   ずんだもんカフェ 公式サイト
   content/*.json を読んで描画する。設計書: SPEC.md v1.0
   ================================================================ */
(function () {
  'use strict';

  var WD = ['日', '月', '火', '水', '木', '金', '土'];

  /* ---------- 日付ユーティリティ（UTCずれを避けるため手で組む） ---------- */

  // "YYYY-MM-DD" -> ローカル時刻の Date（時分は0:00）
  function parseDate(s) {
    if (typeof s !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    // 2026-02-30 のような不正値を弾く
    if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
    return d;
  }

  function toKey(d) {
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    var dd = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  function today() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function formatJP(d) {
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WD[d.getDay()] + '）';
  }

  // "21:00" を過ぎているか（当日判定用）
  function pastTime(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return false;
    var n = new Date();
    return (n.getHours() * 60 + n.getMinutes()) > (+m[1] * 60 + +m[2]);
  }

  /* ---------- 次回開催の算出 ----------
     1. override があればそれを最優先
     2. なければ baseDate から intervalDays 刻みで今日以降の最初の日
     3. skipDates に含まれる日は飛ばす
     戻り値: { date: Date, isToday: bool } / 算出できなければ null
  --------------------------------------------------------------- */
  function calcNextEvent(cfg, from) {
    if (!cfg) return null;
    var t = from || today();

    var ov = parseDate(cfg.override);
    if (ov && ov >= t) return { date: ov, isToday: toKey(ov) === toKey(today()) };

    var base = parseDate(cfg.baseDate);
    var step = parseInt(cfg.intervalDays, 10);
    if (!base || !(step > 0)) return null;

    var skip = {};
    (Array.isArray(cfg.skipDates) ? cfg.skipDates : []).forEach(function (s) {
      var d = parseDate(s);
      if (d) skip[toKey(d)] = true;
    });

    // baseDate が過去でも未来でも、今日以降で最初に来る候補まで進める
    var cur = base;
    if (cur < t) {
      var diff = Math.round((t - cur) / 86400000);
      cur = addDays(cur, Math.ceil(diff / step) * step);
    }

    // skipDates を飛ばす。無限ループ防止に上限を置く
    for (var i = 0; i < 500; i++) {
      if (!skip[toKey(cur)]) {
        return { date: cur, isToday: toKey(cur) === toKey(today()) };
      }
      cur = addDays(cur, step);
    }
    return null;
  }

  /* ---------- DOM ヘルパ ---------- */
  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function svgUse(id, cls) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    if (cls) s.setAttribute('class', cls);
    s.setAttribute('aria-hidden', 'true');
    var u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    u.setAttribute('href', '#' + id);
    s.appendChild(u);
    return s;
  }

  function getJSON(path) {
    return fetch(path, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' ' + r.status);
      return r.json();
    });
  }

  /* ================================================================
     描画
     ================================================================ */

  function renderSite(site) {
    if (!site) return;

    /* --- 次回開催 --- */
    var card = $('next-card');
    var time = (site.nextEvent && site.nextEvent.startTime) || '21:00';
    var next = calcNextEvent(site.nextEvent);

    // 当日だが開始時刻を過ぎていたら、翌日以降で数え直して次の回を出す
    if (next && next.isToday && pastTime(time)) {
      next = calcNextEvent(site.nextEvent, addDays(today(), 1));
    }

    if (!next) {
      $('next-label').textContent = 'つぎの開催';
      $('next-date').textContent = '日程は調整中なのだ';
      $('next-time').textContent = '';
    } else {
      var isNow = next.isToday && !pastTime(time);
      if (isNow) card.classList.add('is-today');
      $('next-label').textContent = isNow ? '本日開催' : 'つぎの開催';
      $('next-date').textContent = formatJP(next.date);
      $('next-time').textContent = time + ' から';
    }

    /* --- グループURL（未設定ならボタンを無効化する） --- */
    var g = (site.groupUrl || '').trim();
    var btn = $('group-btn');
    var footLink = $('group-link-foot');
    if (g) {
      [btn, footLink].forEach(function (a) {
        if (!a) return;
        a.setAttribute('href', g);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
      });
    } else if (btn) {
      btn.setAttribute('aria-disabled', 'true');
      btn.setAttribute('title', 'グループURLが未設定です');
    }

    /* --- X --- */
    if (site.xUrl && $('x-link')) {
      $('x-link').setAttribute('href', site.xUrl);
      var handle = site.xUrl.replace(/\/+$/, '').split('/').pop();
      if (handle) $('x-link').lastChild.textContent = ' @' + handle.replace(/^@/, '');
    }

    /* --- お知らせ --- */
    if (site.notice && site.notice.show && site.notice.text) {
      var n = $('notice');
      n.textContent = site.notice.text;
      n.hidden = false;
    }

    /* --- 100回記念 --- */
    var a = site.anniversary;
    if (a && a.show) {
      var sec = $('anniv');
      var ad = parseDate(a.date);
      $('anniv-title').textContent = a.title || '';
      $('anniv-when').textContent = ad
        ? formatJP(ad) + ' ' + (a.startTime || '') + '〜'
        : '';
      // 開催後は afterReport があればそちらに差し替える
      var isPast = ad && addDays(ad, 1) <= today();
      $('anniv-body').textContent = (isPast && a.afterReport) ? a.afterReport : (a.body || '');
      sec.hidden = false;
    }
  }

  function renderStaff(list) {
    var box = $('staff-grid');
    if (!box || !Array.isArray(list)) return;
    list.filter(function (s) { return s && s.show !== false; }).forEach(function (s) {
      var card = el('div', 'staff');

      var ava = el('div', 'staff-ava');
      if (s.image) {
        var img = el('img');
        img.src = s.image;
        img.alt = s.name || '';
        img.loading = 'lazy';
        ava.appendChild(img);
      } else {
        ava.appendChild(svgUse('i-person'));
      }
      card.appendChild(ava);

      var body = el('div');
      if (s.role) body.appendChild(el('span', 'staff-role', s.role));
      body.appendChild(el('p', 'staff-name', s.name || ''));
      if (s.bio) body.appendChild(el('p', 'staff-bio', s.bio));
      card.appendChild(body);

      box.appendChild(card);
    });
  }

  function renderHistory(list) {
    var box = $('timeline');
    if (!box || !Array.isArray(list)) return;

    // 年ごとにまとめる（出現順を保つ）
    var years = [];
    var byYear = {};
    list.forEach(function (r) {
      if (!r) return;
      var y = r.year;
      if (!byYear[y]) { byYear[y] = []; years.push(y); }
      byYear[y].push(r);
    });

    years.forEach(function (y) {
      var row = el('div', 'tl-year');

      var band = el('div', 'tl-band');
      band.appendChild(el('span', null, String(y)));
      row.appendChild(band);

      var rows = el('div', 'tl-rows');
      byYear[y].forEach(function (r) {
        var item = el('div', 'tl-row' + (r.highlight ? ' is-highlight' : ''));
        item.appendChild(el('div', 'tl-date', r.date || '　'));
        var t = el('div', 'tl-title');
        t.appendChild(document.createTextNode(r.title || ''));
        if (r.upcoming) t.appendChild(el('span', 'tl-badge', '予告'));
        item.appendChild(t);
        rows.appendChild(item);
      });
      row.appendChild(rows);

      box.appendChild(row);
    });
  }

  function renderCollabs(list) {
    var box = $('collab-list');
    if (!box || !Array.isArray(list)) return;
    list.forEach(function (c) {
      if (!c) return;
      var card = el('div', 'collab');
      var body = el('div');
      body.appendChild(el('p', 'collab-name', c.partner || ''));
      if (c.note) body.appendChild(el('p', 'collab-note', c.note));
      card.appendChild(body);
      if (c.years) card.appendChild(el('div', 'collab-year', c.years));
      box.appendChild(card);
    });
  }

  function renderCredits(list) {
    var box = $('credit-list');
    if (!box || !Array.isArray(list) || !list.length) return;
    list.forEach(function (c) {
      if (!c || !c.label) return;
      var li = el('li');
      if (c.url) {
        var a = el('a', null, c.label);
        a.href = c.url;
        a.target = '_blank';
        a.rel = 'noopener';
        li.appendChild(a);
      } else {
        li.textContent = c.label;
      }
      box.appendChild(li);
    });
    $('credits-block').hidden = false;
  }

  /* ================================================================
     起動
     ================================================================ */
  function load(path, fn) {
    return getJSON(path)
      .then(fn)
      .catch(function (e) {
        // 1本落ちても他のセクションは描画を続ける
        if (window.console) console.error('[zundacafe] ' + path, e);
      });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      load('content/site.json', renderSite);
      load('content/staff.json', renderStaff);
      load('content/history.json', renderHistory);
      load('content/collabs.json', renderCollabs);
      load('content/credits.json', renderCredits);
    });
  }

  // テスト用（ブラウザでは使わない）
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { calcNextEvent: calcNextEvent, parseDate: parseDate, toKey: toKey, addDays: addDays, today: today };
  }
})();
