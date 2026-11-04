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
    drafts: {},        // 入力途中の文字列。再描画しても消えないよう保持する
    passLength: 4,
    code: '',
    codeMsg: '',
    codeErr: false,
    loggingIn: false,
    pendingWrites: 0,
    error: null,
    revealPass: {},    // 管理者ページで番号を表示しているチーム
    // 管理画面のデータ。連絡先やパスを含むので端末には保存しない
    admin: { calendar: null, contacts: null, team: null, teamList: null, teamId: null, power: null }
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

  function timeText(item) {
    return item && item.start ? item.start + '〜' + item.end : '';
  }

  function setBusy(delta) {
    S.pendingWrites += delta;
    document.getElementById('busy').hidden = S.pendingWrites <= 0;
  }

  // サーバーの api* を fetch で呼ぶ。通信エラーも応答エラーと同じ形で返す
  // GitHub Pages から GAS を呼ぶため、プリフライトを避けて text/plain で送る。独自ヘッダー・Cookie は付けない
  function call(name, args, done) {
    setBusy(1);
    fetch(window.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: name, args: args || [] }),
      redirect: 'follow'
    }).then(function (res) {
      return res.json();
    }).then(function (json) {
      setBusy(-1);
      // サーバーは { ok:true, data } / { ok:false, error:{code,message} } を返す。
      // 画面側の既存ロジックに合わせ、data を平らにした { ok, ... } の形へ戻す
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
        '<h2>' + esc(gym.name) + '</h2>' + (gym.start ? '<p class="place-time">' + esc(timeText(gym)) + '</p>' : '') +
        '<p>一緒に練習:' + esc(mates) + '</p>' +
        '<a href="' + esc(mapUrl(gym)) + '" target="_blank" rel="noopener">地図を開く ↗</a></div>';
    } else {
      html += '<div class="pending"><span class="label-w">今週の体育館</span><span>土曜までに決まり、LINEでお知らせします。</span></div>';
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
      names[a === 'yes' || a === 'no' || a === 'maybe' ? a : 'none'].push(m.name);
    });
    var rows = [['yes', '出席'], ['no', '欠席'], ['maybe', '未定'], ['none', '未回答']];
    return '<div class="att-list"><div class="att-head"><span class="label">' + esc(team.name) + 'の出欠</span>' +
      '<span class="label">' + b.members.filter(function (m) { return m.teamId === team.id; }).length + '人</span></div>' +
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

  function viewAlloc(team) {
    var b = S.boot;
    var view = b.allocation;
    var who = auth();
    var tag = view.state === 'confirmed' ? ['confirmed', '確定済み'] : view.adjusted ? ['adjusting', '調整中'] : ['', '自動の草案'];
    var head = '<div class="alloc-head"><div><div class="label">' + dateLabel(view.date) + ' SUN</div>' +
      '<div class="title-sm">割り振り<span class="acc">.</span></div></div>' + (view.dayOff ? '' : '<span class="tag ' + tag[0] + '">' + tag[1] + '</span>') + '</div>';
    if (view.dayOff) {
      return head + '<div class="empty"><b>この週は練習休みです。</b>' + esc(view.dayOffReason) + '</div>';
    }
    var deadline = view.state === 'open'
      ? '<span>回答受付中</span><button class="link" data-a="closeWeek">回答を締め切る</button>'
      : view.state === 'closed'
        ? '<span>締切済み</span><button class="link" data-a="reopenWeek">受付を再開</button>'
        : '<span>締切済み</span>' + (who && who.role === 'power' ? '<button class="link" data-a="unconfirm">確定を解除</button>' : '');
    var html = head + viewSummary() + '<div class="deadline">' + deadline + '</div>';
    if (view.warnings.length) {
      html += '<div class="warns">' + view.warnings.map(function (w) {
        return '<div class="warn"><b>!</b><span>' + esc(w) + '</span></div>';
      }).join('') + '</div>';
    }
    if (view.noOpenGyms) {
      return html + '<div class="empty"><b>開ける体育館がありません。</b>カレンダーの使用不可を確認してください。</div>' + closedList(view);
    }
    html += '<div class="hint">チームをタップして移動先を選びます。</div>';
    view.gyms.forEach(function (g) {
      var comp = g.teams.map(function (t) {
        return '<span class="' + (t.id === team.id ? 'mine' : '') + '" style="flex:' + Math.max(t.yes, 1) + '"></span>';
      }).join('');
      var rows = g.teams.map(function (t) {
        var ok = t.yes >= 6;
        return '<button class="team-row" data-a="openMove" data-v="' + esc(t.id) + '"><span class="mark' + (t.id === team.id ? ' mine' : '') + '">' + esc(teamMark(t.name)) + '</span>' +
          '<span class="team-main"><strong>' + esc(t.name) + '</strong><span class="team-sub' + (ok ? ' ok' : '') + '">' + (ok ? '6人以上' : '合流') + (t.none ? '・未回答' + t.none : '') + '</span></span>' +
          (t.isHome ? '<span class="home-tag">ホーム</span>' : '') +
          '<b>' + t.yes + '</b><small>移動 →</small></button>';
      }).join('');
      html += '<div class="gym"><div class="gym-head"><strong>' + esc(g.name) + '</strong><b>' + g.total + '</b><small>人</small></div>' +
        (g.start ? '<div class="label">' + esc(timeText(g)) + '</div>' : '') +
        '<div class="comp">' + comp + '</div><div>' + rows + '</div></div>';
    });
    html += closedList(view);
    var main = view.state === 'confirmed'
      ? (b.lineEnabled ? '修正してLINEに再投稿' : '修正を確定する')
      : (b.lineEnabled ? '確定してLINEに投稿' : '確定する');
    html += '<div class="alloc-actions"><button class="primary" data-a="openConfirm">' + main + '<span>→</span></button>' +
      (view.state === 'confirmed' ? '' : '<button class="link reset" data-a="resetDraft">自動の草案に戻す</button>') + '</div>';
    return html;
  }

  // ---- カレンダー ----
  function adminLoading() {
    return '<div class="empty">読み込み中…</div>';
  }

  function viewCalendar() {
    var cal = S.admin.calendar;
    var html = '<div class="admin-title"><div class="title-sm">カレンダー<span class="acc">.</span></div></div>';
    if (!cal) return html + adminLoading();
    cal.days.forEach(function (d) {
      var lines = [];
      if (d.dayOff) lines.push('<span class="off">練習休み' + (d.dayOffReason ? ' ' + esc(d.dayOffReason) : '') + '</span>');
      d.blocks.forEach(function (x) {
        lines.push('<span><span class="strike">' + esc(x.gym) + '</span> <small>' + esc(x.note || x.reason) + '</small></span>');
      });
      d.hours.forEach(function (x) { lines.push('<span>' + esc(x.gym) + ' ' + esc(timeText(x)) + '</span>'); });
      if (!lines.length) lines.push('<span class="plain">通常どおり</span>');
      if (d.state === 'confirmed') lines.push('<span class="plain">確定済み</span>');
      html += '<button class="day" data-a="openDay" data-v="' + d.date + '"><span class="day-date">' + dateLabel(d.date) + '</span>' +
        '<span class="day-body">' + lines.join('') + '</span><i>→</i></button>';
    });
    return html;
  }

  function viewDaySheet() {
    var cal = S.admin.calendar;
    var d = cal && cal.days.filter(function (x) { return x.date === S.dayDate; })[0];
    if (!d) return '';
    var gymOptions = cal.gyms.map(function (g) { return [g.id, g.name]; });
    var confirmed = d.state === 'confirmed';
    var html = '<div class="scrim" data-a="closeDialog"><div class="sheet scroll" data-a="noop"><div class="label">SUN</div><h3>' + dateLabel(d.date) + 'の予定</h3>' +
      '<div class="share-note"><b>！</b><span>ここで登録・変更した内容は<em>全員のカレンダー</em>に反映されます。自分だけのメモではありません。</span></div>';

    html += '<div class="section"><div class="section-head"><span class="label">練習休み</span></div>';
    if (d.dayOff) {
      html += '<div class="list-row"><span>練習休み <small>' + esc(d.dayOffReason) + (d.dayOffBy ? ' / 登録:' + esc(d.dayOffBy) : '') + '</small></span><button class="link" data-a="clearDayOff">解除</button></div>';
    } else if (!confirmed) {
      html += '<div class="form-row">' + textInput('d:off', '', '理由(任意)', 'text', 50) + '<button class="sub-btn" data-a="setDayOff">休みにする</button></div>';
    }
    html += '</div>';

    html += '<div class="section"><div class="section-head"><span class="label">使用不可の体育館</span></div>';
    d.blocks.forEach(function (x) {
      html += '<div class="list-row"><span>' + esc(x.gym) + ' <small>' + esc(x.reason) + (x.note ? '(' + esc(x.note) + ')' : '') + (x.by ? ' / 登録:' + esc(x.by) : '') + '</small></span>' +
        '<button class="link" data-a="removeBlock" data-v="' + esc(x.id) + '">取り消し</button></div>';
    });
    if (confirmed) {
      html += '<div class="note-line">確定済みの週には登録できません。</div>';
    } else {
      html += '<div class="form-row">' + selectInput('d:blockGym', gymOptions, gymOptions[0] && gymOptions[0][0]) +
        selectInput('d:blockReason', REASONS.map(function (r) { return [r, r]; }), REASONS[0]) + '</div>' +
        '<div class="form-row">' + textInput('d:blockNote', '', 'メモ(例:運動会)', 'text', 50) + '<button class="sub-btn" data-a="addBlock">登録</button></div>';
    }
    html += '</div>';

    html += '<div class="section"><div class="section-head"><span class="label">時間の変更(この日だけ)</span></div>';
    d.hours.forEach(function (x) {
      html += '<div class="list-row"><span>' + esc(x.gym) + ' <small>' + esc(timeText(x)) + (x.by ? ' / 登録:' + esc(x.by) : '') + '</small></span>' +
        '<button class="link" data-a="clearHours" data-v="' + esc(x.gymId) + '">取り消し</button></div>';
    });
    html += '<div class="form-row">' + selectInput('d:hoursGym', gymOptions, gymOptions[0] && gymOptions[0][0]) + '</div>' +
      '<div class="form-row">' + textInput('d:start', '', '', 'time') + '<span class="time-sep">〜</span>' + textInput('d:end', '', '', 'time') +
      '<button class="sub-btn" data-a="setHours">登録</button></div></div>';

    return html + '<button class="ghost cancel" data-a="closeDialog">閉じる</button></div></div>';
  }

  // ---- 連絡先 ----
  function contactValue(value) {
    var text = String(value || '');
    if (/^[\d\-+() ]{9,}$/.test(text)) {
      return '<a href="tel:' + esc(text.replace(/[^\d+]/g, '')) + '">' + esc(text) + '</a>';
    }
    return '<span class="val">' + esc(text) + '</span>';
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
    var html = '<div class="admin-title"><div class="label">' + (team ? esc(team.teamName) : '') + (who && who.role === 'power' ? ' / 管理者' : '') + '</div>' +
      '<div class="title-sm">チーム管理<span class="acc">.</span></div></div>';
    if (!team) return html + adminLoading();

    if (S.admin.teamList) {
      html += '<div class="team-chips">' + S.admin.teamList.map(function (t) {
        return '<button class="team-chip' + (t.id === team.teamId ? ' on' : '') + (t.passSet ? '' : ' unset') + '" data-a="pickTeam" data-v="' + esc(t.id) + '">' + esc(teamMark(t.name)) + '</button>';
      }).join('') + '</div>';
    }

    html += '<div class="section"><div class="section-head"><span class="label">メンバー</span><span class="label">' + team.members.length + '人</span></div>';
    team.members.forEach(function (m) {
      html += '<div class="list-row"><span>' + esc(m.name) + '</span><button class="link" data-a="askRemoveMember" data-v="' + esc(m.id) + '">削除</button></div>';
    });
    html += '<div class="form-row">' + textInput('t:newMember', '', '名前を入力', 'text', 30) + '<button class="sub-btn" data-a="addMember">追加</button></div></div>';

    html += '<div class="section"><div class="section-head"><span class="label">連絡先(他チームの担当者にも見えます)</span></div>';
    [['rep', '代表', team.rep], ['vice', '副代表', team.vice]].forEach(function (r) {
      html += '<div class="field-label">' + r[1] + '</div><div class="form-row">' + textInput('t:' + r[0] + ':name', r[2].name, '名前', 'text', 30) + '</div>' +
        '<div class="form-row">' + textInput('t:' + r[0] + ':contact', r[2].contact, '電話番号、LINE ID など', 'text', 100) +
        '<button class="sub-btn" data-a="saveContact" data-v="' + r[0] + '">保存</button></div>';
    });
    html += '</div>';

    html += '<div class="section"><div class="section-head"><span class="label">体育館(基本の使用時間)</span></div>';
    if (team.homeGym) {
      html += '<div class="list-row"><span>' + esc(team.homeGym.name) + '</span></div><div class="form-row">' +
        textInput('t:start', team.homeGym.start, '', 'time') + '<span class="time-sep">〜</span>' + textInput('t:end', team.homeGym.end, '', 'time') +
        '<button class="sub-btn" data-a="saveGymHours">保存</button></div>';
    } else {
      html += '<div class="note-line">ホーム体育館はありません。</div>';
    }
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

    html += '<div class="section"><div class="section-head"><span class="label">チームの登録</span></div>' +
      '<div class="form-row">' + textInput('p:teamName', '', 'チーム名', 'text', 30) + '</div>' +
      '<div class="form-row"><span class="fix letter-input">' + textInput('p:teamLetter', data.nextLetter, '記号', 'text', 2) + '</span>' +
      selectInput('p:teamGym', [['', 'ホームなし']].concat(data.gyms.map(function (g) { return [g.id, g.name]; })), '') +
      '<button class="sub-btn" data-a="addTeam">登録</button></div>' +
      '<div class="note-line">登録後、下のチームパスを設定してください。</div></div>';

    html += '<div class="section"><div class="section-head"><span class="label">チームパス</span><span class="label">' + data.teams.length + 'チーム</span></div>';
    data.teams.forEach(function (t) {
      html += '<div class="list-row pass-row"><span class="mark">' + esc(teamMark(t.name)) + '</span><span class="pass-name">' + esc(t.name) + '</span>' + passCell(t) + '</div>';
    });
    html += '<div class="field-label">設定・変更</div><div class="form-row">' +
      selectInput('p:passTeam', data.teams.map(function (t) { return [t.id, t.name]; }), data.teams[0] && data.teams[0].id) + '</div>' +
      '<div class="form-row">' + numberInput('p:passNew', '数字4桁', 4) + '<button class="sub-btn" data-a="setTeamPass">設定</button></div>' +
      '<div class="note-line">変更すると、そのチームの端末は再入力が必要です。</div></div>';

    html += '<div class="section"><div class="section-head"><span class="label">管理者パス</span></div>' +
      '<div class="form-row">' + numberInput('p:powerNew', '新しい番号(数字8桁)', 8, 'password') + '</div>' +
      '<div class="form-row">' + numberInput('p:powerConfirm', 'もう一度入力', 8, 'password') + '<button class="sub-btn" data-a="setPowerPass">変更</button></div>' +
      '<div class="note-line">番号は表示できないので、必ず控えてください。変更すると、他の端末の管理者ログインは解除されます。</div></div>';
    return html;
  }

  // ---- 下部タブ ----
  function viewTabs(isAdmin) {
    var who = auth();
    var tabs = isAdmin
      ? [['alloc', '割り振り'], ['contacts', '連絡先'], ['team', 'チーム管理']]
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

  function viewConfirmSheet(title, note, action, label) {
    return '<div class="scrim" data-a="closeDialog"><div class="sheet" data-a="noop"><h3>' + esc(title) + '</h3>' +
      '<div class="conf-note">' + esc(note) + '</div>' +
      '<div class="conf-btns"><button class="ghost" style="height:56px" data-a="closeDialog">戻る</button>' +
      '<button class="go" data-a="' + action + '">' + esc(label) + '</button></div></div></div>';
  }

  function viewDialog(member, team) {
    if (S.dialog === 'user') {
      return '<div class="scrim" data-a="closeDialog"><div class="sheet sheet-user" data-a="noop"><h3>' + esc(member.name) + 'さん / ' + esc(team.name) + '</h3>' +
        '<p>この端末にログイン状態を保存しています。</p><button class="ghost strong" data-a="changeUser">ログインを変更する</button></div></div>';
    }
    if (S.dialog === 'code') return viewPass();
    if (S.dialog === 'deleteComment') return viewConfirmSheet('このコメントを削除しますか?', '削除すると元に戻せません。', 'deleteComment', '削除する');
    if (S.dialog === 'day') return viewDaySheet();
    if (S.dialog === 'removeMember') {
      var target = S.admin.team && S.admin.team.members.filter(function (m) { return m.id === S.removeMemberId; })[0];
      return viewConfirmSheet((target ? target.name : '') + 'さんを削除しますか?', '名簿と集計から外れます。過去の出欠とコメントは残ります。', 'removeMember', '削除する');
    }
    var view = S.boot.allocation;
    if (S.dialog === 'move') {
      var moving = teamOf(S.moveTeam);
      var yes = 0;
      view.gyms.forEach(function (g) { g.teams.forEach(function (t) { if (t.id === moving.id) yes = t.yes; }); });
      var opts = view.gyms.map(function (g) {
        var cur = view.alloc[moving.id] === g.id;
        return '<button class="move-opt"' + (cur ? ' disabled' : ' data-a="move" data-v="' + esc(g.id) + '"') + '><span>' + esc(g.name) + '</span><small>' +
          (cur ? '現在' : g.total + ' → ' + (g.total + yes) + '人') + '</small></button>';
      }).join('');
      return '<div class="scrim" data-a="closeDialog"><div class="sheet" data-a="noop"><div class="label">移動先を選択</div><h3>' + esc(moving.name) + '(' + yes + '人)</h3>' + opts +
        '<button class="ghost cancel" data-a="closeDialog">やめる</button></div></div>';
    }
    if (S.dialog === 'confirm') {
      var rows = view.gyms.map(function (g) {
        return '<div class="conf-row"><b>' + esc(g.name) + '</b><span>' + esc(g.teams.map(function (t) { return teamMark(t.name); }).join(' / ')) + '</span><strong>' + g.total + '</strong></div>';
      }).join('');
      var line = S.boot.lineEnabled;
      return '<div class="scrim"><div class="sheet"><h3>この内容で確定しますか?</h3>' + rows +
        '<div class="conf-note">' + (line ? 'LINEグループに投稿し、Googleカレンダーにも反映します。' : '未締切の場合は、回答も同時に締め切ります。') + '</div>' +
        '<div class="conf-btns"><button class="ghost" style="height:56px" data-a="closeDialog">戻る</button>' +
        '<button class="go" data-a="confirm">' + (line ? '確定して投稿' : '確定する') + '</button></div></div></div>';
    }
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
    var isAdmin = !!ADMIN_SCREENS[S.screen];
    var previous = document.getElementById('mainScroll');
    var keepScroll = previous && previous.getAttribute('data-screen') === S.screen ? previous.scrollTop : 0;
    var body = S.screen === 'answer' ? viewAnswer(member, team)
      : S.screen === 'alloc' ? viewAlloc(team)
      : S.screen === 'calendar' ? viewCalendar()
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
    });
  }

  function teamIdForAdmin() {
    var who = auth();
    if (!who) return null;
    if (who.role !== 'power') return who.teamId;
    return S.admin.teamId || S.boot.teams[0].id;
  }

  function openAdminScreen(screen) {
    S.screen = screen;
    S.dialog = null;
    render();
    if (screen === 'alloc') adminCall('apiAllocation');
    if (screen === 'contacts') adminCall('apiContacts');
    if (screen === 'team') adminCall('apiTeamAdmin', [teamIdForAdmin()]);
    if (screen === 'power') adminCall('apiPowerAdmin');
  }

  // メンバーのカレンダー。パス不要で、読み込み・書き込みは本人のメンバーIDで行う
  function openMemberCalendar() {
    S.screen = 'calendar';
    S.dialog = null;
    render();
    call('apiMemberCalendar', [S.me], function (result) {
      if (result.ok) { S.admin.calendar = result.calendar; render(); }
      else toast(result.message);
    });
  }

  // カレンダーの登録・変更(メンバー版)。シートを開いたまま内容を更新する
  function memberCalCall(name, extra, message, options) {
    var opts = options || {};
    call(name, [S.me].concat(extra || []), function (result) {
      if (handleResult(result, message, opts.keep) && opts.clear) clearDrafts(opts.clear);
      if (result.ok && opts.clear) render();
    });
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
        toast(result.role === 'power' ? '管理者モード' : '担当者モード');
        openAdminScreen('alloc');
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
      if (v === 'calendar') { openMemberCalendar(); return; }
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
      if (token()) { openAdminScreen('alloc'); return; }
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
    openMove: function (v) { S.dialog = 'move'; S.moveTeam = v; render(); },
    move: function (v) {
      var name = teamOf(S.moveTeam).name;
      var gym = S.boot.allocation.gyms.filter(function (g) { return g.id === v; })[0];
      adminCall('apiMoveTeam', [S.boot.next, S.moveTeam, v], name + ' → ' + gym.name);
      S.dialog = null;
      render();
    },
    resetDraft: function () { adminCall('apiResetDraft', [S.boot.next], '自動の草案に戻しました'); },
    closeWeek: function () { adminCall('apiCloseWeek', [S.boot.next], '回答を締め切りました'); },
    reopenWeek: function () { adminCall('apiReopenWeek', [S.boot.next], '回答の受付を再開しました'); },
    unconfirm: function () { adminCall('apiUnconfirm', [S.boot.next], '確定を解除しました'); },
    openConfirm: function () { S.dialog = 'confirm'; render(); },
    confirm: function () {
      S.dialog = null;
      render();
      adminCall('apiConfirm', [S.boot.next], '確定しました');
    },

    // カレンダー
    openDay: function (v) {
      S.dayDate = v;
      S.dialog = 'day';
      clearDrafts('d:');
      render();
    },
    setDayOff: function () { memberCalCall('apiMemberSetDayOff', [S.dayDate, draft('d:off')], '練習休みにしました', { keep: true, clear: 'd:off' }); },
    clearDayOff: function () { memberCalCall('apiMemberClearDayOff', [S.dayDate], '練習休みを解除しました', { keep: true }); },
    addBlock: function () {
      var gyms = S.admin.calendar.gyms;
      memberCalCall('apiMemberAddBlock', [S.dayDate, draft('d:blockGym', gyms[0] && gyms[0].id), draft('d:blockReason', REASONS[0]), draft('d:blockNote')],
        '使用不可を登録しました', { keep: true, clear: 'd:blockNote' });
    },
    removeBlock: function (v) { memberCalCall('apiMemberRemoveBlock', [S.dayDate, v], '取り消しました', { keep: true }); },
    setHours: function () {
      var gyms = S.admin.calendar.gyms;
      memberCalCall('apiMemberSetDayHours', [S.dayDate, draft('d:hoursGym', gyms[0] && gyms[0].id), draft('d:start'), draft('d:end')],
        '時間を変更しました', { keep: true, clear: 'd:start' });
    },
    clearHours: function (v) { memberCalCall('apiMemberClearDayHours', [S.dayDate, v], '取り消しました', { keep: true }); },

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
    saveGymHours: function () {
      var gym = S.admin.team.homeGym;
      adminCall('apiSaveGymHours', [S.admin.team.teamId, draft('t:start', gym.start), draft('t:end', gym.end)],
        '使用時間を保存しました', { clear: 't:start' });
      delete S.drafts['t:end'];
    },

    // 管理者ページ
    toggleReveal: function (v) { S.revealPass[v] = !S.revealPass[v]; render(); },
    addTeam: function () {
      adminCall('apiAddTeam', [draft('p:teamName'), draft('p:teamLetter', S.admin.power.nextLetter), draft('p:teamGym')],
        'チームを登録しました', { clear: 'p:team' });
    },
    setTeamPass: function () {
      var teams = S.admin.power.teams;
      adminCall('apiSetTeamPass', [draft('p:passTeam', teams[0] && teams[0].id), draft('p:passNew')], 'チームパスを設定しました', { clear: 'p:passNew' });
    },
    setPowerPass: function () {
      call('apiSetPowerPass', [token(), draft('p:powerNew'), draft('p:powerConfirm')], function (result) {
        if (result.ok) {
          // 新しいトークンに切り替えて、そのまま操作を続けられるようにする
          store.set(KEY.auth, JSON.stringify({ token: result.token, role: 'power', teamId: null, expires: result.expires }));
          clearDrafts('p:power');
        }
        handleResult(result, '管理者パスを変更しました');
      });
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
  });
  // 個人コメントは入力欄から離れたときに保存する
  document.addEventListener('change', function (event) {
    var date = event.target.getAttribute('data-note');
    if (date) saveNote(date, event.target.value.trim());
  });
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
