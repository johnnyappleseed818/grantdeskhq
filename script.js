"use strict";

/**
 * SITE CONFIGURATION
 *
 * Replace the empty endpoint/video values before launch. Download URLs may be
 * replaced with reviewed HTTPS or same-origin assets. The generated:// values
 * keep both synthetic sample downloads functional in a local static build.
 */
const SITE_CONFIG = Object.freeze({
  productName: "{{PRODUCT_NAME}}",
  formSubmissionEndpoint: "",
  downloadUrls: Object.freeze({
    sampleReportPdf: "generated://synthetic-sample-report.pdf",
    glMappingXlsx: "generated://synthetic-gl-mapping.xlsx",
  }),
  previewVideoUrl: "",
});

window.SITE_CONFIG = SITE_CONFIG;

const SYNTHETIC_ROWS = Object.freeze([
  Object.freeze([
    "Jan-Mar 2026",
    "Personnel",
    18420,
    18420,
    41580,
    -3420,
    "High",
    "TX-1048; TX-1102",
    "Complete",
  ]),
  Object.freeze([
    "Jan-Mar 2026",
    "Program supplies",
    7860,
    7860,
    12140,
    1140,
    "Review",
    "TX-1177; TX-1193",
    "Program explanation requested",
  ]),
  Object.freeze([
    "Jan-Mar 2026",
    "Travel",
    2315,
    2315,
    7685,
    185,
    "Medium",
    "TX-1214; TX-1220",
    "Complete",
  ]),
  Object.freeze([
    "Jan-Mar 2026",
    "Indirect costs",
    3980,
    3980,
    8020,
    520,
    "Review",
    "CALC-003",
    "Rate confirmation requested",
  ]),
]);

const SYNTHETIC_HEADERS = Object.freeze([
  "Reporting period",
  "Budget line",
  "Period actual",
  "Cumulative actual",
  "Remaining balance",
  "Variance",
  "Mapping confidence",
  "Source transaction IDs",
  "Missing-input status",
]);

function initializeNavigation() {
  const header = document.querySelector("[data-header]");
  const toggle = document.querySelector("[data-nav-toggle]");
  const navigation = document.querySelector("[data-nav]");

  if (!header || !toggle || !navigation) {
    return;
  }

  const toggleLabel = toggle.querySelector(".sr-only");

  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    navigation.classList.toggle("is-open", open);
    if (toggleLabel) {
      toggleLabel.textContent = open ? "Close navigation" : "Open navigation";
    }
  };

  toggle.addEventListener("click", () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });

  navigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      setOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      toggle.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (
      toggle.getAttribute("aria-expanded") === "true" &&
      !header.contains(event.target)
    ) {
      setOpen(false);
    }
  });

  const updateHeader = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 10);
  };

  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });
}

