const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { parseHTML, EventTarget, Event } = require('linkedom');
const source = readFileSync(join(__dirname, '..', 'daily-flow.js'), 'utf8')
  + '\n' + readFileSync(join(__dirname, '..', 'main.js'), 'utf8');

function fixture({ reject = false, setupError = false, unsupported = false } = {}) {
  const { document } = parseHTML(`<!doctype html><html><head></head><body>
    <div id="board-layout-main"><div id="board-layout-player-top"></div>
    <div id="board-layout-chessboard"><wc-chess-board></wc-chess-board></div>
    <div id="board-layout-player-bottom"></div></div></body></html>`);
  // Linkedom's defaultView proxies Node globals; use separate event targets so
  // extension sentinels and API stubs cannot leak from one fixture to another.
  const window = Object.assign(new EventTarget(), {
    document, Event, MutationObserver: document.defaultView.MutationObserver,
  });
  const pip = Object.assign(new EventTarget(), {
    document: parseHTML('<!doctype html><html><head></head><body></body></html>').document,
    Event,
  });
  const board = document.querySelector('wc-chess-board');
  const root = board;
  const parent = board.parentNode;
  board.getBoundingClientRect = () => ({ width: 536, height: 536 });
  Object.defineProperty(document, 'styleSheets', { value: [] });
  const computed = Object.assign([], { getPropertyValue: () => '' });
  window.getComputedStyle = () => computed;
  window.focus = () => {};
  pip.innerWidth = 480;
  pip.innerHeight = 620;
  pip.closed = false;
  pip.close = () => { pip.closed = true; pip.dispatchEvent(new pip.Event('pagehide')); };
  let requests = 0;
  if (!unsupported) window.documentPictureInPicture = { requestWindow: async () => {
    requests++;
    if (reject) throw new Error('PiP denied');
    return pip;
  } };
  if (setupError) pip.document.createElement = () => { throw new Error('Style setup failed'); };
  const timers = new Map();
  let timerId = 0;
  let now = 0;
  const location = { href: 'https://www.chess.com/play/computer' };
  const context = {
    window, document, location, Event: window.Event, URL, Date: { now: () => now },
    MutationObserver: window.MutationObserver,
    console: { warn() {} },
    setInterval: fn => { timers.set(++timerId, fn); return timerId; },
    clearInterval: id => timers.delete(id),
    setTimeout: () => ++timerId,
    clearTimeout() {},
  };
  runInNewContext(source, context);
  const host = document.querySelector('#chess-floating-board-extension');
  const button = host.shadowRoot.querySelector('button');
  const click = async target => {
    target.dispatchEvent(new window.Event('click'));
    await Promise.resolve();
    await Promise.resolve();
  };
  return { document, window, pip, root, board, parent, button, context, location, timers,
    click, requests: () => requests, setTime: value => { now = value; } };
}

test('moves the same board and restores original order when PiP closes', async () => {
  const f = fixture();
  await f.click(f.button);
  assert.equal(f.requests(), 1);
  assert.equal(f.pip.document.querySelector('wc-chess-board'), f.board);
  assert.equal(f.document.querySelector('wc-chess-board'), null);
  assert.equal(f.root.parentNode.id, 'floating-stage');
  assert.equal(f.pip.document.body.textContent, '');
  assert.equal(f.pip.document.querySelector('button, #board-layout-player-top, #board-layout-player-bottom'), null);
  assert.ok(f.document.querySelector('#board-layout-player-top'));
  assert.ok(f.document.querySelector('#board-layout-player-bottom'));
  assert.equal(f.pip.document.documentElement.style.getPropertyValue('--floating-board-size'), '480px');
  f.pip.close();
  assert.equal(f.parent.firstElementChild, f.root);
  assert.equal(f.parent.children.length, 1);
  assert.equal(f.root.hasAttribute('data-floating-chess-root'), false);
  assert.equal(f.button.textContent, '♟ Abrir tablero flotante');
  assert.equal(f.document.body.children.length, 2);
});

