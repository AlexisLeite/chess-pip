/* Keep the PiP opener alive while Chess.com navigates within a same-origin frame. */
(() => {
  'use strict';
  // Creates a daily-game waiting loop whose navigation never unloads the PiP opener.
  window.__chessDailyFlowFactory = function createDailyFlow(options) {
    const { ownerDocument, getDocument, getUrl, onDocument, onWaiting } = options;
    const origin = new URL(getUrl()).origin;
    let frame = null;
    let loading = false;
    let armed = false;
    let emptySince = null;
    let lastRefresh = 0;
    let requestedAt = 0;
    let failed = false;
    let closed = false;
    const now = options.now || (() => Date.now());
    const isDaily = url => /^\/game\/daily\/\d+\/?$/.test(new URL(url, origin).pathname);
    const isHome = url => new URL(url, origin).pathname.replace(/\/$/, '') === '/home';

    function safeDailyUrl(value) {
      try {
        const url = new URL(value, origin);
        return url.origin === origin && isDaily(url.href) ? url.href : null;
      } catch { return null; }
    }

    function nextGame(doc) {
      // Opponent-turn cards shade their preview/avatar with this overlay. The
      // subtle timer class also occurs on my turn, so it cannot identify a turn.
      for (const card of doc.querySelectorAll('a.daily-game-tile-component')) {
        if (!card.querySelector('.daily-game-tile-game-preview')
          || !card.querySelector('.daily-game-tile-time-remaining')
          || card.querySelector('.daily-game-tile-overlay')) continue;
        const url = safeDailyUrl(card.getAttribute('href'));
        if (url) return url;
      }
      return null;
    }

    function loaded() {
      if (closed) return;
      loading = false;
      lastRefresh = now();
      try {
        const doc = frame.contentDocument;
        const url = doc?.location?.href;
        if (!doc?.body || !url || new URL(url).origin !== origin) throw new Error('Frame unavailable');
        onDocument(doc);
        emptySince = null;
        failed = false;
      } catch {
        failed = true;
        onWaiting(true, 'No se pudo cargar Chess.com. Revisa la pestaña original.');
      }
    }

    function navigate(url) {
      if (loading || failed || closed) return;
      if (!frame) {
        frame = ownerDocument.createElement('iframe');
        frame.id = 'chess-daily-flow-frame';
        frame.title = 'Chess.com · Partidas diarias';
        // Allow Chess.com itself to run while preventing an automatic frame
        // navigation from replacing the owner document and closing its PiP.
        frame.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups');
        frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;'
          + 'z-index:2147483645;background:#262522';
        frame.addEventListener('load', loaded);
        ownerDocument.body.append(frame);
      }
      loading = true;
      requestedAt = now();
      frame.src = url;
    }

    function tick(current) {
      const url = getUrl();
      if (isDaily(url)) armed = true;
      if (!armed || closed) return false;
      if (loading) {
        if (now() - requestedAt > 30000) {
          loading = false;
          failed = true;
          onWaiting(true, 'No se pudo cargar Chess.com. Revisa la pestaña original.');
        }
        return true;
      }
      if (failed) return true;
      const doc = getDocument();
      if (isHome(url)) {
        onWaiting(true, 'Aguardando próximo movimiento');
        if (!frame) { navigate(`${origin}/home`); return true; }
        const next = nextGame(doc);
        if (next) navigate(next);
        else if (frame && now() - lastRefresh >= 30000) navigate(`${origin}/home`);
        return true;
      }
      if (!isDaily(url)) {
        onWaiting(true, 'Aguardando próximo movimiento');
        navigate(`${origin}/home`);
        return true;
      }
      const anchorAlive = current.marker.isConnected && current.marker.ownerDocument === doc;
      const pieces = current.root.querySelector('.piece');
      if (anchorAlive && pieces) {
        emptySince = null;
        onWaiting(false);
        return false;
      }
      if (emptySince === null) emptySince = now();
      if (now() - emptySince < 5000) return false;
      onWaiting(true, 'Aguardando próximo movimiento');
      navigate(`${origin}/home`);
      return true;
    }

    function stop() {
      armed = false;
      emptySince = null;
      failed = false;
      // Keep the current game visible in the tab after PiP closes. The load
      // listener still tracks manual frame navigation for a later PiP session.
    }

    function destroy() {
      closed = true;
      frame?.removeEventListener('load', loaded);
    }

    return { tick, stop, destroy };
  };
})();