function initializePreviewModal() {
  const modal = document.querySelector("[data-preview-modal]");
  const openButton = document.querySelector("[data-open-preview]");

  if (!modal || !openButton) {
    return;
  }

  const closeButtons = modal.querySelectorAll("[data-close-preview]");
  const video = modal.querySelector("[data-preview-video]");
  const fallback = modal.querySelector("[data-video-fallback]");
  let previouslyFocused = null;

  const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "video[controls]",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  const configureVideo = () => {
    const configuredUrl = SITE_CONFIG.previewVideoUrl.trim();
    if (!configuredUrl || !video || !fallback) {
      return;
    }

    try {
      const parsedUrl = new URL(configuredUrl, window.location.href);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Unsupported video URL protocol");
      }
      video.src = parsedUrl.href;
      video.hidden = false;
      fallback.hidden = true;
      video.load();
    } catch (_error) {
      video.removeAttribute("src");
      video.hidden = true;
      fallback.hidden = false;
    }
  };

  const closeModal = () => {
    if (modal.hidden) {
      return;
    }
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    if (video && !video.paused) {
      video.pause();
    }
    if (previouslyFocused instanceof HTMLElement) {
      previouslyFocused.focus();
    }
  };

  const openModal = () => {
    previouslyFocused = document.activeElement;
    configureVideo();
    modal.hidden = false;
    document.body.classList.add("modal-open");
    const firstFocusable = modal.querySelector(focusableSelector);
    if (firstFocusable instanceof HTMLElement) {
      firstFocusable.focus();
    }
  };

  openButton.addEventListener("click", openModal);
  closeButtons.forEach((button) => button.addEventListener("click", closeModal));

  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = Array.from(modal.querySelectorAll(focusableSelector)).filter(
      (element) => element instanceof HTMLElement && !element.hidden,
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function escapePdfText(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function buildPdfBlob() {
  const lines = [
    { text: "SYNTHETIC DATA - CONTROLLER REVIEW DRAFT", size: 15, x: 56, y: 760 },
    { text: "Community Services Award | Jan-Mar 2026", size: 10, x: 56, y: 735 },
    { text: "AI-assisted draft and evidence assembly. Human review required.", size: 9, x: 56, y: 716 },
    { text: "", size: 9, x: 56, y: 696 },
    { text: "Budget line       Period      Cumulative    Remaining     Variance    Confidence", size: 8, x: 56, y: 680 },
    { text: "Personnel         $18,420     $18,420       $41,580       ($3,420)   High", size: 8, x: 56, y: 660 },
    { text: "Program supplies  $7,860      $7,860        $12,140       $1,140     Review", size: 8, x: 56, y: 644 },
    { text: "Travel            $2,315      $2,315        $7,685        $185       Medium", size: 8, x: 56, y: 628 },
    { text: "Indirect costs    $3,980      $3,980        $8,020        $520       Review", size: 8, x: 56, y: 612 },
    { text: "", size: 9, x: 56, y: 590 },
    { text: "Source evidence", size: 11, x: 56, y: 570 },
    { text: "Personnel: TX-1048; TX-1102", size: 8, x: 56, y: 550 },
    { text: "Program supplies: TX-1177; TX-1193", size: 8, x: 56, y: 534 },
    { text: "Travel: TX-1214; TX-1220", size: 8, x: 56, y: 518 },
    { text: "Indirect costs: CALC-003", size: 8, x: 56, y: 502 },
    { text: "", size: 9, x: 56, y: 480 },
    { text: "Missing inputs", size: 11, x: 56, y: 460 },
    { text: "- Program explanation requested for program supplies variance.", size: 8, x: 56, y: 440 },
    { text: "- Indirect-cost rate confirmation requested.", size: 8, x: 56, y: 424 },
    { text: "", size: 9, x: 56, y: 402 },
    { text: "All names, amounts, transactions and statuses in this file are synthetic.", size: 8, x: 56, y: 380 },
    { text: "This output is not accounting, legal or compliance advice.", size: 8, x: 56, y: 364 },
  ];

  const stream = lines
    .filter((line) => line.text)
    .map(
      (line) =>
        `BT /F1 ${line.size} Tf 1 0 0 1 ${line.x} ${line.y} Tm (${escapePdfText(line.text)}) Tj ET`,
    )
    .join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return new Blob([pdf], { type: "application/pdf" });
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index) {
  let result = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function buildWorksheetXml() {
  const rows = [SYNTHETIC_HEADERS, ...SYNTHETIC_ROWS];
  const sheetRows = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row
        .map((value, columnIndex) => {
          const cellReference = `${columnName(columnIndex)}${rowNumber}`;
          if (typeof value === "number") {
            return `<c r="${cellReference}"><v>${value}</v></c>`;
          }
          return `<c r="${cellReference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:I${rows.length}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>
    <col min="1" max="1" width="18" customWidth="1"/>
    <col min="2" max="2" width="22" customWidth="1"/>
    <col min="3" max="6" width="18" customWidth="1"/>
    <col min="7" max="7" width="20" customWidth="1"/>
    <col min="8" max="8" width="28" customWidth="1"/>
    <col min="9" max="9" width="34" customWidth="1"/>
  </cols>
  <sheetData>${sheetRows}</sheetData>
  <autoFilter ref="A1:I${rows.length}"/>
</worksheet>`;
}

function createCrcTable() {
  return Array.from({ length: 256 }, (_, tableIndex) => {
    let value = tableIndex;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
}

const CRC_TABLE = createCrcTable();

function crc32(bytes) {
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function concatenateBytes(chunks) {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

function buildStoredZip(files) {
  const encoder = new TextEncoder();
  const localChunks = [];
  const centralChunks = [];
  let localOffset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = typeof file.content === "string" ? encoder.encode(file.content) : file.content;
    const checksum = crc32(dataBytes);
    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);

    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0x0800);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 0x0021);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, dataBytes.length);
    writeUint32(localView, 22, dataBytes.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);

    localChunks.push(localHeader, nameBytes, dataBytes);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0x0800);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 0x0021);
    writeUint32(centralView, 16, checksum);
    writeUint32(centralView, 20, dataBytes.length);
    writeUint32(centralView, 24, dataBytes.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, localOffset);

    centralChunks.push(centralHeader, nameBytes);
    localOffset += localHeader.length + nameBytes.length + dataBytes.length;
  });

  const localData = concatenateBytes(localChunks);
  const centralData = concatenateBytes(centralChunks);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralData.length);
  writeUint32(endView, 16, localData.length);
  writeUint16(endView, 20, 0);

  return concatenateBytes([localData, centralData, endRecord]);
}

