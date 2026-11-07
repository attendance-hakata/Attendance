// 画面側の処理。1ページ内で画面を切り替える(SPA)
// メンバー画面: home / answer、管理画面: alloc / calendar / contacts / team
(function () {
  'use strict';

  var KEY = { me: 'attendance.me', auth: 'attendance.auth', boot: 'attendance.boot' };
  var LABEL = { yes: '参加', no: '不参加', maybe: '未定' };
  var REASONS = ['学校行事', '地域行事', 'チームの都合', 'その他'];
  // カレンダーはメンバーも使える画面にしたので、管理画面(パス必須)の一覧からは外す
  var ADMIN_SCREENS = { alloc: 1, contacts: 1, team: 1, power: 1 };

  // localStorage は使えない環境があるため必ず例外を吸収する
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 記憶できなくても動作は続ける */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* 同上 */ } }
  };

  var S = {
    boot: null,
    me: store.get(KEY.me),
    screen: 'home',
    obTeam: null,
    sumIndex: 0,
    sumOpen: false,
    composerOpen: false,
    noteOpen: {},      // 出欠画面で開いているコメント欄(日付ごと)
    dialog: null,      // 'user' | 'code' | 'move' | 'confirm' | 'deleteComment' | 'day' | 'removeMember'
    moveTeam: null,
    deleteId: null,
    dayDate: null,
    removeMemberId: null,
    renameMemberId: null,
    editLeave: false,  // メンバー編集シートの休部ステータス(ローカル)
    deleteTeamId: null,
    drafts: {},        // 入力途中の文字列。再描画しても消えないよう保持する
    passLength: 4,
    code: '',
    codeMsg: '',
    codeErr: false,
    loggingIn: false,
    pendingWrites: 0,
    busyLabel: '',     // 処理中インジケータの文言(登録中… など)
    error: null,
    revealPass: {},    // 管理者ページで番号を表示しているチーム
    ui: { openReg: false, openPower: false, openGym: false },   // 管理者ページの折りたたみ(チーム登録・管理者パス・体育館マスタ)
    gymEditId: null,
    // 管理画面のデータ。連絡先やパスを含むので端末には保存しない
    admin: { calendar: null, contacts: null, team: null, teamList: null, teamId: null, power: null },
    // メンバーのカレンダー(月表示)の状態
    cal: { mode: 'member', ym: null, sel: '', filters: { assign: true, closed: true, rest: true, other: true }, sheet: null, form: null, confirmDel: false, confirmClosed: false, deleteId: null },
    // 割り振り画面(モックアップ準拠)の状態。map は画面内の割当、決定でまとめて保存
    alloc: { screen: 'pick', gym: '', map: {}, pending: null, version: 0, lineText: '', copied: false }
  };

  // ---- 共通処理 ----
  function esc(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function dateLabel(date) {
    var p = date.split('-');
    return Number(p[1]) + '/' + Number(p[2]);
  }

  // チームの見出しはチーム名の頭文字を使う(A/B/C… の連番記号ではなく)
  function teamMark(name) {
    return String(name || '').trim().charAt(0).toUpperCase();
  }

  function mapUrl(gym) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(gym.address || gym.name);
  }

  // 連絡先の種別を値から判定する(メール / 電話 / LINE等)
  function contactKind(v) {
    var s = String(v || '').trim();
    if (!s) return null;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'mail';
    var digits = s.replace(/[\s\-()+]/g, '');
    if (/^\d{7,}$/.test(digits)) return 'tel';
    return 'line';
  }
  function contactHref(v) {
    var k = contactKind(v);
    if (k === 'tel') return 'tel:' + String(v).replace(/[\s\-()]/g, '');
    if (k === 'mail') return 'mailto:' + String(v).trim();
    return '';
  }
  var CONTACT_LABEL = { tel: '電話', mail: 'メール', line: 'LINE/ID' };
  // LINE の公式ロゴ(緑)。外部から読み込まず図形を直接持つので、オフラインでも表示できる
  var LINE_LOGO_PATH = 'M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314';
  function contactIcon(kind) {
    if (kind === 'line') {
      return '<svg class="cicon cicon-line" viewBox="0 0 24 24" width="16" height="16" aria-label="LINE"><path fill="#06C755" d="' + LINE_LOGO_PATH + '"/></svg>';
    }
    var p = {
      tel: '<path d="M4 4h4l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v4a16 16 0 0 1-16-16z"/>',
      mail: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 6l9 7 9-7"/>',
      line: '<path d="M4 4h16v10H9l-4 4v-4H4z"/>'
    }[kind] || '';
    return '<svg class="cicon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  }

  function timeText(item) {
    return item && item.start ? item.start + '〜' + item.end : '';
  }

  function setBusy(delta, label) {
    S.pendingWrites += delta;
    if (delta > 0 && label) S.busyLabel = label;
    document.getElementById('busy').hidden = S.pendingWrites <= 0;
    renderBusyPill();
    if (S.pendingWrites <= 0) S.busyLabel = '';
  }

  // 処理中のラベル付きインジケータ(登録中…・割当中… など)。時間のかかる操作で状態を見せる
  function renderBusyPill() {
    var pill = document.getElementById('busyPill');
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'busyPill';
      pill.className = 'busy-overlay';
      document.body.appendChild(pill);
    }
    if (S.pendingWrites > 0 && S.busyLabel) {
      pill.innerHTML = '<div class="busy-box"><span class="busy-spin"></span><span class="busy-text">' + esc(S.busyLabel) + '</span></div>';
      pill.hidden = false;
    } else {
      pill.hidden = true;
    }
  }

  // サーバーの api* を fetch で呼ぶ。通信エラーも応答エラーと同じ形で返す
  // GitHub Pages から GAS を呼ぶため、プリフライトを避けて text/plain で送る。独自ヘッダー・Cookie は付けない
  function call(name, args, done, label) {
    setBusy(1, label);
    fetch(window.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: name, args: args || [] }),
      redirect: 'follow'
    }).then(function (res) {
      return res.json();
    }).then(function (json) {
      setBusy(-1);
      if (json && json.ok) {
        var flat = json.data || {};
        flat.ok = true;
        done(flat);
      } else {
        var err = json && json.error;
        done({ ok: false, code: (err && err.code) || 'SERVER', message: (err && err.message) || '応答がありません。' });
      }
    }).catch(function () {
      setBusy(-1);
      done({ ok: false, code: 'NETWORK', message: '通信できませんでした。もう一度お試しください。' });
    });
  }

  var toastTimer = null;
  function toast(text) {
    var root = document.getElementById('toast');
    root.innerHTML = '<div class="toast">' + esc(text) + '</div>';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { root.innerHTML = ''; }, 2000);
  }

  // 入力済みのパスの権限。期限切れなら null
  function auth() {
    try {
      var value = JSON.parse(store.get(KEY.auth) || 'null');
      return value && value.expires > Date.now() ? value : null;
    } catch (e) {
      return null;
    }
  }

  function token() {
    var value = auth();
    return value ? value.token : null;
  }

  // 割当を操作できるのは管理者か「割振担当チーム」のパスのみ
  function canAllocate() {
    var w = auth();
    if (!w) return false;
    if (w.role === 'power') return true;
    var t = (S.boot && S.boot.teams || []).filter(function (x) { return x.id === w.teamId; })[0];
    return !!(t && t.allocDuty);
  }

  function dropAuth() {
    store.del(KEY.auth);
    S.revealPass = {};
    S.admin = { calendar: null, contacts: null, team: null, teamList: null, teamId: null, power: null };
  }

  function me() {
    if (!S.boot || !S.me) return null;
    return S.boot.members.filter(function (m) { return m.id === S.me; })[0] || null;
  }

  function teamOf(id) {
    return S.boot.teams.filter(function (t) { return t.id === id; })[0] || null;
  }

  function setBoot(boot) {
    S.boot = boot;
    store.set(KEY.boot, JSON.stringify(boot));
  }

  function draft(key, fallback) {
    return S.drafts[key] !== undefined ? S.drafts[key] : (fallback === undefined ? '' : fallback);
  }

  function clearDrafts(prefix) {
    Object.keys(S.drafts).forEach(function (k) { if (k.indexOf(prefix) === 0) delete S.drafts[k]; });
  }

  function textInput(key, fallback, placeholder, type, maxlength) {
    return '<input class="text-input" type="' + (type || 'text') + '"' + (maxlength ? ' maxlength="' + maxlength + '"' : '') +
      ' placeholder="' + esc(placeholder || '') + '" data-draft="' + esc(key) + '" value="' + esc(draft(key, fallback)) + '">';
  }

  function selectInput(key, options, fallback) {
    var current = draft(key, fallback);
    return '<select class="text-input" data-draft="' + esc(key) + '">' + options.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (o[0] === current ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select>';
  }

  // ---- 初回(チーム→名前) ----
  function viewOnboard() {
    var html = '<div class="ob"><img src="' + 'assets/logo.png' + '" alt="Attendance">';
    if (!S.obTeam) {
      html += '<h1><span>チームを</span><span>選んでください<i class="acc" style="font-style:normal">.</i></span></h1><div class="ob-list">';
      S.boot.teams.forEach(function (t) {
        var size = S.boot.members.filter(function (m) { return m.teamId === t.id; }).length;
        html += '<button class="ob-item" data-a="obTeam" data-v="' + esc(t.id) + '"><u>' + esc(teamMark(t.name)) + '</u><strong>' + esc(t.name) +
          '</strong><small>' + size + '人</small><i>→</i></button>';
      });
    } else {
      html += '<button class="ob-back" data-a="obBack">← チーム選択へ</button>' +
        '<h1>' + esc(teamOf(S.obTeam).name) + '<i class="acc" style="font-style:normal">.</i></h1>' +
        '<p>あなたの名前を選んでください。</p><div class="ob-list">';
      S.boot.members.filter(function (m) { return m.teamId === S.obTeam; }).forEach(function (m) {
        html += '<button class="ob-item" data-a="obMember" data-v="' + esc(m.id) + '"><strong>' + esc(m.name) + '</strong><i>→</i></button>';
      });
    }
    return html + '</div></div>';
  }

  function viewHeader(isAdmin, member, team) {
    var left = isAdmin
      ? '<button class="back" data-a="tab" data-v="home">← 戻る</button>'
      : '<img src="' + 'assets/logo.png' + '" alt="Attendance">';
    return '<div class="head">' + left + '<span class="spacer"></span>' +
      '<button class="chip" data-a="openUser"><b>' + esc(teamMark(team.name)) + '</b>' + esc(member.name) + '</button></div>';
  }

  // ---- ホーム ----
  function viewHome(member, team) {
    var b = S.boot;
    var dayOff = b.dayOffs[b.next] !== undefined;
    var html = '<div class="hero"><span class="hero-date" id="heroDate">' + dateLabel(b.next) + '</span>' +
      '<span class="hero-side" id="heroSide"><b>SUN</b><span class="label">' + b.next.slice(0, 4) + '</span></span></div>';

    var view = b.allocation;
    if (dayOff) {
      html += '<div class="day-off"><h2>練習休み</h2>' + (b.dayOffs[b.next] ? '<p>' + esc(b.dayOffs[b.next]) + '</p>' : '') + '</div>';
    } else if (view.state === 'confirmed' && view.alloc[team.id]) {
      var gym = view.gyms.filter(function (g) { return g.id === view.alloc[team.id]; })[0];
      var mates = gym.teams.filter(function (t) { return t.id !== team.id; }).map(function (t) { return t.name; }).join('、') || 'なし(単独)';
      html += '<div class="place"><div class="pair"><span>今週の体育館</span><span>' + esc(team.name) + '</span></div>' +
        '<h2>' + esc(gym.gymName || gym.name) + '</h2>' + (gym.start ? '<p class="place-time">' + esc(timeText(gym)) + '</p>' : '') +
        '<p>一緒に練習:' + esc(mates) + '</p>' +
        '<a href="' + esc(mapUrl(gym)) + '" target="_blank" rel="noopener">地図を開く ↗</a></div>';
    } else {
      html += '<div class="pending"><span class="label-w">今週の体育館</span><span>土曜までに決まり、LINEでお知らせします。</span></div>';
    }

    // 今週(次の日曜)の予定サマリ: 使用不可・チーム休み・その他を手早く確認できる
    var wn = calEvents().filter(function (e) { return e.date === b.next; });
    if (wn.length) {
      html += '<div class="week-notes"><div class="wn-head">今週の予定</div>' + wn.map(function (e) {
        var ds = calDescribe(e), col = CAL_TYPES[e.type].color;
        return '<div class="wn-item"><span class="ctag" style="border-color:' + col + ';color:' + col + '">' + CAL_TYPES[e.type].label + '</span>' +
          '<span class="wn-ttl">' + esc(ds.title) + '</span></div>';
      }).join('') + '</div>';
    }

    if (!dayOff) html += viewTeamAttendance(team);
    return html + viewComments(team);
  }

  // ホームに出す自チームの今週の出欠。未定は回答があるときだけ表示する
  function viewTeamAttendance(team) {
    var b = S.boot;
    var statuses = b.attendance[b.next];
    var names = { yes: [], no: [], maybe: [], none: [] };
    b.members.forEach(function (m) {
      if (m.teamId !== team.id) return;
      var a = statuses[m.id];
      var answered = a === 'yes' || a === 'no' || a === 'maybe';
      // 休部は未回答に数えない。回答があればそのまま各欄に加算する
      if (m.onLeave && !answered) return;
      names[answered ? a : 'none'].push(m.name);
    });
    var targetCount = b.members.filter(function (m) { return m.teamId === team.id && !m.onLeave; }).length;
    var rows = [['yes', '出席'], ['no', '欠席'], ['maybe', '未定'], ['none', '未回答']];
    return '<div class="att-list"><div class="att-head"><span class="label">' + esc(team.name) + 'の出欠</span>' +
      '<span class="label">' + targetCount + '人</span></div>' +
      rows.filter(function (r) { return r[0] !== 'maybe' || names.maybe.length; }).map(function (r) {
        var list = names[r[0]];
        return '<div class="att"><span class="att-label">' + r[1] + '</span><b' + (r[0] === 'yes' ? ' class="acc"' : '') + '>' + list.length + '</b>' +
          '<span class="att-names' + (list.length ? '' : ' mute') + '">' + (list.length ? esc(list.join('、')) : 'なし') + '</span></div>';
      }).join('') + '</div>';
  }

  function commentTime(stamp) {
    var m = String(stamp).match(/^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2})/);
    return m ? Number(m[1]) + '/' + Number(m[2]) + ' ' + m[3] : '';
  }

  // ホームのコメント欄。投稿済みは常に表示し、入力欄だけを開閉する
  function viewComments(team) {
    var b = S.boot;
    var comments = b.comments.filter(function (c) { return c.teamId === team.id; });
    var notes = b.members.filter(function (m) {
      return m.teamId === team.id && b.notes[b.next][m.id];
    });
    var composer = '<button class="composer-toggle" aria-expanded="' + S.composerOpen + '" data-a="toggleComposer"><span>連絡を書く</span><i>' + (S.composerOpen ? '▲' : '▼') + '</i></button>' +
      (S.composerOpen
        ? '<div class="composer"><textarea class="comment-input" rows="3" maxlength="200" placeholder="チームへの連絡を入力" data-draft="comment">' + esc(draft('comment')) + '</textarea>' +
          '<button class="primary" data-a="postComment">投稿する<span>→</span></button></div>'
        : '');
    var commentList = comments.map(function (c) {
      var canDelete = c.memberId === S.me || !!token();
      return '<div class="comment"><div class="comment-head"><b>' + esc(c.author) + '</b><span class="label">' + esc(commentTime(c.createdAt)) + '</span>' +
        (canDelete ? '<button class="link comment-del" data-a="askDelete" data-v="' + esc(c.id) + '">削除</button>' : '') + '</div>' +
        '<div class="comment-text">' + esc(c.text) + '</div></div>';
    }).join('') || '<div class="note-line">今週の連絡はまだありません。</div>';
    var noteList = notes.map(function (m) {
      return '<div class="note"><b>' + esc(m.name) + '</b><span>' + esc(b.notes[b.next][m.id]) + '</span></div>';
    }).join('') || '<div class="note-line">今週の個人コメントはありません。</div>';
    return '<div class="section"><div class="section-head"><span class="label">今週の連絡</span><span class="label">' + comments.length + '件</span></div>' + composer + commentList + '</div>' +
      '<div class="section"><div class="section-head"><span class="label">個人コメント</span><span class="label">' + notes.length + '件</span></div>' + noteList +
      '<div class="note-line">個人コメントは出欠画面で週ごとに入力できます。</div></div>';
  }

  // ---- 出欠 ----
  function viewAnswer(member, team) {
    var b = S.boot;
    var html = '<div class="title" style="padding:14px 0 2px">出欠<span class="acc">.</span></div>' +
      '<div class="ans-sub">' + esc(team.name) + ' / ' + esc(member.name) + ' タップで保存されます</div>';
    b.dates.forEach(function (date, i) {
      var current = b.attendance[date][member.id];
      var off = b.dayOffs[date] !== undefined;
      var closed = off || b.weekStates[date] !== 'open';
      var sub = (i === 0 ? '今週' : i + '週間後') + (off ? '・練習休み' : closed ? '・締切済み' : '');
      html += '<div class="week"><div class="week-head"><strong>' + dateLabel(date) + '</strong><b>SUN</b><small>' + sub + '</small></div><div class="opts">';
      ['yes', 'no', 'maybe'].forEach(function (k) {
        var on = current === k;
        html += '<button class="opt' + (on ? ' ' + k : '') + '" aria-pressed="' + on + '"' + (closed ? ' disabled' : '') +
          ' data-a="answer" data-v="' + date + '|' + k + '">' + LABEL[k] + '</button>';
      });
      var draftKey = 'note:' + date;
      var saved = b.notes[date][member.id] || '';
      var open = !!S.noteOpen[date];
      // 閉じていても、入力済みのコメントは読めるようにする
      html += '</div><button class="note-toggle" aria-expanded="' + open + '" data-a="toggleNote" data-v="' + date + '">' +
        '<span class="label">コメント</span><span class="note-saved">' + (open ? '' : esc(saved)) + '</span><i>' + (open ? '▲' : '▼') + '</i></button>' +
        (open ? '<input class="text-input" type="text" maxlength="100" placeholder="例:遅れます(入力欄から離れると保存)" data-draft="' + draftKey + '" data-note="' + date + '" value="' + esc(draft(draftKey, saved)) + '">' : '') + '</div>';
    });
    return html;
  }

  // ---- 割り振り ----
  function viewSummary() {
    var b = S.boot;
    var date = b.dates[S.sumIndex];
    var statuses = b.attendance[date];
    var totals = { yes: 0, none: 0, ok: 0 };
    var rows = b.teams.map(function (t) {
      var c = { yes: 0, no: 0, maybe: 0, none: 0, names: [] };
      b.members.forEach(function (m) {
        if (m.teamId !== t.id) return;
        var a = statuses[m.id];
        if (a === 'yes' || a === 'no' || a === 'maybe') c[a]++;
        else { c.none++; c.names.push(m.name + 'さん'); }
      });
      var ok = c.yes >= 6;
      totals.yes += c.yes;
      totals.none += c.none;
      if (ok) totals.ok++;
      return '<div class="bar-row' + (ok ? ' ok' : '') + '"><div class="bar-top"><strong>' + esc(t.name) + '</strong>' +
        '<span class="bar-track"><span class="bar-fill" style="width:' + (Math.min(c.yes / 12, 1) * 100) + '%"></span></span>' +
        '<span class="bar-num">' + c.yes + '</span></div>' +
        '<div class="bar-meta"><span class="bar-state">' + (ok ? '6人以上' : '合流') + '</span><span>未定 ' + c.maybe + '</span><span>不参加 ' + c.no + '</span><span>未回答 ' + c.none + '</span></div>' +
        (c.names.length ? '<div class="bar-unans">未回答:<span>' + esc(c.names.join('、')) + '</span></div>' : '') + '</div>';
    }).join('');
    var tabs = b.dates.map(function (d, i) {
      return '<button class="week-tab' + (i === S.sumIndex ? ' on' : '') + '" data-a="sumWeek" data-v="' + i + '">' + dateLabel(d) + '</button>';
    }).join('');
    return (S.sumOpen ? '<div class="week-tabs">' + tabs + '</div>' : '') +
      '<div class="kpis"><div class="kpi"><small>参加</small><b class="acc">' + totals.yes + '</b></div>' +
      '<div class="kpi"><small>未回答</small><b>' + totals.none + '</b></div>' +
      '<div class="kpi"><small>6人以上</small><b>' + totals.ok + '<i>/' + b.teams.length + '</i></b></div></div>' +
      '<button class="sum-toggle" data-a="toggleSum"><span>チーム別の集計を' + (S.sumOpen ? '閉じる' : '開く') + '</span><span>' + (S.sumOpen ? '▲' : '▼') + '</span></button>' +
      (S.sumOpen ? '<div class="bars-head"><span>参加人数</span><span>| 6人ライン(1チーム換算)</span></div><div class="bars"><div class="six"></div>' + rows + '</div>' : '');
  }

  function closedList(view) {
    return view.closed.map(function (c) {
      return '<div class="closed"><b>' + esc(c.name) + '</b><em>' + esc(c.reason) + '</em></div>';
    }).join('');
  }

  // ===== 割り振り(モックアップ準拠。画面内で割り振ってから「決定」でまとめて保存) =====
  var ALLOC_UNIT = 6; // 6人以上が目安(バックエンドの警告しきい値に合わせる)
  function allocA() { return S.boot.allocation; }
  // 割り振りの単位は練習枠(体育館＋時間)。名前は割当データの枠から引く
  function allocSlot(id) { var A = allocA(); return (A && A.gyms || []).filter(function (g) { return g.id === id; })[0]; }
  function allocGymName(id) { var s = allocSlot(id); if (s) return s.name; var g = calGym(id); return g ? g.name : ''; }
  function allocGymTotal(gymId) {
    return allocA().allTeams.reduce(function (s, t) { return s + (S.alloc.map[t.id] === gymId ? t.yes : 0); }, 0);
  }
  function allocUnassigned() {
    return allocA().allTeams.filter(function (t) { return !t.rest && t.yes > 0 && !S.alloc.map[t.id]; });
  }
  function allocWarnings() {
    var A = allocA(), w = [];
    allocUnassigned().forEach(function (t) { w.push(t.name + '（' + t.yes + '人）がまだ割り振られていません'); });
    A.gyms.forEach(function (g) {
      var tot = allocGymTotal(g.id);
      var home = A.allTeams.filter(function (t) { return t.homeSlotId === g.id; })[0];
      if (tot > 0 && tot < ALLOC_UNIT) w.push(g.name + 'が' + tot + '人です（' + ALLOC_UNIT + '人未満）');
      if (tot > 0 && home && S.alloc.map[home.id] !== g.id) w.push(g.name + 'にホームの' + home.name + 'がいません');
    });
    return w;
  }

  function allocDateLabel(date) {
    var d = calParse(date);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + CAL_WD[d.getDay()] + '）';
  }
  function allocHead() {
    var A = allocA();
    return '<div class="alloc-head"><div><div class="title-sm">割り振り<span class="acc">.</span></div>' +
      '<div class="alloc-when">' + allocDateLabel(A.date) + 'の分</div></div>' + allocStatus() + '</div>';
  }
  function allocStatus() {
    var A = allocA(), who = auth();
    if (A.state === 'confirmed') return '<div class="alloc-confirmed"><span class="tag confirmed">確定済み</span>' + (canAllocate() ? '<button class="sub-btn unconf-btn" data-a="askUnconfirm">確定を解除</button>' : '') + '</div>';
    var on = A.state === 'open';
    return '<button class="swx' + (on ? ' on' : '') + '" role="switch" aria-checked="' + on + '" data-a="' + (on ? 'allocClose' : 'allocReopen') + '">'
      + '<span class="swx-text">' + (on ? '回答受付中' : '締め切り中') + '</span>'
      + '<span class="swx-track"><span class="swx-knob"></span></span></button>';
  }

  function viewAlloc() {
    if (!S.boot || !allocA()) return adminLoading();
    var A = allocA();
    if (A.dayOff) return allocHead() + '<div class="empty"><b>この週は練習休みです。</b>' + esc(A.dayOffReason) + '</div>';
    if (A.noOpenGyms) return allocHead() + '<div class="empty"><b>開ける体育館がありません。</b>カレンダーの使用不可を確認してください。</div>' + allocTempButton();
    if (S.alloc.screen === 'confirm') return viewAllocConfirm();
    if (S.alloc.screen === 'line') return viewAllocLine();
    return viewAllocPick();
  }

  // 「その他の体育館」(臨時枠の追加)。確定済みの週と割振担当以外には出さない
  function allocTempButton() {
    var A = allocA();
    if (!A || A.state === 'confirmed' || !canAllocate()) return '';
    return '<button class="gymchip add" data-a="askTempSlot"><b>＋ その他の体育館</b><span>臨時で借りる</span></button>';
  }

  function viewTempSlotSheet() {
    var A = allocA(), list = (A && A.tempGyms) || [];
    var body = list.length
      ? '<div class="field-label">体育館</div><div class="form-row">' + selectInput('a:tempGym', list.map(function (g) { return [g.id, g.name]; }), list[0].id) + '</div>' +
        '<div class="field-label">使用時間</div><div class="form-row">' + textInput('a:tempStart', '', '', 'time') + '<span class="time-sep">〜</span>' + textInput('a:tempEnd', '', '', 'time') + '</div>' +
        '<div class="conf-btns"><button class="ghost" style="height:56px" data-a="closeDialog">やめる</button><button class="go" data-a="addTempSlot">追加する</button></div>'
      : '<div class="conf-note">ホームになっていない体育館がありません。臨時で借りる体育館は、管理者メニューの体育館マスタで登録してください。</div>' +
        '<div class="conf-btns"><button class="ghost" style="height:56px" data-a="closeDialog">閉じる</button></div>';
    return '<div class="scrim" data-a="closeDialog"><div class="sheet" data-a="noop"><h3>その他の体育館を追加</h3>' +
      '<div class="conf-note">' + esc(allocDateLabel(A.date)) + 'だけの臨時枠として、割り振りに加えます。</div>' + body + '</div></div>';
  }

  function viewAllocPick() {
    var A = allocA(), active = S.alloc.gym;
    var chips = A.gyms.map(function (g) {
      return '<button class="gymchip' + (g.id === active ? ' on' : '') + '" data-a="allocGym" data-v="' + esc(g.id) + '"><b>' + esc(g.name) + '</b><span>' + (g.temp ? '臨時・' : '') + allocGymTotal(g.id) + '人</span></button>';
    }).join('') + A.closed.map(function (c) {
      return '<button class="gymchip off" disabled><b>' + esc(c.name) + '</b><span>' + esc(c.reason) + '</span></button>';
    }).join('') + allocTempButton();
    var homeTeam = A.allTeams.filter(function (t) { return t.homeSlotId === active; })[0];
    var curSlot = allocSlot(active);
    var curTotal = allocGymTotal(active);
    var canDrop = curSlot && curSlot.temp && A.state !== 'confirmed' && canAllocate() && curTotal === 0 &&
      A.allTeams.every(function (t) { return S.alloc.map[t.id] !== active; });
    var cur = '<div class="alloc-cur"><div><div class="nm">' + esc(allocGymName(active)) + '</div><div class="sub">' +
      (curSlot && curSlot.start ? esc(timeText(curSlot)) + '　' : '') +
      (curSlot && curSlot.temp ? '臨時枠' : homeTeam ? 'ホーム：' + esc(homeTeam.name) : 'ホームのチームなし') + '</div>' +
      (canDrop ? '<button class="link danger" data-a="removeTempSlot" data-v="' + esc(active) + '">この臨時枠を外す</button>' : '') + '</div>' +
      '<div class="tot"><span class="big">' + curTotal + '</span>人<div class="sub">' + Math.floor(curTotal / ALLOC_UNIT) + 'チーム分</div></div></div>';
    var teams = A.allTeams.map(function (t) {
      var a = S.alloc.map[t.id], here = a === active, off = t.rest, cls = '', st;
      if (off) st = '休み';
      else if (here) { st = 'この体育館に割振中'; cls = 'lime'; }
      else if (a) st = '割振済み：' + allocGymName(a);
      else { st = '未割当'; cls = 'warn'; }
      if (!off && t.yes < ALLOC_UNIT) st += '　' + ALLOC_UNIT + '人未満';
      return '<button class="teamrow' + (here ? ' here' : '') + '" data-a="allocTap" data-v="' + esc(t.id) + '"' + (off ? ' disabled' : '') + '>' +
        '<span class="bd">' + esc(teamMark(t.name)) + '</span>' +
        '<span class="tinfo"><span class="tnm">' + esc(t.name) + (t.homeSlotId === active ? '<span class="homeb">HOME</span>' : '') + '</span><span class="st ' + cls + '">' + esc(st) + '</span></span>' +
        '<span class="num"><b' + (!off && t.yes < ALLOC_UNIT ? ' class="short"' : '') + '>' + t.yes + '</b>人</span></button>';
    }).join('');
    var un = allocUnassigned();
    var auto = A.state === 'confirmed' ? '' : '<button class="ghost auto-btn" data-a="askAllocAuto">自動で割り振る</button>';
    return allocHead() +
      '<div class="label gap">① 今週使える体育館を選ぶ</div><div class="gymchips">' + chips + '</div>' + cur +
      '<div class="label gap">② チームをタップして、この体育館に割り振る</div><div class="teamlist">' + teams + '</div>' + auto +
      '<div class="allocbar"><div class="left ' + (un.length ? 'warn' : 'ok') + '">' + (un.length ? '未割当 ' + un.length + 'チーム' : 'すべて割振済み') + '</div>' +
      '<button class="primary" data-a="allocToConfirm">最終確認へ →</button></div>';
  }

  function viewAllocMove() {
    var A = allocA(), p = A.allTeams.filter(function (t) { return t.id === S.alloc.pending; })[0];
    if (!p) return '';
    var from = S.alloc.map[p.id], fromTot = allocGymTotal(from), toTot = allocGymTotal(S.alloc.gym);
    var homeWarn = p.homeSlotId && p.homeSlotId === from;
    return '<div class="scrim" data-a="allocCancelMove"><div class="sheet" data-a="noop">' +
      '<div class="kicker">割振済みのチームです</div>' +
      '<h3>' + esc(p.name) + '（' + p.yes + '人）を' + esc(allocGymName(S.alloc.gym)) + 'に移しますか?</h3>' +
      '<div class="movegrid"><div class="movebox"><div class="k">移動元 ' + esc(allocGymName(from)) + '</div><div class="v">' + fromTot + ' → ' + (fromTot - p.yes) + '人</div></div>' +
      '<div class="movebox to"><div class="k">移動先 ' + esc(allocGymName(S.alloc.gym)) + '</div><div class="v">' + toTot + ' → ' + (toTot + p.yes) + '人</div></div></div>' +
      (homeWarn ? '<div class="movenote">' + esc(allocGymName(from)) + 'は' + esc(p.name) + 'のホームです。移すと使えなくなる可能性があります。</div>' : '') +
      '<div class="conf-btns"><button class="ghost" style="height:52px" data-a="allocCancelMove">キャンセル</button><button class="go" data-a="allocConfirmMove">移す</button></div></div></div>';
  }

  function viewAllocConfirm() {
    var A = allocA(), w = allocWarnings();
    var cards = A.gyms.map(function (g) {
      var ts = A.allTeams.filter(function (t) { return S.alloc.map[t.id] === g.id; });
      var tot = allocGymTotal(g.id);
      return '<section class="acard"><div class="achd"><b>' + esc(g.name) + '</b><span><b class="acc">' + tot + '</b>人 ' + Math.floor(tot / ALLOC_UNIT) + 'チーム分</span></div>' +
        (ts.length ? ts.map(function (t) { return '<div class="at"><span class="bd sm">' + esc(teamMark(t.name)) + '</span><span class="atn">' + esc(t.name) + '</span><span class="n' + (t.yes < ALLOC_UNIT ? ' short' : '') + '">' + t.yes + '人</span></div>'; }).join('') : '<div class="aempty">割当なし（この体育館は使いません）</div>') +
        '</section>';
    }).join('');
    var closed = A.closed.map(function (c) { return '<div class="plain"><span>' + esc(c.name) + '</span><span>' + esc(c.reason) + '</span></div>'; }).join('');
    var rest = A.allTeams.filter(function (t) { return t.rest; }).map(function (t) { return t.name; });
    return '<div class="alloc-head"><div><div class="title-sm">最終確認<span class="acc">.</span></div>' +
      '<div class="alloc-when">' + allocDateLabel(S.boot.next) + 'の割当</div></div></div>' +
      (w.length ? '<div class="warns">' + w.map(function (x) { return '<div class="warn"><b>!</b><span>' + esc(x) + '</span></div>'; }).join('') + '</div>' : '') +
      cards + closed +
      '<div class="plain"><span>休み</span><span>' + esc(rest.length ? rest.join('、') : 'なし') + '</span></div>' +
      '<div class="allocbar"><button class="ghost" data-a="allocBack">修正</button><button class="primary" style="flex:2" data-a="allocDecide">この内容で決定する</button></div>';
  }

  function viewAllocLine() {
    return '<div class="alloc-head"><div><div class="title-sm">LINE通知の文面<span class="acc">.</span></div></div></div>' +
      '<div class="done"><i>✓</i>' + allocDateLabel(S.boot.next) + 'の割当を決定しました</div>' +
      '<div class="label">決定した内容から自動で作成しました。投稿前に確認してください。</div>' +
      '<div class="bubble">' + esc(S.alloc.lineText) + '</div>' +
      (S.alloc.copied ? '<div class="label">文面をコピーしました</div>' : '') +
      '<div class="allocbar"><button class="ghost" data-a="allocBack">割当を修正</button><button class="primary" data-a="allocCopyLine">文面をコピー</button></div>';
  }

  // ---- カレンダー ----
  function adminLoading() {
    return '<div class="empty">読み込み中…</div>';
  }

  // ===== カレンダー(月表示。モックアップ準拠) =====
  var CAL_TYPES = {
    assign: { label: '割振', color: 'var(--acc)' },
    closed: { label: '使用不可', color: 'var(--warn)' },
    rest: { label: 'チーム休み', color: 'var(--blue)' },
    other: { label: 'その他', color: 'var(--tx)' }
  };
  var CAL_REASONS = { closed: ['学校行事', '地域行事', '選挙・公共行事', 'その他'], rest: ['チームの都合', '大会・遠征', 'その他'] };
  var CAL_WD = ['日', '月', '火', '水', '木', '金', '土'];

  function calPad(n) { return (n < 10 ? '0' : '') + n; }
  function calIso(d) { return d.getFullYear() + '-' + calPad(d.getMonth() + 1) + '-' + calPad(d.getDate()); }
  function calParse(t) { var p = String(t).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function calMd(t) { var d = calParse(t); return (d.getMonth() + 1) + '/' + d.getDate(); }
  function calIsSun(t) { return calParse(t).getDay() === 0; }
  function calTeam(id) { return (S.boot.teams || []).filter(function (t) { return t.id === id; })[0]; }
  function calGym(id) { return (S.boot.gyms || []).filter(function (g) { return g.id === id; })[0]; }
  function calTname(id) { var t = calTeam(id); return t ? t.name : ''; }
  function calGname(id) { var g = calGym(id); return g ? g.name : ''; }
  function calEvents() { return S.boot.events || []; }
  function myTeamId() { var m = me(); return m ? m.teamId : ''; }
  function myHomeGym() { var t = calTeam(myTeamId()); return t && t.homeGymId ? t.homeGymId : ''; }

  // カレンダーに出す割振。今週(next)のみサーバーの集計を表示、未来の日曜は「未作成」
  function calAssignFor(date) {
    var a = S.boot.allocation;
    if (date === S.boot.next && a && !a.dayOff) {
      var status = a.state === 'confirmed' ? '確定済み' : a.adjusted ? '調整中' : '未確定';
      return { status: status, rows: (a.gyms || []).map(function (g) { return { gym: g.name, teams: g.teams.map(function (t) { return t.name; }).join('、') }; }) };
    }
    return null;
  }
  function calDescribe(e) {
    if (e.type === 'closed') return { title: calGname(e.gymId) + '　使用不可', sub: e.reason + (e.memo ? '・' + e.memo : '') };
    if (e.type === 'rest') return { title: calTname(e.teamId) + '　休み', sub: e.reason + (e.memo ? '・' + e.memo : '') };
    return { title: e.memo || 'その他の予定', sub: '' };
  }
  function calTargetDates(f) { return f.date ? [f.date] : []; }
  // 使用不可・チーム休みは、次の日曜(割振が作成済み)には登録させない。
  // 管理画面カレンダーで割当権限がある場合(管理者・割振担当)は解除する
  function calBlocked(f) {
    if (f.type === 'other') return false;
    if (S.cal.mode === 'admin' && canAllocate()) return false;
    var a = S.boot.allocation;
    return calTargetDates(f).indexOf(S.boot.next) >= 0 && !!a && !a.dayOff;
  }
  // 他チームの「チーム休み」は、管理者以外は編集できない(閲覧のみ)
  function canEditEvent(e) {
    var w = auth();
    if (w && w.role === 'power') return true;
    if (e.type !== 'rest') return true;
    return e.teamId === myTeamId();
  }
  // 予定の登録者名: どのチームの誰が登録したかを「チーム名・氏名」で表す(操作した本人)
  function eventBy() {
    var m = me();
    if (!m) return '';
    var t = teamOf(m.teamId);
    return (t ? t.name + '・' : '') + m.name;
  }
  function calCannotSave(f) { return !calTargetDates(f).length || calBlocked(f) || (f.type === 'other' && !String(f.memo).trim()) || (f.type === 'closed' && !f.gym); }
  function calSheetWarn(f) {
    return calBlocked(f)
      ? calMd(S.boot.next) + 'はすでに割振が作成されているため、ここからは登録・変更できません。変更が必要な場合は割振担当にご連絡ください。'
      : '';
  }
  function calNewForm() {
    var sel = S.cal.sel, today = S.boot.today;
    return { id: null, type: 'closed', date: sel >= today ? sel : today, gym: myHomeGym(), team: myTeamId(), reason: CAL_REASONS.closed[0], memo: '' };
  }
  function calEditForm(e) {
    return { id: e.id, type: e.type, date: e.date, gym: e.gymId || myHomeGym(), team: e.teamId || myTeamId(), reason: e.reason || (CAL_REASONS[e.type] ? CAL_REASONS[e.type][0] : ''), memo: e.memo || '' };
  }

  function viewCal() {
    if (!S.boot) return adminLoading();
    var c = S.cal;
    if (!c.ym) { var td0 = calParse(S.boot.today); c.ym = [td0.getFullYear(), td0.getMonth()]; }
    if (!c.sel) c.sel = S.boot.next || S.boot.today;
    var today = S.boot.today, mt = calParse(today), minYm = [mt.getFullYear(), mt.getMonth()];
    var y = c.ym[0], m = c.ym[1];
    var atMin = y < minYm[0] || (y === minYm[0] && m <= minYm[1]);
    var offset = new Date(y, m, 1).getDay();
    var weeks = Math.ceil((offset + new Date(y, m + 1, 0).getDate()) / 7);

    var cells = '';
    for (var i = 0; i < weeks * 7; i++) {
      var d = new Date(y, m, 1 - offset + i), t = calIso(d), bars = '', cnt = 0;
      var a = c.filters.assign && calAssignFor(t);
      if (a) { bars += '<i style="background:var(--acc)' + (a.status === '確定済み' ? '' : ';opacity:.5') + '"></i>'; cnt++; }
      calEvents().forEach(function (e) {
        if (e.date === t && c.filters[e.type] && cnt < 4) { bars += '<i style="background:' + CAL_TYPES[e.type].color + '"></i>'; cnt++; }
      });
      var cls = 'cday' + (d.getMonth() !== m ? ' out' : '') + (d.getDay() === 0 && d.getMonth() === m ? ' sun' : '') + (t === today ? ' today' : '') + (t === c.sel ? ' sel' : '');
      cells += '<button class="' + cls + '" data-a="calPick" data-v="' + t + '"><span class="cn">' + d.getDate() + '</span><span class="cbars">' + bars + '</span></button>';
    }
    var chips = ['assign', 'closed', 'rest', 'other'].map(function (k) {
      return '<button class="cchip' + (c.filters[k] ? '' : ' off') + '" data-a="calFilter" data-v="' + k + '"><i style="background:' + CAL_TYPES[k].color + '"></i>' + CAL_TYPES[k].label + '</button>';
    }).join('');

    var sd = calParse(c.sel), list = '';
    var a2 = c.filters.assign && calAssignFor(c.sel);
    if (a2) {
      list += '<div class="casg"><div class="chd"><span class="ct">割振</span><span class="cs">' + esc(a2.status) + '</span><span class="cr">割振は管理画面で決定・ここでは閲覧のみ</span></div>'
        + (a2.rows.length ? a2.rows.map(function (r) { return '<div class="cln"><b>' + esc(r.gym) + '</b><span>' + esc(r.teams) + '</span></div>'; }).join('') : '<div class="cln">割当なし</div>') + '</div>';
    } else if (c.filters.assign && calIsSun(c.sel) && c.sel > S.boot.next) {
      list += '<div class="cyet"><b>割振</b>　未作成（金曜夕方に割振を作成）</div>';
    }
    calEvents().filter(function (e) { return e.date === c.sel && c.filters[e.type]; }).forEach(function (e) {
      var ds = calDescribe(e), col = CAL_TYPES[e.type].color;
      list += '<div class="cev"><div class="cbody"><span class="ctag" style="border-color:' + col + ';color:' + col + '">' + CAL_TYPES[e.type].label + '</span>'
        + '<span class="cttl">' + esc(ds.title) + '</span>' + (ds.sub ? '<span class="csb">' + esc(ds.sub) + '</span>' : '')
        + (e.by ? '<span class="cby">登録：' + esc(e.by) + '</span>' : '') + '</div>'
        + (canEditEvent(e) ? '<button class="cedit" data-a="calEdit" data-v="' + esc(e.id) + '">編集</button>' : '') + '</div>';
    });
    if (!list) list = '<div class="cempty">この日の予定はありません</div>';

    return '<div class="cal">'
      + '<div class="cmonth"><div class="ctitle">' + y + '年' + (m + 1) + '月</div><div class="cnavs">'
      + '<button class="carrow" data-a="calPrev"' + (atMin ? ' disabled' : '') + '>‹</button>'
      + '<button class="cthis" data-a="calThis">今月</button>'
      + '<button class="carrow" data-a="calNext">›</button></div></div>'
      + '<div class="cfilters">' + chips + '</div>'
      + '<div class="cwk"><span>日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span></div>'
      + '<div class="cgrid">' + cells + '</div>'
      + '<div class="cdayhd"><b>' + (sd.getMonth() + 1) + '月' + sd.getDate() + '日（' + CAL_WD[sd.getDay()] + '）</b><span class="label">' + (calIsSun(c.sel) ? '練習日' : '') + '</span></div>'
      + '<button class="caddwide" data-a="calNew"><b>＋</b>' + (sd.getMonth() + 1) + '月' + sd.getDate() + '日の予定を登録</button>'
      + list
      + '</div>';
  }

  // 登録・修正シート(メンバーが登録。登録者＝本人。全員に共有される)
  function viewEventSheet() {
    var f = S.cal.form, isEdit = !!f.id;
    var types = ['closed', 'rest', 'other'].map(function (k) {
      var on = f.type === k, col = CAL_TYPES[k].color;
      return '<button data-a="evType" data-v="' + k + '"' + (on ? ' class="on" style="border-color:' + col + ';color:' + col + '"' : '') + '>' + CAL_TYPES[k].label + '</button>';
    }).join('');
    var dateField = '<label class="cfld"><span>日付</span><input type="date" data-evfield="date" value="' + esc(f.date) + '" min="' + esc(S.boot.today) + '"></label>';
    var gymField = '';
    if (f.type === 'closed') {
      var mh = myHomeGym();
      var hint = !f.gym ? ['体育館を選んでください', 'warn'] : f.gym === mh ? ['自分のチームのホームを初期表示しています', ''] : ['他チームの体育館を代わりに登録します', 'warn'];
      gymField = '<label class="cfld"><span>体育館</span><select data-evfield="gym">' + (mh ? '' : '<option value="">選択してください</option>')
        + (S.boot.gyms || []).map(function (g) { return '<option value="' + g.id + '"' + (g.id === f.gym ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('')
        + '</select><span class="chint ' + hint[1] + '">' + esc(hint[0]) + '</span></label>';
    }
    var teamField = '';
    if (f.type === 'rest') {
      var isPower = auth() && auth().role === 'power';
      if (isPower) {
        // 管理者は全チームから選べる
        teamField = '<label class="cfld"><span>チーム</span><select data-evfield="team">'
          + (S.boot.teams || []).map(function (t) { return '<option value="' + t.id + '"' + (t.id === f.team ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('')
          + '</select><span class="chint">全チームから選べます</span></label>';
      } else {
        // 各チーム代表は自分のチームに固定(他チームは選べない)
        var tn = (teamOf(myTeamId()) || {}).name || '';
        teamField = '<label class="cfld"><span>チーム</span><div class="evby">' + esc(tn) + '</div><span class="chint">自分のチームの休みを登録します</span></label>';
      }
    }
    var reasonField = f.type === 'other' ? '' : '<label class="cfld"><span>理由</span><select data-evfield="reason">'
      + CAL_REASONS[f.type].map(function (r) { return '<option' + (r === f.reason ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select></label>';
    var memoPh = f.type === 'closed' ? '例：運動会' : f.type === 'rest' ? '例：大会参加のため' : '例：代表者ミーティング';
    var memoField = '<label class="cfld"><span>' + (f.type === 'other' ? '内容' : 'メモ（任意）') + '</span><input type="text" data-evfield="memo" maxlength="100" value="' + esc(f.memo) + '" placeholder="' + memoPh + '"></label>';
    var w = calSheetWarn(f);
    return '<div class="scrim" data-a="closeEvSheet" data-self="1"><div class="evsheet" data-a="noop">'
      + '<div class="evhd"><b>' + (isEdit ? '予定を修正' : '予定を登録') + '</b><button class="evx" data-a="closeEvSheet">×</button></div>'
      + '<div class="share-note"><b>！</b><span>この予定は<em>全員のカレンダー</em>に反映されます（自分だけのメモではありません）。</span></div>'
      + '<div class="cfld"><span>種類</span><div class="cseg3">' + types + '</div></div>'
      + dateField + gymField + teamField + reasonField + memoField
      + '<div class="cfld"><span>登録者</span><div class="evby">' + esc(eventBy()) + '</div></div>'
      + (w ? '<div class="cwbox">' + esc(w) + '</div>' : '')
      + '<div class="evrow">' + (isEdit ? '<button class="cbtn warn" data-a="askDeleteEvent">削除</button>' : '')
      + '<button class="cbtn go" style="flex:2" data-a="saveEvent"' + (calCannotSave(f) ? ' disabled' : '') + '>' + (isEdit ? '修正を保存' : '登録') + '</button></div>'
      + '</div></div>';
  }
  function viewEventDelete() {
    var e = calEvents().filter(function (x) { return x.id === S.cal.deleteId; })[0];
    if (!e) return '';
    var ds = calDescribe(e);
    return '<div class="scrim center"><div class="evdialog" data-a="noop">'
      + '<div class="evq">この予定を削除しますか？</div>'
      + '<div class="evboxed">' + calMd(e.date) + '　' + esc(ds.title) + (ds.sub ? '（' + esc(ds.sub) + '）' : '') + '</div>'
      + '<div class="evrow"><button class="cbtn ghost" data-a="cancelDeleteEvent">キャンセル</button><button class="cbtn warnfill" data-a="doDeleteEvent">削除する</button></div>'
      + '</div></div>';
  }

  // ---- 連絡先 ----
  // 連絡先の値を、種別アイコン付きで表示する。電話・メールはタップで発信/送信、LINE/ID等はタップでコピー
  function contactValue(value) {
    var text = String(value || '').trim();
    if (!text) return '<span class="val mute">—</span>';
    var kind = contactKind(text);
    var inner = contactIcon(kind) + '<span class="cval-text">' + esc(text) + '</span>';
    var href = contactHref(text);
    if (href) return '<a class="cval ' + kind + '" href="' + esc(href) + '">' + inner + '</a>';
    return '<button class="cval ' + kind + '" data-a="copyContact" data-v="' + esc(text) + '">' + inner + '<span class="cval-copy">コピー</span></button>';
  }

  function viewContacts() {
    var list = S.admin.contacts;
    var html = '<div class="admin-title"><div class="title-sm">連絡先<span class="acc">.</span></div></div>';
    if (!list) return html + adminLoading();
    list.forEach(function (t) {
      var row = function (label, c) {
        return '<div class="contact"><span class="role">' + label + '</span>' +
          (c ? '<b>' + esc(c.name) + '</b>' + contactValue(c.contact) : '<span class="mute">未登録</span>') + '</div>';
      };
      html += '<div class="contact-team"><h3><span class="mark">' + esc(teamMark(t.teamName)) + '</span>' + esc(t.teamName) + '</h3>' + row('代表', t.rep) + row('副代表', t.vice) + '</div>';
    });
    return html;
  }

  // ---- チーム管理 ----
  function viewTeamAdmin() {
    var team = S.admin.team;
    var who = auth();
    var html = '<div class="admin-title">' + (who && who.role === 'power' ? '<div class="label">管理者</div>' : '') +
      '<div class="title-sm">メンバー管理<span class="acc">.</span></div></div>';
    if (!team) return html + adminLoading();

    if (S.admin.teamList) {
      // 管理者はプルダウンで全チームを切り替え
      html += '<div class="team-switch"><span class="label">チーム</span><select class="text-input" data-pick="team">' +
        S.admin.teamList.map(function (t) {
          return '<option value="' + esc(t.id) + '"' + (t.id === team.teamId ? ' selected' : '') + '>' + esc(t.name) + (t.passSet ? '' : '（パス未設定）') + '</option>';
        }).join('') + '</select></div>';
    } else {
      // 各チームのパスで入った人は、自チーム名を大きく表示
      html += '<div class="team-self"><span class="label">あなたのチーム</span><b>' + esc(team.teamName) + '</b></div>';
    }

    // 在籍を上・休部を下にし、それぞれ名前の50音／アルファベット順で並べる
    var sorted = team.members.slice().sort(function (a, b) {
      if (!!a.onLeave !== !!b.onLeave) return a.onLeave ? 1 : -1;
      return String(a.name).localeCompare(String(b.name), 'ja');
    });
    var activeCount = team.members.filter(function (m) { return !m.onLeave; }).length;
    html += '<div class="section"><div class="section-head"><span class="label">メンバー</span><span class="label">' + activeCount + '人' + (activeCount !== team.members.length ? '（休部' + (team.members.length - activeCount) + '）' : '') + '</span></div>';
    sorted.forEach(function (m) {
      html += '<div class="list-row member-row' + (m.onLeave ? ' is-leave' : '') + '">' +
        '<button class="member-name" data-a="toggleLeave" data-v="' + esc(m.id) + '" title="タップで在籍／休部を切り替え"><span class="mnm">' + esc(m.name) + '</span>' +
        '<span class="mstatus ' + (m.onLeave ? 'leave' : 'active') + '">' + (m.onLeave ? '休部' : '在籍') + '</span></button>' +
        '<button class="link" data-a="askEditMember" data-v="' + esc(m.id) + '">編集</button>' +
        '<button class="link danger" data-a="askRemoveMember" data-v="' + esc(m.id) + '">削除</button></div>';
    });
    html += '<div class="note-line">名前をタップすると在籍／休部を切り替えられます。「編集」で名前を変更できます。</div>';
    html += '<div class="form-row">' + textInput('t:newMember', '', '名前を入力', 'text', 30) + '<button class="sub-btn" data-a="addMember">追加</button></div></div>';

    html += '<div class="section"><div class="section-head"><span class="label">連絡先(他チームの担当者にも見えます)</span></div>';
    [['rep', '代表', team.rep], ['vice', '副代表', team.vice]].forEach(function (r) {
      // 名前はメンバーからプルダウンで選ぶ。名簿にない既存の値は（名簿外）として残す
      var opts = [['', '（未設定）']].concat(team.members.map(function (m) { return [m.name, m.name]; }));
      if (r[2].name && !team.members.some(function (m) { return m.name === r[2].name; })) opts.push([r[2].name, r[2].name + '（名簿外）']);
      var ck = contactKind(r[2].contact);
      html += '<div class="field-label">' + r[1] + '</div><div class="form-row">' + selectInput('t:' + r[0] + ':name', opts, r[2].name) + '</div>' +
        '<div class="form-row">' + textInput('t:' + r[0] + ':contact', r[2].contact, '電話番号、LINE ID など', 'text', 100) +
        '<button class="sub-btn" data-a="saveContact" data-v="' + r[0] + '">保存</button></div>' +
        (ck ? '<div class="chint">判定: ' + contactIcon(ck) + ' ' + CONTACT_LABEL[ck] + '（保存後に反映）</div>' : '');
    });
    html += '</div>';

    html += '<div class="section"><div class="section-head"><span class="label">ホーム(体育館と使用時間)</span></div>';
    // ホームは体育館＋時間の練習枠。他チームがホームにしている体育館は、そのチームと時間を添える
    var home = team.homeGym;
    var schools = team.schools || [];
    var gymOptions = [['', 'なし']].concat(schools.map(function (g) {
      var users = (g.users || []).map(function (u) { return u.name + (u.start ? ' ' + u.start + '〜' + u.end : ''); });
      return [g.id, g.name + (users.length ? '（' + users.join('・') + '）' : '')];
    }));
    html += '<div class="form-row"><span class="home-label">体育館</span>' + selectInput('t:home:gym', gymOptions, home ? home.id : '') + '</div>' +
      '<div class="form-row"><span class="home-label">時間</span>' + textInput('t:home:start', home ? home.start : '', '', 'time') + '<span class="time-sep">〜</span>' +
      textInput('t:home:end', home ? home.end : '', '', 'time') + '<button class="sub-btn" data-a="saveHomeGym">保存</button></div>';
    if (home && home.shared && home.shared.length) {
      html += '<div class="note-line">' + esc(home.shared.join('・')) + 'と同じ枠(同じ体育館・同じ時間)で練習します。</div>';
    }
    html += '<div class="note-line">同じ体育館でも時間が違えば、別の練習場所として割り振られます。同じ時間にすると、そのチームと一緒の枠になります。</div>';
    html += '</div>';

    return html + '<div class="section"><button class="link" data-a="logout">この端末のパス入力を解除する</button></div>';
  }

  // ---- 管理者ページ ----
  function numberInput(key, placeholder, maxlength, type) {
    return '<input class="text-input" type="' + (type || 'text') + '" inputmode="numeric" maxlength="' + maxlength + '" autocomplete="new-password"' +
      ' placeholder="' + esc(placeholder) + '" data-draft="' + esc(key) + '" value="' + esc(draft(key)) + '">';
  }

  function passCell(t) {
    if (!t.passSet) return '<small>未設定</small>';
    if (!t.pass) return '<small>番号不明(再設定してください)</small>';
    var shown = !!S.revealPass[t.id];
    return '<span class="pass-value mono">' + (shown ? esc(t.pass) : '••••') + '</span>' +
      '<button class="link" data-a="toggleReveal" data-v="' + esc(t.id) + '">' + (shown ? '隠す' : '表示') + '</button>';
  }

  function viewPowerAdmin() {
    var data = S.admin.power;
    var html = '<div class="admin-title"><div class="title-sm">管理者<span class="acc">.</span></div></div>';
    if (!data) return html + adminLoading();

    // ① チームパス
    var unsetCount = data.teams.filter(function (t) { return !t.passSet; }).length;
    html += '<div class="section"><div class="section-head"><span class="label">チームパス</span><span class="label">' + data.teams.length + 'チーム</span></div>';
    data.teams.forEach(function (t) {
      html += '<div class="list-row pass-row"><span class="mark">' + esc(teamMark(t.name)) + '</span><span class="pass-name">' + esc(t.name) + '</span>' + passCell(t) + '</div>';
    });
    html += '<div class="form-row"><button class="sub-btn full" data-a="askRandomPass"' + (unsetCount ? '' : ' disabled') + '>未設定のチームにランダム設定' + (unsetCount ? '（' + unsetCount + '）' : '') + '</button></div>';
    html += '<div class="field-label">個別に設定・変更</div><div class="form-row">' +
      selectInput('p:passTeam', data.teams.map(function (t) { return [t.id, t.name]; }), data.teams[0] && data.teams[0].id) + '</div>' +
      '<div class="form-row">' + numberInput('p:passNew', '数字4桁', 4) + '<button class="sub-btn" data-a="setTeamPass">設定</button></div>' +
      '<div class="note-line">変更すると、そのチームの端末は再入力が必要です。</div></div>';

    // ② 割振担当チーム(スイッチ)
    html += '<div class="section"><div class="section-head"><span class="label">割振担当チーム</span></div>' +
      '<div class="note-line">ONのチームだけ割り振り機能を使えます。管理者は常に操作できます。</div>';
    data.teams.forEach(function (t) {
      html += '<div class="list-row"><span class="mark' + (t.allocDuty ? ' mine' : '') + '">' + esc(teamMark(t.name)) + '</span>' +
        '<span class="pass-name">' + esc(t.name) + '</span>' +
        '<button class="swx swx-sm' + (t.allocDuty ? ' on' : '') + '" role="switch" aria-checked="' + !!t.allocDuty + '" data-a="toggleAllocDuty" data-v="' + esc(t.id) + '" title="割振担当">' +
        '<span class="swx-track"><span class="swx-knob"></span></span></button></div>';
    });
    html += '</div>';

    // ③ 管理者パス(折りたたみ・既定で隠す)
    html += '<div class="section"><button class="fold-head" data-a="togglePowerFold" aria-expanded="' + S.ui.openPower + '"><span class="label">管理者パス</span><i>' + (S.ui.openPower ? '▲' : '▼') + '</i></button>';
    if (S.ui.openPower) {
      html += '<div class="note-line">新しいパスをランダムで発行し、登録メールに通知します。画面には表示しません。再設定すると、他の端末の管理者ログインは解除されます。</div>' +
        '<div class="form-row"><button class="sub-btn full" data-a="askResetPower">管理者パスを再設定</button></div>';
    }
    html += '</div>';

    // ④ チームの登録(最下部・折りたたみ・既定で隠す)
    html += '<div class="section"><button class="fold-head" data-a="toggleRegFold" aria-expanded="' + S.ui.openReg + '"><span class="label">チームの登録</span><i>' + (S.ui.openReg ? '▲' : '▼') + '</i></button>';
    if (S.ui.openReg) {
      html += '<div class="form-row">' + textInput('p:teamName', '', 'チーム名', 'text', 30) + '</div>' +
        '<div class="form-row">' + textInput('p:teamGymName', '', 'ホーム体育館名（任意）', 'text', 40) +
        '<button class="sub-btn" data-a="addTeam">登録</button></div>' +
        '<div class="note-line">記号はチーム名の頭文字から自動で付きます。体育館がマスタになければ追加されます。登録後、上のチームパスを設定してください。</div>';
      html += '<div class="field-label">登録済みチームの削除</div>';
      data.teams.forEach(function (t) {
        html += '<div class="list-row"><span class="mark">' + esc(teamMark(t.name)) + '</span><span class="pass-name">' + esc(t.name) + '</span>' +
          '<button class="link danger" data-a="askDeleteTeam" data-v="' + esc(t.id) + '">削除</button></div>';
      });
      html += '<div class="note-line">削除するとメンバーは名簿から外れます。過去の記録は残ります。</div>';
    }
    html += '</div>';

    // ⑤ 体育館マスタ(最下部・折りたたみ・既定で隠す)
    html += '<div class="section"><button class="fold-head" data-a="toggleGymFold" aria-expanded="' + S.ui.openGym + '"><span class="label">体育館マスタ</span><i>' + (S.ui.openGym ? '▲' : '▼') + '</i></button>';
    if (S.ui.openGym) {
      var usedGym = {};
      (S.boot.teams || []).forEach(function (t) { if (t.homeGymId) usedGym[t.homeGymId] = true; });
      var gyms = data.gyms || [];
      html += '<div class="gym-list">';
      gyms.forEach(function (g) {
        html += '<div class="list-row gym-row" data-gym="' + esc(g.id) + '">' +
          (gyms.length > 1 ? '<span class="drag-handle" aria-label="ドラッグして並べ替え">⋮⋮</span>' : '') +
          '<span class="pass-name">' + esc(g.name) + '</span>' +
          (usedGym[g.id] ? '<span class="duty-state">使用中</span>' : '') +
          '<button class="link" data-a="askRenameGym" data-v="' + esc(g.id) + '">名称変更</button>' +
          (usedGym[g.id] ? '' : '<button class="link danger" data-a="askDeleteGym" data-v="' + esc(g.id) + '">削除</button>') + '</div>';
      });
      html += '</div>';
      html += '<div class="form-row">' + textInput('p:gymName', '', '新しい体育館名', 'text', 40) +
        '<button class="sub-btn" data-a="addGym">登録</button></div>';
      html += '<div class="note-line">どのチームのホームにもなっていない体育館は、割り振りの「その他の体育館」から臨時で借りる場所として選べます。</div>';
      html += '<div class="note-line">左の ⋮⋮ をドラッグすると並び順を変えられます(割り振りやカレンダーの体育館の並びにも反映)。チームのホームになっている体育館は、ホームを外すまで削除できません。</div>';
    }
    html += '</div>';
    return html;
  }

  // ---- 下部タブ ----
  function viewTabs(isAdmin) {
    var who = auth();
    var tabs = isAdmin
      ? (canAllocate() ? [['alloc', '割り振り']] : []).concat([['calendar', 'カレンダー'], ['team', 'メンバー管理'], ['contacts', '連絡先']])
      : [['home', 'ホーム'], ['answer', '出欠'], ['calendar', 'カレンダー'], ['admin', '管理画面']];
    if (isAdmin && who && who.role === 'power') tabs.push(['power', '管理者']);
    var cols = ' style="grid-template-columns:repeat(' + tabs.length + ',1fr)"';
    return '<div class="tabs"' + cols + '>' + tabs.map(function (t, i) {
      return '<button class="tab' + (S.screen === t[0] ? ' on' : '') + '" data-a="tab" data-v="' + t[0] + '"><span>0' + (i + 1) + '</span>' + t[1] + '</button>';
    }).join('') + '</div>';
  }

  function viewError() {
    return '<div class="error"><b>' + esc(S.error) + '</b><p>時間をおいて開き直してください。</p><button class="ghost strong" data-a="reload">読み込み直す</button></div>';
  }

  // ---- ダイアログ ----
  function viewPass() {
    var len = S.passLength;
    var dots = [];
    for (var i = 0; i < len; i++) dots.push('<span' + (i < S.code.length ? ' class="on"' : '') + '></span>');
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(function (k) {
      return '<button class="key' + (k ? '' : ' none') + '"' + (k ? ' data-a="key" data-v="' + k + '"' : '') + '>' + k + '</button>';
    }).join('');
    return '<div class="pass"><div class="label">' + (len === 4 ? 'チームのパスコード' : '管理者パスコード') + '</div><div class="dots">' + dots.join('') + '</div>' +
      '<div class="pass-msg' + (S.codeErr ? ' err' : '') + '">' + esc(S.codeMsg) + '</div><div class="keys">' + keys + '</div>' +
      '<button class="link" data-a="togglePass">' + (len === 4 ? '管理者用' : 'チーム用') + '</button>' +
      '<button class="link" data-a="closeDialog">やめる</button></div>';
  }

  function viewGymRenameSheet() {
    var g = S.admin.power && (S.admin.power.gyms || []).filter(function (x) { return x.id === S.gymEditId; })[0];
    var cur = g ? g.name : '';
    return '<div class="scrim" data-a="closeDialog"><div class="sheet" data-a="noop"><h3>体育館名を変更</h3>' +
      '<div class="form-row">' + textInput('gymName', cur, '体育館名', 'text', 40) + '</div>' +
      '<div class="conf-btns"><button class="ghost" style="height:56px" data-a="closeDialog">やめる</button>' +
      '<button class="go" data-a="renameGym">保存</button></div></div></div>';
  }

  function viewMemberEditSheet() {
    var m = S.admin.team && S.admin.team.members.filter(function (x) { return x.id === S.renameMemberId; })[0];
    var cur = m ? m.name : '';
    var leave = !!S.editLeave;
    return '<div class="scrim" data-a="closeDialog"><div class="sheet" data-a="noop"><h3>メンバーを編集</h3>' +
      '<div class="field-label">名前</div><div class="form-row">' + textInput('rename', cur, '名前', 'text', 30) + '</div>' +
      '<div class="field-label">ステータス</div>' +
      '<div class="seg"><button class="seg-btn' + (!leave ? ' on' : '') + '" data-a="editStatus" data-v="active">在籍</button>' +
      '<button class="seg-btn' + (leave ? ' on' : '') + '" data-a="editStatus" data-v="leave">休部</button></div>' +
      '<div class="conf-btns"><button class="ghost" style="height:56px" data-a="closeDialog">やめる</button>' +
      '<button class="go" data-a="saveMemberEdit">保存</button></div></div></div>';
  }

  function viewConfirmSheet(title, note, action, label) {
    return '<div class="scrim" data-a="closeDialog"><div class="sheet" data-a="noop"><h3>' + esc(title) + '</h3>' +
      '<div class="conf-note">' + esc(note) + '</div>' +
      '<div class="conf-btns"><button class="ghost" style="height:56px" data-a="closeDialog">戻る</button>' +
      '<button class="go" data-a="' + action + '">' + esc(label) + '</button></div></div></div>';
  }

  function viewDialog(member, team) {
    if (S.cal && S.cal.confirmDel) return viewEventDelete();
    if (S.cal && S.cal.confirmClosed) return viewConfirmSheet('この体育館を使用不可にしますか?', '選んだ日は、この体育館が全チームの割り振りから外れます。みんなのカレンダーに反映されます。', 'doSaveEvent', '使用不可にする');
    if (S.screen === 'calendar' && S.cal && S.cal.sheet) return viewEventSheet();
    if (S.dialog === 'user') {
      return '<div class="scrim" data-a="closeDialog"><div class="sheet sheet-user" data-a="noop"><h3>' + esc(member.name) + 'さん / ' + esc(team.name) + '</h3>' +
        '<p>この端末にログイン状態を保存しています。</p><button class="ghost strong" data-a="changeUser">ログインを変更する</button></div></div>';
    }
    if (S.dialog === 'code') return viewPass();
    if (S.dialog === 'deleteComment') return viewConfirmSheet('このコメントを削除しますか?', '削除すると元に戻せません。', 'deleteComment', '削除する');
    if (S.dialog === 'randomPass') return viewConfirmSheet('未設定のチームにパスを割り当てますか?', 'パス未設定のチームに、重複しない4桁をランダムで設定します。設定済みのチームは変わりません。', 'randomizeTeamPasses', '割り当てる');
    if (S.dialog === 'resetPower') return viewConfirmSheet('管理者パスを再設定しますか?', '新しいパスを発行して登録メールに通知します。画面には表示しません。再設定すると、他の端末の管理者ログインは解除されます。', 'resetPowerPass', '再設定する');
    if (S.dialog === 'deleteTeam') {
      var dt = S.admin.power && S.admin.power.teams.filter(function (t) { return t.id === S.deleteTeamId; })[0];
      return viewConfirmSheet((dt ? dt.name : '') + 'チームを削除しますか?', 'メンバーは名簿から外れ、割り振り・チームパスの設定も消えます。過去の出欠・コメントは残ります。元に戻せません。', 'deleteTeam', '削除する');
    }
    if (S.dialog === 'editMember') return viewMemberEditSheet();
    if (S.dialog === 'renameGym') return viewGymRenameSheet();
    if (S.dialog === 'tempSlot') return viewTempSlotSheet();
    if (S.dialog === 'allocAuto') {
      return viewConfirmSheet('自動で割り振り直しますか?', '今の割り振りを、ホームと参加人数をもとにした自動の割振で置き換えます。手で動かしたチームも自動の位置に戻り、元には戻せません。', 'allocAuto', '割り振り直す');
    }
    if (S.dialog === 'unconfirm') {
      var ud = S.boot && S.boot.next ? allocDateLabel(S.boot.next) : '';
      return viewConfirmSheet(ud + 'の割り振りの確定を解除しますか?', '割り振りの中身は残ります。メンバーの画面は「未確定」に戻り、もう一度「決定」すると確定します。', 'allocUnconfirm', '解除する');
    }
    if (S.dialog === 'deleteGym') {
      var dg = S.admin.power && (S.admin.power.gyms || []).filter(function (g) { return g.id === S.gymEditId; })[0];
      return viewConfirmSheet((dg ? dg.name : '') + 'を削除しますか?', 'この体育館をマスタから外します。過去の記録は残ります。', 'deleteGym', '削除する');
    }
    if (S.dialog === 'removeMember') {
      var target = S.admin.team && S.admin.team.members.filter(function (m) { return m.id === S.removeMemberId; })[0];
      return viewConfirmSheet((target ? target.name : '') + 'さんを削除しますか?', '名簿と集計から外れます。過去の出欠とコメントは残ります。', 'removeMember', '削除する');
    }
    if (S.screen === 'alloc' && S.alloc.pending) return viewAllocMove();
    return '';
  }

  // ---- 描画 ----
  function fitHero() {
    var date = document.getElementById('heroDate');
    var side = document.getElementById('heroSide');
    if (!date || !side) return;
    // 12/27 のような長い日付は、右の SUN と重ならない大きさまで縮める
    date.style.fontSize = '';
    var room = date.parentNode.clientWidth - side.offsetWidth - 8;
    var width = date.getBoundingClientRect().width;
    if (width > room) date.style.fontSize = Math.floor(118 * room / width) + 'px';
  }

  function render() {
    var app = document.getElementById('app');
    var overlay = document.getElementById('overlay');
    if (S.error && !S.boot) {
      app.innerHTML = viewError();
      overlay.innerHTML = '';
      return;
    }
    if (!S.boot) return;
    var member = me();
    if (!member) {
      app.innerHTML = viewOnboard();
      overlay.innerHTML = '';
      return;
    }
    var team = teamOf(member.teamId);
    var isAdmin = !!ADMIN_SCREENS[S.screen] || (S.screen === 'calendar' && S.cal.mode === 'admin');
    var previous = document.getElementById('mainScroll');
    var keepScroll = previous && previous.getAttribute('data-screen') === S.screen ? previous.scrollTop : 0;
    var body = S.screen === 'answer' ? viewAnswer(member, team)
      : S.screen === 'alloc' ? viewAlloc(team)
      : S.screen === 'calendar' ? viewCal()
      : S.screen === 'contacts' ? viewContacts()
      : S.screen === 'team' ? viewTeamAdmin()
      : S.screen === 'power' ? viewPowerAdmin()
      : viewHome(member, team);
    app.innerHTML = viewHeader(isAdmin, member, team) +
      '<div class="main" id="mainScroll" data-screen="' + S.screen + '">' + body + '</div>' + viewTabs(isAdmin);
    document.getElementById('mainScroll').scrollTop = keepScroll;
    overlay.innerHTML = viewDialog(member, team);
    fitHero();
  }

  // ---- サーバー応答の反映 ----
  function applyData(result) {
    if (result.boot) setBoot(result.boot);
    if (result.calendar) S.admin.calendar = result.calendar;
    if (result.contacts) S.admin.contacts = result.contacts;
    if (result.team) S.admin.team = result.team;
    if (result.teamList) S.admin.teamList = result.teamList;
    if (result.powerAdmin) S.admin.power = result.powerAdmin;
  }

  // keepDialog が true なら、カレンダーのシートなどを開いたまま内容だけ更新する
  function handleResult(result, message, keepDialog) {
    if (result.ok) {
      applyData(result);
      if (!keepDialog) {
        S.dialog = null;
        S.moveTeam = null;
      }
      render();
      if (message) toast(message);
      return true;
    }
    if (result.code === 'AUTH') {
      dropAuth();
      S.screen = 'home';
      S.dialog = 'code';
      S.passLength = 4;
      S.code = '';
      S.codeErr = true;
      S.codeMsg = result.message;
    } else {
      if (!keepDialog) {
        S.dialog = null;
        S.moveTeam = null;
      }
      toast(result.message);
    }
    render();
    return false;
  }

  function adminCall(name, extra, message, options) {
    var opts = options || {};
    call(name, [token()].concat(extra || []), function (result) {
      if (handleResult(result, message, opts.keep) && opts.clear) clearDrafts(opts.clear);
      if (result.ok && opts.clear) render();
    }, opts.busy);
  }

  function teamIdForAdmin() {
    var who = auth();
    if (!who) return null;
    if (who.role !== 'power') return who.teamId;
    return S.admin.teamId || S.boot.teams[0].id;
  }

  function openAdminScreen(screen) {
    if (screen === 'alloc') { openAlloc(); return; }
    S.screen = screen;
    S.dialog = null;
    render();
    if (screen === 'contacts') adminCall('apiContacts');
    if (screen === 'team') adminCall('apiTeamAdmin', [teamIdForAdmin()]);
    if (screen === 'power') adminCall('apiPowerAdmin');
  }

  // 割り振り画面を開く。最新の割当を取り直し、画面内の割当(map)を初期化する
  function openAlloc() {
    S.screen = 'alloc';
    S.dialog = null;
    initAlloc();
    render();
    // 最新の割当を取り直す。ただし利用者が操作を始めていたら初期化しない(編集・画面遷移を保持)
    call('apiAllocation', [token()], function (result) {
      if (result.ok) { setBoot(result.boot); if (!S.alloc.started) initAlloc(); render(); }
      else handleResult(result);
    });
  }
  function initAlloc() {
    var a = S.boot && S.boot.allocation, map = {};
    if (a && a.alloc) Object.keys(a.alloc).forEach(function (k) { map[k] = a.alloc[k]; });
    var gym0 = a && a.gyms && a.gyms[0] ? a.gyms[0].id : '';
    S.alloc = { screen: 'pick', gym: gym0, map: map, pending: null, version: a ? (a.version || 0) : 0, lineText: '', copied: false, started: false };
  }
  function scrollTop_() { var m = document.getElementById('mainScroll'); if (m) m.scrollTop = 0; }
  // 週の状態操作(締切・再開・解除)。割当の map は保持し、boot と表示だけ更新する
  function allocStateOp(apiName, message, label) {
    call(apiName, [token(), S.boot.next], function (result) {
      // カレンダーへの反映に失敗しても操作自体は成功している。その旨を添えて知らせる
      if (result.ok) { setBoot(result.boot); render(); toast(message + (result.gcalError ? '(' + result.gcalError + ')' : '')); }
      else handleResult(result);
    }, label);
  }

  // メンバーのカレンダー(月表示)。予定は boot に含まれる。開くたびに最新を取り直す
  function openMemberCalendar() {
    S.cal.mode = 'member';
    openCalendar_();
  }
  // 管理画面のカレンダー。管理者・割振担当は割振済みの次の日曜にも登録できる
  function openAdminCalendar() {
    S.cal.mode = 'admin';
    openCalendar_();
  }
  function openCalendar_() {
    S.screen = 'calendar';
    S.dialog = null;
    if (S.boot && !S.cal.ym) { var td = calParse(S.boot.today); S.cal.ym = [td.getFullYear(), td.getMonth()]; S.cal.sel = S.boot.next || S.boot.today; }
    render();
    call('apiBootstrap', [], function (result) {
      if (result.ok) { setBoot(result.boot); render(); }
    });
  }

  // カレンダーの登録・削除の結果を反映する。boot を更新し、必要なら選択日・月を合わせる
  function calApply(result, message, onOk) {
    if (result.ok) {
      setBoot(result.boot);
      if (onOk) onOk();
      render();
      if (message) toast(message);
    } else {
      toast(result.message);
    }
  }

  function saveNote(date, note) {
    var map = S.boot.notes[date];
    var before = map[S.me] || '';
    var memberId = S.me;
    if (before === note) return;
    if (note) map[memberId] = note; else delete map[memberId];
    call('apiSaveNote', [memberId, date, note], function (result) {
      if (result.ok) {
        delete S.drafts['note:' + date];
        store.set(KEY.boot, JSON.stringify(S.boot));
        toast(dateLabel(date) + ' ' + (note ? 'コメントを保存しました' : 'コメントを削除しました'));
        return;
      }
      // 保存できなかった場合は保存済みの値を戻し、入力内容は欄に残す
      if (before) map[memberId] = before; else delete map[memberId];
      toast(result.message);
    });
  }

  function loginCode() {
    S.loggingIn = true;
    S.codeMsg = '確認中…';
    render();
    call('apiLogin', [S.code], function (result) {
      S.loggingIn = false;
      S.code = '';
      if (result.ok) {
        store.set(KEY.auth, JSON.stringify({ token: result.token, role: result.role, teamId: result.teamId, expires: result.expires }));
        toast(result.role === 'power' ? '管理者モード' : 'ログインしました');
        openAdminScreen(canAllocate() ? 'alloc' : 'contacts');
        return;
      }
      S.codeErr = true;
      S.codeMsg = result.message;
      render();
    });
  }

  // ---- 操作 ----
  var actions = {
    noop: function () {},
    reload: function () { load(); },
    obTeam: function (v) { S.obTeam = v; render(); },
    obBack: function () { S.obTeam = null; render(); },
    obMember: function (v) {
      S.me = v;
      S.obTeam = null;
      S.screen = 'home';
      store.set(KEY.me, v);
      render();
      toast(me().name + 'さんで、ログインしました');
    },
    tab: function (v) {
      if (v === 'admin') { actions.goAdmin(); return; }
      if (v === 'calendar') {
        var adminCtx = !!ADMIN_SCREENS[S.screen] || (S.screen === 'calendar' && S.cal.mode === 'admin');
        if (adminCtx) openAdminCalendar(); else openMemberCalendar();
        return;
      }
      if (ADMIN_SCREENS[v]) { openAdminScreen(v); return; }
      S.screen = v;
      S.dialog = null;
      render();
    },
    openUser: function () { S.dialog = 'user'; render(); },
    closeDialog: function () {
      S.dialog = null;
      S.moveTeam = null;
      S.code = '';
      S.codeMsg = '';
      S.codeErr = false;
      if (S.cal) S.cal.confirmClosed = false;
      clearDrafts('d:');
      render();
    },
    changeUser: function () {
      S.me = null;
      S.dialog = null;
      S.screen = 'home';
      store.del(KEY.me);
      render();
    },
    answer: function (v) {
      var parts = v.split('|');
      var date = parts[0];
      var status = parts[1];
      var map = S.boot.attendance[date];
      var before = map[S.me];
      if (before === status) return;
      map[S.me] = status;
      render();
      toast(dateLabel(date) + ' ' + LABEL[status] + 'で保存しました');
      call('apiSetAttendance', [S.me, date, status], function (result) {
        if (result.ok) {
          store.set(KEY.boot, JSON.stringify(S.boot));
          return;
        }
        // 保存できなかったので表示を元に戻す
        if (before) map[S.me] = before; else delete map[S.me];
        if (result.code === 'WEEK_CLOSED') S.boot.weekStates[date] = 'closed';
        render();
        toast(result.message);
      });
    },
    toggleComposer: function () { S.composerOpen = !S.composerOpen; render(); },
    toggleNote: function (v) {
      S.noteOpen[v] = !S.noteOpen[v];
      render();
      if (S.noteOpen[v]) {
        var input = document.querySelector('[data-note="' + v + '"]');
        if (input) input.focus();
      }
    },
    postComment: function () {
      var text = draft('comment').trim();
      if (!text) { toast('コメントを入力してください'); return; }
      call('apiPostComment', [S.me, S.boot.next, text], function (result) {
        if (result.ok) {
          S.drafts.comment = '';
          S.composerOpen = false;
        }
        handleResult(result, '投稿しました');
      });
    },
    askDelete: function (v) { S.dialog = 'deleteComment'; S.deleteId = v; render(); },
    deleteComment: function () {
      var id = S.deleteId;
      S.dialog = null;
      S.deleteId = null;
      render();
      call('apiDeleteComment', [id, S.me, token()], function (result) {
        // 他の人が先に削除していた場合は、最新の状態を取り直す
        if (!result.ok && result.code === 'NOT_FOUND') load();
        handleResult(result, '削除しました');
      });
    },

    // パス入力
    goAdmin: function () {
      if (token()) { openAdminScreen(canAllocate() ? 'alloc' : 'contacts'); return; }
      S.dialog = 'code';
      S.passLength = 4;
      S.code = '';
      S.codeErr = false;
      S.codeMsg = '';
      render();
    },
    togglePass: function () {
      S.passLength = S.passLength === 4 ? 8 : 4;
      S.code = '';
      S.codeErr = false;
      S.codeMsg = '';
      render();
    },
    key: function (v) {
      if (S.loggingIn) return;
      S.codeErr = false;
      S.codeMsg = '';
      if (v === '⌫') {
        S.code = S.code.slice(0, -1);
        render();
        return;
      }
      S.code = (S.code + v).slice(0, S.passLength);
      if (S.code.length < S.passLength) { render(); return; }
      loginCode();
    },
    logout: function () {
      dropAuth();
      S.screen = 'home';
      render();
      toast('パス入力を解除しました');
    },

    // 割り振り
    sumWeek: function (v) { S.sumIndex = Number(v); render(); },
    toggleSum: function () { S.sumOpen = !S.sumOpen; if (!S.sumOpen) S.sumIndex = 0; render(); },
    allocGym: function (v) { S.alloc.started = true; S.alloc.gym = v; render(); },
    allocTap: function (v) {
      S.alloc.started = true;
      var a = S.alloc.map[v];
      if (a === S.alloc.gym) { delete S.alloc.map[v]; render(); }
      else if (!a) { S.alloc.map[v] = S.alloc.gym; render(); }
      else { S.alloc.pending = v; render(); }
    },
    // 臨時枠(その他の体育館)の追加と取り外し
    askTempSlot: function () { clearDrafts('a:temp'); S.dialog = 'tempSlot'; render(); },
    addTempSlot: function () {
      var A = allocA(), list = A.tempGyms || [];
      var gymId = draft('a:tempGym', list[0] ? list[0].id : ''), start = draft('a:tempStart', ''), end = draft('a:tempEnd', '');
      if (!gymId) return;
      if (!start || !end) { toast('使用時間を入力してください'); return; }
      call('apiAddTempSlot', [token(), S.boot.next, gymId, start, end], function (result) {
        if (result.ok) {
          setBoot(result.boot);
          S.dialog = null;
          S.alloc.started = true;
          if (result.slotId) S.alloc.gym = result.slotId;
          clearDrafts('a:temp');
          render(); toast('臨時枠を追加しました');
        } else handleResult(result, null, true);
      }, '追加中…');
    },
    removeTempSlot: function (v) {
      call('apiRemoveTempSlot', [token(), S.boot.next, v], function (result) {
        if (result.ok) {
          setBoot(result.boot);
          Object.keys(S.alloc.map).forEach(function (k) { if (S.alloc.map[k] === v) delete S.alloc.map[k]; });
          var first = allocA().gyms[0];
          S.alloc.gym = first ? first.id : '';
          render(); toast('臨時枠を外しました');
        } else handleResult(result);
      }, '保存中…');
    },
    allocCancelMove: function () { S.alloc.pending = null; render(); },
    allocConfirmMove: function () { S.alloc.map[S.alloc.pending] = S.alloc.gym; S.alloc.pending = null; render(); },
    allocToConfirm: function () { S.alloc.started = true; S.alloc.screen = 'confirm'; render(); scrollTop_(); },
    allocBack: function () { S.alloc.screen = 'pick'; render(); scrollTop_(); },
    allocDecide: function () {
      call('apiSaveAssignment', [token(), S.boot.next, S.alloc.map, S.alloc.version], function (result) {
        if (result.ok) {
          setBoot(result.boot);
          S.alloc.lineText = result.lineText || '';
          S.alloc.version = (result.boot.allocation && result.boot.allocation.version) || S.alloc.version;
          S.alloc.screen = 'line';
          S.alloc.copied = false;
          render(); scrollTop_(); toast('割当を決定しました' + (result.gcalError ? '(' + result.gcalError + ')' : ''));
        } else if (result.code === 'CONFLICT') {
          toast(result.message); openAlloc();
        } else { handleResult(result); }
      }, '保存中…');
    },
    allocCopyLine: function () {
      var text = S.alloc.lineText || '';
      var done = function () { S.alloc.copied = true; render(); toast('コピーしました'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
      else done();
    },
    // 自動の割り振り直しは、念のため最終確認を挟む
    askAllocAuto: function () { S.dialog = 'allocAuto'; render(); },
    allocAuto: function () {
      S.dialog = null; render();
      call('apiResetDraft', [token(), S.boot.next], function (result) {
        if (result.ok) { setBoot(result.boot); initAlloc(); render(); toast('自動で割り振りました'); }
        else handleResult(result);
      }, '割当中…');
    },
    allocClose: function () { allocStateOp('apiCloseWeek', '回答を締め切りました', '更新中…'); },
    allocReopen: function () { allocStateOp('apiReopenWeek', '回答の受付を再開しました', '更新中…'); },
    askUnconfirm: function () { S.dialog = 'unconfirm'; render(); },
    allocUnconfirm: function () { S.dialog = null; render(); allocStateOp('apiUnconfirm', '確定を解除しました', '解除中…'); },

    // カレンダー(月表示)
    calPick: function (v) { S.cal.sel = v; render(); },
    calPrev: function () {
      var d = new Date(S.cal.ym[0], S.cal.ym[1] - 1, 1), t = calParse(S.boot.today);
      if (d.getFullYear() < t.getFullYear() || (d.getFullYear() === t.getFullYear() && d.getMonth() < t.getMonth())) return;
      S.cal.ym = [d.getFullYear(), d.getMonth()]; render();
    },
    calNext: function () { var d = new Date(S.cal.ym[0], S.cal.ym[1] + 1, 1); S.cal.ym = [d.getFullYear(), d.getMonth()]; render(); },
    calThis: function () { var t = calParse(S.boot.today); S.cal.ym = [t.getFullYear(), t.getMonth()]; S.cal.sel = S.boot.today; render(); },
    calFilter: function (v) { S.cal.filters[v] = !S.cal.filters[v]; render(); },
    calNew: function () { S.cal.form = calNewForm(); S.cal.sheet = 'new'; render(); },
    calEdit: function (v) {
      var e = calEvents().filter(function (x) { return x.id === v; })[0];
      if (e) { S.cal.form = calEditForm(e); S.cal.sheet = 'edit'; render(); }
    },
    closeEvSheet: function () { S.cal.sheet = null; S.cal.form = null; render(); },
    evType: function (v) {
      var f = S.cal.form; f.type = v; f.reason = CAL_REASONS[v] ? CAL_REASONS[v][0] : '';
      if (!f.gym) f.gym = myHomeGym();
      render();
    },
    saveEvent: function () {
      var f = S.cal.form;
      if (calCannotSave(f)) return;
      // メンバーが体育館を使用不可にするときは、全チームに影響するため確認する
      if (S.cal.mode === 'member' && f.type === 'closed' && !f.id) { S.cal.confirmClosed = true; render(); return; }
      actions.doSaveEvent();
    },
    cancelClosed: function () { S.cal.confirmClosed = false; render(); },
    doSaveEvent: function () {
      S.cal.confirmClosed = false;
      var f = S.cal.form;
      var isEdit = !!f.id;
      // フォームの gym/team を API の gymId/teamId に合わせて送る
      var payload = { id: f.id, type: f.type, date: f.date, gymId: f.gym, teamId: f.team, reason: f.reason, memo: f.memo };
      var onDone = function (r) {
        calApply(r, isEdit ? '予定を修正しました' : '予定を登録しました', function () {
          if (f.date) { var dd = calParse(f.date); S.cal.ym = [dd.getFullYear(), dd.getMonth()]; S.cal.sel = f.date; }
          S.cal.sheet = null; S.cal.form = null;
        });
      };
      // 登録者(本人=S.me)を渡して「チーム名・氏名」で記録する
      if (S.cal.mode === 'admin') call('apiSaveEvent', [token(), payload, S.me], onDone, '登録中…');
      else call('apiMemberSaveEvent', [S.me, payload], onDone, '登録中…');
    },
    askDeleteEvent: function () { S.cal.deleteId = S.cal.form.id; S.cal.confirmDel = true; render(); },
    cancelDeleteEvent: function () { S.cal.confirmDel = false; S.cal.deleteId = null; render(); },
    doDeleteEvent: function () {
      var onDone = function (r) {
        calApply(r, '予定を削除しました', function () { S.cal.confirmDel = false; S.cal.deleteId = null; S.cal.sheet = null; S.cal.form = null; });
      };
      if (S.cal.mode === 'admin') call('apiDeleteEvent', [token(), S.cal.deleteId], onDone, '削除中…');
      else call('apiMemberDeleteEvent', [S.me, S.cal.deleteId], onDone, '削除中…');
    },

    // チーム管理
    pickTeam: function (v) {
      S.admin.teamId = v;
      S.admin.team = null;
      clearDrafts('t:');
      render();
      adminCall('apiTeamAdmin', [v]);
    },
    addMember: function () {
      adminCall('apiAddMember', [S.admin.team.teamId, draft('t:newMember')], 'メンバーを追加しました', { clear: 't:newMember' });
    },
    askRemoveMember: function (v) { S.dialog = 'removeMember'; S.removeMemberId = v; render(); },
    toggleLeave: function (v) {
      var m = (S.admin.team && S.admin.team.members || []).filter(function (x) { return x.id === v; })[0];
      var on = !(m && m.onLeave);
      adminCall('apiSetMemberLeave', [S.admin.team.teamId, v, on], on ? '休部にしました' : '在籍に戻しました', { busy: '更新中…' });
    },
    askEditMember: function (v) {
      var m = (S.admin.team && S.admin.team.members || []).filter(function (x) { return x.id === v; })[0];
      S.renameMemberId = v;
      S.editLeave = !!(m && m.onLeave);
      delete S.drafts['rename'];
      S.dialog = 'editMember';
      render();
    },
    editStatus: function (v) { S.editLeave = (v === 'leave'); render(); },
    saveMemberEdit: function () {
      var team = S.admin.team, id = S.renameMemberId;
      var m = team.members.filter(function (x) { return x.id === id; })[0];
      var newName = String(draft('rename', m ? m.name : '')).trim();
      if (!newName) { toast('名前を入力してください'); return; }
      var wantLeave = !!S.editLeave;
      var needLeave = m && (!!m.onLeave !== wantLeave);
      S.dialog = null; clearDrafts('rename'); render();
      // まず名前、続けて(必要なら)休部ステータスを保存する
      call('apiRenameMember', [token(), team.teamId, id, newName], function (r) {
        if (!r.ok) { handleResult(r); return; }
        if (needLeave) {
          call('apiSetMemberLeave', [token(), team.teamId, id, wantLeave], function (r2) {
            handleResult(r2, 'メンバーを更新しました');
          }, '保存中…');
        } else {
          handleResult(r, 'メンバーを更新しました');
        }
      }, '保存中…');
    },
    removeMember: function () {
      var id = S.removeMemberId;
      S.dialog = null;
      S.removeMemberId = null;
      render();
      adminCall('apiRemoveMember', [S.admin.team.teamId, id], 'メンバーを削除しました');
    },
    saveContact: function (v) {
      var current = S.admin.team[v];
      adminCall('apiSaveContact', [S.admin.team.teamId, v, draft('t:' + v + ':name', current.name), draft('t:' + v + ':contact', current.contact)],
        '連絡先を保存しました', { clear: 't:' + v + ':' });
    },
    // ホーム(体育館＋時間)の保存。「なし」にすると時間は無視する
    saveHomeGym: function () {
      var t = S.admin.team, h = t.homeGym;
      var gymId = draft('t:home:gym', h ? h.id : '');
      var start = gymId ? draft('t:home:start', h ? h.start : '') : '';
      var end = gymId ? draft('t:home:end', h ? h.end : '') : '';
      if (gymId === (h ? h.id : '') && (!gymId || (start === h.start && end === h.end))) { toast('変更はありません'); return; }
      if (gymId && (!start) !== (!end)) { toast('開始と終了の両方を入力してください'); return; }
      adminCall('apiSetHomeGym', [t.teamId, gymId, start, end], 'ホームを保存しました', { clear: 't:home:', busy: '保存中…' });
    },

    copyContact: function (v) {
      var done = function () { toast('コピーしました'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, done);
      else done();
    },

    // 管理者ページ
    toggleReveal: function (v) { S.revealPass[v] = !S.revealPass[v]; render(); },
    togglePowerFold: function () { S.ui.openPower = !S.ui.openPower; render(); },
    toggleRegFold: function () { S.ui.openReg = !S.ui.openReg; render(); },
    toggleGymFold: function () { S.ui.openGym = !S.ui.openGym; render(); },
    askRenameGym: function (v) { S.gymEditId = v; delete S.drafts['gymName']; S.dialog = 'renameGym'; render(); },
    renameGym: function () {
      adminCall('apiRenameGym', [S.gymEditId, draft('gymName', '')], '体育館名を変更しました', { clear: 'gymName', busy: '保存中…' });
    },
    askDeleteGym: function (v) { S.gymEditId = v; S.dialog = 'deleteGym'; render(); },
    addGym: function () {
      if (!String(draft('p:gymName', '')).trim()) { toast('体育館名を入力してください'); return; }
      adminCall('apiAddGym', [draft('p:gymName', '')], '体育館を登録しました', { clear: 'p:gymName', busy: '登録中…' });
    },
    deleteGym: function () {
      var id = S.gymEditId;
      S.dialog = null; S.gymEditId = null; render();
      adminCall('apiDeleteGym', [id], '体育館を削除しました', { busy: '削除中…' });
    },
    addTeam: function () {
      adminCall('apiAddTeam', [draft('p:teamName'), draft('p:teamGymName')],
        'チームを登録しました', { clear: 'p:team', busy: '登録中…' });
    },
    askDeleteTeam: function (v) { S.dialog = 'deleteTeam'; S.deleteTeamId = v; render(); },
    deleteTeam: function () {
      var id = S.deleteTeamId;
      S.dialog = null; S.deleteTeamId = null; render();
      adminCall('apiDeleteTeam', [id], 'チームを削除しました', { busy: '削除中…' });
    },
    setTeamPass: function () {
      var teams = S.admin.power.teams;
      adminCall('apiSetTeamPass', [draft('p:passTeam', teams[0] && teams[0].id), draft('p:passNew')], 'チームパスを設定しました', { clear: 'p:passNew', busy: '設定中…' });
    },
    askRandomPass: function () { S.dialog = 'randomPass'; render(); },
    randomizeTeamPasses: function () {
      adminCall('apiRandomizeTeamPasses', [], '未設定のチームにパスを割り当てました', { busy: '設定中…' });
    },
    toggleAllocDuty: function (v) {
      var t = (S.admin.power.teams || []).filter(function (x) { return x.id === v; })[0];
      var on = !(t && t.allocDuty);
      adminCall('apiSetAllocDuty', [v, on], on ? '割振担当にしました' : '割振担当を外しました');
    },
    askResetPower: function () { S.dialog = 'resetPower'; render(); },
    resetPowerPass: function () {
      S.dialog = null;
      call('apiResetPowerPass', [token()], function (result) {
        if (result.ok) {
          // 新しいトークンに切り替えて、そのまま操作を続けられるようにする(新パスはメールで届く)
          store.set(KEY.auth, JSON.stringify({ token: result.token, role: 'power', teamId: null, expires: result.expires }));
        }
        handleResult(result, '新しい管理者パスをメールに送信しました');
      }, '再設定中…');
    }
  };

  document.addEventListener('click', function (event) {
    var el = event.target.closest('[data-a]');
    if (!el || el.disabled) return;
    var fn = actions[el.getAttribute('data-a')];
    if (fn) fn(el.getAttribute('data-v'));
  });
  // 入力途中の文字列を保持する
  document.addEventListener('input', function (event) {
    var key = event.target.getAttribute('data-draft');
    if (key) S.drafts[key] = event.target.value;
    // カレンダーのメモは再描画せず値だけ保持し、登録ボタンの有効/無効だけ更新する
    var ef = event.target.getAttribute('data-evfield');
    if (ef === 'memo' && S.cal.form) {
      S.cal.form.memo = event.target.value;
      var save = document.querySelector('[data-a="saveEvent"]');
      if (save) save.disabled = calCannotSave(S.cal.form);
    }
  });
  // 個人コメントは入力欄から離れたときに保存する
  document.addEventListener('change', function (event) {
    var date = event.target.getAttribute('data-note');
    if (date) saveNote(date, event.target.value.trim());
    // 管理者のチーム切り替え(プルダウン)
    if (event.target.getAttribute('data-pick') === 'team') { actions.pickTeam(event.target.value); return; }
    // カレンダーの予定フォーム(セレクト・日付)は変更時に再描画する
    var ef = event.target.getAttribute('data-evfield');
    if (ef && S.cal.form) {
      S.cal.form[ef] = event.target.value;
      if (ef !== 'memo') render();
    }
  });
  // 体育館マスタの並び替え(⋮⋮ をドラッグ)。マウス・タッチ共通で Pointer Events を使い、
  // 指の位置に合わせて行そのものを入れ替え、離したときに順番が変わっていれば保存する
  var gymDrag = null;
  document.addEventListener('pointerdown', function (event) {
    var handle = event.target.closest('.drag-handle');
    if (!handle || gymDrag) return;
    var row = handle.closest('.gym-row');
    var list = row && row.parentNode;
    if (!list) return;
    event.preventDefault();
    gymDrag = { row: row, list: list, pointerId: event.pointerId, before: gymOrderOf(list).join(',') };
    row.classList.add('dragging');
    try { handle.setPointerCapture(event.pointerId); } catch (e) { /* 取れなくても document で拾う */ }
  });
  document.addEventListener('pointermove', function (event) {
    if (!gymDrag || event.pointerId !== gymDrag.pointerId) return;
    event.preventDefault();
    var y = event.clientY, row = gymDrag.row;
    var prev = row.previousElementSibling, next = row.nextElementSibling;
    if (prev && y < prev.getBoundingClientRect().top + prev.offsetHeight / 2) {
      gymDrag.list.insertBefore(row, prev);
    } else if (next && y > next.getBoundingClientRect().top + next.offsetHeight / 2) {
      gymDrag.list.insertBefore(row, next.nextElementSibling);
    }
  });
  function endGymDrag(event) {
    if (!gymDrag || event.pointerId !== gymDrag.pointerId) return;
    var drag = gymDrag;
    gymDrag = null;
    drag.row.classList.remove('dragging');
    var ids = gymOrderOf(drag.list);
    if (ids.join(',') === drag.before) return;
    // 返事を待つ間に再描画されても新しい並びで見えるよう、手元の一覧も先に並べ替える
    if (S.admin.power && S.admin.power.gyms) {
      var byId = {};
      S.admin.power.gyms.forEach(function (g) { byId[g.id] = g; });
      S.admin.power.gyms = ids.map(function (id) { return byId[id]; }).filter(Boolean);
    }
    call('apiReorderGyms', [token(), ids], function (result) {
      // 失敗したら、サーバーの実際の並びを取り直して画面を戻す
      if (!handleResult(result, '並び順を保存しました')) adminCall('apiPowerAdmin');
    }, '保存中…');
  }
  document.addEventListener('pointerup', endGymDrag);
  document.addEventListener('pointercancel', endGymDrag);
  function gymOrderOf(list) {
    return Array.prototype.map.call(list.querySelectorAll('.gym-row'), function (r) { return r.getAttribute('data-gym'); });
  }

  window.addEventListener('resize', fitHero);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitHero);

  // ---- 起動 ----
  function load() {
    S.error = null;
    render();
    call('apiBootstrap', [], function (result) {
      if (result.ok) {
        setBoot(result.boot);
      } else if (!S.boot || result.code === 'SETUP_REQUIRED') {
        S.boot = null;
        S.error = result.message;
      } else {
        toast('最新の情報を取得できませんでした');
      }
      // 入力中に描き直すとフォーカスが外れるので、次の操作まで待つ
      var active = document.activeElement;
      if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
      render();
    });
  }

  // 以前の形式のパス情報を片付ける
  store.del('attendance.token');
  store.del('attendance.tokenExp');

  // 前回のデータがあれば先に表示し、裏で最新を取得する(GAS の読み込みが遅いため)
  try {
    var cached = JSON.parse(store.get(KEY.boot) || 'null');
    // 古い形式の保存データは使わず、サーバーの応答を待つ
    if (cached && cached.teams && cached.notes && cached.comments && cached.dayOffs) S.boot = cached;
  } catch (e) { /* 壊れた保存データは無視する */ }
  load();

  // プレビューと動作確認から画面を操作するための入口
  window.App = { act: function (name, value) { actions[name](value); }, state: S };
})();
