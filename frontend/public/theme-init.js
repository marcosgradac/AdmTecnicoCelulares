(function () {
  var mode = 'light';
  try {
    var token = localStorage.getItem('cellufix_access_token'), cache = JSON.parse(localStorage.getItem('tecnodesk_theme_session') || 'null'), hash = 2166136261;
    if (token) for (var i = 0; i < token.length; i++) hash = Math.imul(hash ^ token.charCodeAt(i), 16777619);
    var preference = token && cache && cache.tokenHint === (hash >>> 0).toString(16) ? cache.preference : 'SYSTEM';
    mode = preference === 'DARK' || (preference !== 'LIGHT' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  } catch (_) { if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) mode = 'dark'; }
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  document.documentElement.style.backgroundColor = mode === 'dark' ? '#0D111B' : '#F8F9FC';
})();
