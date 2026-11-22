(() => {
  if (window.__PINTGRAB_LOADED__) return;
  window.__PINTGRAB_LOADED__ = true;

  let isBulkCancelled = false;
  let bulkOverlay = null;
  let toastTimer = null;

  const PINIMG_SIZE_RE = /^(https:\/\/i\.pinimg\.com)\/(?:originals|\d+x(?:\d+)?(?:_RS)?)\/(.+)$/i;
  const AVATAR_SIZE_RE = /\/(?:30x30|50x50|75x75|140x140)(?:_RS)?\//i;
  const MP4_URL_RE = /https?:\\?\/\\?\/v[0-9]*\.pinimg\.com\\?\/videos[^"'\s<>]+\.mp4/gi;
  const HLS_URL_RE = /https?:\\?\/\\?\/v[0-9]*\.pinimg\.com\\?\/videos\/iht\/hls\/([a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]+)\.m3u8/gi;

  function safeSendMessage(message) {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage(message);
      }
    } catch (e) {
      // Ignore invalidated context
    }
  }

  function requestBackgroundDownload(payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ action: "DOWNLOAD_MEDIA", ...payload }, (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(resp || { ok: false, error: "No response from background." });
          }
        });
      } catch (e) {
        resolve({ ok: false, error: e.message || "Messaging error." });
      }
    });
  }

  /* ============================================================
     1. Styles (Pinterest-Red Native Theme)
     ============================================================ */

  function injectStyles() {
    if (document.getElementById("pintgrab-styles")) return;
    const style = document.createElement("style");
    style.id = "pintgrab-styles";
    style.textContent = `
      .pintgrab-pin-btn {
        position: absolute;
        left: 10px;
        bottom: 10px;
        z-index: 20;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        height: 34px;
        min-width: 34px;
        padding: 0 11px;
        border: none;
        border-radius: 999px;
        background: #E60023;
        color: #FFFFFF;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12.5px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.28);
        opacity: 0;
        transform: translateY(3px);
        transition: opacity 0.16s ease, transform 0.16s ease, background-color 0.15s ease;
        pointer-events: auto;
      }

      .pintgrab-pin-btn.pintgrab-always-visible,
      .pintgrab-pin-host:hover > .pintgrab-pin-btn,
      .pintgrab-pin-btn:hover,
      .pintgrab-pin-btn:focus-visible,
      .pintgrab-pin-btn.pintgrab-busy,
      .pintgrab-pin-btn.pintgrab-done {
        opacity: 1;
        transform: translateY(0);
      }

      .pintgrab-pin-btn:hover {
        background: #AD081B;
      }

      .pintgrab-pin-btn:active {
        transform: scale(0.96);
      }

      .pintgrab-pin-btn.pintgrab-done {
        background: #0F8A4B;
      }

      .pintgrab-pin-btn.pintgrab-err {
        background: #222222;
      }

      .pintgrab-pin-btn svg {
        width: 15px;
        height: 15px;
        flex-shrink: 0;
      }

      .pintgrab-spin {
        animation: pintgrab-rotate 0.75s linear infinite;
      }

      @keyframes pintgrab-rotate {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      #pintgrab-toast {
        position: fixed;
        left: 50%;
        bottom: 24px;
        transform: translateX(-50%) translateY(12px);
        z-index: 2147483647;
        background: #111111;
        color: #FFFFFF;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 999px;
        padding: 10px 18px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
        display: flex;
        align-items: center;
        gap: 8px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease, transform 0.2s ease;
        max-width: 90vw;
      }

      #pintgrab-toast.visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      #pintgrab-toast .pintgrab-toast-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #E60023;
        flex-shrink: 0;
      }

      #pintgrab-toast.success .pintgrab-toast-dot {
        background: #22C55E;
      }

      #pintgrab-toast.warn .pintgrab-toast-dot {
        background: #F59E0B;
      }
    `;
    document.head.appendChild(style);
  }

  function showToast(text, type = "info", durationMs = 2800) {
    injectStyles();
    let toast = document.getElementById("pintgrab-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "pintgrab-toast";
      toast.innerHTML = `<span class="pintgrab-toast-dot"></span><span class="pintgrab-toast-text"></span>`;
      document.body.appendChild(toast);
    }
    toast.className = type;
    toast.querySelector(".pintgrab-toast-text").textContent = text;
    requestAnimationFrame(() => toast.classList.add("visible"));

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("visible");
    }, durationMs);
  }

  /* ============================================================
     2. Media Extraction Helpers (Images, GIFs & MP4 Videos)
     ============================================================ */

  function extractPinIdFromUrl(urlString) {
    if (!urlString) return "";
    const match = urlString.match(/\/pin\/(\d+)/);
    return match ? match[1] : "";
  }

  function getPinIdFromElement(el) {
    if (!el) return extractPinIdFromUrl(window.location.href);
    const dragIdEl = el.querySelector("[data-pin-drag-id]") || el.closest("[data-pin-drag-id]");
    if (dragIdEl) {
      const dragId = dragIdEl.getAttribute("data-pin-drag-id");
      if (dragId && /^\d+$/.test(dragId)) return dragId;
    }
    const link = el.querySelector('a[href*="/pin/"]') || el.closest('a[href*="/pin/"]');
    if (link) {
      const id = extractPinIdFromUrl(link.getAttribute("href") || "");
      if (id) return id;
    }
    const dataId = el.getAttribute("data-test-pin-id") || el.getAttribute("data-pin-id");
    if (dataId && /^\d+$/.test(dataId)) return dataId;
    return extractPinIdFromUrl(window.location.href);
  }

  function buildImageCandidates(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return [];
    const cleaned = rawUrl.trim();
    if (!cleaned.startsWith("http")) return [];

    const candidates = [];
    const add = (u) => {
      if (u && !candidates.includes(u)) candidates.push(u);
    };

    const match = cleaned.match(PINIMG_SIZE_RE);
    if (match) {
      const [, origin, rest] = match;
      add(`${origin}/originals/${rest}`);
      if (/\.jpg$/i.test(rest)) {
        add(`${origin}/originals/${rest.replace(/\.jpg$/i, ".png")}`);
      }
      add(`${origin}/736x/${rest}`);
      add(`${origin}/564x/${rest}`);
    }
    add(cleaned);
    return candidates;
  }

  function getBestImgInContainer(container) {
    if (!container) return null;
    const imgs = Array.from(container.querySelectorAll('img[src*="pinimg.com"], img[srcset*="pinimg.com"]'));
    let bestImg = null;
    let bestScore = -1;

    for (const img of imgs) {
      const src = img.currentSrc || img.src || "";
      if (!src || AVATAR_SIZE_RE.test(src)) continue;
      if (img.closest('[data-test-id="creator-avatar"], [data-test-id="pinner-avatar"], [data-test-id="user-avatar"]')) {
        continue;
      }
      const rect = img.getBoundingClientRect();
      const w = Math.max(rect.width, img.naturalWidth || 0);
      const h = Math.max(rect.height, img.naturalHeight || 0);
      if (w < 80 || h < 80) continue;
      const score = w * h;
      if (score > bestScore) {
        bestScore = score;
        bestImg = img;
      }
    }
    return bestImg;
  }

  function getHighestUrlFromImg(img) {
    if (!img) return "";
    const srcset = img.getAttribute("srcset") || "";
    if (srcset) {
      const parsed = srcset
        .split(",")
        .map((part) => {
          const tokens = part.trim().split(/\s+/);
          const url = tokens[0];
          const mult = tokens[1] ? parseFloat(tokens[1]) : 1;
          return { url, mult: Number.isNaN(mult) ? 1 : mult };
        })
        .filter((x) => x.url && x.url.includes("pinimg.com"))
        .sort((a, b) => b.mult - a.mult);
      if (parsed.length > 0) return parsed[0].url;
    }
    return img.currentSrc || img.src || "";
  }

  function rankMp4Url(url) {
    if (/1080p|1080w/i.test(url)) return 5;
    if (/720p|720w/i.test(url)) return 4;
    if (/expMp4/i.test(url)) return 3;
    if (/480p|480w/i.test(url)) return 2;
    return 1;
  }

  function findVideoMp4CandidatesInScripts(pinId) {
    // Scan ALL inline scripts including Pinterest's data-relay-completed-request="true"
    const scripts = Array.from(document.querySelectorAll("script:not([src])"));
    const mp4Candidates = [];
    const hlsDerived = [];

    const collectFromChunk = (chunk) => {
      const mp4Matches = chunk.match(MP4_URL_RE);
      if (mp4Matches) {
        mp4Matches.forEach((raw) => {
          const clean = raw.replace(/\\\//g, "/");
          if (!mp4Candidates.includes(clean)) mp4Candidates.push(clean);
        });
      }

      let hlsMatch;
      HLS_URL_RE.lastIndex = 0;
      while ((hlsMatch = HLS_URL_RE.exec(chunk)) !== null) {
        const sigPath = hlsMatch[1];
        const derived = [
          `https://v1.pinimg.com/videos/iht/expMp4/${sigPath}_720w.mp4`,
          `https://v1.pinimg.com/videos/mc/720p/${sigPath}.mp4`,
          `https://v1.pinimg.com/videos/iht/720p/${sigPath}.mp4`
        ];
        derived.forEach((u) => {
          if (!hlsDerived.includes(u)) hlsDerived.push(u);
        });
      }
    };

    for (const script of scripts) {
      const text = script.textContent || "";
      if (!text || !text.includes("pinimg.com/videos")) continue;

      if (pinId && text.includes(pinId)) {
        const idx = text.indexOf(pinId);
        const slice = text.slice(Math.max(0, idx - 2500), Math.min(text.length, idx + 15000));
        collectFromChunk(slice);
      } else if (window.location.pathname.includes("/pin/")) {
        collectFromChunk(text);
      }
    }

    mp4Candidates.sort((a, b) => rankMp4Url(b) - rankMp4Url(a));
    const combined = [...mp4Candidates];
    hlsDerived.forEach((u) => {
      if (!combined.includes(u)) combined.push(u);
    });
    return combined;
  }

  function isLikelyVideoContainer(container) {
    if (!container) return false;
    if (container.querySelector("video")) return true;
    if (container.querySelector('[data-test-id="story-pin-video-block"], [data-test-id="pinrep-video"], [data-test-id="web-video-player"], [data-test-id="video-duration-pill"]')) {
      return true;
    }
    // Check for Pinterest video duration badge (e.g. "0:15" or "1:20") inside card overlay
    const badges = container.querySelectorAll("div, span");
    for (const b of badges) {
      if (b.children.length === 0) {
        const txt = (b.textContent || "").trim();
        if (/^\d{1,2}:\d{2}$/.test(txt)) {
          return true;
        }
      }
    }
    return false;
  }

  function extractMediaFromElement(container) {
    const pinId = getPinIdFromElement(container);
    const videoEl = container.querySelector("video");
    const isVideo = Boolean(videoEl) || isLikelyVideoContainer(container);
    const imgEl = getBestImgInContainer(container);
    const title = (imgEl && imgEl.alt ? imgEl.alt.trim() : "")
      || (document.querySelector('[data-test-id="pinTitle"] h1, [data-test-id="closeup-title"] h1, h1')?.textContent?.trim() || "");

    const posterUrl = (videoEl && videoEl.poster) || getHighestUrlFromImg(imgEl) || "";
    const fallbackImageCandidates = posterUrl ? buildImageCandidates(posterUrl) : [];

    // 1. Video pin path
    if (isVideo) {
      const mp4Candidates = [];
      const addMp4 = (u) => {
        if (u && u.startsWith("http") && !mp4Candidates.includes(u)) mp4Candidates.push(u);
      };

      if (videoEl) {
        const directSrc = videoEl.currentSrc || videoEl.src || "";
        if (directSrc && directSrc.startsWith("http") && /\.mp4(\?|$)/i.test(directSrc)) {
          addMp4(directSrc);
        }
        Array.from(videoEl.querySelectorAll("source")).forEach((s) => {
          if (s.src && s.src.startsWith("http") && /\.mp4(\?|$)/i.test(s.src)) {
            addMp4(s.src);
          }
        });
      }

      // Extract MP4 URLs (including data-relay-completed-request="true" & HLS-derived expMp4)
      findVideoMp4CandidatesInScripts(pinId).forEach(addMp4);

      return {
        mediaType: "video",
        candidates: mp4Candidates,
        fallbackImageCandidates,
        pinId,
        title,
        origin: window.location.origin
      };
    }

    // 2. Image / GIF pin path
    const imgUrl = getHighestUrlFromImg(imgEl);
    if (!imgUrl) return null;

    return {
      mediaType: /\.gif(\?|$)/i.test(imgUrl) ? "gif" : "image",
      candidates: buildImageCandidates(imgUrl),
      fallbackImageCandidates: [],
      pinId,
      title,
      origin: window.location.origin
    };
  }

  /* ============================================================
     3. On-Page Pin Buttons
     ============================================================ */

  const ICON_DOWNLOAD = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  `;

  const ICON_SPINNER = `
    <svg class="pintgrab-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
    </svg>
  `;

  const ICON_CHECK = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  `;

  function attachButtonToPinContainer(container, isCloseup = false) {
    if (!container || container.dataset.pintgrabBound === "true") return;

    const hasMedia = container.querySelector("video") || getBestImgInContainer(container);
    if (!hasMedia) return;

    container.dataset.pintgrabBound = "true";
    container.classList.add("pintgrab-pin-host");

    const computedPos = window.getComputedStyle(container).position;
    if (computedPos === "static") {
      container.style.position = "relative";
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `pintgrab-pin-btn${isCloseup ? " pintgrab-always-visible" : ""}`;
    btn.setAttribute("data-pintgrab-btn", "true");
    btn.setAttribute("aria-label", "Download with Pintgrab");
    btn.title = "Download HD with Pintgrab";
    btn.innerHTML = isCloseup ? `${ICON_DOWNLOAD}<span>Grab</span>` : ICON_DOWNLOAD;

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (btn.classList.contains("pintgrab-busy")) return;
      btn.classList.add("pintgrab-busy");
      btn.classList.remove("pintgrab-done", "pintgrab-err");
      btn.innerHTML = isCloseup ? `${ICON_SPINNER}<span>Grabbing...</span>` : ICON_SPINNER;

      const media = extractMediaFromElement(container);
      if (!media || (media.candidates.length === 0 && !media.pinId && media.fallbackImageCandidates.length === 0)) {
        btn.classList.remove("pintgrab-busy");
        btn.classList.add("pintgrab-err");
        btn.innerHTML = isCloseup ? `${ICON_DOWNLOAD}<span>Grab</span>` : ICON_DOWNLOAD;
        showToast("Could not detect downloadable media on this pin.", "warn");
        return;
      }

      const resp = await requestBackgroundDownload({
        candidates: media.candidates,
        fallbackImageCandidates: media.fallbackImageCandidates,
        mediaType: media.mediaType,
        pinId: media.pinId,
        title: media.title,
        origin: media.origin
      });

      btn.classList.remove("pintgrab-busy");
      if (resp && resp.ok) {
        btn.classList.add("pintgrab-done");
        btn.innerHTML = isCloseup ? `${ICON_CHECK}<span>Saved</span>` : ICON_CHECK;
        if (resp.usedVideoFallback) {
          showToast("Stream-only video — saved HD cover image instead.", "warn", 3500);
        } else {
          const finalType = resp.actualMediaType || media.mediaType;
          const label = finalType === "video" ? "HD MP4 video" : (finalType === "gif" ? "GIF" : "HD image");
          showToast(`Saved ${label} to Downloads/Pintgrab`, "success");
        }
        setTimeout(() => {
          btn.classList.remove("pintgrab-done");
          btn.innerHTML = isCloseup ? `${ICON_DOWNLOAD}<span>Grab</span>` : ICON_DOWNLOAD;
        }, 2000);
      } else {
        btn.classList.add("pintgrab-err");
        btn.innerHTML = isCloseup ? `${ICON_DOWNLOAD}<span>Retry</span>` : ICON_DOWNLOAD;
        showToast(resp?.error || "Download failed.", "warn");
        setTimeout(() => btn.classList.remove("pintgrab-err"), 2000);
      }
    });

    container.appendChild(btn);
  }

  function scanAndAttachPinButtons() {
    injectStyles();

    // 1. Pin detail (closeup) containers
    const closeupSelectors = [
      '[data-test-id="closeup-body-image-container"]',
      '[data-test-id="closeup-image"]',
      '[data-test-id="pin-closeup-image"]',
      '[data-test-id="story-pin-image-block"]',
      '[data-test-id="visual-content-container"]'
    ];
    for (const selector of closeupSelectors) {
      document.querySelectorAll(selector).forEach((el) => {
        if (el.querySelector('[data-pintgrab-btn="true"]') || el.closest('[data-pintgrab-bound="true"]')) {
          return;
        }
        attachButtonToPinContainer(el, true);
      });
    }

    // 2. Feed / Board pin cards
    const cardSelectors = [
      '[data-test-id="pin"]',
      '[data-test-id="pinWrapper"]'
    ];
    document.querySelectorAll(cardSelectors.join(",")).forEach((card) => {
      if (card.querySelector('[data-pintgrab-btn="true"]') || card.closest('[data-pintgrab-bound="true"]')) {
        return;
      }
      const mediaBox = card.querySelector('[data-test-id="pinrep-image"], [data-test-id="pin-visual-wrapper"]') || card;
      attachButtonToPinContainer(mediaBox, false);
    });
  }

  let scanDebounceTimer = null;
  function schedulePinButtonScan() {
    if (scanDebounceTimer) return;
    scanDebounceTimer = setTimeout(() => {
      scanDebounceTimer = null;
      scanAndAttachPinButtons();
    }, 300);
  }

  scanAndAttachPinButtons();
  const pinObserver = new MutationObserver(schedulePinButtonScan);
  pinObserver.observe(document.documentElement, { childList: true, subtree: true });

  /* ============================================================
     4. Single Pin & Bulk Board Download Flows (Popup-triggered)
     ============================================================ */

  function detectPageInfo() {
    const path = window.location.pathname;
    const isPinPage = /^\/pin\/\d+/.test(path);

    const heading = document.querySelector('[data-test-id="board-header"] h1, [data-test-id="pinTitle"] h1, h1');
    const cleanTitle = (heading && heading.textContent && heading.textContent.trim())
      || document.title.replace(/\s*[-|]\s*Pinterest.*$/i, "").trim()
      || "Pinterest";

    const visiblePins = collectVisiblePinsFromDom().length;

    return {
      pageType: isPinPage ? "pin" : "board",
      title: cleanTitle,
      visiblePins
    };
  }

  function normalizePinKey(media) {
    if (media.pinId) return `pin:${media.pinId}`;
    const first = (media.candidates && media.candidates[0]) || (media.fallbackImageCandidates && media.fallbackImageCandidates[0]) || "";
    const match = first.match(PINIMG_SIZE_RE);
    return match ? `img:${match[2]}` : first;
  }

  function collectVisiblePinsFromDom() {
    const items = [];
    const seen = new Set();

    const cards = Array.from(document.querySelectorAll('[data-test-id="pin"], [data-test-id="pinWrapper"], [data-grid-item="true"]'));
    for (const card of cards) {
      // Skip the main closeup card wrapper in related-pins masonry
      if (card.querySelector('[data-test-id="closeup-body"]')) continue;

      const media = extractMediaFromElement(card);
      if (!media || (media.candidates.length === 0 && !media.pinId && media.fallbackImageCandidates.length === 0)) continue;
      const key = normalizePinKey(media);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push(media);
    }

    if (items.length === 0) {
      const imgs = Array.from(document.querySelectorAll('img[src*="i.pinimg.com"]'));
      for (const img of imgs) {
        const src = getHighestUrlFromImg(img);
        if (!src || AVATAR_SIZE_RE.test(src)) continue;
        const rect = img.getBoundingClientRect();
        if (Math.max(rect.width, img.naturalWidth || 0) < 120) continue;
        const media = {
          mediaType: /\.gif(\?|$)/i.test(src) ? "gif" : "image",
          candidates: buildImageCandidates(src),
          fallbackImageCandidates: [],
          pinId: getPinIdFromElement(img.closest("a") || img.parentElement),
          title: (img.alt || "").trim(),
          origin: window.location.origin
        };
        const key = normalizePinKey(media);
        if (!seen.has(key)) {
          seen.add(key);
          items.push(media);
        }
      }
    }

    return items;
  }

  async function downloadCurrentPinPage() {
    const closeupContainer =
      document.querySelector('[data-test-id="closeup-body-image-container"]') ||
      document.querySelector('[data-test-id="visual-content-container"]') ||
      document.querySelector('[data-test-id="closeup-body-style"]') ||
      document.querySelector('[data-test-id="closeup-image"]') ||
      document.querySelector('[data-test-id="pin-closeup-image"]') ||
      document.querySelector("main") ||
      document.body;

    const media = extractMediaFromElement(closeupContainer);
    if (!media || (media.candidates.length === 0 && !media.pinId && media.fallbackImageCandidates.length === 0)) {
      const msg = "No downloadable pin image or video found on this page.";
      safeSendMessage({ action: "ERROR", message: msg });
      showToast(msg, "warn", 3500);
      return;
    }

    safeSendMessage({ action: "PROGRESS", status: "downloading", current: 0, total: 1 });
    const resp = await requestBackgroundDownload({
      candidates: media.candidates,
      fallbackImageCandidates: media.fallbackImageCandidates,
      mediaType: media.mediaType,
      pinId: media.pinId,
      title: media.title,
      origin: media.origin
    });

    if (resp && resp.ok) {
      const note = resp.usedVideoFallback
        ? "Stream-only video — saved HD cover image instead."
        : (resp.actualMediaType === "video" ? "Saved HD MP4 video to Downloads/Pintgrab." : "");
      safeSendMessage({
        action: "PROGRESS",
        status: "completed",
        downloaded: 1,
        total: 1,
        note
      });
      showToast(
        resp.usedVideoFallback
          ? "Stream-only video — saved HD cover image."
          : (resp.actualMediaType === "video" ? "Saved HD MP4 video to Downloads/Pintgrab!" : "Saved to Downloads/Pintgrab!"),
        resp.usedVideoFallback ? "warn" : "success"
      );
    } else {
      const err = resp?.error || "Download failed.";
      safeSendMessage({ action: "ERROR", message: err });
      showToast(err, "warn");
    }
  }

  async function runBulkDownload({ maxPins = 50, scrollDelayMs = 450, folderName = "" }) {
    isBulkCancelled = false;
    const initialScrollY = window.scrollY;
    const collected = new Map();
    const downloadDelayMs = (typeof PINTGRAB_CONFIG !== "undefined" && PINTGRAB_CONFIG.DOWNLOAD_DELAY_MS) || 220;

    try {
      updateBulkOverlay("Scanning pins...", "Scrolling to collect high-res pins from this page.", 0, maxPins);
      safeSendMessage({ action: "PROGRESS", status: "scanning", current: 0, total: maxPins });

      let staleRounds = 0;
      const maxStaleRounds = 3;

      while (collected.size < maxPins && staleRounds < maxStaleRounds && !isBulkCancelled) {
        const prevSize = collected.size;
        const visible = collectVisiblePinsFromDom();

        for (const item of visible) {
          if (collected.size >= maxPins) break;
          const key = normalizePinKey(item);
          if (!collected.has(key)) {
            collected.set(key, item);
          }
        }

        updateBulkOverlay(
          "Scanning pins...",
          `Found ${collected.size} unique pin${collected.size === 1 ? "" : "s"} so far.`,
          collected.size,
          maxPins
        );
        safeSendMessage({ action: "PROGRESS", status: "scanning", current: collected.size, total: maxPins });

        if (collected.size >= maxPins) break;

        if (collected.size === prevSize) {
          staleRounds++;
        } else {
          staleRounds = 0;
        }

        window.scrollBy({ top: Math.round(window.innerHeight * 0.85), behavior: "instant" });
        await new Promise((resolve) => setTimeout(resolve, scrollDelayMs));
      }

      if (isBulkCancelled) {
        removeBulkOverlay();
        window.scrollTo(0, initialScrollY);
        return;
      }

      const items = Array.from(collected.values());
      if (items.length === 0) {
        throw new Error("No downloadable pins were found on this page.");
      }

      const folder = folderName || detectPageInfo().title || "Board";
      let downloaded = 0;

      for (let i = 0; i < items.length; i++) {
        if (isBulkCancelled) break;

        const item = items[i];
        updateBulkOverlay(
          "Downloading pins...",
          `Saving to Downloads/Pintgrab/${folder}`,
          i + 1,
          items.length
        );
        safeSendMessage({
          action: "PROGRESS",
          status: "downloading",
          current: i + 1,
          total: items.length
        });

        const resp = await requestBackgroundDownload({
          candidates: item.candidates,
          fallbackImageCandidates: item.fallbackImageCandidates,
          mediaType: item.mediaType,
          pinId: item.pinId,
          title: item.title,
          origin: item.origin,
          folder
        });

        if (resp && resp.ok) downloaded++;
        await new Promise((resolve) => setTimeout(resolve, downloadDelayMs));
      }

      window.scrollTo(0, initialScrollY);

      if (isBulkCancelled) {
        removeBulkOverlay();
        showToast(`Cancelled — saved ${downloaded} pin${downloaded === 1 ? "" : "s"}.`, "warn");
        return;
      }

      safeSendMessage({
        action: "PROGRESS",
        status: "completed",
        downloaded,
        total: items.length
      });

      updateBulkOverlay(
        "All done!",
        `Saved ${downloaded} of ${items.length} pins to Downloads/Pintgrab/${folder}.`,
        items.length,
        items.length
      );
      setTimeout(() => removeBulkOverlay(), 2400);
    } catch (error) {
      window.scrollTo(0, initialScrollY);
      removeBulkOverlay();
      if (!isBulkCancelled) {
        safeSendMessage({ action: "ERROR", message: error.message });
        showToast(error.message || "Bulk download failed.", "warn", 3500);
      }
    }
  }

  /* ============================================================
     5. Bulk Progress Overlay (Pinterest-Red Theme)
     ============================================================ */

  function createBulkOverlay() {
    if (bulkOverlay) return;

    bulkOverlay = document.createElement("div");
    bulkOverlay.id = "pintgrab-overlay";
    bulkOverlay.style.cssText = `
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(17, 17, 17, 0.45);
      backdrop-filter: blur(8px);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    bulkOverlay.innerHTML = `
      <div style="background: #FFFFFF; border: 1px solid #F2D7DC; border-radius: 20px; padding: 28px 26px; width: 370px; max-width: 90vw; box-shadow: 0 24px 48px rgba(0, 0, 0, 0.24); display: flex; flex-direction: column; align-items: center; text-align: center;">
        <div style="width: 44px; height: 44px; background: #E60023; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; box-shadow: 0 4px 14px rgba(230, 0, 35, 0.28); color: #FFFFFF;">
          ${ICON_DOWNLOAD}
        </div>
        <div style="font-size: 17px; font-weight: 700; color: #111111; margin-bottom: 5px;">Pintgrab</div>
        <div id="pg-overlay-status" style="font-size: 13.5px; font-weight: 700; color: #E60023; margin-bottom: 4px;">Scanning pins...</div>
        <div id="pg-overlay-detail" style="font-size: 12px; color: #5F5F5F; margin-bottom: 18px; line-height: 1.4;">Collecting high-resolution pins.</div>

        <div style="width: 100%; height: 8px; background: #F5E6E9; border-radius: 999px; overflow: hidden; margin-bottom: 8px;">
          <div id="pg-overlay-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #E60023 0%, #FF4D6A 100%); border-radius: 999px; transition: width 0.2s ease;"></div>
        </div>
        <div style="width: 100%; display: flex; justify-content: space-between; font-size: 11px; font-weight: 600;">
          <span id="pg-overlay-percent" style="color: #E60023;">0%</span>
          <span id="pg-overlay-count" style="color: #5F5F5F;">0 / 0 pins</span>
        </div>

        <button id="pg-overlay-cancel" type="button" style="
          margin-top: 18px;
          width: 100%;
          background: #F6F6F6;
          border: 1px solid #E2E2E2;
          border-radius: 999px;
          color: #111111;
          padding: 9px 14px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
        ">Cancel</button>
      </div>
    `;

    document.body.appendChild(bulkOverlay);
    const cancelBtn = document.getElementById("pg-overlay-cancel");
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        isBulkCancelled = true;
        removeBulkOverlay();
        safeSendMessage({ action: "CANCELLED" });
      };
    }
  }

  function updateBulkOverlay(status, detail, current, total) {
    createBulkOverlay();
    const statusEl = document.getElementById("pg-overlay-status");
    const detailEl = document.getElementById("pg-overlay-detail");
    const fillEl = document.getElementById("pg-overlay-fill");
    const percentEl = document.getElementById("pg-overlay-percent");
    const countEl = document.getElementById("pg-overlay-count");

    if (statusEl) statusEl.textContent = status;
    if (detailEl) detailEl.textContent = detail;
    if (current !== undefined && total !== undefined) {
      const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (percentEl) percentEl.textContent = `${pct}%`;
      if (countEl) countEl.textContent = `${current} / ${total} pins`;
    }
  }

  function removeBulkOverlay() {
    if (bulkOverlay) {
      bulkOverlay.remove();
      bulkOverlay = null;
    }
  }

  /* ============================================================
     6. Message Listener from Popup
     ============================================================ */

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || !request.action) return false;

    if (request.action === "SCAN_PAGE") {
      sendResponse(detectPageInfo());
      return true;
    }

    if (request.action === "DOWNLOAD_CURRENT_PIN") {
      downloadCurrentPinPage();
      sendResponse({ started: true });
      return true;
    }

    if (request.action === "START_BULK_DOWNLOAD") {
      runBulkDownload({
        maxPins: request.maxPins || 50,
        scrollDelayMs: request.scrollDelayMs || 450,
        folderName: request.folderName || ""
      });
      sendResponse({ started: true });
      return true;
    }

    return false;
  });
})();
