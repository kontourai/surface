// ── live refresh — SSE subscription for read-model change events ───────────
// Connects to /api/stream (text/event-stream). On each "model" event:
//   1. Refetches /api/console-model (preserving the current run selector)
//   2. Re-renders feed + metrics
//   3. Re-resolves the open detail sheet by claim id; if the claim vanished,
//      closes the sheet gracefully with a brief notice.
//   4. Preserves active filters, search text, and feed scroll position.
//
// Live indicator dot (#liveIndicator) near the theme toggle reflects
// connection state (live / connecting / disconnected) and auto-reconnects
// with capped exponential back-off.

(function () {
  const RECONNECT_BASE_MS = 1000;
  const RECONNECT_MAX_MS  = 30000;

  let es = null;
  let reconnectDelay = RECONNECT_BASE_MS;
  let reconnectTimer = null;
  let isLive = false;

  function setLiveState(state) {
    isLive = state === "live";
    const dot = document.getElementById("liveIndicator");
    if (!dot) return;
    dot.dataset.liveState = state;     // "live" | "connecting" | "disconnected"
    dot.title = state === "live"
      ? "Live — auto-refreshes on file change"
      : state === "connecting"
        ? "Connecting to live refresh…"
        : "Live refresh disconnected — reconnecting…";
    dot.setAttribute("aria-label", dot.title);
  }

  async function handleModelEvent() {
    // Preserve scroll position of the feed container
    const feed = document.getElementById("claimFeed");
    const scrollTop = feed ? feed.scrollTop : 0;

    // Remember which claim is currently open
    const previousClaimId = currentDetailClaim?.id ?? null;

    // Re-fetch using the currently active run (null = latest)
    const url = currentRunId && currentRunId !== "latest"
      ? `/api/console-model?run=${encodeURIComponent(currentRunId)}`
      : "/api/console-model";

    let newData;
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      newData = await response.json();
    } catch {
      return;
    }

    currentData = newData;
    renderConsole();
    renderRunPicker();

    // Restore scroll position
    if (feed) feed.scrollTop = scrollTop;

    // Re-resolve the open detail sheet
    if (previousClaimId) {
      const updatedClaim = (currentData.claims ?? []).find(c => c.id === previousClaimId);
      if (updatedClaim) {
        const idx = currentData.claims.indexOf(updatedClaim);
        const cardEl = document.querySelector(`[data-claim-index="${idx}"]`);
        showClaimDetail(updatedClaim, currentData.readModel, cardEl, false);
      } else {
        // Claim was removed from the new model — close sheet with a notice
        closeSheet(false);
        showLiveNotice("Claim removed in latest run — detail closed.");
      }
    }
  }

  function showLiveNotice(message) {
    // Reuse any existing notice element so repeated notices don't stack
    let notice = document.getElementById("liveNotice");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "liveNotice";
      notice.className = "live-notice";
      notice.setAttribute("role", "status");
      notice.setAttribute("aria-live", "polite");
      const body = document.querySelector(".dash-body");
      if (body) body.prepend(notice);
    }
    notice.textContent = message;
    notice.removeAttribute("hidden");
    clearTimeout(notice._hideTimer);
    notice._hideTimer = setTimeout(() => {
      notice.setAttribute("hidden", "");
    }, 5000);
  }

  function connect() {
    if (es) {
      es.close();
      es = null;
    }
    setLiveState("connecting");

    es = new EventSource("/api/stream");

    es.addEventListener("open", () => {
      reconnectDelay = RECONNECT_BASE_MS;
      setLiveState("live");
    });

    es.addEventListener("model", () => {
      handleModelEvent().catch(() => {});
    });

    es.addEventListener("error", () => {
      es.close();
      es = null;
      setLiveState("disconnected");
      scheduleReconnect();
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
      connect();
    }, reconnectDelay);
  }

  // Boot — defer until DOM is ready (script runs after body content)
  connect();
})();
