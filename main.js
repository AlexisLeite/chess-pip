/* Chess.com Document PiP. Runs in the page's world; no remote code or game API. */
(() => {
  'use strict';
  const KEY = '__chessFloatingBoardV1';
  if (window[KEY]) return;
  const sourceDocument = document;
  let session = null;
  let opening = false;
  const host = document.createElement('div');
  host.id = 'chess-floating-board-extension';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>
    :host { all: initial; position: fixed; right: 20px; bottom: 20px;
      z-index: 2147483647; font: 14px/1.4 system-ui, sans-serif; }
    button { border: 1px solid #b0ce8b; border-radius: 9px; padding: 11px 16px;
      background: #466d2c; color: #fff; font: 600 14px system-ui; cursor: pointer;
      box-shadow: 0 3px 16px #0006; }
    button:hover { background: #588536; } button:disabled { opacity: .6; cursor: wait; }
    button:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
    p { max-width: 290px; background: #252621; color: #fff; padding: 12px;
      border-radius: 8px; box-shadow: 0 3px 16px #0006; margin: 0 0 8px; }
    p:empty { display: none; }
  </style><p role="status" aria-live="polite"></p><button type="button"></button>`;
  const button = shadow.querySelector('button');
  const message = shadow.querySelector('p');
  let messageTimer;

  function notify(text) {
    message.textContent = text;
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => { message.textContent = ''; }, 9000);
  }

  function findBoard() {
    return Array.from(document.querySelectorAll('wc-chess-board, chess-board'))
      .find(board => board.getBoundingClientRect().width > 100);
  }

  function updateButton() {
    button.disabled = opening;
    button.textContent = session ? '♟ Devolver tablero a la página' : '♟ Abrir tablero flotante';
    host.hidden = !session && !findBoard();
  }

  function copyVariables(from, to) {
    const computed = window.getComputedStyle(from);
    for (const name of computed) {
      if (name.startsWith('--')) to.style.setProperty(name, computed.getPropertyValue(name));
    }
  }

  function copyTheme(pipDocument) {
    pipDocument.documentElement.className = document.documentElement.className;
    pipDocument.body.className = document.body.className;
    pipDocument.documentElement.lang = document.documentElement.lang || 'en';
    copyVariables(document.documentElement, pipDocument.documentElement);
    copyVariables(document.body, pipDocument.body);
  }

  function mirrorStyles(current) {
    const target = current.window.document;
    const fragment = target.createDocumentFragment();
    for (const sheet of document.styleSheets) {
      let element;
      try {
        element = target.createElement('style');
        element.textContent = Array.from(sheet.cssRules, rule => rule.cssText).join('\n');
        // Preserve relative URLs in stylesheets by keeping external sheets linked.
        if (sheet.href) {
          element = target.createElement('link');
          element.rel = 'stylesheet';
          element.href = sheet.href;
        }
      } catch {
        if (!sheet.href) continue;
        element = target.createElement('link');
        element.rel = 'stylesheet';
        element.href = sheet.href;
      }
      element.media = sheet.media.mediaText;
      element.disabled = sheet.disabled;
      fragment.append(element);
    }
    for (const sheet of document.adoptedStyleSheets || []) {
      const element = target.createElement('style');
      element.textContent = Array.from(sheet.cssRules, rule => rule.cssText).join('\n');
      fragment.append(element);
    }
    for (const element of current.styles) element.remove();
    current.styles = Array.from(fragment.childNodes);
    target.head.insertBefore(fragment, current.override);
  }

  function resizeBoard(current) {
    if (session !== current) return;
    const pip = current.window;
    const size = Math.max(1, Math.floor(Math.min(pip.innerWidth,
      pip.innerHeight - (current.clockHeight || 0))));
    pip.document.documentElement.style.setProperty('--floating-board-size', `${size}px`);
  }

  function signalResize(current) {
    resizeBoard(current);
    // Chess.com's existing handlers belong to the source window, even in PiP.
    window.dispatchEvent(new Event('resize'));
  }

  function bridgeInput(current) {
    const pip = current.window;
    const mouseEvents = ['mousemove', 'mouseup'];
    const pointerEvents = ['pointermove', 'pointerup', 'pointercancel'];
    const keyboardEvents = ['keydown', 'keyup'];
    const types = [...mouseEvents, ...pointerEvents, ...keyboardEvents];
    const forward = event => {
      // Down/click stay on the real board. Only continue document-level gestures
      // and keyboard handlers registered by Chess.com in the original document.
      const Constructor = pointerEvents.includes(event.type) ? window.PointerEvent
        : keyboardEvents.includes(event.type) ? window.KeyboardEvent : window.MouseEvent;
      const fields = ['clientX', 'clientY', 'screenX', 'screenY', 'button', 'buttons',
        'ctrlKey', 'altKey', 'shiftKey', 'metaKey', 'movementX', 'movementY',
        'pointerId', 'pointerType', 'isPrimary', 'width', 'height', 'pressure',
        'key', 'code', 'repeat', 'location'];
      const init = { bubbles: true, cancelable: true };
      for (const name of fields) if (name in event) init[name] = event[name];
      const forwarded = new Constructor(event.type, init);
      if (!sourceDocument.dispatchEvent(forwarded)) event.preventDefault();
    };
    for (const type of types) pip.document.addEventListener(type, forward);
    current.cleanups.push(() => {
      for (const type of types) pip.document.removeEventListener(type, forward);
    });
  }

  function restore(current) {
    if (current.restored) return;
    current.restored = true;
    for (const cleanup of current.cleanups.splice(0)) cleanup();
    if (current.marker.isConnected) current.marker.replaceWith(current.root);
    else if (current.parent.isConnected && !findBoard()) current.parent.append(current.root);
    else current.root.remove();
    current.placeholder?.remove();
    current.root.removeAttribute('data-floating-chess-root');
    if (session === current) session = null;
    updateButton();
    window.dispatchEvent(new Event('resize'));
  }

  function closeSession() {
    if (!session) return;
    const current = session;
    // Restore synchronously before closing so reopening cannot race pagehide.
    restore(current);
    if (!current.window.closed) current.window.close();
  }

  function createPlaceholder(current) {
    const placeholder = document.createElement('div');
    placeholder.style.cssText = 'padding:28px;min-height:180px;display:grid;place-content:center;'
      + 'gap:16px;text-align:center;background:#262822;color:#fff;border-radius:12px';
    const text = document.createElement('p');
    text.textContent = 'Tu tablero está en la ventana flotante.';
    const back = document.createElement('button');
    back.textContent = 'Devolver tablero';
    back.style.cssText = 'padding:12px;cursor:pointer;background:#81b64c;color:#fff;border:0;border-radius:6px';
    back.addEventListener('click', closeSession);
    placeholder.append(text, back);
    current.marker.after(placeholder);
    current.placeholder = placeholder;
  }

  function confirmationButton(action = 'confirm') {
    const group = sourceDocument.querySelector('.confirm-move-buttons');
    if (!group) return null;
    const glyph = action === 'confirm' ? 'mark-check' : 'mark-cross';
    const label = action === 'confirm' ? 'Submit Move' : 'Cancel Move';
    const control = group.querySelector(`svg[data-glyph="${glyph}"]`)?.closest('button')
      || group.querySelector(`button[aria-label="${label}"]`);
    if (!control || !control.isConnected || !control.getClientRects().length) return null;
    for (let element = control; element; element = element.parentElement) {
      const style = window.getComputedStyle(element);
      if (element.hidden || style.display === 'none' || style.visibility === 'hidden') return null;
    }
    return control;
  }

  function syncConfirmation(current, stage) {
    let group = stage.querySelector('#floating-move-actions');
    for (const action of ['cancel', 'confirm']) {
      const source = confirmationButton(action);
      let overlay = group?.querySelector(`#floating-${action}-move`);
      if (!source) { overlay?.remove(); continue; }
      if (!group) {
        group = current.window.document.createElement('div');
        group.id = 'floating-move-actions';
        stage.append(group);
      }
      if (!overlay) {
        overlay = current.window.document.createElement('button');
        overlay.id = `floating-${action}-move`;
        overlay.type = 'button';
        overlay.textContent = action === 'confirm' ? '✓' : '✕';
        const label = action === 'confirm' ? 'Confirmar jugada' : 'Cancelar jugada';
        overlay.setAttribute('aria-label', label);
        overlay.title = label;
        overlay.addEventListener('click', event => {
          event.stopPropagation();
          if (session !== current || overlay.disabled || stage.inert) return;
          if (current.url !== location.href || !current.marker.isConnected || findBoard()) {
            followBoard(current, stage);
            syncConfirmation(current, stage);
            return;
          }
          // Resolve the live control again, never a control from a prior game.
          const original = confirmationButton(action);
          if (original && !controlDisabled(original)) original.click();
          syncConfirmation(current, stage);
        });
        group.append(overlay);
      }
      overlay.disabled = controlDisabled(source);
    }
    if (group && !group.childElementCount) group.remove();
  }

  function controlDisabled(control) {
    return control.disabled || control.getAttribute('aria-disabled') === 'true'
      || control.getAttribute('data-disabled') === 'true'
      || control.getAttribute('data-loading') === 'true';
  }

  function syncClocks(current, stage) {
    const profile = sourceDocument.querySelector('#sidebar-main-menu a[href*="/member/"]');
    const username = profile?.getAttribute('href')?.split('/member/')[1]?.split(/[/?#]/)[0]?.toLowerCase();
    const rows = Array.from(sourceDocument.querySelectorAll(
      '#board-layout-player-top, #board-layout-player-bottom'));
    const mine = username && rows.find(row => row.querySelector(
      '[data-user-block-part="username"], [data-test-element="user-tagline-username"]')
      ?.textContent.trim().toLowerCase() === username);
    const other = mine && rows.find(row => row !== mine);
    const clockText = row => row?.querySelector(
      '.clock-time-text, .clock-time-monospace, [role="timer"]')?.textContent.replace(/\s+/g, ' ').trim();
    const myTime = clockText(mine);
    const otherTime = clockText(other);
    const opponentName = other?.querySelector(
      '[data-user-block-part="username"], [data-test-element="user-tagline-username"]')?.textContent.trim();
    const opponentRating = other?.querySelector('[data-user-block-part="rating"]')
      ?.textContent.replace(/[()\s]/g, '');
    const opponent = opponentName
      ? `${opponentName}${opponentRating ? ` (${opponentRating})` : ''}` : '';
    const times = myTime || otherTime ? `${myTime || '—'} - ${otherTime || '—'}` : '';
    const height = times || opponent ? 18 : 0;
    if (current.clockHeight !== height) {
      current.clockHeight = height;
      current.window.document.documentElement.style.setProperty('--floating-clock-height', `${height}px`);
      resizeBoard(current);
    }
    let overlay = stage.querySelector('#floating-times');
    if (!height) { overlay?.remove(); return; }
    if (!overlay) {
      overlay = current.window.document.createElement('div');
      overlay.id = 'floating-times';
      stage.append(overlay);
    }
    const text = [times, opponent].filter(Boolean).join(' · ');
    if (overlay.textContent !== text) overlay.textContent = text;
    overlay.title = text;
  }

  function watchOverlays(current, stage) {
    const sync = () => {
      if (session !== current) return;
      followBoard(current, stage);
      syncConfirmation(current, stage);
      syncClocks(current, stage);
    };
    sync();
    const timer = setInterval(sync, 250);
    current.cleanups.push(() => clearInterval(timer));
  }

  function followBoard(current, stage) {
    const next = findBoard();
    if (next && (next !== current.root || next.parentNode !== stage)) {
      // The site's SPA created a new board. Retire the old one instead of
      // returning it next to the new board, where duplicate IDs would interfere.
      current.marker.remove();
      current.placeholder?.remove();
      current.root.removeAttribute('data-floating-chess-root');
      if (current.root !== next) current.root.remove();
      const marker = sourceDocument.createComment('Chess PiP: posición original');
      next.before(marker);
      current.root = next;
      current.marker = marker;
      current.parent = next.parentNode;
      createPlaceholder(current);
      stage.style.cssText = '';
      copyVariables(next, stage);
      next.setAttribute('data-floating-chess-root', '');
      stage.append(next);
      signalResize(current);
    }
    // During asynchronous rendering, hide and disable the retired game rather
    // than accepting moves on it. A subsequent tick attaches the next board.
    stage.inert = !current.marker.isConnected;
    stage.style.visibility = stage.inert ? 'hidden' : '';
    if (current.url !== location.href) {
      current.url = location.href;
      current.window.document.querySelector('base').href = sourceDocument.baseURI;
      copyTheme(current.window.document);
      mirrorStyles(current);
    }
  }

  function setupWindow(current) {
    const pip = current.window;
    const target = pip.document;
    target.title = 'Chess.com · Tablero flotante';
    const base = target.createElement('base');
    base.href = document.baseURI;
    target.head.append(base);
    copyTheme(target);
    const style = target.createElement('style');
    style.textContent = `
      html, body { margin:0!important; padding:0!important; min-width:0!important;
        width:100%!important; height:100%!important; display:block!important;
        overflow:hidden!important; background:#000!important; }
      body { display:flex!important; align-items:center; justify-content:center; }
      #floating-stage { position:relative; display:flex; flex-direction:column;
        align-items:center; justify-content:flex-start; width:var(--floating-board-size);
        height:calc(var(--floating-board-size) + var(--floating-clock-height, 0px)); margin:0; padding:0; }
      #floating-move-actions { position:absolute; z-index:1000; right:0;
        bottom:var(--floating-clock-height, 0px); display:flex; gap:2px;
        height:calc(var(--floating-board-size) / 16); }
      #floating-move-actions button { display:grid; place-items:center; box-sizing:border-box;
        width:calc(var(--floating-board-size) / 16); height:100%; min-width:0; min-height:0;
        margin:0; padding:0; border:0; border-radius:2px; background:#181818b3;
        color:#ddd; cursor:pointer; font:400 calc(var(--floating-board-size) / 32)/1 system-ui;
        box-shadow:none; }
      #floating-confirm-move { color:#b3d48e!important; }
      #floating-move-actions button:hover { background:#181818ed; }
      #floating-move-actions button:disabled { opacity:.55; cursor:wait; }
      #floating-move-actions button:focus-visible { outline:2px solid #fff; outline-offset:2px; }
      #floating-times { display:block;
        flex:none; box-sizing:border-box; width:100%; height:var(--floating-clock-height); margin:0; padding:0 6px;
        background:#000; color:#fff; opacity:1; font:400 10px/18px system-ui;
        font-variant-numeric:tabular-nums; text-align:center; white-space:nowrap; overflow:hidden;
        text-overflow:ellipsis;
        pointer-events:none; user-select:none; }
      [data-floating-chess-root] { display:block!important;
        position:relative!important; width:var(--floating-board-size)!important;
        height:var(--floating-board-size)!important; margin:0!important;
        min-width:0!important; max-width:none!important; min-height:0!important;
        max-height:none!important; padding:0!important; grid-area:auto!important;
        flex:none!important; touch-action:none; }
    `;
    current.override = style;
    target.head.append(style);
    mirrorStyles(current);
    const stage = target.createElement('div');
    stage.id = 'floating-stage';
    copyVariables(current.root, stage);
    target.body.append(stage);
    current.root.setAttribute('data-floating-chess-root', '');
    stage.append(current.root);
    bridgeInput(current);
    watchOverlays(current, stage);
    const resized = () => signalResize(current);
    pip.addEventListener('resize', resized);
    const hidden = () => restore(current);
    pip.addEventListener('pagehide', hidden, { once: true });
    current.cleanups.push(() => {
      pip.removeEventListener('resize', resized);
      pip.removeEventListener('pagehide', hidden);
    });
    let pending;
    const stylesChanged = new MutationObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(() => {
        if (session !== current) return;
        try { mirrorStyles(current); } catch (error) { console.warn('[Chess PiP] Styles', error); }
      }, 120);
    });
    stylesChanged.observe(document.head, { subtree: true, childList: true, characterData: true });
    current.cleanups.push(() => { stylesChanged.disconnect(); clearTimeout(pending); });
    signalResize(current);
  }

  async function openBoard() {
    if (opening) return;
    if (session) { closeSession(); return; }
    if (!window.documentPictureInPicture) {
      notify('Necesitas una versión reciente de Chrome de escritorio con Document PiP.');
      return;
    }
    const board = findBoard();
    if (!board) { notify('Abre primero una partida con un tablero visible.'); return; }
    const root = board;
    opening = true;
    updateButton();
    let current;
    try {
      // Must run directly inside the trusted page-button click's user activation.
      const pip = await window.documentPictureInPicture.requestWindow({ width: 480, height: 480 });
      if (!root.isConnected || !root.contains(board)) {
        pip.close();
        throw new Error('La página cambió mientras se abría la ventana. Vuelve a intentarlo.');
      }
      const marker = document.createComment('Chess PiP: posición original');
      current = { window: pip, root, marker, parent: root.parentNode,
        cleanups: [], styles: [], restored: false, url: location.href };
      root.before(marker);
      session = current;
      createPlaceholder(current);
      setupWindow(current);
    } catch (error) {
      if (current) {
        restore(current);
        if (!current.window.closed) current.window.close();
      }
      console.warn('[Chess PiP]', error);
      notify(`No se pudo abrir el tablero flotante. ${error.message || 'Inténtalo de nuevo.'}`);
    } finally {
      opening = false;
      updateButton();
    }
  }

  button.addEventListener('click', openBoard);
  document.body.append(host);
  const refresh = setInterval(() => {
    // Chess.com navigates between game screens without reloading its document.
    if (!host.isConnected) document.body.append(host);
    updateButton();
  }, 800);
  window.addEventListener('pagehide', () => {
    closeSession();
    clearInterval(refresh);
    clearTimeout(messageTimer);
  }, { once: true });
  window[KEY] = { close: closeSession };
  updateButton();
})();
