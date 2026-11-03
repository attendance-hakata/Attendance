/* =====================================================================
   データ（getBootstrap の実データを入れる。サンプルは持たない）
   ===================================================================== */
var UNIT = 5;                     // 5人で1チーム換算
var TODAY = '', DATE = '';        // アプリを開いた日 / 今週の練習日
var MIN_YM = [2026, 0];           // 今月（これより前には戻れない）
var DUTY_NAME = '';               // 今週の担当（担当表の人）
var GYMS = [];                    // [{id,name,short}]
var TEAMS = [];                   // [{id,name,home,n,members:[{id,name}]}]
var ATT = {};                     // 出欠 {date:{memberId:'yes'|'no'|'maybe'}}
var DATES = [];                   // 出欠の対象日（直近の日曜）
var TYPES = {                     // 表示ラベル・色（UI定数）
  assign: { label: '割振',       color: '#C6F14A' },
  closed: { label: '使用不可',   color: '#FF9A3C' },
  rest:   { label: 'チーム休み', color: '#6CB4FF' },
  other:  { label: 'その他',     color: '#D4D4D4' }
};
var REASONS = {                   // UI定数
  closed: ['学校行事', '地域行事', '選挙・公共行事', 'その他'],
  rest:   ['チームの都合', '大会・遠征', 'その他']
};

function gymShort_(name){ return String(name || '').replace(/小学校$/, '小'); }

// getBootstrap の結果（boot）からアプリ用データを作る
function buildData(boot){
  TODAY = boot.today;
  DATE = boot.next;
  DATES = boot.dates || [DATE];
  var td = parse(TODAY); MIN_YM = [td.getFullYear(), td.getMonth()];
  DUTY_NAME = boot.dutyName || '';
  ATT = boot.attendance || {};
  var al = boot.allocation || {};
  // 体育館（使える体育館＋使用不可の体育館）
  var gyms = (al.gyms || []).slice();
  var closedList = al.closed ? (Array.isArray(al.closed) ? al.closed : [al.closed]) : [];
  closedList.forEach(function(c){ if (c && c.id && !gyms.some(function(g){ return g.id === c.id; })) gyms.push({ id: c.id, name: c.name }); });
  GYMS = gyms.map(function(g){ return { id: g.id, name: g.name, short: gymShort_(g.name) }; });
  // チーム（＋メンバー、＋今週の参加人数＝出欠が参加の人数）
  var attNext = ATT[DATE] || {};
  TEAMS = (boot.teams || []).map(function(t){
    var mem = (boot.members || []).filter(function(m){ return m.teamId === t.id; }).map(function(m){ return { id: m.id, name: m.name }; });
    var n = mem.filter(function(m){ return attNext[m.id] === 'yes'; }).length;
    return { id: t.id, name: t.name, home: t.homeGymId || '', n: n, members: mem };
  });
  // 今週の割振・使用不可・練習休みを state へ
  state.asg.assign = al.alloc || {};
  state.asg.decided = !!(al.state && al.state !== 'open');
  state.asg.gym = GYMS.length ? GYMS[0].id : '';
  state.events = [];
  closedList.forEach(function(c, i){ if (c && c.id) state.events.push({ id: 'c' + i, type: 'closed', date: DATE, gym: c.id, reason: '', memo: c.reason || '', by: '' }); });
  var dayOffs = boot.dayOffs || {};
  Object.keys(dayOffs).forEach(function(d, i){ state.events.push({ id: 'o' + i, type: 'other', date: d, reason: '', memo: '練習休み' + (dayOffs[d] ? '：' + dayOffs[d] : ''), by: '' }); });
  state.cal.ym = MIN_YM.slice();
  state.cal.sel = DATE;
}

var state = {
  tab: 'home',
  me: null,                                   // 選択中のチームID（自分のチーム）
  member: null,                               // 選択中のメンバー名（誰で操作するか）
  memberId: null,                             // 選択中のメンバーID
  admin: false,                               // 管理画面のロック解除
  pick: { team: null },                       // 入口：チーム選択の途中状態
  gate: { code: '', err: '' },                // 管理パスワードの入力
  events: [],                                 // 予定（使用不可・練習休み等。buildData で実データを入れる）
  nextId: 1,
  cal: { ym: [2026, 0], sel: '', filters: { assign: true, closed: true, rest: true, other: true }, sheet: null, form: null, confirmDel: false, toast: '' },
  asg: { screen: 'pick', gym: '', pending: null, decided: false, posted: false, copied: false, assign: {} }
};

