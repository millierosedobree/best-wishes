(function () {
  const STORAGE_KEY = "galleryAdminToken";
  const API_ROOT =
    window.location.hostname === "localhost" && window.location.port === "3333"
      ? "http://localhost:3337"
      : "";

  const SYMBOL_OPTIONS = [
    { value: "music", label: "Notation (boxed)" },
    { value: "bwSerif", label: "bw, serif" },
    { value: "bwBrush", label: "bw, brush" },
    { value: "bc", label: "BC flourish" },
    { value: "custom", label: "Custom image / SVG" },
  ];

  const loginPanel = document.getElementById("loginPanel");
  const editorPanel = document.getElementById("editorPanel");
  const adminTokenInput = document.getElementById("adminToken");
  const btnLogin = document.getElementById("btnLogin");
  const loginError = document.getElementById("loginError");
  const showList = document.getElementById("showList");
  const btnAddShow = document.getElementById("btnAddShow");
  const btnSave = document.getElementById("btnSave");
  const saveError = document.getElementById("saveError");
  const saveStatus = document.getElementById("saveStatus");

  let shows = [];
  let token = sessionStorage.getItem(STORAGE_KEY) || "";

  function apiUrl(path) {
    return `${API_ROOT}${path}`;
  }

  function authHeaders() {
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.classList.remove("hidden");
  }

  function clearLoginError() {
    loginError.textContent = "";
    loginError.classList.add("hidden");
  }

  function showSaveError(msg) {
    saveError.textContent = msg;
    saveError.classList.remove("hidden");
  }

  function clearSaveError() {
    saveError.textContent = "";
    saveError.classList.add("hidden");
  }

  function slugId(base) {
    const s = String(base || "show")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
    return s || `show-${Date.now()}`;
  }

  function uniqueId(preferred) {
    let id = slugId(preferred);
    const existing = new Set(shows.map((x) => x.id));
    if (!existing.has(id)) return id;
    let n = 2;
    while (existing.has(`${id}-${n}`)) n += 1;
    return `${id}-${n}`;
  }

  function wrapBodyMarker(ta, marker) {
    if (!ta || typeof ta.selectionStart !== "number") return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = ta.value;
    const selected = val.slice(start, end);

    if (!selected) {
      if (marker === "**") {
        const insert = "****";
        ta.value = val.slice(0, start) + insert + val.slice(end);
        ta.focus();
        ta.setSelectionRange(start + 2, start + 2);
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
      const insert = "*\u00b7*";
      ta.value = val.slice(0, start) + insert + val.slice(end);
      ta.focus();
      ta.setSelectionRange(start + 1, start + 2);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    const out = marker + selected + marker;
    ta.value = val.slice(0, start) + out + val.slice(end);
    const innerStart = start + marker.length;
    const innerEnd = innerStart + selected.length;
    ta.focus();
    ta.setSelectionRange(innerStart, innerEnd);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function loadShows() {
    const res = await fetch(apiUrl("/api/shows"));
    if (!res.ok) throw new Error("Could not load shows");
    const data = await res.json();
    shows = Array.isArray(data.shows) ? data.shows.map(normalizeShow) : [];
  }

  async function checkAdminToken() {
    const res = await fetch(apiUrl("/api/admin/check"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Invalid admin token");
    }
  }

  function normalizeShow(s) {
    let images = [];
    if (Array.isArray(s.images)) images = s.images.map(String);
    else if (s.image) images = [String(s.image)];
    images = images.map((u) => u.trim()).filter(Boolean);
    const rawCaptions = Array.isArray(s.imageCaptions) ? s.imageCaptions.map((c) => String(c ?? "")) : [];
    const imageCaptions = images.map((_, i) => String(rawCaptions[i] ?? ""));
    return {
      id: String(s.id || "").trim() || uniqueId("show"),
      label: String(s.label ?? ""),
      title: String(s.title ?? ""),
      text: String(s.text ?? ""),
      images,
      imageCaptions,
      image: images[0] || "",
      cardColor: String(s.cardColor ?? "").trim(),
      symbol: SYMBOL_OPTIONS.some((o) => o.value === s.symbol) ? s.symbol : "music",
      symbolAsset: String(s.symbolAsset ?? ""),
    };
  }

  function imageRowsHtml(show) {
    let urls = Array.isArray(show.images) ? [...show.images] : [];
    if (!urls.length && show.image) urls = [String(show.image)];
    if (!urls.length) urls = [""];
    const captions = Array.isArray(show.imageCaptions) ? show.imageCaptions : [];
    const onlySlot = urls.length <= 1;
    return urls
      .map(
        (url, i) => `
    <div class="image-row" data-image-row>
      <input type="text" class="mono" data-image-url value="${escapeAttr(url)}" placeholder="https://… or /uploads/…" />
      <div class="image-caption-field">
        <input type="text" data-image-caption value="${escapeAttr(captions[i] || "")}" placeholder="Caption — e.g. Name, *title*, 2027" title="Use **word** for bold and *word* for italic (same as body text)" />
        <div class="caption-format-bar" role="group" aria-label="Caption style">
          <button type="button" class="btn btn-secondary btn-tiny" data-caption-format="**" title="Bold (wrap selection)">B</button>
          <button type="button" class="btn btn-secondary btn-tiny" data-caption-format="*" title="Italic (wrap selection)">I</button>
        </div>
      </div>
      <div class="image-row-actions">
        <input type="file" data-upload="image" accept="image/*" class="hidden" />
        <button type="button" class="btn btn-secondary btn-small" data-pick="image">Upload</button>
        <button type="button" class="btn btn-secondary btn-small" data-remove-image ${onlySlot && !String(url).trim() ? "disabled" : ""}>${onlySlot ? "Clear image" : "Remove"}</button>
      </div>
    </div>`,
      )
      .join("");
  }

  function hexForSwatch(color) {
    const s = String(color || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      const r = s[1];
      const g = s[2];
      const b = s[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return "#b8ff2e";
  }

  function render() {
    showList.innerHTML = "";
    shows.forEach((show, index) => {
      const card = document.createElement("div");
      card.className = "show-card";
      card.dataset.index = String(index);

      const symSelect = SYMBOL_OPTIONS.map(
        (o) =>
          `<option value="${o.value}" ${show.symbol === o.value ? "selected" : ""}>${o.label}</option>`,
      ).join("");

      const customHidden = show.symbol !== "custom" ? "hidden" : "";
      const cardColorVal = show.cardColor || "#b8ff2e";

      card.innerHTML = `
        <div class="show-actions">
          <strong class="mono">${escapeHtml(show.id)}</strong>
          <button type="button" class="btn btn-secondary btn-small" data-action="up" ${index === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="btn btn-secondary btn-small" data-action="down" ${index === shows.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" class="btn btn-secondary btn-small" data-action="remove">Remove</button>
        </div>
        <div class="grid">
          <div class="row">
            <label>Nav label</label>
            <input type="text" data-field="label" value="${escapeAttr(show.label)}" title="Shown on the tab / screen readers" />
          </div>
          <div class="row grid-two">
            <div>
              <label>Show ID</label>
              <input type="text" data-field="id" class="mono" value="${escapeAttr(show.id)}" title="URL hash and HTML id; letters, numbers, - and _ only" />
            </div>
            <div>
              <label>Symbol</label>
              <select data-field="symbol">${symSelect}</select>
            </div>
          </div>
          <div class="row custom-asset ${customHidden}" data-custom-wrap>
            <label title="PNG, SVG, JPG, or paste a /uploads/… URL">Custom symbol</label>
            <div class="btn-row">
              <input type="text" data-field="symbolAsset" class="mono" value="${escapeAttr(show.symbolAsset)}" placeholder="/uploads/your-icon.svg" />
              <input type="file" data-upload="symbol" accept="image/*,.svg" class="hidden" />
              <button type="button" class="btn btn-secondary btn-small" data-pick="symbol">Upload</button>
            </div>
          </div>
          <div class="row field-title-row">
            <label>Title</label>
            <div class="title-format-wrap">
              <input
                type="text"
                data-field="title"
                class="title-prose-input"
                value="${escapeAttr(show.title)}"
                placeholder="e.g. *Winter* scores"
                title="Same as body: **bold** and *italic*"
              />
              <div class="title-format-bar" role="group" aria-label="Title formatting">
                <button type="button" class="btn btn-secondary btn-small" data-title-format="**">Bold</button>
                <button type="button" class="btn btn-secondary btn-small" data-title-format="*">Italic</button>
              </div>
            </div>
          </div>
          <div class="row grid-two">
            <div>
              <label>Card color (picker)</label>
              <input type="color" data-color-swatch value="${escapeAttr(hexForSwatch(cardColorVal))}" aria-label="Card background color" />
            </div>
            <div>
              <label>Card color (CSS)</label>
              <input type="text" data-field="cardColor" class="mono" value="${escapeAttr(cardColorVal)}" placeholder="#b8ff2e or rgb(…)" />
            </div>
          </div>
          <div class="row">
            <label>Images</label>
            <div class="image-rows" data-image-rows>
              ${imageRowsHtml(show)}
            </div>
            <button type="button" class="btn btn-secondary btn-small" data-add-image>Add image</button>
          </div>
          <div class="row row--body field-body">
            <label>Body text</label>
            <div class="body-format-bar" role="toolbar" aria-label="Insert bold or italic markers">
              <button type="button" class="btn btn-secondary btn-small" data-format-bold>Bold</button>
              <button type="button" class="btn btn-secondary btn-small" data-format-italic>Italic</button>
              <span class="body-format-hint"><span class="mono">**bold**</span> · <span class="mono">*italic*</span> · Ctrl/⌘+B or +I</span>
            </div>
            <textarea data-field="text" class="admin-body-text" rows="3" spellcheck="true" title="**bold** and *italic* markers; grows while focused"></textarea>
          </div>
        </div>
      `;

      card.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const action = btn.getAttribute("data-action");
          const i = Number(card.dataset.index);
          if (action === "up" && i > 0) {
            [shows[i - 1], shows[i]] = [shows[i], shows[i - 1]];
            render();
          } else if (action === "down" && i < shows.length - 1) {
            [shows[i + 1], shows[i]] = [shows[i], shows[i + 1]];
            render();
          } else if (action === "remove") {
            if (shows.length <= 1) {
              showSaveError("Keep at least one show.");
              return;
            }
            shows.splice(i, 1);
            render();
          }
        });
      });

      card.querySelectorAll("input, select, textarea").forEach((el) => {
        const field = el.getAttribute("data-field");
        if (!field) return;
        el.addEventListener("input", () => syncCardFromDom(card, index));
        el.addEventListener("change", () => syncCardFromDom(card, index));
      });

      card.querySelectorAll("[data-image-url], [data-image-caption]").forEach((el) => {
        el.addEventListener("input", () => syncCardFromDom(card, index));
        el.addEventListener("change", () => syncCardFromDom(card, index));
      });

      card.querySelectorAll("[data-caption-format]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = btn.closest(".image-row");
          const cap = row?.querySelector("[data-image-caption]");
          const kind = btn.getAttribute("data-caption-format");
          if (!cap || !kind) return;
          wrapBodyMarker(cap, kind);
        });
      });

      const titleInput = card.querySelector('[data-field="title"]');
      card.querySelectorAll("[data-title-format]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const kind = btn.getAttribute("data-title-format");
          if (!titleInput || !kind) return;
          wrapBodyMarker(titleInput, kind);
        });
      });
      titleInput?.addEventListener("keydown", (e) => {
        if (e.metaKey || e.ctrlKey) {
          const k = e.key.toLowerCase();
          if (k === "b") {
            e.preventDefault();
            wrapBodyMarker(titleInput, "**");
          } else if (k === "i") {
            e.preventDefault();
            wrapBodyMarker(titleInput, "*");
          }
        }
      });

      const symbolSelect = card.querySelector('[data-field="symbol"]');
      symbolSelect.addEventListener("change", () => {
        syncCardFromDom(card, index);
        const wrap = card.querySelector("[data-custom-wrap]");
        if (shows[index].symbol === "custom") {
          wrap.classList.remove("hidden");
        } else {
          wrap.classList.add("hidden");
        }
      });

      card.querySelectorAll("[data-pick]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const kind = btn.getAttribute("data-pick");
          const row = btn.closest(".image-row");
          if (kind === "image" && row) {
            row.querySelector(`[data-upload="${kind}"]`)?.click();
            return;
          }
          const input = card.querySelector(`[data-upload="${kind}"]`);
          if (input) input.click();
        });
      });

      card.querySelectorAll("[data-upload]").forEach((fileInput) => {
        fileInput.addEventListener("change", async () => {
          const f = fileInput.files && fileInput.files[0];
          fileInput.value = "";
          if (!f) return;
          const kind = fileInput.getAttribute("data-upload");
          try {
            const url = await uploadFile(f);
            const i = Number(card.dataset.index);
            if (kind === "image") {
              const row = fileInput.closest(".image-row");
              const urlInput = row && row.querySelector("[data-image-url]");
              if (urlInput) urlInput.value = url;
              syncCardFromDom(card, i);
            } else if (kind === "symbol") {
              shows[i].symbol = "custom";
              shows[i].symbolAsset = url;
              card.querySelector('[data-field="symbol"]').value = "custom";
              card.querySelector('[data-field="symbolAsset"]').value = url;
              card.querySelector("[data-custom-wrap]").classList.remove("hidden");
            }
            clearSaveError();
            flashStatus("Uploaded");
          } catch (e) {
            showSaveError(e.message || String(e));
          }
        });
      });

      const swatch = card.querySelector("[data-color-swatch]");
      const colorText = card.querySelector('[data-field="cardColor"]');
      if (swatch && colorText) {
        swatch.addEventListener("input", () => {
          colorText.value = swatch.value;
          syncCardFromDom(card, index);
        });
        colorText.addEventListener("input", () => {
          swatch.value = hexForSwatch(colorText.value);
        });
      }

      card.querySelector("[data-add-image]")?.addEventListener("click", () => {
        const i = Number(card.dataset.index);
        const raw = Array.from(card.querySelectorAll("[data-image-url]")).map((el) => el.value.trim());
        const rawCaptions = Array.from(card.querySelectorAll("[data-image-caption]")).map((el) => el.value.trim());
        raw.push("");
        rawCaptions.push("");
        shows[i].images = raw;
        shows[i].imageCaptions = rawCaptions;
        render();
      });

      card.querySelectorAll("[data-remove-image]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = btn.closest(".image-row");
          const showCard = btn.closest(".show-card");
          if (!row || !showCard) return;
          const cardIndex = Number.parseInt(showCard.getAttribute("data-index"), 10);
          if (!Number.isFinite(cardIndex) || !shows[cardIndex]) return;

          const rows = showCard.querySelectorAll(".image-row");
          const ix = [...rows].indexOf(row);
          if (ix < 0) return;

          const raw = Array.from(showCard.querySelectorAll("[data-image-url]")).map((el) => el.value.trim());
          const rawCaptions = Array.from(showCard.querySelectorAll("[data-image-caption]")).map((el) => el.value.trim());

          if (rows.length <= 1) {
            raw[ix] = "";
            if (rawCaptions[ix] !== undefined) rawCaptions[ix] = "";
          } else {
            raw.splice(ix, 1);
            rawCaptions.splice(ix, 1);
          }

          shows[cardIndex].images = raw.length ? raw : [""];
          while (rawCaptions.length < shows[cardIndex].images.length) rawCaptions.push("");
          shows[cardIndex].imageCaptions = rawCaptions.slice(0, shows[cardIndex].images.length);
          render();
        });
      });

      const ta = card.querySelector('[data-field="text"]');
      if (ta) ta.value = show.text;

      const bodyTa = card.querySelector('[data-field="text"]');
      card.querySelector("[data-format-bold]")?.addEventListener("click", () => wrapBodyMarker(bodyTa, "**"));
      card.querySelector("[data-format-italic]")?.addEventListener("click", () => wrapBodyMarker(bodyTa, "*"));
      bodyTa?.addEventListener("keydown", (e) => {
        if (e.metaKey || e.ctrlKey) {
          const k = e.key.toLowerCase();
          if (k === "b") {
            e.preventDefault();
            wrapBodyMarker(bodyTa, "**");
          } else if (k === "i") {
            e.preventDefault();
            wrapBodyMarker(bodyTa, "*");
          }
        }
      });

      showList.appendChild(card);
    });

    showList.querySelectorAll(".show-card").forEach((card) => {
      const idx = Number(card.dataset.index);
      syncCardFromDom(card, idx);
    });
  }

  function syncCardFromDom(card, index) {
    const s = shows[index];
    if (!s) return;
    card.querySelectorAll("[data-field]").forEach((el) => {
      const field = el.getAttribute("data-field");
      if (field === "text") s[field] = el.value;
      else s[field] = el.value.trim();
    });
    s.images = Array.from(card.querySelectorAll("[data-image-url]")).map((el) => el.value.trim());
    s.imageCaptions = Array.from(card.querySelectorAll("[data-image-caption]")).map((el) => el.value.trim());
    if (s.imageCaptions.length < s.images.length) {
      while (s.imageCaptions.length < s.images.length) s.imageCaptions.push("");
    } else if (s.imageCaptions.length > s.images.length) {
      s.imageCaptions = s.imageCaptions.slice(0, s.images.length);
    }
    s.image = s.images.find(Boolean) || "";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  async function uploadFile(file) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(apiUrl("/api/upload"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || res.statusText || "Upload failed");
    }
    return data.url;
  }

  function flashStatus(msg) {
    saveStatus.textContent = msg;
    saveStatus.classList.remove("hidden");
    window.clearTimeout(flashStatus._t);
    flashStatus._t = window.setTimeout(() => {
      saveStatus.classList.add("hidden");
    }, 2200);
  }

  async function saveAll() {
    clearSaveError();
    document.querySelectorAll(".show-card").forEach((card) => {
      const idx = Number(card.dataset.index);
      syncCardFromDom(card, idx);
    });

    shows = shows.map(normalizeShow);
    const ids = new Set();
    for (const s of shows) {
      if (!s.id) {
        showSaveError("Each show needs an ID.");
        return;
      }
      if (ids.has(s.id)) {
        showSaveError(`Duplicate id: ${s.id}`);
        return;
      }
      ids.add(s.id);
    }

    const res = await fetch(apiUrl("/api/shows"), {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ shows }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data.error || res.statusText || "Save failed";
      showSaveError(res.status === 401 ? "Unauthorized. Enter the correct admin token and try again." : message);
      if (res.status === 401) {
        sessionStorage.removeItem(STORAGE_KEY);
        token = "";
        editorPanel.classList.add("hidden");
        loginPanel.classList.remove("hidden");
        adminTokenInput.value = "";
        showLoginError("Your admin token was rejected. Enter the token from `.env` and continue.");
      }
      return;
    }
    shows = data.shows.map(normalizeShow);
    flashStatus("Saved");
    render();
  }

  async function tryEnter() {
    clearLoginError();
    token = adminTokenInput.value.trim();
    if (!token) {
      showLoginError("Enter the admin token from your .env file.");
      return;
    }
    try {
      await checkAdminToken();
      sessionStorage.setItem(STORAGE_KEY, token);
      await loadShows();
      loginPanel.classList.add("hidden");
      editorPanel.classList.remove("hidden");
      render();
    } catch (e) {
      sessionStorage.removeItem(STORAGE_KEY);
      token = "";
      showLoginError(e.message || String(e));
    }
  }

  btnLogin.addEventListener("click", tryEnter);
  adminTokenInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryEnter();
  });

  btnAddShow.addEventListener("click", () => {
    const id = uniqueId("show");
    shows.push({
      id,
      label: "New show",
      title: "Untitled",
      text: "",
      images: [""],
      imageCaptions: [""],
      image: "",
      cardColor: "#b8ff2e",
      symbol: "music",
      symbolAsset: "",
    });
    render();
  });

  btnSave.addEventListener("click", () => {
    saveAll().catch((e) => showSaveError(e.message || String(e)));
  });

  (async function init() {
    if (token) {
      adminTokenInput.value = token;
      try {
        await checkAdminToken();
        await loadShows();
        loginPanel.classList.add("hidden");
        editorPanel.classList.remove("hidden");
        render();
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
        token = "";
      }
    }
  })();
})();
