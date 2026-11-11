const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { parseHTML, Event } = require('linkedom');
const source = readFileSync(join(__dirname, '..', 'daily-flow.js'), 'utf8');

function fixture(url = 'https://www.chess.com/game/daily/1') {
  const owner = parseHTML('<html><body><main></main></body></html>').document;
  let doc = owner;
  let time = 0;
  let waiting = false;
  let text;
  let loadedDoc;
  const window = {};
  runInNewContext(source, { window, URL, Date });
  const flow = window.__chessDailyFlowFactory({
    ownerDocument: owner, getDocument: () => doc, getUrl: () => url,
    now: () => time,
    onDocument: next => { doc = next; url = next.location.href; },
    onWaiting: (value, message) => { waiting = value; text = message; },
  });
  const root = owner.createElement('wc-chess-board');
  root.innerHTML = '<div class="piece wp"></div>';
  const marker = owner.createComment('position');
  owner.querySelector('main').append(marker);
  const current = { root, marker };
  const frame = () => owner.querySelector('iframe');
  const load = (href, html = '') => {
    loadedDoc = parseHTML(`<html><head></head><body>${html}</body></html>`).document;
    Object.defineProperty(loadedDoc, 'location', { value: { href } });
    Object.defineProperty(frame(), 'contentDocument', { configurable: true, get: () => loadedDoc });
    frame().dispatchEvent(new Event('load'));
    return loadedDoc;
  };
  return { flow, owner, current, frame, load, tick: () => flow.tick(current),
    setTime: value => { time = value; }, setUrl: value => { url = value; },
    waiting: () => waiting, text: () => text };
}

function card(id, classes = '', timer = '') {
  return `<a class="daily-game-tile-component" href="/game/daily/${id}">
    <div class="daily-game-tile-game-preview ${classes}"></div>
    <div class="daily-game-tile-time-remaining"><span class="${timer}">1 day</span></div></a>`;
}

function exhaust(f) {
  f.tick();
  f.current.marker.remove();
  f.tick();
  f.setTime(5000);
  f.tick();
}

test('empty daily board waits five seconds, then opens home without replacing the owner', () => {
  const f = fixture();
  f.tick();
  assert.equal(f.frame(), null);
  f.current.marker.remove();
  f.tick();
  f.setTime(4999);
  f.tick();
  assert.equal(f.frame(), null);
  f.setTime(5000);
  f.tick();
  assert.equal(f.waiting(), true);
  assert.equal(f.text(), 'Aguardando próximo movimiento');
  assert.equal(f.frame().src, 'https://www.chess.com/home');
  assert.ok(f.owner.querySelector('main'));
  assert.equal(f.frame().hasAttribute('sandbox'), true);
});

test('async board recovery cancels the grace period; empty reused boards also trigger waiting', () => {
  const f = fixture();
  f.current.root.replaceChildren();
  f.tick();
  f.setTime(4999);
  f.current.root.innerHTML = '<div class="piece"></div>';
  f.tick();
  f.setTime(10000);
  f.tick();
  assert.equal(f.frame(), null);
  f.current.root.replaceChildren();
  f.tick();
  f.setTime(15000);
  f.tick();
  assert.ok(f.frame());
});

test('home skips opponent turns, polls every thirty seconds and resumes a ready daily game', () => {
  const f = fixture();
  exhaust(f);
  f.load('https://www.chess.com/home', card(2, 'daily-game-tile-overlay') + card(3, 'daily-game-tile-overlay', 'time-remaining-subtle'));
  f.tick();
  assert.equal(f.frame().src, 'https://www.chess.com/home');
  f.setTime(34999);
  f.tick();
  // Changing src lets us distinguish a refresh from an idle tick in this DOM mock.
  f.frame().src = 'unchanged';
  f.tick();
  assert.equal(f.frame().src, 'unchanged');
  f.setTime(35000);
  f.tick();
  assert.equal(f.frame().src, 'https://www.chess.com/home');
  f.load('https://www.chess.com/home', card(2, 'daily-game-tile-overlay') + card(4, '', 'time-remaining-subtle'));
  f.tick();
  assert.equal(f.frame().src, 'https://www.chess.com/game/daily/4');
  const game = f.load('https://www.chess.com/game/daily/4', '<main></main>');
  f.current.marker = game.createComment('new board');
  game.querySelector('main').append(f.current.marker);
  f.tick();
  assert.equal(f.waiting(), false);
});

test('home live updates are noticed immediately and external game links are rejected', () => {
  const f = fixture();
  exhaust(f);
  const home = f.load('https://www.chess.com/home', card(2).replace('/game/daily/2', 'https://other.example/game/daily/2'));
  f.tick();
  assert.equal(f.frame().src, 'https://www.chess.com/home');
  home.body.insertAdjacentHTML('beforeend', card(8));
  f.tick();
  assert.equal(f.frame().src, 'https://www.chess.com/game/daily/8');
});

test('automatic SPA return to home still starts a refreshable home frame', () => {
  const f = fixture();
  f.tick();
  f.setUrl('https://www.chess.com/home');
  f.tick();
  assert.equal(f.frame().src, 'https://www.chess.com/home');
});

test('blocked frame or a timed out load gives a visible error instead of looping', () => {
  const f = fixture();
  exhaust(f);
  f.load('about:blank');
  assert.match(f.text(), /No se pudo cargar/);
  f.setTime(100000);
  f.tick();
  assert.match(f.text(), /No se pudo cargar/);
  const g = fixture();
  exhaust(g);
  g.setTime(35001);
  g.tick();
  assert.match(g.text(), /No se pudo cargar/);
});

test('computer games never enter the daily loop and destroyed flows cannot navigate', () => {
  const f = fixture('https://www.chess.com/play/computer');
  f.current.marker.remove();
  f.tick();
  f.setTime(60000);
  f.tick();
  assert.equal(f.frame(), null);
  const g = fixture();
  g.flow.destroy();
  exhaust(g);
  assert.equal(g.frame(), null);
});
