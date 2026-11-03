// GAS の Web アプリ（exec URL）へ POST して {ok,data}/{ok,error} を扱う。
// プリフライトを避けるため text/plain、独自ヘッダーと Cookie は送らない。
window.api = function (action, params) {
  return fetch(window.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: action, params: params || {} }),
    redirect: 'follow'
  }).then(function (res) {
    return res.json();
  }).then(function (json) {
    if (!json.ok) {
      var err = new Error((json.error && json.error.message) || '通信エラー');
      err.code = json.error && json.error.code;
      throw err;
    }
    return json.data;
  });
};