function buildXlsxBlob() {
  const files = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Synthetic GL Mapping" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content: buildWorksheetXml(),
    },
  ];

  const archive = buildStoredZip(files);
  return new Blob([archive], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function triggerDownload(url, filename) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function initializeDownloads() {
  const buttons = document.querySelectorAll("[data-download]");
  const status = document.querySelector("[data-download-status]");

  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      const key = button.dataset.download;
      const configuredUrl = SITE_CONFIG.downloadUrls[key];
      if (!configuredUrl) {
        if (status) {
          status.textContent = "This sample download has not been configured.";
        }
        return;
      }

      button.disabled = true;
      if (status) {
        status.textContent = "Preparing synthetic sample…";
      }

      try {
        if (configuredUrl.startsWith("generated://")) {
          const isPdf = key === "sampleReportPdf";
          const blob = isPdf ? buildPdfBlob() : buildXlsxBlob();
          const objectUrl = URL.createObjectURL(blob);
          triggerDownload(
            objectUrl,
            isPdf ? "synthetic-sample-report.pdf" : "synthetic-gl-mapping.xlsx",
          );
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        } else {
          const parsedUrl = new URL(configuredUrl, window.location.href);
          if (!["http:", "https:"].includes(parsedUrl.protocol)) {
            throw new Error("Unsupported download URL protocol");
          }
          triggerDownload(
            parsedUrl.href,
            key === "sampleReportPdf"
              ? "synthetic-sample-report.pdf"
              : "synthetic-gl-mapping.xlsx",
          );
        }

        if (status) {
          status.textContent = "Synthetic sample download started.";
        }
      } catch (_error) {
        if (status) {
          status.textContent = "The synthetic sample could not be prepared. Please try again.";
        }
      } finally {
        button.disabled = false;
      }
    });
  });
}

function initializeLeadForm() {
  const form = document.querySelector("[data-lead-form]");
  const submitButton = document.querySelector("[data-submit-button]");
  const status = document.querySelector("[data-form-status]");

  if (!form || !submitButton || !status) {
    return;
  }

  const fields = Array.from(form.querySelectorAll("input, select, textarea"));
  const updateInvalidState = (field) => {
    field.toggleAttribute("aria-invalid", !field.validity.valid);
  };

  fields.forEach((field) => {
    field.addEventListener("invalid", () => updateInvalidState(field));
    field.addEventListener("input", () => {
      if (field.validity.valid) {
        field.removeAttribute("aria-invalid");
      }
    });
    field.addEventListener("change", () => {
      if (field.validity.valid) {
        field.removeAttribute("aria-invalid");
      }
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.classList.remove("is-error");

    if (!form.checkValidity()) {
      fields.forEach(updateInvalidState);
      status.textContent = "Please complete the required fields before continuing.";
      status.classList.add("is-error");
      form.reportValidity();
      status.focus();
      return;
    }

    const endpoint = SITE_CONFIG.formSubmissionEndpoint.trim();
    if (!endpoint) {
      status.textContent =
        "The form is ready, but its submission endpoint has not been configured. Set SITE_CONFIG.formSubmissionEndpoint before launch.";
      status.classList.add("is-error");
      status.focus();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Sending…";
    status.textContent = "Sending your inquiry…";

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    payload.product = SITE_CONFIG.productName;
    payload.source = "founding-pilot-marketing-site";

    try {
      const parsedEndpoint = new URL(endpoint, window.location.href);
      if (!["http:", "https:"].includes(parsedEndpoint.protocol)) {
        throw new Error("Unsupported form endpoint protocol");
      }

      const response = await fetch(parsedEndpoint.href, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Form endpoint returned ${response.status}`);
      }

      form.reset();
      fields.forEach((field) => field.removeAttribute("aria-invalid"));
      status.textContent =
        "Thank you. If the pilot appears suitable, you will receive separate secure-upload instructions. No files were collected here.";
      status.focus();
    } catch (_error) {
      status.textContent =
        "Your inquiry could not be sent. Please try again after the submission endpoint is verified.";
      status.classList.add("is-error");
      status.focus();
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Request pilot conversation";
    }
  });
}

function initializeFooter() {
  const year = document.querySelector("[data-current-year]");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initializeNavigation();
  initializePreviewModal();
  initializeDownloads();
  initializeLeadForm();
  initializeFooter();
});
