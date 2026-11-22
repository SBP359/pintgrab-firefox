/**
 * ===================================================
 * Pintgrab - Global Constants & Configuration
 * ===================================================
 */

const PINTGRAB_CONFIG = {
  VERSION: "1.0.1",
  DEFAULT_MAX_PINS: 50,
  DEFAULT_SCROLL_DELAY_MS: 450,
  DOWNLOAD_DELAY_MS: 220,
  GITHUB_URL: "https://github.com/sbp359",
  KOFI_URL: "https://ko-fi.com/sbp359"
};

if (typeof window !== "undefined") {
  window.PINTGRAB_CONFIG = PINTGRAB_CONFIG;
}
