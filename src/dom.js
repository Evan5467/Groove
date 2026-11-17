// Tiny DOM builder. Strings always become text nodes, so user or AI text can never turn into
// markup. Attributes that could inject markup or script are refused.
const SVG = 'http://www.w3.org/2000/svg';
const BLOCKED = new Set(['innerHTML', 'outerHTML', 'srcdoc', 'href', 'src', 'action', 'formaction']);

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false || k === true) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (BLOCKED.has(k) || (k === 'style' && typeof v === 'string')) throw new Error('blocked attribute');
    if (k === 'class') el.className = v;
    else if (k === 'style') for (const [p, val] of Object.entries(v)) (p.startsWith('--') ? el.style.setProperty(p, val) : (el.style[p] = val));
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, kids);
  return el;
}

const ICONS = {
  today: ['M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', 'M8 3v4M16 3v4M4 10h16', 'M9 15l2 2 4-4'],
  week: ['M4 6h4v12H4zM10 6h4v12h-4zM16 6h4v12h-4z'],
  library: ['M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', 'M5 17a3 3 0 0 1 3-3h10'],
  settings: ['M4 7h10M18 7h2M4 17h2M10 17h10', 'M16 7m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0', 'M8 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0'],
  plus: ['M12 5v14M5 12h14'],
  chevL: ['M15 6l-6 6 6 6'],
  chevR: ['M9 6l6 6-6 6'],
  check: ['M5 12l5 5 9-10'],
  lock: ['M6 11h12v9H6z', 'M9 11V8a3 3 0 0 1 6 0v3'],
  trash: ['M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13'],
  x: ['M6 6l12 12M18 6L6 18'],
  upload: ['M12 16V4M7 9l5-5 5 5M5 20h14'],
  type: ['M5 6V4h14v2M12 4v16M9 20h6'],
  task: ['M5 12l5 5 9-10'],
  repeat: ['M17 3l4 4-4 4M3 11V9a2 2 0 0 1 2-2h16M7 21l-4-4 4-4M21 13v2a2 2 0 0 1-2 2H3'],
  back: ['M15 6l-6 6 6 6']
};

export function icon(name, size = 22) {
  const s = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v);
  for (const d of ICONS[name] || []) {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', d);
    s.append(p);
  }
  return s;
}

export function toast(msg) {
  const box = document.getElementById('toasts');
  const t = h('div', { class: 'toast', role: 'status' }, String(msg));
  box.append(t);
  setTimeout(() => t.remove(), 3200);
}

// Object URLs for image previews are tracked so locking the app can revoke them all.
const urls = new Set();
export function trackUrl(blob) {
  const u = URL.createObjectURL(blob);
  urls.add(u);
  return u;
}
export function revokeUrls() {
  for (const u of urls) URL.revokeObjectURL(u);
  urls.clear();
}

const stack = [];
export function openSheet(title, build, { onClose } = {}) {
  const body = h('div', { class: 'sheet-b' });
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    const i = stack.indexOf(close);
    if (i >= 0) stack.splice(i, 1);
    layer.classList.remove('open');
    setTimeout(() => layer.remove(), 220);
    onClose?.();
  }
  const layer = h('div', { class: 'layer' },
    h('div', { class: 'scrim', onClick: close }),
    h('section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header', { class: 'sheet-h' },
        h('h2', {}, title),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onClick: close }, icon('x'))),
      body));
  document.body.append(layer);
  requestAnimationFrame(() => layer.classList.add('open'));
  stack.push(close);
  append(body, [build(close)]);
  return close;
}
export const closeTopSheet = () => {
  const c = stack.at(-1);
  if (!c) return false;
  c();
  return true;
};
export const closeAllSheets = () => { while (stack.length) stack.at(-1)(); };

export function confirmSheet({ title, message, ok = 'Confirm', danger = false }) {
  return new Promise(res => {
    let done = false;
    const fin = v => { if (!done) { done = true; res(v); } };
    openSheet(title, close => [
      h('p', { class: 'muted' }, message),
      h('div', { class: 'row end' },
        h('button', { class: 'btn ghost', type: 'button', onClick: () => { fin(false); close(); } }, 'Cancel'),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', onClick: () => { fin(true); close(); } }, ok))
    ], { onClose: () => fin(false) });
  });
}
