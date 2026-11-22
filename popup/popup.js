document.addEventListener("DOMContentLoaded", () => {
  const domainWarningBox = document.getElementById("domain-warning-box");
  const downloadControls = document.getElementById("download-controls");
  const currentDomainBadge = document.getElementById("current-domain-badge");
  const openPinterestBtn = document.getElementById("open-pinterest-btn");

  const pulseDot = document.getElementById("pulse-dot");
  const statusText = document.getElementById("status-text");
  const statusDetail = document.getElementById("status-detail");

  const progressContainer = document.getElementById("progress-container");
  const progressBarFill = document.getElementById("progress-bar-fill");
  const progressPercent = document.getElementById("progress-percent");
  const progressCount = document.getElementById("progress-count");

  const grabPinBtn = document.getElementById("grab-pin-btn");
  const bulkBtn = document.getElementById("bulk-btn");
  const maxPinsRange = document.getElementById("max-pins-range");
  const maxPinsInput = document.getElementById("max-pins-input");
  const delayRange = document.getElementById("delay-range");
  const delayValue = document.getElementById("delay-value");
  const delayInfoBtn = document.getElementById("delay-info-btn");
  const delayInfoPopover = document.getElementById("delay-info-popover");

  let activeTabId = null;
  let detectedBoardTitle = "";

  function getHostname(urlString) {
    try {
      return new URL(urlString).hostname.toLowerCase();
    } catch (e) {
      return "";
    }
  }

  function isPinterestDomain(urlString) {
    const host = getHostname(urlString);
    return /(?:^|\.)pinterest\.[a-z.]+$/i.test(host);
  }

  function isPinDetailUrl(urlString) {
    try {
      return /^\/pin\/\d+/.test(new URL(urlString).pathname);
    } catch (e) {
      return false;
    }
  }

  // Sync sliders
  maxPinsRange.addEventListener("input", (e) => {
    maxPinsInput.value = e.target.value;
    savePopupSettings();
  });

  maxPinsInput.addEventListener("input", (e) => {
    const value = Math.min(1000, Math.max(10, parseInt(e.target.value, 10) || 10));
    maxPinsRange.value = String(value);
  });

  maxPinsInput.addEventListener("change", (e) => {
    const value = Math.min(1000, Math.max(10, parseInt(e.target.value, 10) || 10));
    e.target.value = String(value);
    maxPinsRange.value = String(value);
    savePopupSettings();
  });

  delayRange.addEventListener("input", (e) => {
    delayValue.textContent = `${e.target.value}ms`;
    savePopupSettings();
  });

  if (delayInfoBtn && delayInfoPopover) {
    delayInfoBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const shouldOpen = delayInfoPopover.classList.contains("hidden");
      delayInfoPopover.classList.toggle("hidden", !shouldOpen);
      delayInfoBtn.setAttribute("aria-expanded", String(shouldOpen));
    });

    document.addEventListener("click", (e) => {
      if (!delayInfoPopover.contains(e.target) && e.target !== delayInfoBtn) {
        delayInfoPopover.classList.add("hidden");
        delayInfoBtn.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        delayInfoPopover.classList.add("hidden");
        delayInfoBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  function savePopupSettings() {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        maxPins: parseInt(maxPinsInput.value, 10) || 50,
        scrollDelayMs: parseInt(delayRange.value, 10) || 450
      });
    }
  }

  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["maxPins", "scrollDelayMs"], (settings) => {
      const maxPins = Math.min(1000, Math.max(10, parseInt(settings.maxPins, 10) || 50));
      const scrollDelayMs = Math.min(1000, Math.max(250, parseInt(settings.scrollDelayMs, 10) || 450));
      maxPinsInput.value = String(maxPins);
      maxPinsRange.value = String(maxPins);
      delayRange.value = String(scrollDelayMs);
      delayValue.textContent = `${scrollDelayMs}ms`;
    });
  }

  function sendTabMessage(tabId, payload, onSuccess, allowInjectRetry = true) {
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      if (!chrome.runtime.lastError) {
        if (onSuccess) onSuccess(response);
        return;
      }

      if (allowInjectRetry && chrome.scripting && chrome.scripting.executeScript) {
        chrome.scripting.executeScript(
          { target: { tabId }, files: ["constants.js", "content.js"] },
          () => {
            if (chrome.runtime.lastError) {
              showRefreshError();
              return;
            }
            sendTabMessage(tabId, payload, onSuccess, false);
          }
        );
      } else {
        showRefreshError();
      }
    });
  }

  function showRefreshError() {
    pulseDot.className = "pulse-dot error";
    statusText.textContent = "Refresh required";
    statusDetail.textContent = "Refresh this Pinterest tab, then try again.";
    setButtonsBusy(false);
  }

  function setButtonsBusy(busy) {
    grabPinBtn.disabled = busy;
    bulkBtn.disabled = busy;
  }

  // Initialize based on active tab
  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab) return;

      activeTabId = tab.id;
      const url = tab.url || "";
      const hostname = getHostname(url);

      if (!isPinterestDomain(url)) {
        domainWarningBox.classList.remove("hidden");
        downloadControls.classList.add("hidden");
        if (hostname) {
          currentDomainBadge.textContent = hostname;
        } else if (url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:")) {
          currentDomainBadge.textContent = "Browser Internal Page";
        } else {
          currentDomainBadge.textContent = "Unsupported Site";
        }
        return;
      }

      domainWarningBox.classList.add("hidden");
      downloadControls.classList.remove("hidden");

      const isPin = isPinDetailUrl(url);
      if (isPin) {
        grabPinBtn.classList.remove("hidden");
        bulkBtn.classList.add("secondary-btn");
        bulkBtn.querySelector(".btn-text").textContent = "Grab Related Pins Below";
        statusText.textContent = "Pin detected";
        statusDetail.textContent = "Grab this pin in original HD or batch-save related pins below.";
      } else {
        grabPinBtn.classList.add("hidden");
        bulkBtn.classList.remove("secondary-btn");
        statusText.textContent = "Ready to grab";
        statusDetail.textContent = "Hover any pin to save it, or grab this board in bulk below.";
      }

      // Query page details from content script
      sendTabMessage(activeTabId, { action: "SCAN_PAGE" }, (info) => {
        if (!info) return;
        detectedBoardTitle = info.title || "";
        if (!isPin && info.visiblePins > 0) {
          statusDetail.textContent = `Detected ${info.visiblePins} visible pin${info.visiblePins === 1 ? "" : "s"} on “${detectedBoardTitle}”.`;
        }
      });
    });
  }

  // Open Pinterest button
  if (openPinterestBtn) {
    openPinterestBtn.addEventListener("click", () => {
      const targetUrl = "https://www.pinterest.com";
      if (activeTabId) {
        chrome.tabs.get(activeTabId, (tab) => {
          const currentUrl = tab ? (tab.url || "") : "";
          if (currentUrl.startsWith("chrome://") || currentUrl.startsWith("edge://") || currentUrl.startsWith("about:")) {
            chrome.tabs.create({ url: targetUrl });
          } else {
            chrome.tabs.update(activeTabId, { url: targetUrl });
          }
          window.close();
        });
      } else {
        chrome.tabs.create({ url: targetUrl });
        window.close();
      }
    });
  }

  // Download single current pin
  grabPinBtn.addEventListener("click", () => {
    if (!activeTabId) return;
    setButtonsBusy(true);
    pulseDot.className = "pulse-dot active";
    statusText.textContent = "Grabbing pin...";
    statusDetail.textContent = "Resolving highest-resolution image or video.";
    sendTabMessage(activeTabId, { action: "DOWNLOAD_CURRENT_PIN" });
  });

  // Start bulk board / feed download
  bulkBtn.addEventListener("click", () => {
    if (!activeTabId) return;
    const maxPins = parseInt(maxPinsRange.value, 10) || 50;
    const scrollDelayMs = parseInt(delayRange.value, 10) || 450;

    setButtonsBusy(true);
    progressContainer.classList.remove("hidden");
    progressBarFill.style.width = "0%";
    progressPercent.textContent = "0%";
    progressCount.textContent = `0 / ${maxPins} pins`;

    pulseDot.className = "pulse-dot active";
    statusText.textContent = "Scanning pins...";
    statusDetail.textContent = "Scrolling to collect pins from this page.";

    sendTabMessage(activeTabId, {
      action: "START_BULK_DOWNLOAD",
      maxPins,
      scrollDelayMs,
      folderName: detectedBoardTitle
    });
  });

  // Listen for progress from content script
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender) => {
      if (sender && sender.tab && sender.tab.id && activeTabId && sender.tab.id !== activeTabId) {
        return;
      }

      if (message.action === "PROGRESS") {
        if (message.status === "scanning") {
          pulseDot.className = "pulse-dot active";
          statusText.textContent = "Scanning pins...";
          statusDetail.textContent = `Collected ${message.current} unique pins so far.`;
          const pct = message.total > 0 ? Math.min(100, Math.round((message.current / message.total) * 100)) : 0;
          progressContainer.classList.remove("hidden");
          progressBarFill.style.width = `${pct}%`;
          progressPercent.textContent = `${pct}%`;
          progressCount.textContent = `${message.current} / ${message.total} pins`;
        } else if (message.status === "downloading") {
          pulseDot.className = "pulse-dot active";
          statusText.textContent = "Downloading pins...";
          statusDetail.textContent = "Saving original HD media to Downloads/Pintgrab.";
          const pct = message.total > 0 ? Math.min(100, Math.round((message.current / message.total) * 100)) : 0;
          progressContainer.classList.remove("hidden");
          progressBarFill.style.width = `${pct}%`;
          progressPercent.textContent = `${pct}%`;
          progressCount.textContent = `${message.current} / ${message.total} pins`;
        } else if (message.status === "completed") {
          pulseDot.className = "pulse-dot success";
          statusText.textContent = "Download complete";
          statusDetail.textContent = message.note
            || `Saved ${message.downloaded} of ${message.total} pin${message.total === 1 ? "" : "s"} to Downloads/Pintgrab.`;
          progressBarFill.style.width = "100%";
          progressPercent.textContent = "100%";
          setButtonsBusy(false);
        }
      } else if (message.action === "ERROR") {
        pulseDot.className = "pulse-dot error";
        statusText.textContent = "Could not download";
        statusDetail.textContent = message.message || "Something went wrong. Please try again.";
        setButtonsBusy(false);
      } else if (message.action === "CANCELLED") {
        pulseDot.className = "pulse-dot idle";
        statusText.textContent = "Grab cancelled";
        statusDetail.textContent = "Ready whenever you want to try again.";
        progressContainer.classList.add("hidden");
        setButtonsBusy(false);
      }
    });
  }

  // Bind config version
  if (typeof PINTGRAB_CONFIG !== "undefined") {
    const versionEl = document.getElementById("app-version");
    if (versionEl && PINTGRAB_CONFIG.VERSION) {
      versionEl.textContent = `v${PINTGRAB_CONFIG.VERSION}`;
    }
  }

  // Open footer links in new tabs
  document.querySelectorAll(".footer-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const url = link.getAttribute("href");
      if (url && url !== "#") {
        if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
          chrome.tabs.create({ url });
        } else {
          window.open(url, "_blank");
        }
      }
    });
  });
});
