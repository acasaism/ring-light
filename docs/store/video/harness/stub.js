// Fake extension API for the panel and the call frames, injected by record.mjs into every frame before
// its scripts run. One storage object lives in the parent page, with change events, like
// browser.storage.local + storage.onChanged. Texts come from the real English messages.
(function () {
  if (window === window.top) return; // the parent page (index.html) owns the store
  const store = parent.fakeStore;
  const xhr = new XMLHttpRequest();
  xhr.open("GET", "/_locales/en/messages.json", false); // synchronous: the panel reads texts as it starts
  xhr.send();
  const M = JSON.parse(xhr.responseText);
  const getMessage = (k, s) => {
    const m = M[k];
    if (!m) return k;
    let x = m.message;
    for (const [n, p] of Object.entries(m.placeholders || {})) x = x.replace("$" + n.toUpperCase() + "$", s[+p.content.slice(1) - 1]);
    return x;
  };
  window.browser = {
    i18n: { getUILanguage: () => "en", getMessage },
    runtime: { getURL: (p) => p, sendMessage: async () => {} },
    windows: { create: async () => { parent.openLightWindow(); return { id: 1 }; }, get: async () => { throw new Error("none"); }, onRemoved: { addListener() {} } },
    storage: {
      local: {
        get: async (d) => ({ ...d, ...store.data }),
        set: async (v) => {
          const changes = {};
          for (const k in v) changes[k] = { newValue: v[k] };
          Object.assign(store.data, v);
          for (const fn of store.listeners) fn(changes);
        },
        remove: async () => {},
      },
      onChanged: { addListener: (fn) => store.listeners.push(fn) },
    },
  };
})();