test('return button restores immediately and allows opening PiP again', async () => {
  const f = fixture();
  await f.click(f.button);
  await f.click(f.button);
  assert.equal(f.parent.firstElementChild, f.root);
  assert.equal(f.pip.closed, true);
  f.pip.closed = false;
  await f.click(f.button);
  assert.equal(f.requests(), 2);
  assert.equal(f.pip.document.querySelector('wc-chess-board'), f.board);
});

test('rejection leaves original board intact and displays a recoverable error', async () => {
  const f = fixture({ reject: true });
  await f.click(f.button);
  assert.equal(f.parent.firstElementChild, f.root);
  assert.match(f.button.parentNode.querySelector('p').textContent, /PiP denied/);
  assert.equal(f.button.disabled, false);
});

test('failure during setup rolls back marker, placeholder and window', async () => {
  const f = fixture({ setupError: true });
  await f.click(f.button);
  assert.equal(f.parent.firstElementChild, f.root);
  assert.equal(f.parent.children.length, 1);
  assert.equal(f.document.body.children.length, 2);
  assert.equal(f.pip.closed, true);
  assert.match(f.button.parentNode.querySelector('p').textContent, /Style setup failed/);
});

test('SPA URL change keeps the same live board in the existing PiP window', async () => {
  const f = fixture();
  await f.click(f.button);
  f.location.href = 'https://www.chess.com/game/computer/123';
  for (const callback of f.timers.values()) callback();
  assert.equal(f.pip.document.querySelector('wc-chess-board'), f.root);
  assert.equal(f.pip.closed, false);
  assert.equal(f.requests(), 1);
});

test('duplicate installation does not add extra buttons or timers', () => {
  const f = fixture();
  runInNewContext(source, f.context);
  assert.equal(f.document.querySelectorAll('#chess-floating-board-extension').length, 1);
  assert.equal(f.timers.size, 1);
});

test('unsupported Chrome reports the problem without changing the board', async () => {
  const f = fixture({ unsupported: true });
  await f.click(f.button);
  assert.equal(f.parent.firstElementChild, f.root);
  assert.match(f.button.parentNode.querySelector('p').textContent, /Chrome/);
});

test('confirmation floats only for a pending move and activates the original button', async () => {
  const f = fixture();
  const group = f.document.createElement('div');
  group.className = 'confirm-move-buttons';
  group.innerHTML = '<button aria-label="Submit Move" data-disabled="true"></button>';
  f.document.body.append(group);
  const original = group.querySelector('button');
  original.getClientRects = () => [{}];
  let submitted = 0;
  original.addEventListener('click', () => { submitted++; group.remove(); });
  await f.click(f.button);
  const overlay = f.pip.document.querySelector('#floating-confirm-move');
  assert.ok(overlay);
  assert.equal(overlay.textContent, '✓');
  assert.equal(overlay.getAttribute('aria-label'), 'Confirmar jugada');
  assert.equal(overlay.disabled, true);
  await f.click(overlay);
  assert.equal(submitted, 0);
  original.setAttribute('data-disabled', 'false');
  for (const callback of Array.from(f.timers.values())) callback();
  assert.equal(overlay.disabled, false);
  await f.click(overlay);
  assert.equal(submitted, 1);
  assert.equal(f.pip.document.querySelector('#floating-confirm-move'), null);
  f.pip.close();
  assert.equal(f.timers.size, 1);
});

test('hidden or removed confirmation cannot submit a stale move', async () => {
  const f = fixture();
  const group = f.document.createElement('div');
  group.className = 'confirm-move-buttons';
  group.innerHTML = '<button aria-label="Submit Move"></button>';
  f.document.body.append(group);
  const original = group.querySelector('button');
  original.getClientRects = () => [{}];
  let submitted = 0;
  original.addEventListener('click', () => submitted++);
  await f.click(f.button);
  const overlay = f.pip.document.querySelector('#floating-confirm-move');
  original.hidden = true;
  await f.click(overlay);
  assert.equal(submitted, 0);
  assert.equal(f.pip.document.querySelector('#floating-confirm-move'), null);
});

