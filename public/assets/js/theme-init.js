/* Apply the server-configured theme before first paint.
   /theme.js supplies window.__APP_THEME__ from the APP_THEME environment
   variable. This app deliberately does not persist a choice in the browser;
   the toggle is session-only so the "no browser storage" guarantee holds. */
(() => {
  const root = document.documentElement;
  const configured = window.__APP_THEME__;
  let theme = 'dark';
  if (configured === 'light') {
    theme = 'light';
  } else if (configured === 'system') {
    theme = window.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark';
  }
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
})();
