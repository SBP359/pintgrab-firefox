/**
 * Pintgrab Background Script (Firefox & Chrome MV3 compatible)
 * Resolves highest-available pin media URLs (including SSR MP4 extraction for video pins)
 * and triggers native browser downloads.
 */

const MP4_URL_RE = /https?:\\?\/\\?\/v[0-9]*\.pinimg\.com\\?\/videos[^"'\s<>]+\.mp4/gi;
const HLS_URL_RE = /https?:\\?\/\\?\/v[0-9]*\.pinimg\.com\\?\/videos\/iht\/hls\/([a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]+)\.m3u8/gi;

function sanitizeFilenameSegment(value, maxLen = 64) {
  if (!value || typeof value !== "string") return "";
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, maxLen)
    .trim();
}

function getExtensionFromUrl(url, mediaType) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]{2,5})$/);
    if (match) {
      const ext = match[1];
      if (["jpg", "jpeg", "png", "gif", "webp", "mp4", "mov", "webm"].includes(ext)) {
        return ext === "jpeg" ? "jpg" : ext;
      }
    }
  } catch (e) {
    // Fallback below
  }
  return mediaType === "video" ? "mp4" : "jpg";
}

function rankMp4Url(url) {
  if (/1080p|1080w/i.test(url)) return 5;
  if (/720p|720w/i.test(url)) return 4;
  if (/expMp4/i.test(url)) return 3;
  if (/480p|480w/i.test(url)) return 2;
  return 1;
}

function extractMp4CandidatesFromText(text) {
  if (!text) return [];
  const urls = [];
  const add = (u) => {
    if (u && !urls.includes(u)) urls.push(u);
  };

  const mp4Matches = text.match(MP4_URL_RE) || [];
  const cleanedMp4s = Array.from(new Set(mp4Matches.map((u) => u.replace(/\\\//g, "/"))))
    .sort((a, b) => rankMp4Url(b) - rankMp4Url(a));
  cleanedMp4s.forEach(add);

  // Also derive MP4 paths from any HLS .m3u8 signature as fallback candidates
  let hlsMatch;
  HLS_URL_RE.lastIndex = 0;
  while ((hlsMatch = HLS_URL_RE.exec(text)) !== null) {
    const sigPath = hlsMatch[1];
    add(`https://v1.pinimg.com/videos/iht/expMp4/${sigPath}_720w.mp4`);
    add(`https://v1.pinimg.com/videos/mc/720p/${sigPath}.mp4`);
    add(`https://v1.pinimg.com/videos/iht/720p/${sigPath}.mp4`);
  }

  return urls;
}

async function fetchPinPageMp4Candidates(pinId, origin) {
  if (!pinId) return [];
  const baseOrigin = origin && origin.startsWith("http") ? origin : "https://www.pinterest.com";
  const pinUrl = `${baseOrigin}/pin/${pinId}/`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(pinUrl, {
      credentials: "include",
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!resp.ok) return [];
    const html = await resp.text();
    return extractMp4CandidatesFromText(html);
  } catch (e) {
    return [];
  }
}

async function isUrlReachable(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(timer);
    return resp.ok;
  } catch (e) {
    return false;
  }
}

async function resolveFirstReachableUrl(candidates, allowUnverifiedLast = true) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  for (let i = 0; i < candidates.length; i++) {
    const url = candidates[i];
    if (allowUnverifiedLast && i === candidates.length - 1) {
      return url;
    }
    if (await isUrlReachable(url)) {
      return url;
    }
  }
  return null;
}

function buildDownloadPath(item, resolvedUrl, actualMediaType) {
  const ext = getExtensionFromUrl(resolvedUrl, actualMediaType);
  const folder = sanitizeFilenameSegment(item.folder || "", 48);
  const title = sanitizeFilenameSegment(item.title || "", 52);
  const pinPart = item.pinId ? `pin-${item.pinId}` : `pin-${Date.now()}`;

  const baseName = title ? `${title}-${pinPart}` : pinPart;
  if (folder) {
    return `Pintgrab/${folder}/${baseName}.${ext}`;
  }
  return `Pintgrab/${baseName}.${ext}`;
}

function triggerDownload(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename,
        saveAs: false,
        conflictAction: "uniquify"
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (downloadId === undefined) {
          reject(new Error("Download was not started."));
        } else {
          resolve(downloadId);
        }
      }
    );
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.action !== "DOWNLOAD_MEDIA") {
    return false;
  }

  (async () => {
    try {
      const initialCandidates = Array.isArray(message.candidates) && message.candidates.length > 0
        ? [...message.candidates]
        : (message.url ? [message.url] : []);

      let bestUrl = null;
      let actualMediaType = message.mediaType || "image";
      let usedVideoFallback = false;

      if (message.mediaType === "video") {
        // 1. Try any MP4 candidates already extracted from the page
        if (initialCandidates.length > 0) {
          bestUrl = await resolveFirstReachableUrl(initialCandidates, false);
        }

        // 2. If none worked (e.g. SPA navigation or feed card), fetch the Pin SSR page to extract MP4
        if (!bestUrl && message.pinId) {
          const fetchedCandidates = await fetchPinPageMp4Candidates(message.pinId, message.origin);
          if (fetchedCandidates.length > 0) {
            bestUrl = await resolveFirstReachableUrl(fetchedCandidates, false);
          }
        }

        // 3. Last resort for HLS-only videos with zero MP4 variants: fall back to HD cover image
        if (!bestUrl && Array.isArray(message.fallbackImageCandidates) && message.fallbackImageCandidates.length > 0) {
          bestUrl = await resolveFirstReachableUrl(message.fallbackImageCandidates, true);
          if (bestUrl) {
            actualMediaType = "image";
            usedVideoFallback = true;
          }
        }
      } else {
        bestUrl = await resolveFirstReachableUrl(initialCandidates, true);
      }

      if (!bestUrl) {
        sendResponse({ ok: false, error: "Could not resolve a downloadable media URL." });
        return;
      }

      const filename = buildDownloadPath(message, bestUrl, actualMediaType);
      const downloadId = await triggerDownload(bestUrl, filename);
      sendResponse({
        ok: true,
        downloadId,
        url: bestUrl,
        filename,
        actualMediaType,
        usedVideoFallback
      });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || "Download failed." });
    }
  })();

  return true;
});