test('clock labels follow my username when players change sides and update from the page', async () => {
  const f = fixture();
  const sidebar = f.document.createElement('div');
  sidebar.id = 'sidebar-main-menu';
  sidebar.innerHTML = '<a href="https://www.chess.com/member/alexisuy">AlexisUy</a>';
  f.document.body.append(sidebar);
  const top = f.document.querySelector('#board-layout-player-top');
  const bottom = f.document.querySelector('#board-layout-player-bottom');
  top.innerHTML = '<span data-user-block-part="username">AlexisUy</span><span role="timer">22 hrs</span>';
  bottom.innerHTML = '<span data-user-block-part="username">Opponent</span><span data-user-block-part="rating"> (936) </span><span role="timer">1 day</span>';
  await f.click(f.button);
  const clocks = f.pip.document.querySelector('#floating-times');
  assert.equal(clocks.textContent, '22 hrs - 1 day · Opponent (936)');
  assert.equal(f.board.nextElementSibling, clocks);
  f.pip.innerHeight = 480;
  f.pip.dispatchEvent(new Event('resize'));
  assert.equal(f.pip.document.documentElement.style.getPropertyValue('--floating-board-size'), '462px');
  assert.equal(f.pip.document.documentElement.style.getPropertyValue('--floating-clock-height'), '18px');
  const myContents = top.innerHTML;
  top.innerHTML = bottom.innerHTML;
  bottom.innerHTML = myContents;
  bottom.querySelector('[role="timer"]').textContent = '21 hrs';
  for (const callback of Array.from(f.timers.values())) callback();
  assert.equal(clocks.textContent, '21 hrs - 1 day · Opponent (936)');
  top.querySelector('[data-user-block-part="username"]').textContent = 'NewOpponent';
  top.querySelector('[data-user-block-part="rating"]').textContent = '(1200)';
  for (const callback of Array.from(f.timers.values())) callback();
  assert.equal(clocks.textContent, '21 hrs - 1 day · NewOpponent (1200)');
});

test('cancel overlay activates only cancellation and removes both pending-move actions', async () => {
  const f = fixture();
  const group = f.document.createElement('div');
  group.className = 'confirm-move-buttons';
  group.innerHTML = '<button aria-label="Cancel Move"></button><button aria-label="Submit Move"></button>';
  f.document.body.append(group);
  let cancelled = 0;
  let submitted = 0;
  for (const control of group.children) control.getClientRects = () => [{}];
  group.firstElementChild.addEventListener('click', () => { cancelled++; group.remove(); });
  group.lastElementChild.addEventListener('click', () => submitted++);
  await f.click(f.button);
  const cancel = f.pip.document.querySelector('#floating-cancel-move');
  assert.equal(cancel.textContent, '✕');
  assert.equal(cancel.getAttribute('aria-label'), 'Cancelar jugada');
  await f.click(cancel);
  assert.equal(cancelled, 1);
  assert.equal(submitted, 0);
  assert.equal(f.pip.document.querySelector('#floating-move-actions'), null);
});

test('daily navigation transfers a new board and closing restores only the current game', async () => {
  const f = fixture();
  await f.click(f.button);
  const replacement = f.document.createElement('wc-chess-board');
  replacement.id = 'next-daily-game';
  replacement.getBoundingClientRect = () => ({ width: 536, height: 536 });
  f.parent.replaceChildren(replacement);
  f.location.href = 'https://www.chess.com/game/daily/1061368774';
  for (const callback of Array.from(f.timers.values())) callback();
  assert.equal(f.pip.document.querySelector('wc-chess-board'), replacement);
  assert.equal(f.root.isConnected, false);
  assert.equal(f.pip.closed, false);
  assert.equal(f.requests(), 1);
  f.pip.close();
  assert.equal(f.parent.firstElementChild, replacement);
  assert.equal(f.document.querySelectorAll('wc-chess-board').length, 1);
});