/* =====================================================================
   ヘルパー
   ===================================================================== */
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function pad(n){ return (n < 10 ? '0' : '') + n; }
function iso(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parse(t){ var p = t.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function md(t){ var d = parse(t); return (d.getMonth() + 1) + '/' + d.getDate(); }
var WD = ['日','月','火','水','木','金','土'];
function isSun(t){ return parse(t).getDay() === 0; }
function team(id){ return TEAMS.find(function(t){ return t.id === id; }); }
function gym(id){ return GYMS.find(function(g){ return g.id === id; }); }
function tname(id){ var t = team(id); return t ? t.name : ''; }
function gname(id){ var g = gym(id); return g ? g.name : ''; }
function homeOf(teamId){ var t = team(teamId); return t && t.home ? t.home : ''; }
function homeTeamOf(gymId){ return TEAMS.find(function(t){ return t.home === gymId; }); }

/* カレンダーの予定から、その日の使用不可・休みを引く */
function closedOn(date, gymId){ return state.events.find(function(e){ return e.type === 'closed' && e.date === date && e.gym === gymId; }); }
function restOn(date, teamId){ return state.events.find(function(e){ return e.type === 'rest' && e.date === date && e.team === teamId; }); }

/* 割振（今週分） */
function countOf(t){ return restOn(DATE, t.id) ? 0 : t.n; }
function total(gymId){ return TEAMS.filter(function(t){ return state.asg.assign[t.id] === gymId; }).reduce(function(a, t){ return a + countOf(t); }, 0); }
function openGyms(){ return GYMS.filter(function(g){ return !closedOn(DATE, g.id); }); }
function unassigned(){
  return TEAMS.filter(function(t){
    if (countOf(t) === 0) return false;
    var a = state.asg.assign[t.id];
    return !a || !!closedOn(DATE, a);
  });
}
/* カレンダーに出す割振（過去の確定分＋今週の草案／確定） */
function assignFor(date){
  if (date !== DATE) return null;
  var rows = openGyms().map(function(g){
    var ts = TEAMS.filter(function(t){ return state.asg.assign[t.id] === g.id && countOf(t) > 0; });
    return ts.length ? { gym: g.name, teams: ts.map(function(t){ return t.name; }).join('、') } : null;
  }).filter(Boolean);
  return { status: state.asg.decided ? '確定済み' : '草案（未確定）', rows: rows };
}

function set(p){ Object.assign(state, p); render(); }
function setCal(p){ Object.assign(state.cal, p); render(); }
function setAsg(p){ Object.assign(state.asg, p); render(); }

/* =====================================================================
   共通パーツ
   ===================================================================== */
function header(){
  var who = state.me
    ? '<button class="who" data-act="switchIdent" aria-label="チーム・担当を切り替える"><span class="dot"></span>' + esc(tname(state.me)) + ' / ' + esc(state.member) + '</button>'
    : '';
  return '<div class="hdr"><img class="logo-img" src="assets/logo.png" alt="Attendance.">' + who + '</div>';
}
function tabbar(){
  var ic = {
    home:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
    att:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h12M4 10h12M4 15h7"/><path d="m15.5 18 2.2 2.2L22 15.6"/></svg>',
    cal:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19"/></svg>'
  };
  function t(v, label){
    var on = v === 'admin' ? (state.tab === 'admin' || state.tab === 'asg') : state.tab === v;
    return '<button class="tab' + (on ? ' on' : '') + '" data-act="tab" data-v="' + v + '" aria-current="' + on + '">' + ic[v] + label + '</button>';
  }
  return '<nav class="tabbar" aria-label="画面の切り替え">'
    + t('home', 'ホーム') + t('att', '出欠') + t('cal', 'カレンダー') + t('admin', '管理') + '</nav>';
}

/* =====================================================================
   ホーム・出欠・管理（枠。中身はモックアップ／サンプル。実装時に API へ）
   ===================================================================== */
function viewHome(){
  var h = '<div class="pad">';
  h += '<div class="hero"><div class="label">今週の練習日</div><div class="big en">' + md(DATE)
    + ' <span style="font-size:14px;font-family:\'Noto Sans JP\',sans-serif">（' + WD[parse(DATE).getDay()] + '）</span></div></div>';
  if (state.me) {
    var t = team(state.me), g = state.asg.assign[state.me], rest = restOn(DATE, state.me);
    var where = rest ? '休み' : (g && !closedOn(DATE, g) ? gname(g) : '未定');
    h += '<div class="card">'
      + '<div class="kv"><span>あなた</span><span class="v">' + esc(state.member) + '</span></div>'
      + '<div class="kv"><span>自チーム</span><span class="v">' + esc(t.name) + '</span></div>'
      + '<div class="kv"><span>割振先の体育館</span><span class="v">' + esc(where) + '</span></div>'
      + '<div class="kv"><span>今週の参加人数</span><span class="v">' + countOf(t) + ' 人</span></div>'
      + '</div>';
    var am = ATT[DATE] || {}, mem = t.members || [];
    var yes = mem.filter(function(m){ return am[m.id] === 'yes'; }).length;
    var no = mem.filter(function(m){ return am[m.id] === 'no'; }).length;
    var un = mem.length - mem.filter(function(m){ return am[m.id]; }).length;
    h += '<div class="label">自チームの出欠（' + mem.length + '名）</div>'
      + '<div class="grid3">'
      + '<div class="box"><div class="label">参加</div><div class="big en">' + yes + '</div></div>'
      + '<div class="box"><div class="label">不参加</div><div class="big en">' + no + '</div></div>'
      + '<div class="box"><div class="label">未回答</div><div class="big en">' + un + '</div></div>'
      + '</div>'
      + '<button class="link" data-act="tab" data-v="att">出欠を見る →</button>';
  }
  var a = assignFor(DATE);
  if (a) {
    h += '<div class="label">今週の割振（' + a.status + '）</div><div class="card">';
    if (a.rows.length) a.rows.forEach(function(r){
      h += '<div class="kv"><span>' + esc(r.gym) + '</span><span class="v" style="font-weight:500;color:var(--sub)">' + esc(r.teams) + '</span></div>';
    });
    else h += '<div class="st">まだ割振がありません</div>';
    h += '</div><button class="link" data-act="tab" data-v="cal">カレンダーで見る →</button>';
  }
  return h + '</div>';
}
function viewAtt(){
  var html = '<div class="pad"><div class="hero"><div class="label">出欠</div><div class="big">あなたの出欠</div></div>';
  html += '<div class="card">';
  (DATES.length ? DATES : [DATE]).forEach(function(d){
    var st = (ATT[d] || {})[state.memberId];
    var lbl = st === 'yes' ? '参加' : st === 'no' ? '不参加' : st === 'maybe' ? '未定' : '未回答';
    var cls = st === 'yes' ? 'lime' : st === 'no' ? 'warn' : st === 'maybe' ? 'blue' : '';
    html += '<div class="kv"><span>' + md(d) + '（' + WD[parse(d).getDay()] + '）</span><span class="v"><span class="st ' + cls + '" style="font-size:14px">' + lbl + '</span></span></div>';
  });
  html += '</div><div class="hint">出欠を変更する機能は、この後の工程で追加します。</div></div>';
  return html;
}
function viewAdmin(){
  function mi(title, sub, attr, cv){
    return '<button class="mi" ' + attr + '><span><b>' + title + '</b><span class="sub">' + sub + '</span></span><span class="cv">' + cv + '</span></button>';
  }
  return '<div class="pad"><div class="hero"><div class="label">管理画面</div><div class="big">管理メニュー</div></div><div class="menu">'
    + mi('割振', '今週の体育館割当（幹事）', 'data-act="tab" data-v="asg"', '›')
    + mi('連絡先', 'チームの連絡先を確認', 'disabled', '準備中')
    + mi('チーム管理', 'メンバー・連絡先の編集', 'disabled', '準備中')
    + mi('管理者', 'パスワード・体育館・担当表', 'disabled', '準備中')
    + '</div></div>';
}

/* =====================================================================
   カレンダー
   ===================================================================== */
function describe(e){
  if (e.type === 'closed') return { title: gname(e.gym) + '　使用不可', sub: e.reason + (e.memo ? '・' + e.memo : '') };
  if (e.type === 'rest')   return { title: tname(e.team) + '　休み', sub: e.reason + (e.memo ? '・' + e.memo : '') };
  return { title: e.memo || 'その他の予定', sub: '' };
}
function viewCal(){
  var c = state.cal, y = c.ym[0], m = c.ym[1];
  var atMin = y < MIN_YM[0] || (y === MIN_YM[0] && m <= MIN_YM[1]);
  var offset = new Date(y, m, 1).getDay();
  var weeks = Math.ceil((offset + new Date(y, m + 1, 0).getDate()) / 7);

  var cells = '';
  for (var i = 0; i < weeks * 7; i++) {
    var d = new Date(y, m, 1 - offset + i), t = iso(d), bars = '', cnt = 0;
    var a = c.filters.assign && assignFor(t);
    if (a) { bars += '<i style="background:#C6F14A' + (a.status === '確定済み' ? '' : ';opacity:.5') + '"></i>'; cnt++; }
    state.events.forEach(function(e){
      if (e.date === t && c.filters[e.type] && cnt < 4) { bars += '<i style="background:' + TYPES[e.type].color + '"></i>'; cnt++; }
    });
    var cls = 'day' + (d.getMonth() !== m ? ' out' : '') + (d.getDay() === 0 && d.getMonth() === m ? ' sun' : '') + (t === TODAY ? ' today' : '') + (t === c.sel ? ' sel' : '');
    cells += '<button class="' + cls + '" data-act="calPick" data-date="' + t + '" aria-pressed="' + (t === c.sel) + '" aria-label="' + (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WD[d.getDay()] + '）' + (cnt ? '　予定' + cnt + '件' : '') + '">'
      + '<span class="n">' + d.getDate() + '</span><span class="bars">' + bars + '</span></button>';
  }

  var chips = ['assign','closed','rest','other'].map(function(k){
    var on = c.filters[k];
    return '<button class="chip' + (on ? '' : ' off') + '" data-act="calFilter" data-v="' + k + '" aria-pressed="' + on + '"><i style="background:' + TYPES[k].color + '"></i>' + TYPES[k].label + '</button>';
  }).join('');

  var sd = parse(c.sel), list = '';
  var a2 = c.filters.assign && assignFor(c.sel);
  if (a2) {
    list += '<section class="asg"><div class="hd"><span class="t">割振</span><span class="s">' + a2.status + '</span><span class="r">割振画面で決定・ここでは編集不可</span></div>'
      + (a2.rows.length ? a2.rows.map(function(r){ return '<div class="ln"><b>' + esc(r.gym) + '</b><span class="en">' + esc(r.teams) + '</span></div>'; }).join('') : '<div class="ln">割当なし</div>')
      + (c.sel === DATE ? '<button class="link" data-act="tab" data-v="asg">割振画面を開く →</button>' : '') + '</section>';
  } else if (c.filters.assign && isSun(c.sel) && c.sel >= TODAY) {
    list += '<div class="yet"><b style="color:var(--lime)">割振</b>　未作成（金曜夕方に草案を作成）</div>';
  }
  var evs = state.events.filter(function(e){ return e.date === c.sel && c.filters[e.type]; });
  evs.forEach(function(e){
    var ds = describe(e), col = TYPES[e.type].color;
    list += '<section class="ev"><div class="body"><span class="tag" style="border-color:' + col + ';color:' + col + '">' + TYPES[e.type].label + '</span>'
      + '<span class="ttl">' + esc(ds.title) + '</span>' + (ds.sub ? '<span class="sb">' + esc(ds.sub) + '</span>' : '')
      + '<span class="by">登録：' + (e.by && tname(e.by) ? esc(tname(e.by)) + ' 代表' : '管理者') + '</span></div>'
      + '<button class="edit" data-act="calEdit" data-id="' + e.id + '" aria-label="' + esc(ds.title) + 'を編集">編集</button></section>';
  });
  if (!list) list = '<div class="empty">この日の予定はありません</div>';

  return '<div class="pad">'
    + '<div class="monthrow"><h1>' + y + '年' + (m + 1) + '月</h1><div class="navs">'
    + '<button class="arrow" data-act="calPrev" aria-label="前の月"' + (atMin ? ' disabled' : '') + '>‹</button>'
    + '<button data-act="calThis">今月</button>'
    + '<button class="arrow" data-act="calNext" aria-label="次の月">›</button></div></div>'
    + '<div class="filters">' + chips + '</div>'
    + (c.toast ? '<div class="toast" role="status">' + esc(c.toast) + '</div>' : '')
    + '<div class="wk"><span>日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span></div>'
    + '<div class="grid">' + cells + '</div>'
    + '<div class="dayhd"><b>' + (sd.getMonth() + 1) + '月' + sd.getDate() + '日（' + WD[sd.getDay()] + '）</b><span class="label">' + (isSun(c.sel) ? '練習日' : '') + '</span></div>'
    + list
    + '<div style="height:72px"></div></div>'
    + '<button class="fab" data-act="calNew"><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" stroke="#0D0D0D" stroke-width="2.4" stroke-linecap="round"/></svg>予定を登録</button>';
}

/* 登録・修正シート */
function upcomingSundays(){
  var out = [], d = parse(TODAY);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  for (var k = 0; k < 8; k++) { out.push(iso(d)); d.setDate(d.getDate() + 7); }
  return out;
}
function targetDates(f){ return f.type === 'other' ? (f.date ? [f.date] : []) : f.dates; }
function cannotSave(f){ return !targetDates(f).length || (f.type === 'other' && !f.memo.trim()) || (f.type === 'closed' && !f.gym); }
function sheetWarn(f){
  if (f.type === 'other') return '';
  var ds = targetDates(f), conf = [], draft = [];
  ds.forEach(function(d){ var a = assignFor(d); if (a) (a.status === '確定済み' ? conf : draft).push(md(d)); });
  if (conf.length) return conf.join('、') + 'は割振が確定済みです。保存すると今週の担当に見直しを依頼します。';
  if (draft.length) return draft.join('、') + 'は割振の草案があります。保存すると草案に反映されます。';
  return '';
}
function viewSheet(){
  var c = state.cal, f = c.form, isEdit = c.sheet === 'edit';
  var types = ['closed','rest','other'].map(function(k){
    var on = f.type === k, col = TYPES[k].color;
    return '<button data-act="fType" data-v="' + k + '" aria-pressed="' + on + '" style="' + (on ? 'background:#1E1E1E;border:1.5px solid ' + col + ';color:' + col : '') + '">' + TYPES[k].label + '</button>';
  }).join('');

  var suns = upcomingSundays();
  f.dates.forEach(function(d){ if (suns.indexOf(d) < 0) suns.unshift(d); });
  var dateField = f.type === 'other'
    ? '<label class="fld">日付<input type="date" data-field="date" value="' + esc(f.date) + '" min="' + TODAY + '"></label>'
    : '<div><div class="label" style="margin-bottom:6px">' + (isEdit ? '日付（日曜）' : '日付（日曜・複数選べます）') + '</div><div class="suns">'
      + suns.map(function(d){ var on = f.dates.indexOf(d) >= 0; return '<button class="' + (on ? 'on' : '') + '" data-act="fDate" data-date="' + d + '" aria-pressed="' + on + '">' + md(d) + '</button>'; }).join('')
      + '</div></div>';

  var myHome = homeOf(state.me);
  var gymField = '';
  if (f.type === 'closed') {
    var gh = !f.gym ? ['体育館を選んでください', 'warn']
      : f.gym === myHome ? ['ログイン中のチーム（' + tname(state.me) + '）のホームを初期表示しています', '']
      : ['他チームの体育館を代わりに登録します', 'warn'];
    gymField = '<label class="fld">体育館<select data-field="gym">'
      + (myHome ? '' : '<option value="">選択してください</option>')
      + GYMS.map(function(g){ return '<option value="' + g.id + '"' + (g.id === f.gym ? ' selected' : '') + '>' + g.name + '</option>'; }).join('')
      + '</select><span class="hint ' + gh[1] + '">' + gh[0] + '</span></label>';
  }
  var teamField = '';
  if (f.type === 'rest') {
    teamField = '<label class="fld">チーム<select data-field="team">'
      + TEAMS.map(function(t){ return '<option value="' + t.id + '"' + (t.id === f.team ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('')
      + '</select><span class="hint ' + (f.team === state.me ? '' : 'warn') + '">' + (f.team === state.me ? 'ログイン中のチームを初期表示しています' : '他チームの休みを代わりに登録します') + '</span></label>';
  }
  var reasonField = f.type === 'other' ? '' : '<label class="fld">理由<select data-field="reason">'
    + REASONS[f.type].map(function(r){ return '<option' + (r === f.reason ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select></label>';
  var memoPh = f.type === 'closed' ? '例：運動会' : f.type === 'rest' ? '例：大会参加のため' : '例：代表者ミーティング';
  var memoField = '<label class="fld">' + (f.type === 'other' ? '内容' : 'メモ（任意）') + '<input type="text" data-field="memo" value="' + esc(f.memo) + '" placeholder="' + memoPh + '"></label>';
  var byField = '<label class="fld">登録者<select data-field="by">'
    + TEAMS.map(function(t){ return '<option value="' + t.id + '"' + (t.id === f.by ? ' selected' : '') + '>' + esc(t.name) + ' 代表</option>'; }).join('')
    + '</select></label>';
  var w = sheetWarn(f);
  var n = targetDates(f).length;
  return '<div class="overlay bottom" data-act="closeSheet" data-self="1"><div class="sheet" role="dialog" aria-modal="true" aria-label="' + (isEdit ? '予定を修正' : '予定を登録') + '">'
    + '<span class="grab"></span><div class="shd"><b>' + (isEdit ? '予定を修正' : '予定を登録') + '</b><button class="x" data-act="closeSheet" aria-label="閉じる">×</button></div>'
    + '<div><div class="label" style="margin-bottom:6px">種類</div><div class="seg3">' + types + '</div></div>'
    + dateField + gymField + teamField + reasonField + memoField + byField
    + (w ? '<div class="wbox">' + esc(w) + '</div>' : '')
    + '<div class="row2">' + (isEdit ? '<button class="btn danger" data-act="askDelete">削除</button>' : '')
    + '<button class="btn primary" style="flex:2" data-act="saveEvent" id="saveBtn"' + (cannotSave(f) ? ' disabled' : '') + '>' + (isEdit ? '修正を保存' : (n > 1 ? n + '件を登録' : '登録')) + '</button></div>'
    + '</div></div>';
}
function viewDelete(){
  var f = state.cal.form, e = state.events.find(function(x){ return x.id === f.id; });
  if (!e) return '';
  var ds = describe(e), a = assignFor(e.date);
  return '<div class="overlay center"><div class="dialog" role="alertdialog" aria-modal="true" aria-label="予定の削除">'
    + '<div class="q">この予定を削除しますか？</div>'
    + '<div class="boxed">' + md(e.date) + '　' + esc(ds.title) + (ds.sub ? '（' + esc(ds.sub) + '）' : '') + '</div>'
    + (a && e.type !== 'other' ? '<div class="hint warn" style="font-size:12px">この日は割振があります。削除すると、割振の見直しが必要になる場合があります。</div>' : '')
    + '<div class="row2"><button class="btn ghost" data-act="cancelDelete">キャンセル</button><button class="btn danger-fill" data-act="doDelete">削除する</button></div>'
    + '</div></div>';
}

/* =====================================================================
   割振
   ===================================================================== */
function viewAsgPick(){
  var s = state.asg, canEdit = state.admin;
  var cur = gym(s.gym), curTotal = total(s.gym), ht = homeTeamOf(s.gym);

  var gymsHtml = GYMS.map(function(g){
    var cl = closedOn(DATE, g.id), on = g.id === s.gym;
    var sub = cl ? '使用不可・' + (cl.memo || cl.reason) : total(g.id) + '人';
    return '<button class="gym' + (on ? ' on' : '') + '" data-act="asgGym" data-v="' + g.id + '"' + (cl ? ' disabled' : '') + ' aria-pressed="' + on + '"><b>' + esc(g.short) + '</b><span>' + esc(sub) + '</span></button>';
  }).join('');

  var rows = TEAMS.map(function(t){
    var a = s.assign[t.id], here = a === s.gym, rest = restOn(DATE, t.id), n = countOf(t);
    var st, cls = '';
    if (rest) { st = '休み（カレンダー登録）'; cls = 'blue'; }
    else if (n === 0) { st = '休み（参加0人）'; }
    else if (a && closedOn(DATE, a)) { st = '割振先が使用不可：' + gname(a); cls = 'warn'; }
    else if (here) { st = 'この体育館に割振中'; cls = 'lime'; }
    else if (a) { st = '割振済み：' + gname(a); }
    else { st = '未割当'; cls = 'warn'; }
    if (n > 0 && n < UNIT) st += '　5人未満';
    var off = n === 0;
    return '<button class="team' + (here && !off ? ' here' : '') + (off ? ' off' : '') + '" data-act="asgTeam" data-v="' + t.id + '"' + (off || !canEdit ? ' disabled' : '') + ' aria-pressed="' + here + '">'
      + '<span class="bd">' + t.id + '</span>'
      + '<span class="tinfo"><span class="tname">' + esc(t.name) + (t.home === s.gym ? '<span class="home">HOME</span>' : '') + '</span><span class="st ' + cls + '">' + esc(st) + '</span></span>'
      + '<span class="num"><b class="' + (n > 0 && n < UNIT ? 'short' : '') + '">' + n + '</b><span>人</span></span></button>';
  }).join('');

  var un = unassigned();
  var head = '<div class="pad">'
    + '<div><h1>' + md(DATE) + '(' + WD[parse(DATE).getDay()] + ')の割当</h1><div class="label" style="margin-top:6px">今週の担当　' + esc(DUTY_NAME) + (s.decided ? '　・　確定済み' : '　・　草案') + '</div></div>';
  head += '<div><div class="label" style="margin-bottom:8px">① 今週使える体育館を選ぶ</div><div class="gyms">' + gymsHtml + '</div></div>'
    + '<div class="cur"><div><div class="nm">' + esc(cur.name) + '</div><div class="s">' + (ht ? 'ホーム：' + esc(ht.name) : 'ホームのチームなし') + '</div></div>'
    + '<div style="text-align:right"><span class="big">' + curTotal + '</span><span style="font-size:12px">人</span><div class="s">' + Math.floor(curTotal / UNIT) + 'チーム分</div></div></div>'
    + '<div class="label">② チームをタップして、この体育館に割り振る</div>'
    + '<div class="teams">' + rows + '</div></div>';
  var bar = canEdit
    ? '<div class="bar"><div class="left ' + (un.length ? 'warn' : 'ok') + '">' + (un.length ? '未割当 ' + un.length + 'チーム' : 'すべてのチームを割り振りました') + '</div><button class="btn primary" style="flex:0 0 190px" data-act="asgConfirm">最終確認へ</button></div>'
    : '';
  return head + bar;
}
function viewMove(){
  var s = state.asg, p = team(s.pending), from = s.assign[p.id], fromTotal = total(from), toTotal = total(s.gym), n = countOf(p);
  var homeWarn = p.home && p.home === from;
  return '<div class="overlay center"><div class="dialog" role="dialog" aria-modal="true" aria-label="再割振の確認">'
    + '<div class="kicker">割振済みのチームです</div>'
    + '<div class="q"><span class="en">' + esc(p.name) + '</span>（' + n + '人）を<br>' + esc(gname(s.gym)) + 'に移しますか？</div>'
    + '<div class="grid2"><div class="box"><div class="k">移動元　' + esc(gname(from)) + '</div><div class="v">' + fromTotal + ' → ' + (fromTotal - n) + '<small style="font-size:11px">人</small></div></div>'
    + '<div class="box to"><div class="k">移動先　' + esc(gname(s.gym)) + '</div><div class="v">' + toTotal + ' → ' + (toTotal + n) + '<small style="font-size:11px">人</small></div></div></div>'
    + (homeWarn ? '<div class="hint warn" style="font-size:12px">' + esc(gname(from)) + 'は' + esc(p.name) + 'のホームです。移すと、この体育館は使えなくなる可能性があります。</div>' : '')
    + '<div class="row2"><button class="btn ghost" data-act="cancelMove">キャンセル</button><button class="btn primary" data-act="confirmMove">移す</button></div>'
    + '</div></div>';
}
function asgWarnings(){
  var w = [];
  unassigned().forEach(function(t){
    var a = state.asg.assign[t.id];
    w.push(a ? t.name + 'の割振先（' + gname(a) + '）が使用不可になりました' : t.name + '（' + countOf(t) + '人）がまだ割り振られていません');
  });
  openGyms().forEach(function(g){
    var tot = total(g.id), ht = homeTeamOf(g.id);
    if (tot > 0 && tot < UNIT) w.push(g.name + 'が' + tot + '人です（5人未満）');
    if (tot > 0 && ht && state.asg.assign[ht.id] !== g.id) w.push(g.name + 'にホームの' + ht.name + 'がいません。借りているチームがいないと使えない可能性があります');
  });
  return w;
}
function viewAsgConfirm(){
  var w = asgWarnings();
  var cards = openGyms().map(function(g){
    var ts = TEAMS.filter(function(t){ return state.asg.assign[t.id] === g.id && countOf(t) > 0; }), tot = total(g.id);
    return '<section class="card"><div class="hd"><b>' + esc(g.name) + '</b><span><span class="en" style="font-size:24px;font-weight:800">' + tot + '</span><span style="font-size:12px">人</span><span class="label" style="margin-left:6px">' + Math.floor(tot / UNIT) + 'チーム分</span></span></div>'
      + (ts.length ? ts.map(function(t){ var n = countOf(t); return '<div class="t"><span class="bd">' + t.id + '</span><span class="en" style="font-weight:600">' + esc(t.name) + '</span><span class="n' + (n < UNIT ? ' short' : '') + '">' + n + '人</span></div>'; }).join('') : '<div class="none">割当なし（この体育館は使いません）</div>')
      + '</section>';
  }).join('');
  var closed = GYMS.filter(function(g){ return closedOn(DATE, g.id); }).map(function(g){ var e = closedOn(DATE, g.id); return '<div class="plain"><span>使用不可　' + esc(g.name) + '</span><span>' + esc(e.memo || e.reason) + '</span></div>'; }).join('');
  var rest = TEAMS.filter(function(t){ return countOf(t) === 0; }).map(function(t){ return t.name; });
  return '<div class="pad"><h1>最終確認</h1>'
    + (w.length ? '<div class="warnbox">' + w.map(function(x){ return '<div><span>' + esc(x) + '</span></div>'; }).join('') + '</div>' : '')
    + cards + closed
    + '<div class="plain"><span>休み</span><span>' + esc(rest.length ? rest.join('、') : 'なし') + '</span></div></div>'
    + '<div class="bar"><button class="btn ghost" style="flex:1" data-act="asgBack">戻って修正</button><button class="btn primary" style="flex:2" data-act="asgDecide">この内容で決定する</button></div>';
}
function lineText(){ // 実装時はGAS側で作成して返す
  var lines = ['【11/8(日) 練習場所が決まりました】', ''];
  openGyms().forEach(function(g){
    var ts = TEAMS.filter(function(t){ return state.asg.assign[t.id] === g.id && countOf(t) > 0; });
    if (!ts.length) return;
    lines.push('●' + g.name + '（' + total(g.id) + '人）');
    lines.push('　' + ts.map(function(t){ return t.name + ' ' + countOf(t) + '人'; }).join('／'));
  });
  lines.push('');
  GYMS.forEach(function(g){ var e = closedOn(DATE, g.id); if (e) lines.push('※' + g.name + 'は' + (e.memo || e.reason) + 'のため使用不可'); });
  var rest = TEAMS.filter(function(t){ return countOf(t) === 0; }).map(function(t){ return t.name; });
  if (rest.length) lines.push('※休み：' + rest.join('、'));
  lines.push('詳細はこちら → [アプリのURL]');
  return lines.join('\n');
}
function viewAsgLine(){
  var s = state.asg;
  var note = s.copied ? '文面をコピーしました' : s.posted ? '代表者のLINEグループに投稿しました' : 'ボットが代表者のLINEグループに投稿します';
  return '<div class="pad">'
    + '<div class="done"><i><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="#0D0D0D" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></i>11/8の割当を決定しました（カレンダーにも反映）</div>'
    + '<h1>LINE通知の文面</h1>'
    + '<div class="label">決定した内容から自動で作成しました。投稿前に確認してください。</div>'
    + '<div class="bubble">' + esc(lineText()) + '</div>'
    + '<div class="label">' + note + '</div></div>'
    + '<div class="bar" style="flex-direction:column;align-items:stretch"><button class="btn primary" data-act="post"' + (s.posted ? ' disabled' : '') + '>' + (s.posted ? 'LINEグループに投稿しました' : 'LINEグループに投稿する') + '</button>'
    + '<div class="row2"><button class="btn ghost" style="min-height:48px" data-act="copy">文面をコピー</button><button class="btn quiet" style="min-height:48px" data-act="asgBack">割当を修正</button></div></div>';
}

/* =====================================================================
   入口・管理パスワード
   ===================================================================== */
/* 入口：チームを選ぶ → 誰で操作するか（メンバー）を選ぶ。認証はしない */
function viewPickTeam(){
  var cards = TEAMS.map(function(t){
    return '<button class="pk" data-act="pickTeam" data-v="' + t.id + '"><span class="bd">' + t.id + '</span><span class="pkname">' + esc(t.name) + '</span><span class="cv">›</span></button>';
  }).join('');
  return '<div class="entry"><img class="elogo-img" src="assets/logo.png" alt="Attendance.">'
    + '<div class="etitle">チームを選択</div>'
    + '<div class="esub">あなたのチームを選んでください</div>'
    + '<div class="menu">' + cards + '</div></div>';
}
function viewPickMember(){
  var t = team(state.pick.team), ms = t.members || [];
  var cards = ms.length ? ms.map(function(m){
    return '<button class="pk" data-act="pickMember" data-v="' + esc(m.id) + '"><span class="pkname">' + esc(m.name) + '</span><span class="cv">›</span></button>';
  }).join('') : '<div class="empty">このチームにはメンバーが登録されていません。</div>';
  return '<div class="entry"><img class="elogo-img" src="assets/logo.png" alt="Attendance.">'
    + '<div class="etitle">' + esc(t.name) + '</div>'
    + '<div class="esub">あなたの名前を選んでください</div>'
    + '<div class="menu">' + cards + '</div>'
    + '<button class="link" style="align-self:center;margin-top:10px" data-act="pickBack">← チーム選択に戻る</button></div>';
}
/* 管理画面のパスワード。これを知っている人だけが管理画面に入れる */
function viewAdminGate(){
  var g = state.gate;
  return '<div class="pad"><div class="hero"><div class="label">管理画面</div><div class="big">管理パスワード</div></div>'
    + '<div class="notice">管理画面（割振・代表者設定・チーム管理など）に入るにはパスワードが必要です。</div>'
    + '<label class="fld">パスワード<input type="password" inputmode="numeric" autocomplete="off" data-gfield="code" value="' + esc(g.code) + '" placeholder="8桁の数字"></label>'
    + (g.err ? '<div class="err" role="alert">' + esc(g.err) + '</div>' : '')
    + '<div class="hint">デモ：8桁の数字で開きます（本番はサーバーで照合します）</div>'
    + '<button class="btn primary" data-act="gateSubmit">管理画面に入る</button></div>';
}

/* =====================================================================
   描画
   ===================================================================== */
function render(){
  // まだ誰で操作するか決めていなければ、入口（チーム→メンバー選択）を出す
  if (!state.me) {
    document.getElementById('app').innerHTML = state.pick.team ? viewPickMember() : viewPickTeam();
    return;
  }
  var asgBody = state.asg.screen === 'confirm' ? viewAsgConfirm() : state.asg.screen === 'line' ? viewAsgLine() : viewAsgPick();
  var body;
  if (state.tab === 'home') body = viewHome();
  else if (state.tab === 'att') body = viewAtt();
  else if (state.tab === 'cal') body = viewCal();
  else if (state.tab === 'admin') body = state.admin ? viewAdmin() : viewAdminGate();
  else body = state.admin ? asgBody : viewAdminGate();
  var overlays = '';
  if (state.tab === 'cal' && state.cal.sheet) overlays += viewSheet();
  if (state.tab === 'cal' && state.cal.confirmDel) overlays += viewDelete();
  if (state.tab === 'asg' && state.admin && state.asg.pending) overlays += viewMove();
  document.getElementById('app').innerHTML = header() + body + tabbar() + overlays;
}

/* =====================================================================
   操作
   ===================================================================== */
function saveIdent(){ try { if (state.me) localStorage.setItem('att_ident', JSON.stringify({ team: state.me, member: state.member, memberId: state.memberId })); else localStorage.removeItem('att_ident'); } catch (e) {} }
function loadIdent(){ try { var r = JSON.parse(localStorage.getItem('att_ident') || 'null'); if (r && team(r.team)) { var t = team(r.team), m = (t.members || []).filter(function(x){ return x.id === r.memberId; })[0]; if (m) { state.me = r.team; state.memberId = r.memberId; state.member = m.name; } } } catch (e) {} }
function newForm(){
  var c = state.cal, ds = isSun(c.sel) && c.sel >= TODAY ? [c.sel] : [];
  return { id: null, type: 'closed', dates: ds, date: c.sel >= TODAY ? c.sel : TODAY, gym: homeOf(state.me), team: state.me, reason: REASONS.closed[0], memo: '', by: state.me };
}
function editForm(e){
  return { id: e.id, type: e.type, dates: e.type === 'other' ? [] : [e.date], date: e.date, gym: e.gym || homeOf(state.me), team: e.team || state.me, reason: e.reason || (REASONS[e.type] ? REASONS[e.type][0] : ''), memo: e.memo || '', by: e.by };
}

var ACTIONS = {
  tab: function(el){ set({ tab: el.dataset.v }); window.scrollTo(0, 0); },
  switchIdent: function(){ set({ me: null, member: null, memberId: null, admin: false, pick: { team: null }, gate: { code: '', err: '' }, tab: 'home' }); saveIdent(); },
  pickTeam: function(el){ state.pick.team = el.dataset.v; render(); },
  pickBack: function(){ state.pick.team = null; render(); },
  pickMember: function(el){ var t = team(state.pick.team), m = t && (t.members || []).filter(function(x){ return x.id === el.dataset.v; })[0]; set({ me: state.pick.team, member: m ? m.name : '', memberId: el.dataset.v, tab: 'home' }); saveIdent(); },
  reload: function(){ bootLoad(); },
  gateSubmit: function(){
    if (!/^\d{8}$/.test(state.gate.code || '')) { state.gate.err = 'パスワードは8桁の数字です'; return render(); }
    set({ admin: true, gate: { code: '', err: '' } });
  },

  calPrev: function(){ var c = state.cal, d = new Date(c.ym[0], c.ym[1] - 1, 1); if (d.getFullYear() < MIN_YM[0] || (d.getFullYear() === MIN_YM[0] && d.getMonth() < MIN_YM[1])) return; setCal({ ym: [d.getFullYear(), d.getMonth()], toast: '' }); },
  calNext: function(){ var c = state.cal, d = new Date(c.ym[0], c.ym[1] + 1, 1); setCal({ ym: [d.getFullYear(), d.getMonth()], toast: '' }); },
  calThis: function(){ setCal({ ym: MIN_YM.slice(), sel: TODAY, toast: '' }); },
  calPick: function(el){ setCal({ sel: el.dataset.date, toast: '' }); },
  calFilter: function(el){ var f = Object.assign({}, state.cal.filters); f[el.dataset.v] = !f[el.dataset.v]; setCal({ filters: f }); },
  calNew: function(){ setCal({ sheet: 'new', form: newForm(), toast: '' }); },
  calEdit: function(el){ var e = state.events.find(function(x){ return x.id === el.dataset.id; }); setCal({ sheet: 'edit', form: editForm(e), toast: '' }); },
  closeSheet: function(el, ev){ if (el.dataset.self && ev.target !== el) return; setCal({ sheet: null, form: null, confirmDel: false }); },
  fType: function(el){
    var f = state.cal.form, k = el.dataset.v;
    f.type = k; f.reason = REASONS[k] ? REASONS[k][0] : '';
    if (k !== 'other') f.dates = f.dates.length ? f.dates : (isSun(f.date) ? [f.date] : []);
    if (!f.gym) f.gym = homeOf(state.me);
    render();
  },
  fDate: function(el){
    var f = state.cal.form, d = el.dataset.date;
    if (state.cal.sheet === 'edit') f.dates = [d];
    else if (f.dates.indexOf(d) >= 0) f.dates = f.dates.filter(function(x){ return x !== d; });
    else { f.dates.push(d); f.dates.sort(); }
    render();
  },
  saveEvent: function(){
    var c = state.cal, f = c.form;
    if (cannotSave(f)) return;
    var ds = targetDates(f), warned = !!sheetWarn(f);
    var mk = function(d, id){ return { id: id, type: f.type, date: d, gym: f.type === 'closed' ? f.gym : undefined, team: f.type === 'rest' ? f.team : undefined, reason: f.type === 'other' ? '' : f.reason, memo: f.memo.trim(), by: f.by }; };
    if (c.sheet === 'edit') state.events = state.events.map(function(e){ return e.id === f.id ? mk(ds[0], e.id) : e; });
    else ds.forEach(function(d){ state.events.push(mk(d, 'e' + (state.nextId++))); });
    var first = parse(ds[0]);
    setCal({ sheet: null, form: null, sel: ds[0], ym: [first.getFullYear(), first.getMonth()],
      toast: (c.sheet === 'edit' ? '予定を修正しました' : ds.length + '件の予定を登録しました') + (warned ? '（割振に反映しました）' : '') });
  },
  askDelete: function(){ setCal({ confirmDel: true }); },
  cancelDelete: function(){ setCal({ confirmDel: false }); },
  doDelete: function(){
    var id = state.cal.form.id;
    state.events = state.events.filter(function(e){ return e.id !== id; });
    setCal({ sheet: null, form: null, confirmDel: false, toast: '予定を削除しました' });
  },

  asgGym: function(el){ setAsg({ gym: el.dataset.v }); },
  asgTeam: function(el){
    if (!state.admin) return;
    var id = el.dataset.v, s = state.asg, a = s.assign[id], assign = Object.assign({}, s.assign);
    if (a === s.gym) { assign[id] = null; return setAsg({ assign: assign, decided: false }); }
    if (!a || closedOn(DATE, a)) { assign[id] = s.gym; return setAsg({ assign: assign, decided: false }); }
    setAsg({ pending: id });
  },
  cancelMove: function(){ setAsg({ pending: null }); },
  confirmMove: function(){ var s = state.asg, assign = Object.assign({}, s.assign); assign[s.pending] = s.gym; setAsg({ assign: assign, pending: null, decided: false }); },
  asgConfirm: function(){ setAsg({ screen: 'confirm' }); window.scrollTo(0, 0); },
  asgBack: function(){ setAsg({ screen: 'pick', posted: false, copied: false }); window.scrollTo(0, 0); },
  asgDecide: function(){ setAsg({ screen: 'line', decided: true, posted: false, copied: false }); window.scrollTo(0, 0); },
  post: function(){ setAsg({ posted: true, copied: false }); },
  copy: function(){
    var done = function(){ setAsg({ copied: true }); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lineText()).then(done, done); else done();
  }
};

document.addEventListener('click', function(ev){
  var el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  var fn = ACTIONS[el.dataset.act];
  if (fn) fn(el, ev);
});
/* セレクト・日付は変更時に再描画。文字入力は再描画せず値だけ保持（入力中のフォーカスを保つ） */
document.addEventListener('change', function(ev){
  var el = ev.target;
  if (el.dataset.field && state.cal.form) {
    var f = state.cal.form;
    f[el.dataset.field] = el.value;
    if (el.dataset.field === 'date' && f.type !== 'other') f.dates = isSun(el.value) ? [el.value] : f.dates;
    if (el.dataset.field !== 'memo') render();
  }
  if (el.dataset.gfield) { state.gate[el.dataset.gfield] = el.value; }
});
document.addEventListener('input', function(ev){
  var el = ev.target;
  if (el.dataset.field === 'memo' && state.cal.form) {
    state.cal.form.memo = el.value;
    var b = document.getElementById('saveBtn'); if (b) b.disabled = cannotSave(state.cal.form);
  }
  if (el.dataset.gfield === 'code') { state.gate.code = el.value; }
});
document.addEventListener('keydown', function(ev){
  if (ev.key !== 'Escape') return;
  if (state.asg.pending) return setAsg({ pending: null });
  if (state.cal.confirmDel) return setCal({ confirmDel: false });
  if (state.cal.sheet) return setCal({ sheet: null, form: null });
});

function renderLoading(){
  document.getElementById('app').innerHTML = '<div class="entry"><img class="elogo-img" src="assets/logo.png" alt="Attendance."><div class="esub">読み込み中…</div></div>';
}
function renderError(e){
  document.getElementById('app').innerHTML = '<div class="entry"><img class="elogo-img" src="assets/logo.png" alt="Attendance.">'
    + '<div class="etitle">読み込みに失敗しました</div>'
    + '<div class="esub">通信エラー（' + esc(e && e.message ? e.message : '') + '）。電波のよい場所でお試しください。</div>'
    + '<button class="btn primary" data-act="reload">再読み込み</button></div>';
}
// getBootstrap の実データを取得してからアプリを描く
function bootLoad(){
  renderLoading();
  api('getBootstrap').then(function(data){ buildData(data.boot); loadIdent(); render(); }).catch(function(e){ renderError(e); });
}

bootLoad();