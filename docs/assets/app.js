/* =====================================================================
   サンプルデータ（実装時は API の結果に置き換える）
   ===================================================================== */
var TODAY = '2026-11-03';               // 実装時はアプリを開いた日
var MIN_YM = [2026, 10];                // 今月（11月）。これより前には戻れない
var DATE = '2026-11-08';                // 今週の練習日（割振の対象）
var DUTY = 'B';                         // 今週の担当（担当表から）
var UNIT = 5;                           // 5人で1チーム換算

var GYMS = [
  { id: 'g1', name: '第一小学校', short: '第一小' },
  { id: 'g2', name: '第二小学校', short: '第二小' },
  { id: 'g3', name: '第三小学校', short: '第三小' },
  { id: 'g4', name: '第四小学校', short: '第四小' }
];
var TEAMS = [ // n = その週の参加人数（出欠集計から）
  { id: 'A', name: 'Active',    n: 8, home: 'g1' },
  { id: 'B', name: 'bent',      n: 3, home: 'g2' },
  { id: 'C', name: 'CompacT',   n: 7, home: 'g3' },
  { id: 'D', name: 'DAIDAI',    n: 9 },
  { id: 'E', name: 'HOZUKI',    n: 2 },
  { id: 'F', name: "LIB'ER'TY", n: 6, home: 'g4' },
  { id: 'G', name: 'MUGEN',     n: 4 },
  { id: 'H', name: 'RUSH',      n: 5 }
];
var TYPES = {
  assign: { label: '割振',       color: '#C6F14A' },
  closed: { label: '使用不可',   color: '#FF9A3C' },
  rest:   { label: 'チーム休み', color: '#6CB4FF' },
  other:  { label: 'その他',     color: '#D4D4D4' }
};
var REASONS = {
  closed: ['学校行事', '地域行事', '選挙・公共行事', 'その他'],
  rest:   ['チームの都合', '大会・遠征', 'その他']
};
var PAST_ASSIGN = { // 確定済みの過去分
  '2026-11-01': [
    { gym: '第一小学校', teams: 'Active、DAIDAI' },
    { gym: '第二小学校', teams: 'bent、HOZUKI、MUGEN' },
    { gym: '第三小学校', teams: "CompacT、LIB'ER'TY" }
  ]
};

