// ==UserScript==
// @name         Rodeo NCL1 Hover Quick Barcodes PrintMon
// @namespace    wprijaco.rodeo.ncl1.hover.quickbarcodes.printmon
// @version      1.1.0
// @description  Prodeo-style hover barcode popup with Copy and Print buttons. Runs only on https://rodeo-dub.amazon.com/NCL1/Search* pages.
// @author       Prince Jacob (Wprijaco)
// @match        https://rodeo-dub.amazon.com/NCL1/Search*
// @updateURL    https://raw.githubusercontent.com/prince-jacob/-HoverQuickBarcodesPrintMon/refs/heads/main/HoverQuickBarcodesPrintMon.main.js
// @downloadURL  https://raw.githubusercontent.com/prince-jacob/-HoverQuickBarcodesPrintMon/refs/heads/main/HoverQuickBarcodesPrintMon.main.js
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @connect      localhost
// @connect      127.0.0.1
// @require      https://cdnjs.cloudflare.com/ajax/libs/bwip-js/3.0.4/bwip-js-min.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const ALLOWED_PREFIX = "https://rodeo-dub.amazon.com/NCL1/Search";
  if (!window.location.href.startsWith(ALLOWED_PREFIX)) return;

  const SCRIPT_NAME = "Rodeo NCL1 Hover Quick Barcodes PrintMon";
  const VERSION = "1.1.0";

  const CONFIG = {
    minLen: 2,
    maxLen: 90,
    scanIntervalMs: 2000,
    tooltipOffsetTop: 20,
    tooltipOffsetLeft: 45
  };

  function cleanText(input) {
    return String(input || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\/$/, "")
      .trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function asciihex(str) {
    let output = "";
    str = String(str || "");
    for (let i = 0; i < str.length; i++) {
      output += Number(str.charCodeAt(i)).toString(16);
    }
    return output;
  }

  function genId() {
    let id = "";
    for (let i = 0; i < 10; i++) id += Math.floor(Math.random() * 9);
    return id;
  }

  function getCookieValue(name) {
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const trimmed = cookie.trim();
      if (trimmed.startsWith(name + "=")) return trimmed.substring(name.length + 1);
    }
    return "";
  }

  function toast(message, color = "#232f3e") {
    let host = document.getElementById("pj-qb-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "pj-qb-toast-host";
      document.body.appendChild(host);
    }

    const item = document.createElement("div");
    item.className = "pj-qb-toast";
    item.style.background = color;
    item.textContent = message;
    host.appendChild(item);

    setTimeout(() => item.classList.add("pj-qb-toast-show"), 20);
    setTimeout(() => {
      item.classList.remove("pj-qb-toast-show");
      setTimeout(() => item.remove(), 350);
    }, 1800);
  }

  function copyText(text) {
    if (typeof GM_setClipboard === "function") {
      GM_setClipboard(text, { type: "text", mimetype: "text/plain" });
    } else {
      navigator.clipboard.writeText(text);
    }
    toast("Copied", "#4CAF50");
  }

  async function printmonBarcode(data, text = "", desc = "", quantity = 1) {
    data = cleanText(data);
    text = cleanText(text || data);
    desc = cleanText(desc || "");

    if (!data) {
      toast("Empty barcode", "#b91c1c");
      return false;
    }

    const badgeId = getCookieValue("fcmenu-employeeId") || "1";
    const url =
      "http://localhost:5965/printer?action=print&type=barcode&" +
      "data=" + encodeURIComponent(asciihex(data)) +
      "&text=" + encodeURIComponent(asciihex(text)) +
      "&quantity=" + encodeURIComponent(quantity) +
      "&badgeid=" + encodeURIComponent(badgeId) +
      "&desc=" + encodeURIComponent(asciihex(desc)) +
      "&seq=" + encodeURIComponent(genId());

    try {
      const response = await fetch(url);
      const reply = await response.text();
      if (reply === "valid") {
        toast("Printed: " + data, "#047857");
        return true;
      }
      toast("PrintMon error", "#b91c1c");
      alert("Failed to print barcode:\n\n" + data + "\n\nCheck printer / PrintMon.");
      return false;
    } catch (error) {
      console.error(error);
      toast("PrintMon not running", "#b91c1c");
      alert("Failed to print barcode:\n\n" + data + "\n\nPrintMon may not be running on localhost:5965.");
      return false;
    }
  }

  function looksPrintable(text) {
    if (!text) return false;
    if (text.length < CONFIG.minLen || text.length > CONFIG.maxLen) return false;
    if (/^(copy|print|search|submit|cancel|close|refresh)$/i.test(text)) return false;
    if (text.split(" ").length > 10 && !/^(ts|ch|fn|x0|b0|tote|cs|sp)/i.test(text)) return false;
    return true;
  }

  function getBestText(el) {
    if (!el) return "";

    const link = el.querySelector?.("a");
    const titleSpan = el.querySelector?.("span[title]");
    const input = el.matches?.("input,textarea") ? el : el.querySelector?.("input,textarea");

    const candidates = [
      input?.value,
      titleSpan?.getAttribute("title"),
      link?.innerText,
      el.getAttribute?.("title"),
      el.getAttribute?.("aria-label"),
      el.innerText
    ].map(cleanText).filter(Boolean);

    return candidates.find(looksPrintable) || "";
  }


  function buildColumnMap(table) {
    const map = {};
    const headers = Array.from(table.querySelectorAll("thead th"));
    headers.forEach((th, index) => {
      const name = cleanText(th.innerText || th.textContent).toLowerCase();
      if (name) map[name] = index;
    });
    return map;
  }

  function findColumn(map, possibleNames, fallbackIndex) {
    for (const name of possibleNames) {
      const key = name.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
    }
    return fallbackIndex;
  }

  function getCellTitle(cell) {
    const titled = cell?.querySelector?.("span[title], a[title], [title]");
    return cleanText(titled?.getAttribute?.("title") || cell?.innerText || cell?.textContent || "");
  }

  function getRowInfo(host) {
    const row = host?.closest?.("tr");
    const table = row?.closest?.("table");
    if (!row || !table) return null;

    const map = buildColumnMap(table);
    const fnIndex = findColumn(map, ["FN SKU", "FNSKU"], 2);
    const titleIndex = findColumn(map, ["Title", "ASIN Title", "ASIN Titles"], 3);
    const cells = Array.from(row.children);

    return {
      row,
      fnSku: cleanText(cells[fnIndex]?.innerText || cells[fnIndex]?.textContent || ""),
      title: getCellTitle(cells[titleIndex]),
      cellIndex: cells.indexOf(host.closest?.("td,th"))
    };
  }

  function getPrintDescription(host, text) {
    const info = getRowInfo(host);
    if (!info || !info.title) return "";

    const isFnSkuColumn = info.cellIndex >= 0 && info.fnSku && cleanText(text) === info.fnSku;
    const looksLikeFnSku = /^[A-Z0-9]{8,14}$/.test(cleanText(text)) && cleanText(text) === info.fnSku;

    return (isFnSkuColumn || looksLikeFnSku) ? info.title : "";
  }

  function makeBarcodeImage(text) {
    const canv = document.createElement("canvas");
    try {
      bwipjs.toCanvas(canv, {
        bcid: text.length > 25 ? "azteccode" : "code128",
        text,
        scale: text.length > 25 ? 2 : 3,
        height: 12,
        paddingtop: 1,
        paddingright: 4,
        paddingbottom: 1,
        paddingleft: 4,
        includetext: true,
        textxalign: "center"
      });
    } catch (e) {
      console.error("Barcode generation failed", e);
      return null;
    }

    const img = document.createElement("img");
    img.src = canv.toDataURL("image/png");
    img.alt = text;
    return img;
  }

  function addPrintAndCopyButtons(host, text, desc = "") {
    const tooltip = host.querySelector(".pj-bctt-span");
    if (!tooltip) return;

    const row = document.createElement("div");
    row.className = "pj-qb-button-row";

    const printBtn = document.createElement("button");
    printBtn.type = "button";
    printBtn.className = "pj-qb-btn pj-qb-print";
    printBtn.textContent = "🖨️ Print";
    printBtn.title = "Print with PrintMon";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "pj-qb-btn pj-qb-copy";
    copyBtn.textContent = "📋 Copy";
    copyBtn.title = "Copy barcode text";

    printBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      printmonBarcode(text, text, desc);
    }, false);

    copyBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      copyText(text);
    }, false);

    row.appendChild(printBtn);
    row.appendChild(copyBtn);
    tooltip.insertBefore(row, tooltip.firstChild);
  }

  function attachQuickBarcode(el) {
    if (!el || el.dataset.pjQbAttached === "1") return;
    if (el.closest(".pj-bctt-span")) return;

    el.dataset.pjQbAttached = "1";

    el.addEventListener("mouseenter", function () {
      if (el.querySelector(".pj-bctt-span")) return;

      const text = getBestText(el);
      if (!looksPrintable(text)) return;

      const img = makeBarcodeImage(text);
      if (!img) return;

      el.classList.add("pj-barcodeTooltip");

      const span = document.createElement("span");
      span.className = "pj-bctt-span";
      span.addEventListener("click", e => e.stopPropagation(), false);
      span.addEventListener("mousedown", e => e.stopPropagation(), false);

      const textLine = document.createElement("div");
      textLine.className = "pj-qb-text";
      textLine.textContent = text;

      const desc = getPrintDescription(el, text);
      if (desc) {
        const descLine = document.createElement("div");
        descLine.className = "pj-qb-desc";
        descLine.textContent = "Title: " + desc;
        span.appendChild(descLine);
      }

      span.appendChild(img);
      span.appendChild(textLine);
      el.appendChild(span);
      addPrintAndCopyButtons(el, text, desc);
    }, false);
  }

  function getCandidateElements() {
    const selectors = [
      "table.result-table tbody td",
      "table.result-table tbody td a",
      "td.filterable",
      "td.retail",
      "td",
      "a[href*='fcresearch']",
      "span[title]"
    ];

    const found = new Set();
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const host = el.closest("td") || el;
        if (host && !host.closest("#pj-qb-toast-host")) found.add(host);
      });
    });
    return Array.from(found);
  }

  function scanPage() {
    if (!window.location.href.startsWith(ALLOWED_PREFIX)) return;
    getCandidateElements().forEach(attachQuickBarcode);
  }

  function injectStyles() {
    GM_addStyle(`
      .pj-barcodeTooltip {
        text-decoration: none !important;
        position: relative !important;
      }

      .pj-barcodeTooltip .pj-bctt-span {
        display: none;
        position: absolute;
        top: ${CONFIG.tooltipOffsetTop}px;
        left: ${CONFIG.tooltipOffsetLeft}px;
        z-index: 2147483647;
        width: auto;
        min-width: 220px;
        max-width: 420px;
        border: 1px solid #000;
        border-radius: 8px;
        background: #fff;
        color: #000;
        overflow: hidden;
        padding: 8px;
        box-shadow: 0 8px 22px rgba(0,0,0,.35);
        font-family: Arial, sans-serif;
      }

      .pj-barcodeTooltip:hover .pj-bctt-span,
      .pj-barcodeTooltip .pj-bctt-span:hover {
        display: block;
      }

      .pj-bctt-span img {
        display: block;
        max-width: 390px;
        background: #fff;
        margin: 0 auto;
      }

      .pj-qb-button-row {
        display: flex;
        gap: 8px;
        margin-bottom: 7px;
        align-items: center;
      }

      .pj-qb-btn {
        border: 0;
        border-radius: 6px;
        padding: 6px 9px;
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        line-height: 1;
      }

      .pj-qb-print { background: #047857; }
      .pj-qb-copy { background: #2563eb; }
      .pj-qb-btn:hover { filter: brightness(1.1); }

      .pj-qb-text {
        margin-top: 5px;
        font-size: 12px;
        font-weight: 700;
        color: #111;
        text-align: center;
        word-break: break-all;
      }

      .pj-qb-desc {
        margin: 2px 0 6px 0;
        padding: 5px 6px;
        border-radius: 6px;
        background: #f3f4f6;
        color: #111827;
        font-size: 11px;
        font-weight: 700;
        line-height: 1.25;
        max-width: 390px;
        word-break: break-word;
      }

      #pj-qb-toast-host {
        position: fixed;
        right: 20px;
        bottom: 22px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
      }

      .pj-qb-toast {
        min-width: 140px;
        max-width: 360px;
        opacity: 0;
        transform: translateY(12px);
        transition: opacity .25s ease, transform .25s ease;
        padding: 10px 13px;
        border-radius: 999px;
        color: #fff;
        font-size: 12px;
        font-weight: 800;
        box-shadow: 0 10px 25px rgba(0,0,0,.35);
        text-align: center;
      }

      .pj-qb-toast-show {
        opacity: 1;
        transform: translateY(0);
      }
    `);
  }

  function init() {
    injectStyles();
    scanPage();

    const observer = new MutationObserver(() => scanPage());
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(scanPage, CONFIG.scanIntervalMs);

    console.log(`${SCRIPT_NAME} v${VERSION} loaded. Runs only on ${ALLOWED_PREFIX}*`);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