test('asynchronous board replacement disables the old game until the next board arrives', async () => {
  const f = fixture();
  await f.click(f.button);
  f.parent.replaceChildren();
  f.location.href = 'https://www.chess.com/game/daily/1061368774';
  for (const callback of Array.from(f.timers.values())) callback();
  const stage = f.pip.document.querySelector('#floating-stage');
  assert.equal(stage.inert, true);
  assert.equal(stage.style.visibility, 'hidden');
  const replacement = f.document.createElement('wc-chess-board');
  replacement.getBoundingClientRect = () => ({ width: 536, height: 536 });
  f.parent.append(replacement);
  for (const callback of Array.from(f.timers.values())) callback();
  assert.equal(stage.inert, false);
  assert.equal(stage.style.visibility, '');
  assert.equal(f.pip.document.querySelector('wc-chess-board'), replacement);
});

test('closing during navigation does not resurrect a retired board in the new page', async () => {
  const f = fixture();
  await f.click(f.button);
  f.parent.remove();
  f.pip.close();
  assert.equal(f.document.querySelector('wc-chess-board'), null);
  assert.equal(f.root.isConnected, false);
});

test('daily exhaustion preserves PiP, waits at home, adopts the next frame board and stops on close', async () => {
  const f = fixture();
  f.location.href = 'https://www.chess.com/game/daily/1';
  f.root.innerHTML = '<div class="piece"></div>';
  const tick = () => { for (const callback of Array.from(f.timers.values())) callback(); };
  await f.click(f.button);
  f.parent.replaceChildren();
  tick();
  f.setTime(5000);
  tick();
  const frame = f.document.querySelector('#chess-daily-flow-frame');
  assert.ok(frame);
  assert.equal(f.pip.document.querySelector('[role="status"]').textContent, 'Aguardando próximo movimiento');
  assert.equal(f.requests(), 1);
  assert.equal(f.pip.closed, false);
  const load = (url, html) => {
    const doc = parseHTML(`<html><head></head><body>${html}</body></html>`).document;
    const view = Object.assign(new EventTarget(), { Event, getComputedStyle: f.window.getComputedStyle });
    Object.defineProperties(doc, {
      location: { value: { href: url } },
      defaultView: { value: view },
      styleSheets: { value: [] },
    });
    Object.defineProperty(frame, 'contentDocument', { configurable: true, value: doc });
    frame.dispatchEvent(new Event('load'));
    return doc;
  };
  const home = load('https://www.chess.com/home', '<main></main>');
  tick();
  assert.equal(f.pip.document.querySelector('#floating-stage').style.visibility, 'hidden');
  home.body.insertAdjacentHTML('beforeend', `<a class="daily-game-tile-component" href="/game/daily/2">
    <div class="daily-game-tile-game-preview"></div><div class="daily-game-tile-time-remaining">1 day</div></a>`);
  tick();
  assert.equal(frame.src, 'https://www.chess.com/game/daily/2');
  const game = load('https://www.chess.com/game/daily/2', '<main><wc-chess-board><div class="piece"></div></wc-chess-board></main>');
  const next = game.querySelector('wc-chess-board');
  next.getBoundingClientRect = () => ({ width: 536, height: 536 });
  tick();
  assert.equal(f.pip.document.querySelector('wc-chess-board'), next);
  assert.equal(f.pip.document.querySelector('[role="status"]'), null);
  assert.equal(f.pip.document.querySelector('#floating-stage').style.visibility, '');
  assert.equal(f.requests(), 1);
  f.pip.close();
  assert.equal(game.querySelector('wc-chess-board'), next);
  assert.equal(f.document.querySelector('wc-chess-board'), null);
  frame.src = 'no-more-navigation';
  f.setTime(90000);
  tick();
  assert.equal(frame.src, 'no-more-navigation');
});
