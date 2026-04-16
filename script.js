(function () {
  const icons = {
    music: `
      <svg class="nav-icon nav-icon--boxed" viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="1" y="1" width="70" height="70" fill="none" stroke="currentColor" stroke-width="1.5"/>
        <path fill="none" stroke="currentColor" stroke-width="1.2" d="M14 52c0-6 4-10 10-10s10 4 10 10M34 52V22l8-4v34M46 52V26l6-3v29"/>
        <ellipse cx="24" cy="52" rx="2.5" ry="2" fill="currentColor"/>
        <ellipse cx="44" cy="52" rx="2.5" ry="2" fill="currentColor"/>
        <path fill="none" stroke="currentColor" stroke-width="1" d="M52 18c3 8 6 14 10 18M18 20c4 3 7 8 9 14"/>
      </svg>`,
    bwSerif: `
      <svg class="nav-icon" viewBox="0 0 88 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <text x="4" y="32" font-family="Georgia, Times, serif" font-size="28" fill="currentColor">bw,</text>
      </svg>`,
    bwBrush: `
      <svg class="nav-icon" viewBox="0 0 100 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <text x="2" y="22" font-family="Georgia, Times, serif" font-size="18" fill="currentColor">b</text>
        <path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" d="M22 28c8-14 22-22 38-18 10 2 16 10 18 20" />
        <text x="58" y="32" font-family="Georgia, Times, serif" font-size="20" fill="currentColor">,</text>
      </svg>`,
    bc: `
      <svg class="nav-icon" viewBox="0 0 120 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <text x="4" y="34" font-family="Georgia, Times, serif" font-size="36" font-weight="700" fill="currentColor">B</text>
        <path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M38 30c12-8 28-6 38 4s12 22 4 34c-6 8-16 10-26 8M76 14c6 4 14 18 18 32 4 14 4 26-2 34"/>
      </svg>`,
  };

  const iconOrder = ["music", "bwSerif", "bwBrush", "bc"];

  const navScroll = document.getElementById("navScroll");
  const viewerInner = document.getElementById("viewerInner");
  const viewerFigures = document.getElementById("viewerFigures");
  const viewerTitle = document.getElementById("viewerTitle");
  const viewerText = document.getElementById("viewerText");
  const viewer = document.getElementById("viewer");
  const viewerPanel = document.getElementById("viewerPanel");
  const imageLightbox = document.getElementById("imageLightbox");
  const imageLightboxImg = imageLightbox?.querySelector(".image-lightbox__img");
  const imageLightboxCaption = imageLightbox?.querySelector(".image-lightbox__caption");
  const imageLightboxPrev = imageLightbox?.querySelector(".image-lightbox__prev");
  const imageLightboxNext = imageLightbox?.querySelector(".image-lightbox__next");
  const imageLightboxCloseBtns = imageLightbox
    ? imageLightbox.querySelectorAll(".image-lightbox__close, .image-lightbox__scrim")
    : [];
  const navScrollFrame = navScroll?.closest(".nav-scroll-frame") ?? null;

  let shows = [];
  let lightboxReturnFocus = null;
  let lightboxCloseFallbackTimer = null;
  let lightboxUrls = [];
  let lightboxCaptions = [];
  let lightboxIndex = 0;
  let lightboxChromeIdleTimer = null;
  let lightboxChromeMoveRaf = null;
  let lightboxChromeStageEl = null;
  let lightboxChromeTouchHandler = null;
  let lightboxSwipeHandler = null;
  let lightboxSwipeState = null;
  /** Idle time before × / arrows auto-hide again. */
  const LIGHTBOX_CHROME_IDLE_MS = 2200;
  const LIGHTBOX_SWIPE_MIN_PX = 44;
  const LIGHTBOX_SWIPE_AXIS_RATIO = 1.2;
  let currentIndex = -1;

  function prefersLightboxChromeIdle() {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }

  function safeUrl(u) {
    const s = String(u || "").trim();
    if (!s) return "";
    if (s.startsWith("//")) return "";
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith("/")) return s;
    return "";
  }

  function normalizeShow(s) {
    const symbolKeys = new Set(Object.keys(icons));
    let sym = s.symbol === "custom" ? "custom" : symbolKeys.has(s.symbol) ? s.symbol : "music";
    let id = String(s.id || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
    if (!id) id = "show";
    let images = [];
    if (Array.isArray(s.images) && s.images.length) {
      images = s.images.map((u) => safeUrl(u) || "").filter(Boolean);
    }
    if (!images.length) {
      const one = safeUrl(s.image) || String(s.image || "").trim();
      if (one) images = [one];
    }
    const rawCaptions = Array.isArray(s.imageCaptions) ? s.imageCaptions.map((c) => String(c ?? "")) : [];
    const imageCaptions = images.map((_, i) => String(rawCaptions[i] ?? ""));
    const cardColor = String(s.cardColor ?? "").trim();
    return {
      id,
      label: String(s.label ?? ""),
      title: String(s.title ?? ""),
      text: String(s.text ?? ""),
      image: images[0] || "",
      images,
      imageCaptions,
      cardColor,
      symbol: sym,
      symbolAsset: safeUrl(s.symbolAsset) || String(s.symbolAsset || "").trim(),
    };
  }

  function presetKeyForShow(show, index) {
    if (show.symbol && show.symbol !== "custom" && icons[show.symbol]) {
      return show.symbol;
    }
    return iconOrder[index % iconOrder.length];
  }

  function setNavIcon(btn, show, index) {
    btn.replaceChildren();
    if (show.symbol === "custom" && safeUrl(show.symbolAsset)) {
      const img = document.createElement("img");
      img.src = safeUrl(show.symbolAsset);
      img.className = "nav-icon nav-icon--custom";
      img.alt = "";
      img.decoding = "async";
      img.addEventListener("load", updateNavScrollAffordance, { once: true });
      btn.appendChild(img);
      return;
    }
    const key = presetKeyForShow(show, index);
    const wrap = document.createElement("div");
    wrap.innerHTML = icons[key] || icons.music;
    while (wrap.firstChild) {
      btn.appendChild(wrap.firstChild);
    }
  }

  async function loadShows() {
    const applyPayload = (data) => {
      if (data && Array.isArray(data.shows) && data.shows.length) {
        shows = data.shows.map(normalizeShow);
        return true;
      }
      return false;
    };

    try {
      const res = await fetch("/api/shows", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (applyPayload(data)) return;
      }
    } catch {
      /* fall through to static default */
    }

    try {
      const res = await fetch("/data/default-shows.json");
      if (res.ok) {
        const data = await res.json();
        if (applyPayload(data)) return;
      }
    } catch {
      /* offline or missing file */
    }

    shows = [];
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /** Inline markers: **bold**, *italic* (safe DOM; no HTML in source). */
  function appendFormattedLine(parent, line) {
    let i = 0;
    while (i < line.length) {
      if (line[i] === "*" && line[i + 1] === "*") {
        const end = line.indexOf("**", i + 2);
        if (end === -1) {
          parent.appendChild(document.createTextNode("**"));
          i += 2;
          continue;
        }
        const bold = document.createElement("strong");
        bold.textContent = line.slice(i + 2, end);
        parent.appendChild(bold);
        i = end + 2;
        continue;
      }
      if (line[i] === "*") {
        const end = line.indexOf("*", i + 1);
        if (end !== -1) {
          const mid = line.slice(i + 1, end);
          if (!mid.includes("*")) {
            const em = document.createElement("em");
            em.textContent = mid;
            parent.appendChild(em);
            i = end + 1;
            continue;
          }
        }
        parent.appendChild(document.createTextNode(line[i]));
        i += 1;
        continue;
      }
      parent.appendChild(document.createTextNode(line[i]));
      i += 1;
    }
  }

  /** Same markers as body text: **bold**, *italic* (newlines preserved). */
  function renderFormattedRichText(el, raw) {
    el.replaceChildren();
    const s = String(raw ?? "");
    if (!s) return;
    const lines = s.split("\n");
    lines.forEach((line, idx) => {
      appendFormattedLine(el, line);
      if (idx < lines.length - 1) {
        el.appendChild(document.createTextNode("\n"));
      }
    });
  }

  /** Plain string for img alt / ARIA (strips ** and * markup). */
  function stripRichMarkers(raw) {
    let s = String(raw ?? "");
    let prev;
    do {
      prev = s;
      s = s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
    } while (s !== prev);
    return s.replace(/\*\*/g, "").replace(/\*/g, "").trim();
  }

  function updateNavScrollAffordance() {
    if (!navScroll || !navScrollFrame) return;
    const { scrollLeft, scrollWidth, clientWidth } = navScroll;
    const overflow = scrollWidth > clientWidth + 2;
    if (!overflow) {
      navScrollFrame.classList.remove("nav-scroll-frame--more-left", "nav-scroll-frame--more-right");
      navScroll.setAttribute("aria-label", "Shows");
      return;
    }
    navScrollFrame.classList.toggle("nav-scroll-frame--more-left", scrollLeft > 2);
    navScrollFrame.classList.toggle("nav-scroll-frame--more-right", scrollLeft + clientWidth < scrollWidth - 2);
    navScroll.setAttribute("aria-label", "Shows — scroll sideways for more");
  }

  if (navScroll && navScrollFrame) {
    navScroll.addEventListener("scroll", updateNavScrollAffordance, { passive: true });
    window.addEventListener("resize", updateNavScrollAffordance, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => updateNavScrollAffordance()).observe(navScroll);
    }
  }

  function setViewerLabelledBy(showId) {
    viewer.setAttribute("aria-labelledby", `tab-${showId}`);
  }

  function applyDeepLink(showId) {
    if (!showId) return;
    const encoded = encodeURIComponent(showId);
    if (window.location.hash === `#${encoded}`) return;
    history.replaceState(null, "", `#${encoded}`);
  }

  function revealViewerContentWhenReady() {
    if (viewerPanel.classList.contains("viewer-panel--content-visible")) {
      return;
    }

    const markReady = () => {
      viewerPanel.classList.add("viewer-panel--content-visible");
    };

    if (prefersReducedMotion()) {
      markReady();
      return;
    }

    const onEnd = (e) => {
      if (e.target !== viewerPanel || e.propertyName !== "grid-template-rows") return;
      viewerPanel.removeEventListener("transitionend", onEnd);
      clearTimeout(fallback);
      markReady();
    };

    viewerPanel.addEventListener("transitionend", onEnd);
    const fallback = window.setTimeout(() => {
      viewerPanel.removeEventListener("transitionend", onEnd);
      markReady();
    }, 450);
  }

  function openViewer() {
    viewerPanel.classList.add("viewer-panel--open");
    viewerPanel.setAttribute("aria-hidden", "false");
    viewer.setAttribute("aria-hidden", "false");
    revealViewerContentWhenReady();
  }

  function setImageWithFade(img, url) {
    const src = safeUrl(url);
    if (!src) {
      img.removeAttribute("src");
      img.classList.remove("is-loading");
      return;
    }
    img.classList.add("is-loading");
    const done = () => img.classList.remove("is-loading");
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
    img.src = src;
    if (img.complete) {
      requestAnimationFrame(done);
    }
  }

  function scrollViewerTop(smooth) {
    if (smooth && !prefersReducedMotion()) {
      viewer.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      viewer.scrollTop = 0;
    }
  }

  function applyShow(show, index, options = {}) {
    const { scrollViewer = true, scrollTabIntoView = true, updateHash = true } = options;

    if (imageLightbox && imageLightboxImg?.getAttribute("src")) {
      lightboxReturnFocus = null;
      closeImageLightbox({ instant: true });
    }

    const urls = Array.isArray(show.images) && show.images.length ? show.images : show.image ? [show.image] : [];
    const captions = Array.isArray(show.imageCaptions) ? show.imageCaptions : [];
    viewerFigures.replaceChildren();
    let visibleIndex = 0;
    urls.forEach((u, i) => {
      const src = safeUrl(u);
      if (!src) return;
      const fig = document.createElement("figure");
      fig.className = "viewer-figure";
      const zoomBtn = document.createElement("button");
      zoomBtn.type = "button";
      zoomBtn.className = "viewer-figure__open";
      const titlePlain = stripRichMarkers(show.title);
      const alt = urls.length > 1 ? `${titlePlain} (${i + 1})` : titlePlain;
      zoomBtn.setAttribute("aria-label", `View full size: ${alt}`);
      zoomBtn.setAttribute("data-lightbox-index", String(visibleIndex));
      const img = document.createElement("img");
      img.alt = alt;
      img.loading = i === 0 ? "eager" : "lazy";
      img.decoding = "async";
      if (i === 0) img.fetchPriority = "high";
      setImageWithFade(img, src);
      zoomBtn.appendChild(img);
      fig.appendChild(zoomBtn);
      const captionText = String(captions[i] || "").trim();
      if (captionText) {
        const caption = document.createElement("figcaption");
        caption.className = "viewer-figure__caption rich-text";
        renderFormattedRichText(caption, captionText);
        fig.appendChild(caption);
      }
      viewerFigures.appendChild(fig);
      visibleIndex += 1;
    });

    const bg = String(show.cardColor || "").trim();
    viewer.style.setProperty("--viewer-bg", bg || "#ffffff");

    renderFormattedRichText(viewerTitle, show.title);
    renderFormattedRichText(viewerText, show.text);
    setViewerLabelledBy(show.id);
    if (updateHash) applyDeepLink(show.id);
    openViewer();

    navScroll.querySelectorAll(".nav-btn").forEach((btn, i) => {
      btn.setAttribute("aria-selected", i === index ? "true" : "false");
    });

    if (scrollTabIntoView) {
      const tab = navScroll.querySelector(`[data-index="${index}"]`);
      if (tab) {
        tab.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          inline: "nearest",
          block: "nearest",
        });
      }
    }

    currentIndex = index;
    if (scrollViewer) {
      scrollViewerTop(true);
    }
  }

  function selectShow(index, { instant = false, updateHash = true } = {}) {
    const show = shows[index];
    if (!show) return;
    if (!instant && index === currentIndex) return;

    const snapOpts = { scrollViewer: !instant, scrollTabIntoView: !instant, updateHash };

    if (instant || prefersReducedMotion()) {
      applyShow(show, index, { scrollViewer: !instant, scrollTabIntoView: !instant, updateHash });
      if (instant) {
        viewer.scrollTop = 0;
      }
      return;
    }

    // Re-run content reveal timing on every symbol switch so copy appears
    // after the card has mostly finished its visual transition.
    viewerPanel.classList.remove("viewer-panel--content-visible");

    if (typeof document.startViewTransition === "function") {
      document.startViewTransition(() => {
        applyShow(show, index, snapOpts);
      });
      return;
    }

    viewerInner.classList.add("viewer-inner--exit");
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(safety);
      applyShow(show, index, snapOpts);
      requestAnimationFrame(() => {
        viewerInner.classList.remove("viewer-inner--exit");
      });
    };

    const onEnd = (e) => {
      if (e.target !== viewerInner || e.propertyName !== "opacity") return;
      viewerInner.removeEventListener("transitionend", onEnd);
      finish();
    };

    viewerInner.addEventListener("transitionend", onEnd);
    const safety = window.setTimeout(finish, 600);
  }

  function renderNav() {
    navScroll.innerHTML = "";
    shows.forEach((show, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nav-btn";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", "false");
      btn.setAttribute("aria-controls", "viewer");
      btn.setAttribute("id", `tab-${show.id}`);
      btn.setAttribute("data-index", String(index));
      setNavIcon(btn, show, index);
      btn.setAttribute("aria-label", show.label || stripRichMarkers(show.title) || "Show");
      btn.addEventListener("click", () => selectShow(index));
      navScroll.appendChild(btn);
    });
    void navScroll.offsetWidth;
    updateNavScrollAffordance();
    requestAnimationFrame(updateNavScrollAffordance);
  }

  function showFromHash() {
    const raw = decodeURIComponent(window.location.hash.replace(/^#/, "").trim());
    if (!raw) return false;
    const idx = shows.findIndex((s) => s.id === raw);
    if (idx < 0) return false;
    selectShow(idx, { instant: true, updateHash: false });
    return true;
  }

  function focusWithoutScroll(el) {
    if (!el || typeof el.focus !== "function") return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      try {
        el.focus();
      } catch {
        /* detached */
      }
    }
  }

  function detachLightboxChromeUi() {
    if (lightboxChromeIdleTimer !== null) {
      window.clearTimeout(lightboxChromeIdleTimer);
      lightboxChromeIdleTimer = null;
    }
    if (lightboxChromeMoveRaf !== null) {
      cancelAnimationFrame(lightboxChromeMoveRaf);
      lightboxChromeMoveRaf = null;
    }
    if (lightboxChromeStageEl) {
      lightboxChromeStageEl.removeEventListener("mousemove", onLightboxStageMouseMove);
      lightboxChromeStageEl.removeEventListener("mouseenter", onLightboxStageMouseEnter);
      lightboxChromeStageEl.removeEventListener("mouseleave", onLightboxStageMouseLeave);
      if (lightboxChromeTouchHandler) {
        lightboxChromeStageEl.removeEventListener("pointerdown", lightboxChromeTouchHandler);
        lightboxChromeStageEl.removeEventListener("pointermove", lightboxChromeTouchHandler);
        lightboxChromeTouchHandler = null;
      }
      if (lightboxSwipeHandler) {
        lightboxChromeStageEl.removeEventListener("pointerdown", lightboxSwipeHandler);
        lightboxChromeStageEl.removeEventListener("pointerup", lightboxSwipeHandler);
        lightboxChromeStageEl.removeEventListener("pointercancel", lightboxSwipeHandler);
        lightboxSwipeHandler = null;
      }
      lightboxSwipeState = null;
      lightboxChromeStageEl = null;
    }
    imageLightbox?.classList.remove("image-lightbox--chrome");
  }

  function keyboardKeepsLightboxChromeVisible() {
    // Keep this behavior for desktop keyboard focus only.
    // On touch devices, focused controls should not block idle auto-hide.
    if (!prefersLightboxChromeIdle()) return false;
    const a = document.activeElement;
    if (!a || !imageLightbox?.contains(a)) return false;
    const chrome =
      a.classList.contains("image-lightbox__close") ||
      a.classList.contains("image-lightbox__prev") ||
      a.classList.contains("image-lightbox__next");
    if (!chrome) return false;
    try {
      return a.matches(":focus-visible");
    } catch {
      return true;
    }
  }

  function hideLightboxChromeForPointer() {
    if (lightboxChromeIdleTimer !== null) {
      window.clearTimeout(lightboxChromeIdleTimer);
      lightboxChromeIdleTimer = null;
    }
    if (!imageLightbox?.classList.contains("image-lightbox--active")) return;
    if (keyboardKeepsLightboxChromeVisible()) return;
    imageLightbox.classList.remove("image-lightbox--chrome");
  }

  function bumpLightboxChrome() {
    if (!imageLightbox?.classList.contains("image-lightbox--active")) return;
    imageLightbox.classList.add("image-lightbox--chrome");
    if (lightboxChromeIdleTimer !== null) {
      window.clearTimeout(lightboxChromeIdleTimer);
      lightboxChromeIdleTimer = null;
    }
    lightboxChromeIdleTimer = window.setTimeout(() => {
      lightboxChromeIdleTimer = null;
      if (!imageLightbox?.classList.contains("image-lightbox--active")) return;
      if (keyboardKeepsLightboxChromeVisible()) return;
      imageLightbox.classList.remove("image-lightbox--chrome");
    }, LIGHTBOX_CHROME_IDLE_MS);
  }

  function onLightboxStageMouseMove() {
    if (!prefersLightboxChromeIdle()) return;
    if (lightboxChromeMoveRaf !== null) return;
    lightboxChromeMoveRaf = requestAnimationFrame(() => {
      lightboxChromeMoveRaf = null;
      bumpLightboxChrome();
    });
  }

  function onLightboxStageMouseEnter() {
    bumpLightboxChrome();
  }

  function onLightboxStageMouseLeave() {
    hideLightboxChromeForPointer();
  }

  function onLightboxTouchPointerActivity() {
    if (lightboxChromeMoveRaf !== null) return;
    lightboxChromeMoveRaf = requestAnimationFrame(() => {
      lightboxChromeMoveRaf = null;
      bumpLightboxChrome();
    });
  }

  function onLightboxTouchSwipe(ev) {
    if (!ev || ev.pointerType !== "touch") return;
    if (ev.type === "pointerdown") {
      lightboxSwipeState = {
        id: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
      };
      return;
    }
    if (!lightboxSwipeState || ev.pointerId !== lightboxSwipeState.id) return;
    if (ev.type === "pointerup") {
      const dx = ev.clientX - lightboxSwipeState.startX;
      const dy = ev.clientY - lightboxSwipeState.startY;
      lightboxSwipeState = null;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const mostlyHorizontal = absX > absY * LIGHTBOX_SWIPE_AXIS_RATIO;
      if (absX < LIGHTBOX_SWIPE_MIN_PX || !mostlyHorizontal) return;
      stepLightbox(dx < 0 ? 1 : -1);
      return;
    }
    if (ev.type === "pointercancel") {
      lightboxSwipeState = null;
    }
  }

  function attachLightboxChromeUi() {
    detachLightboxChromeUi();
    if (!imageLightbox) return;
    lightboxChromeStageEl = imageLightbox;
    if (prefersLightboxChromeIdle()) {
      imageLightbox.addEventListener("mousemove", onLightboxStageMouseMove);
      imageLightbox.addEventListener("mouseenter", onLightboxStageMouseEnter);
      imageLightbox.addEventListener("mouseleave", onLightboxStageMouseLeave);
    } else {
      lightboxChromeTouchHandler = onLightboxTouchPointerActivity;
      imageLightbox.addEventListener("pointerdown", lightboxChromeTouchHandler, { passive: true });
      imageLightbox.addEventListener("pointermove", lightboxChromeTouchHandler, { passive: true });
      lightboxSwipeHandler = onLightboxTouchSwipe;
      imageLightbox.addEventListener("pointerdown", lightboxSwipeHandler, { passive: true });
      imageLightbox.addEventListener("pointerup", lightboxSwipeHandler, { passive: true });
      imageLightbox.addEventListener("pointercancel", lightboxSwipeHandler, { passive: true });
    }
  }

  function finishLightboxTeardown() {
    if (lightboxCloseFallbackTimer !== null) {
      window.clearTimeout(lightboxCloseFallbackTimer);
      lightboxCloseFallbackTimer = null;
    }
    detachLightboxChromeUi();
    if (!imageLightbox) return;
    const active = document.activeElement;
    if (active && imageLightbox.contains(active) && typeof active.blur === "function") {
      try {
        active.blur();
      } catch {
        /* ignore */
      }
    }
    imageLightbox.classList.remove("image-lightbox--active", "image-lightbox--open");
    imageLightbox.setAttribute("aria-hidden", "true");
    document.body.classList.remove("image-lightbox-active");
    lightboxUrls = [];
    lightboxCaptions = [];
    lightboxIndex = 0;
    syncLightboxArrows();
    if (imageLightboxImg) {
      imageLightboxImg.removeAttribute("src");
      imageLightboxImg.alt = "";
    }
    if (imageLightboxCaption) {
      renderFormattedRichText(imageLightboxCaption, "");
      imageLightboxCaption.classList.remove("image-lightbox__caption--visible");
    }
    if (lightboxReturnFocus) {
      const el = lightboxReturnFocus;
      lightboxReturnFocus = null;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          focusWithoutScroll(el);
        });
      });
    }
  }

  function syncLightboxArrows() {
    if (!imageLightboxPrev || !imageLightboxNext) return;
    const n = lightboxUrls.length;
    if (n <= 1) {
      imageLightboxPrev.hidden = true;
      imageLightboxNext.hidden = true;
      return;
    }
    const clamped = Math.max(0, Math.min(lightboxIndex, n - 1));
    if (clamped !== lightboxIndex) {
      lightboxIndex = clamped;
    }
    imageLightboxPrev.hidden = lightboxIndex <= 0;
    imageLightboxNext.hidden = lightboxIndex >= n - 1;
  }

  function lightboxAltForIndex(idx) {
    const show = shows[currentIndex];
    const title = stripRichMarkers(show?.title || "") || "Image";
    if (lightboxUrls.length <= 1) return title;
    return `${title} (${idx + 1} of ${lightboxUrls.length})`;
  }

  function applyLightboxSlide() {
    if (!imageLightboxImg || !lightboxUrls.length) return;
    const src = lightboxUrls[lightboxIndex];
    if (!src) return;
    imageLightboxImg.alt = lightboxAltForIndex(lightboxIndex);
    imageLightboxImg.src = src;
    if (imageLightboxCaption) {
      const captionText = String(lightboxCaptions[lightboxIndex] || "").trim();
      renderFormattedRichText(imageLightboxCaption, captionText);
      imageLightboxCaption.classList.toggle("image-lightbox__caption--visible", Boolean(captionText));
    }
    if (typeof imageLightboxImg.decode === "function") {
      imageLightboxImg.decode().catch(() => {});
    }
    syncLightboxArrows();
  }

  function stepLightbox(delta) {
    if (lightboxUrls.length <= 1) return;
    const next = lightboxIndex + delta;
    if (next < 0 || next >= lightboxUrls.length) return;
    lightboxIndex = next;
    applyLightboxSlide();
    bumpLightboxChrome();
  }

  function openImageLightbox(urlList, startIndex, triggerEl, captionList) {
    const list = Array.isArray(urlList)
      ? urlList.map((u) => safeUrl(u)).filter(Boolean)
      : safeUrl(urlList)
        ? [safeUrl(urlList)]
        : [];
    if (!imageLightbox || !imageLightboxImg || !list.length) return;
    if (lightboxCloseFallbackTimer !== null) {
      window.clearTimeout(lightboxCloseFallbackTimer);
      lightboxCloseFallbackTimer = null;
    }
    lightboxUrls = list;
    lightboxCaptions = Array.isArray(captionList) ? captionList.map((c) => String(c ?? "")) : [];
    if (lightboxCaptions.length < lightboxUrls.length) {
      while (lightboxCaptions.length < lightboxUrls.length) lightboxCaptions.push("");
    } else if (lightboxCaptions.length > lightboxUrls.length) {
      lightboxCaptions = lightboxCaptions.slice(0, lightboxUrls.length);
    }
    lightboxIndex = Math.max(0, Math.min(Number(startIndex) || 0, list.length - 1));
    syncLightboxArrows();
    lightboxReturnFocus = triggerEl && typeof triggerEl.focus === "function" ? triggerEl : null;
    applyLightboxSlide();
    imageLightbox.classList.remove("image-lightbox--open", "image-lightbox--active");
    imageLightbox.setAttribute("aria-hidden", "false");
    void imageLightbox.offsetWidth;
    document.body.classList.add("image-lightbox-active");
    imageLightbox.classList.add("image-lightbox--active");
    requestAnimationFrame(() => {
      imageLightbox.classList.add("image-lightbox--open");
    });
    attachLightboxChromeUi();
    if (!prefersLightboxChromeIdle()) {
      // On mobile, show controls immediately on first open.
      bumpLightboxChrome();
    }
    window.setTimeout(() => {
      if (prefersLightboxChromeIdle()) {
        focusWithoutScroll(imageLightbox);
      } else {
        focusWithoutScroll(imageLightbox.querySelector(".image-lightbox__close"));
      }
    }, 70);
  }

  function closeImageLightbox(options = {}) {
    const instant = options.instant === true;
    if (!imageLightbox || !imageLightboxImg?.getAttribute("src")) return;

    if (instant) {
      finishLightboxTeardown();
      return;
    }

    if (prefersReducedMotion()) {
      finishLightboxTeardown();
      return;
    }

    if (!imageLightbox.classList.contains("image-lightbox--open")) {
      if (imageLightbox.classList.contains("image-lightbox--active")) {
        finishLightboxTeardown();
      }
      return;
    }

    let lightboxCloseSettled = false;
    const done = () => {
      if (lightboxCloseSettled) return;
      lightboxCloseSettled = true;
      imageLightboxImg.removeEventListener("transitionend", onImgTransitionEnd);
      if (lightboxCloseFallbackTimer !== null) {
        window.clearTimeout(lightboxCloseFallbackTimer);
        lightboxCloseFallbackTimer = null;
      }
      finishLightboxTeardown();
    };

    const onImgTransitionEnd = (e) => {
      if (e.target !== imageLightboxImg || e.propertyName !== "opacity") return;
      done();
    };

    imageLightboxImg.addEventListener("transitionend", onImgTransitionEnd);
    lightboxCloseFallbackTimer = window.setTimeout(done, 560);

    imageLightbox.classList.remove("image-lightbox--open");
  }

  if (imageLightbox && imageLightboxImg) {
    if (imageLightbox.parentElement !== document.body) {
      document.body.appendChild(imageLightbox);
    }

    function onFigureActivate(e) {
      const openBtn = e.target.closest(".viewer-figure__open");
      if (!openBtn || !viewerFigures.contains(openBtn)) return;
      const img = openBtn.querySelector("img");
      if (!img || !img.getAttribute("src")) return;
      e.preventDefault();
      const show = shows[currentIndex];
      if (!show) return;
      const urls =
        Array.isArray(show.images) && show.images.length
          ? show.images
          : show.image
            ? [show.image]
            : [];
      const captions = Array.isArray(show.imageCaptions) ? show.imageCaptions : [];
      const lightboxItems = [];
      urls.forEach((u, i) => {
        const src = safeUrl(u);
        if (!src) return;
        lightboxItems.push({
          src,
          caption: String(captions[i] || ""),
        });
      });
      if (!lightboxItems.length) return;
      const idxRaw = openBtn.getAttribute("data-lightbox-index");
      const idxParsed = idxRaw !== null ? parseInt(idxRaw, 10) : 0;
      const safeList = lightboxItems.map((x) => x.src);
      const captionList = lightboxItems.map((x) => x.caption);
      openImageLightbox(safeList, Number.isFinite(idxParsed) ? idxParsed : 0, openBtn, captionList);
    }

    viewerFigures.addEventListener("click", onFigureActivate);

    imageLightboxCloseBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const instantDismiss = btn.classList.contains("image-lightbox__scrim");
        closeImageLightbox({ instant: instantDismiss });
      });
    });

    imageLightboxPrev?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      stepLightbox(-1);
    });
    imageLightboxNext?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      stepLightbox(1);
    });
  }

  document.addEventListener("keydown", (e) => {
    const lightboxOn =
      imageLightbox?.classList.contains("image-lightbox--active") && imageLightboxImg?.getAttribute("src");

    if (lightboxOn && e.key === "Escape") {
      e.preventDefault();
      closeImageLightbox({ instant: true });
      return;
    }

    if (lightboxOn && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      if (lightboxUrls.length > 1) {
        if (e.key === "ArrowLeft" && !imageLightboxPrev?.hidden) stepLightbox(-1);
        if (e.key === "ArrowRight" && !imageLightboxNext?.hidden) stepLightbox(1);
      }
      return;
    }

    const tabs = Array.from(navScroll.querySelectorAll(".nav-btn"));
    const current = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
    if (e.key === "ArrowRight" && current < tabs.length - 1) {
      e.preventDefault();
      tabs[current + 1].focus();
      selectShow(current + 1);
    } else if (e.key === "ArrowLeft" && current > 0) {
      e.preventDefault();
      tabs[current - 1].focus();
      selectShow(current - 1);
    }
  });

  loadShows().then(() => {
    renderNav();
    // Always boot into the home state on refresh.
    if (window.location.hash) {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  });

  window.addEventListener("hashchange", () => {
    showFromHash();
  });
})();