var state = {
  tab: 'cal',
  me: null,                                   // ログイン中のチームID
  login: null,                                // { team, code, err, then }
  events: [
    { id: 'e1', type: 'closed', date: '2026-11-08', gym: 'g4', reason: '学校行事', memo: '運動会', by: 'F' },
    { id: 'e2', type: 'rest',   date: '2026-11-08', team: 'H', reason: '大会・遠征', memo: '', by: 'H' },
    { id: 'e3', type: 'closed', date: '2026-11-15', gym: 'g2', reason: '地域行事', memo: '秋祭り', by: 'B' },
    { id: 'e4', type: 'rest',   date: '2026-11-15', team: 'E', reason: 'チームの都合', memo: '', by: 'E' },
    { id: 'e5', type: 'other',  date: '2026-11-18', reason: '', memo: '代表者ミーティング（オンライン）', by: 'D' },
    { id: 'e6', type: 'closed', date: '2026-11-29', gym: 'g1', reason: '選挙・公共行事', memo: '投票所のため', by: 'A' }
  ],
  nextId: 7,
  cal: { ym: [2026, 10], sel: DATE, filters: { assign: true, closed: true, rest: true, other: true }, sheet: null, form: null, confirmDel: false, toast: '' },
  asg: { screen: 'pick', gym: 'g1', pending: null, decided: false, posted: false, copied: false,
         assign: { A: 'g1', F: 'g1', B: 'g2', E: 'g2', D: 'g2', C: 'g3', G: 'g3', H: null } }
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
  if (PAST_ASSIGN[date]) return { status: '確定済み', rows: PAST_ASSIGN[date] };
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
    ? '<button class="who" data-act="openLogin" aria-label="ログイン中のチームを切り替える"><span class="dot"></span>' + esc(tname(state.me)) + ' 代表</button>'
    : '<button class="who out" data-act="openLogin"><span class="dot"></span>代表者ログイン</button>';
  return '<div class="hdr"><div class="logo"><b>Attendance</b><i></i></div>' + who + '</div>';
}
function tabbar(){
  var cal = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
  var asg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="4" width="7" height="7" rx="1.5"/><rect x="13.5" y="4" width="7" height="7" rx="1.5"/><rect x="3.5" y="14" width="7" height="6" rx="1.5"/><path d="M14 17h6M17 14v6"/></svg>';
  return '<nav class="tabbar" aria-label="画面の切り替え">'
    + '<button class="tab' + (state.tab === 'cal' ? ' on' : '') + '" data-act="tab" data-v="cal" aria-current="' + (state.tab === 'cal') + '">' + cal + 'カレンダー</button>'
    + '<button class="tab' + (state.tab === 'asg' ? ' on' : '') + '" data-act="tab" data-v="asg" aria-current="' + (state.tab === 'asg') + '">' + asg + '割振</button>'
    + '</nav>';
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
      + '<span class="by">登録：' + esc(tname(e.by)) + ' 代表</span></div>'
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
  var s = state.asg, canEdit = state.me === DUTY;
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
    + '<div><h1>11/8(日)の割当</h1><div class="label" style="margin-top:6px">今週の担当　' + esc(tname(DUTY)) + ' 代表' + (s.decided ? '　・　確定済み' : '　・　草案') + '</div></div>';
  if (!canEdit) {
    head += '<div class="notice"><span>割振ができるのは、今週の担当（' + esc(tname(DUTY)) + ' 代表）だけです。' + (state.me ? '' : '担当の方はログインしてください。') + '</span>'
      + '<button class="btn ghost" style="min-height:44px" data-act="openLogin">' + (state.me ? 'ログイン中のチームを切り替える' : '代表者ログイン') + '</button></div>';
  }
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
   ログイン（代表者パスコード）
   ===================================================================== */
function viewLogin(){
  var l = state.login;
  return '<div class="overlay center"><div class="dialog" role="dialog" aria-modal="true" aria-label="代表者ログイン">'
    + '<div class="q">代表者ログイン</div>'
    + '<div class="label">チームのパスコードを入力すると、そのチームの代表として登録・割振ができます。</div>'
    + '<label class="fld">チーム<select data-lfield="team">' + TEAMS.map(function(t){ return '<option value="' + t.id + '"' + (t.id === l.team ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</select></label>'
    + '<label class="fld">パスコード<input type="password" inputmode="numeric" autocomplete="current-password" data-lfield="code" value="' + esc(l.code) + '" placeholder="4桁の数字"></label>'
    + (l.err ? '<div class="err" role="alert">' + esc(l.err) + '</div>' : '')
    + '<div class="hint">モックアップでは4桁の数字なら何でもログインできます</div>'
    + '<div class="row2">' + (state.me ? '<button class="btn quiet" data-act="logout">ログアウト</button>' : '<button class="btn ghost" data-act="closeLogin">キャンセル</button>')
    + '<button class="btn primary" data-act="doLogin">ログイン</button></div>'
    + (state.me ? '<button class="link" style="align-self:center" data-act="closeLogin">閉じる</button>' : '')
    + '</div></div>';
}

/* =====================================================================
   描画
   ===================================================================== */
function render(){
  var body;
  if (state.tab === 'cal') body = viewCal();
  else body = state.asg.screen === 'confirm' ? viewAsgConfirm() : state.asg.screen === 'line' ? viewAsgLine() : viewAsgPick();
  var overlays = '';
  if (state.tab === 'cal' && state.cal.sheet) overlays += viewSheet();
  if (state.tab === 'cal' && state.cal.confirmDel) overlays += viewDelete();
  if (state.tab === 'asg' && state.asg.pending) overlays += viewMove();
  if (state.login) overlays += viewLogin();
  document.getElementById('app').innerHTML = header() + body
    + '<div class="mock-note">モックアップ：体育館名・ホーム・人数・予定はサンプルです</div>'
    + tabbar() + overlays;
}

/* =====================================================================
   操作
   ===================================================================== */
function needLogin(then){ set({ login: { team: state.me || 'B', code: '', err: '', then: then } }); }
function newForm(){
  var c = state.cal, ds = isSun(c.sel) && c.sel >= TODAY ? [c.sel] : [];
  return { id: null, type: 'closed', dates: ds, date: c.sel >= TODAY ? c.sel : TODAY, gym: homeOf(state.me), team: state.me, reason: REASONS.closed[0], memo: '', by: state.me };
}
function editForm(e){
  return { id: e.id, type: e.type, dates: e.type === 'other' ? [] : [e.date], date: e.date, gym: e.gym || homeOf(state.me), team: e.team || state.me, reason: e.reason || (REASONS[e.type] ? REASONS[e.type][0] : ''), memo: e.memo || '', by: e.by };
}

var ACTIONS = {
  tab: function(el){ set({ tab: el.dataset.v }); window.scrollTo(0, 0); },
  openLogin: function(){ needLogin(null); },
  closeLogin: function(){ set({ login: null }); },
  logout: function(){ set({ me: null, login: null }); },
  doLogin: function(){
    var l = state.login;
    if (!/^\d{4}$/.test(l.code)) { l.err = 'パスコードが違います'; return render(); }
    var then = l.then;
    state.me = l.team; state.login = null;
    if (then === 'new') { state.cal.form = newForm(); state.cal.sheet = 'new'; }
    if (then && then.indexOf('edit:') === 0) { var e = state.events.find(function(x){ return x.id === then.slice(5); }); if (e) { state.cal.form = editForm(e); state.cal.sheet = 'edit'; } }
    render();
  },

  calPrev: function(){ var c = state.cal, d = new Date(c.ym[0], c.ym[1] - 1, 1); if (d.getFullYear() < MIN_YM[0] || (d.getFullYear() === MIN_YM[0] && d.getMonth() < MIN_YM[1])) return; setCal({ ym: [d.getFullYear(), d.getMonth()], toast: '' }); },
  calNext: function(){ var c = state.cal, d = new Date(c.ym[0], c.ym[1] + 1, 1); setCal({ ym: [d.getFullYear(), d.getMonth()], toast: '' }); },
  calThis: function(){ setCal({ ym: MIN_YM.slice(), sel: TODAY, toast: '' }); },
  calPick: function(el){ setCal({ sel: el.dataset.date, toast: '' }); },
  calFilter: function(el){ var f = Object.assign({}, state.cal.filters); f[el.dataset.v] = !f[el.dataset.v]; setCal({ filters: f }); },
  calNew: function(){ if (!state.me) return needLogin('new'); setCal({ sheet: 'new', form: newForm(), toast: '' }); },
  calEdit: function(el){ if (!state.me) return needLogin('edit:' + el.dataset.id); var e = state.events.find(function(x){ return x.id === el.dataset.id; }); setCal({ sheet: 'edit', form: editForm(e), toast: '' }); },
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
    if (state.me !== DUTY) return;
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
  if (el.dataset.lfield && state.login) { state.login[el.dataset.lfield] = el.value; }
});
document.addEventListener('input', function(ev){
  var el = ev.target;
  if (el.dataset.field === 'memo' && state.cal.form) {
    state.cal.form.memo = el.value;
    var b = document.getElementById('saveBtn'); if (b) b.disabled = cannotSave(state.cal.form);
  }
  if (el.dataset.lfield === 'code' && state.login) { state.login.code = el.value; }
});
document.addEventListener('keydown', function(ev){
  if (ev.key !== 'Escape') return;
  if (state.login) return set({ login: null });
  if (state.asg.pending) return setAsg({ pending: null });
  if (state.cal.confirmDel) return setCal({ confirmDel: false });
  if (state.cal.sheet) return setCal({ sheet: null, form: null });
});

render();