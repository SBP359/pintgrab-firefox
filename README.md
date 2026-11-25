<div align="center">

<img src="https://raw.githubusercontent.com/SBP359/pintgrab-firefox/bbd55b2a5f21a09af5303e38ddc2b855d989458c/logo.png" alt="Pintgrab Logo" width="120" height="120">

# Pintgrab

### Download Pinterest media in its highest available quality

**A fast, private, and easy-to-use Firefox extension for saving Pinterest images, GIFs, videos, boards, feeds, and related pins.**

[![Version](https://img.shields.io/badge/version-1.0.1-E60023.svg)](manifest.json)
[![Pintgrab on Firefox](https://img.shields.io/badge/Firefox-140%2B-FF7139.svg?logo=mozilla-firefox&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/pintgrab/)
[![Manifest](https://img.shields.io/badge/Manifest-V3-4285F4.svg)](manifest.json)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Ko-fi](https://img.shields.io/badge/Support-Ko--fi-FF5E5B.svg?logo=ko-fi&logoColor=white)](https://ko-fi.com/sbp359)

<br>

<a href="https://github.com/sbp359"><strong>GitHub</strong></a>
&nbsp;&nbsp;|&nbsp;&nbsp;
<a href="https://ko-fi.com/sbp359"><strong>Support Pintgrab on Ko-fi</strong></a>

</div>

---

## Overview

**Pintgrab** makes it simple to download Pinterest media without leaving the page. Hover over a pin to reveal the quick-download button, open the Pintgrab popup for bulk controls, or use it directly from a pin detail page.

Downloads are organized into:

    Downloads/
    └── Pintgrab/
        └── <board-or-board-title>/
            └── <pin-title>-pin-<pin-id>.<format>

> **Quality First:** The extension attempts to preserve the original HD image or video quality and supports images, GIFs, and MP4 video pins.

---

## Features

- **HD single-pin downloads** with the highest-resolution URL available
- **Quick hover download** directly on Pinterest pin cards
- **Bulk board and feed grabbing**
- **Custom pin limit** from 10 to 1,000 pins
- **Adjustable scroll delay** from 250 ms to 1,000 ms
- **Saved settings** using Firefox local extension storage
- **Automatic GIF and video detection**
- **MP4 resolution detection** with HLS and cover-image fallbacks
- **Pin and board titles used in organized download paths**
- **Live scanning and download progress**
- **Cancellation support for bulk downloads**
- **Pinterest domain detection**
- **Original filename conflict handling**
- **No account or API key required**

---

## Popup Controls

### Maximum pins to grab

Enter a custom value or move the slider to choose how many unique pins Pintgrab should collect:

| Setting | Value |
| :--- | :--- |
| **Minimum** | 10 pins |
| **Default** | 50 pins |
| **Maximum** | 1,000 pins |

The number and slider stay synchronized, and both the limit and scroll delay are remembered for your next popup session.

### Scroll speed delay

Use the **Scroll speed delay** slider to control the pause between page scrolls:

| Setting | Value |
| :--- | :--- |
| **Minimum** | 250 ms |
| **Default** | 450 ms |
| **Maximum** | 1,000 ms |

Click the circular **i** button beside the label for an explanation. Increase the delay if you have a slow or unstable internet connection, or if the full grab is missing pins. A longer delay gives Pinterest more time to load content.

---

## How to Use

### Download one pin

1. Open a Pinterest pin, board, or feed.
2. Hover over a pin.
3. Select the red **Download** button.
4. The highest available media quality will be saved to `Downloads/Pintgrab/`.

### Download from a pin detail page

1. Open a URL beginning with `https://www.pinterest.com/pin/...`.
2. Select the extension icon.
3. Choose **Download This Pin (HD)**.

### Download multiple pins

1. Open a Pinterest board or feed.
2. Select the Pintgrab extension icon.
3. Set **Max pins to grab**.
4. Adjust **Scroll speed delay** if needed.
5. Choose **Grab Board / Visible Pins**.
6. Follow the live scan and download progress.

On pin detail pages, the bulk action changes to **Grab Related Pins Below**.

---

## Installation

### Load temporarily in Firefox

1. Open Firefox.
2. Visit `about:debugging#/runtime/this-firefox`.
3. Select **This Firefox**.
4. Select **Load Temporary Add-on**.
5. Choose `manifest.json` from this project folder.
6. Open Pinterest and select the Pintgrab icon.

> Temporary add-ons remain until Firefox is restarted. For repeated use, package and install the extension as a signed Firefox add-on.

### Package for Firefox

The project can be packaged as a ZIP file without changing its contents:

    Compress-Archive -Path manifest.json, background.js, constants.js, content.js, logo.png, icons, popup -DestinationPath pintgrab-firefox.zip -Force

---

## Project Structure

    pintgrab-firefox/
    ├── manifest.json       # Extension manifest and permissions
    ├── background.js       # Media resolution and native download handling
    ├── constants.js        # Shared version and default configuration
    ├── content.js          # Pinterest page scanning and bulk downloads
    ├── README.md           # Project documentation
    └── popup/
        ├── popup.html      # Popup interface
        ├── popup.css       # Popup styling
        └── popup.js        # Popup state and controls

---

## Supported Pinterest Domains

Pintgrab supports Pinterest country domains, including:

- `pinterest.com`
- `pinterest.co.uk`
- `pinterest.ca`
- `pinterest.de`
- `pinterest.fr`
- `pinterest.in`
- `pinterest.jp`
- `pinterest.es`
- `pinterest.it`
- `pinterest.com.au`
- `pinterest.pt`
- `pinterest.com.mx`
- `pinterest.ph`

---

## Permissions

Pintgrab requests only the permissions needed for its core behavior:

| Permission | Purpose |
| :--- | :--- |
| `activeTab` | Read the active Pinterest tab and communicate with it |
| `tabs` | Detect supported pages and open Pinterest links |
| `downloads` | Save files through Firefox's native download manager |
| `scripting` | Inject the content script if needed after extension updates or navigation |
| `storage` | Remember maximum pins and scroll delay preferences |

Pintgrab does not request a data-collection permission and does not require an account.

---

## Privacy

- Pintgrab does not send pin data to a Pintgrab server.
- Pintgrab does not track browsing activity.
- Settings are stored locally in extension storage.
- Media is downloaded directly through Firefox and the user-selected Downloads location.
- Pinterest media requests occur only while the extension is being used.

Review [manifest.json](manifest.json) for the exact supported domains and permissions.

---

## Troubleshooting

### Refresh required

Refresh the Pinterest page after installing or updating the extension. Pintgrab can retry content-script injection, but refreshing is the most reliable fix.

### Pins are missing

Try one or more of these fixes:

- Increase **Scroll speed delay**
- Scroll toward the end of the board manually before starting
- Check that the Pinterest page is fully loaded
- Reduce the pin limit if the page is very large
- Refresh Pinterest and retry

### Video downloaded as an image

Pintgrab falls back to a high-resolution cover image when it cannot find a reachable MP4. This keeps a usable image when an HLS-only video cannot be resolved.

### Unsupported site message

Open a Pinterest domain listed in [Supported Pinterest Domains](#supported-pinterest-domains), then reopen the popup.

---

## Development

No build system or package installation is required. Firefox loads the source files directly.

For local development:

1. Clone or download this repository.
2. Load it through `about:debugging`.
3. Edit the source files.
4. Click **Reload** in Firefox's temporary extensions page.
5. Refresh Pinterest and test the updated extension.

### Useful Files

- `popup/popup.html` — popup markup
- `popup/popup.css` — popup visual design
- `popup/popup.js` — popup interactions and settings
- `content.js` — Pinterest page and media discovery
- `background.js` — media URL resolution and browser downloads
- `constants.js` — shared version and defaults
- `manifest.json` — package metadata and permissions

---

## Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a focused feature or bug-fix branch.
3. Keep changes compatible with Firefox Manifest V3.
4. Test on at least one Pinterest board and one `/pin/` detail page.
5. Submit a pull request with a clear description and testing steps.

Please do not include credentials, private browser data, copyrighted test files, or unrelated changes.

---

## Support the Project

Pintgrab is free to use. If it saves you time, consider supporting continued development:

<div align="center">

### ☕ Support on Ko-fi

**[https://ko-fi.com/sbp359](https://ko-fi.com/sbp359)**

<a href="https://ko-fi.com/sbp359">
  <img src="https://storage.ko-fi.com/cdn/kofi2.png?v=3" alt="Support Pintgrab on Ko-fi" height="46">
</a>

</div>

---

## Author

Created with ❤️ by [**sbp359**](https://github.com/sbp359)

- GitHub: [https://github.com/sbp359](https://github.com/sbp359)
- Ko-fi: [https://ko-fi.com/sbp359](https://ko-fi.com/sbp359)

---

## License

Pintgrab is released under the [MIT License](LICENSE).
