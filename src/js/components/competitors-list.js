/**
 * Horizontal paged carousel: pages sit in a row; track uses translateX.
 * Cards per page: 1 below 768px, 2 from 768px to 1279px, 3 from 1280px up (avoids three 320px cards overlapping mid-desktop).
 */
(function () {
  var SWIPE_THRESHOLD_PX = 48;
  var MQ_TABLET = window.matchMedia("(min-width: 768px)");
  var MQ_THREE_COL = window.matchMedia("(min-width: 1280px)");
  var SUPPORTS_INERT = typeof HTMLElement !== "undefined" && "inert" in HTMLElement.prototype;

  function chunkArray(items, size) {
    var out = [];
    var i = 0;
    while (i < items.length) {
      out.push(items.slice(i, i + size));
      i += size;
    }
    return out;
  }

  function createEl(tag, className) {
    var el = document.createElement(tag);
    if (className) {
      el.className = className;
    }
    return el;
  }

  /** Chevron L-shape; rotation matches stages carousel (prev = left, next = right). */
  function createChevron(isPrev) {
    var span = createEl("span", "competitors-carousel__chevron");
    if (isPrev) {
      span.classList.add("competitors-carousel__chevron--prev");
    }
    return span;
  }

  function buildCard(item) {
    var article = createEl("article", "competitors-card");
    var imgWrap = createEl("div", "competitors-card__image");
    var img = createEl("img");
    img.src = item.image;
    img.alt = item.name;
    img.width = 320;
    img.height = 320;
    /* No lazy: new nodes on each layout rebuild would defer load and flicker. */
    img.loading = "eager";
    imgWrap.appendChild(img);

    var nameEl = createEl("div", "competitors-card__name");
    var nameSpan = createEl("span");
    nameSpan.textContent = item.name;
    nameEl.appendChild(nameSpan);

    var sub = createEl("div", "competitors-card__subtitle");
    var subSpan = createEl("span");
    subSpan.textContent = item.ratingText;
    sub.appendChild(subSpan);

    /* Placeholder: no navigation or side effects (design-only control). */
    var moreBtn = createEl("button", "competitors-card__more");
    moreBtn.type = "button";
    moreBtn.textContent = "Подробнее";

    article.appendChild(imgWrap);
    article.appendChild(nameEl);
    article.appendChild(sub);
    article.appendChild(moreBtn);
    return article;
  }

  function buildPage(rows) {
    var page = createEl("div", "competitors-carousel__page");
    rows.forEach(function (item) {
      page.appendChild(buildCard(item));
    });
    return page;
  }

  /** Warm HTTP cache + raster decode so rebuilt <img> nodes paint without a blank flash. */
  function preloadCompetitorImages(items) {
    var seen = Object.create(null);
    items.forEach(function (row) {
      var u = row && row.image;
      if (!u || seen[u]) {
        return;
      }
      seen[u] = true;
      var im = new Image();
      im.src = u;
      if (typeof im.decode === "function") {
        im.decode().catch(function () {
          /* decode may reject for unsupported types; ignore */
        });
      }
    });
  }

  function initCompetitorsCarousel(root) {
    var data =
      typeof COMPETITORS_DATA !== "undefined" && Array.isArray(COMPETITORS_DATA)
        ? COMPETITORS_DATA
        : [];
    if (data.length === 0) {
      return function noop() {};
    }

    var nav = root.querySelector("[data-competitors-nav]");
    var viewport = root.querySelector("[data-competitors-viewport]");
    if (!nav || !viewport) {
      return function noop() {};
    }

    var prevBtn = createEl("button", "competitors-carousel__arrow competitors-carousel__arrow--prev");
    prevBtn.type = "button";
    prevBtn.setAttribute("aria-label", "Предыдущая страница");
    prevBtn.appendChild(createChevron(true));

    var counter = createEl("div", "competitors-carousel__counter");
    counter.setAttribute("aria-live", "polite");
    var curSpan = createEl("span", "competitors-carousel__counter-current");
    var totSpan = createEl("span", "competitors-carousel__counter-total");
    counter.appendChild(curSpan);
    counter.appendChild(document.createTextNode(" / "));
    counter.appendChild(totSpan);

    var nextBtn = createEl("button", "competitors-carousel__arrow competitors-carousel__arrow--next");
    nextBtn.type = "button";
    nextBtn.setAttribute("aria-label", "Следующая страница");
    nextBtn.appendChild(createChevron(false));

    nav.appendChild(prevBtn);
    nav.appendChild(counter);
    nav.appendChild(nextBtn);

    var track = createEl("div", "competitors-carousel__track");
    viewport.appendChild(track);

    var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    var layoutMorphFadeOutTimer = null;
    var layoutMorphCleanupTimer = null;

    function clearLayoutMorphTimers() {
      if (layoutMorphFadeOutTimer !== null) {
        window.clearTimeout(layoutMorphFadeOutTimer);
        layoutMorphFadeOutTimer = null;
      }
      if (layoutMorphCleanupTimer !== null) {
        window.clearTimeout(layoutMorphCleanupTimer);
        layoutMorphCleanupTimer = null;
      }
    }

    var pageIndex = 0;
    var pages = [];
    var pageWidthPx = 0;
    var pageHeightPx = 0;
    /** Chunk size after last successful build; used to map page index across breakpoint changes. */
    var lastChunkSize = 0;

    var TRACK_EASE = "cubic-bezier(0.33, 1, 0.32, 1)";
    var TRACK_DURATION_MS = 480;

    function chunkSize() {
      if (MQ_THREE_COL.matches) {
        return 3;
      }
      if (MQ_TABLET.matches) {
        return 2;
      }
      return 1;
    }

    function applyTrackRebuild(anchor) {
      var k = chunkSize();
      track.textContent = "";
      pages = chunkArray(data, k).map(function (rows) {
        var p = buildPage(rows);
        track.appendChild(p);
        return p;
      });

      if (typeof anchor === "number" && Number.isFinite(anchor) && lastChunkSize > 0) {
        var ac = Math.max(0, Math.min(anchor, data.length - 1));
        pageIndex = Math.min(Math.floor(ac / k), Math.max(0, pages.length - 1));
      } else {
        pageIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
      }

      lastChunkSize = k;
      syncLayout();
      updateDom();
    }

    /**
     * @param {{ anchorStartIndex?: number, layoutMorph?: boolean }} [opts]
     *   anchorStartIndex — first competitor index to keep in view after chunk size changes (e.g. from MQ).
     *   layoutMorph — brief opacity crossfade before rebuild (breakpoint card-count change).
     */
    function rebuildPages(opts) {
      opts = opts || {};
      var anchor = opts.anchorStartIndex;
      var useMorph =
        Boolean(opts.layoutMorph) && lastChunkSize > 0 && !motionQuery.matches;

      if (!useMorph) {
        applyTrackRebuild(anchor);
        return;
      }

      clearLayoutMorphTimers();
      track.style.transition = "opacity 0.12s ease-out";
      track.style.opacity = "0";

      layoutMorphFadeOutTimer = window.setTimeout(function () {
        layoutMorphFadeOutTimer = null;
        applyTrackRebuild(anchor);
        track.style.transition = "none";
        track.style.opacity = "0";
        void track.offsetWidth;
        window.requestAnimationFrame(function () {
          track.style.transition = "opacity 0.22s ease-out";
          track.style.opacity = "1";
          layoutMorphCleanupTimer = window.setTimeout(function () {
            layoutMorphCleanupTimer = null;
            track.style.opacity = "";
            track.style.transition = "";
          }, 240);
        });
      }, 100);
    }

    function syncLayout() {
      if (pages.length === 0) {
        pageWidthPx = 0;
        pageHeightPx = 0;
        viewport.style.height = "";
        return;
      }
      var w = viewport.offsetWidth;
      pageWidthPx = w;
      pages.forEach(function (p) {
        p.style.flex = "0 0 " + String(w) + "px";
        p.style.width = String(w) + "px";
        p.style.minWidth = String(w) + "px";
        p.style.maxWidth = String(w) + "px";
      });

      var maxH = 0;
      pages.forEach(function (p) {
        maxH = Math.max(maxH, p.offsetHeight);
      });
      pageHeightPx = maxH;
      viewport.style.height = maxH > 0 ? String(maxH) + "px" : "";
    }

    function updateDom() {
      var total = pages.length;
      curSpan.textContent = String(pageIndex + 1);
      totSpan.textContent = String(total);
      prevBtn.disabled = pageIndex <= 0;
      nextBtn.disabled = pageIndex >= total - 1;

      var offset = pageIndex * pageWidthPx;
      var instant = motionQuery.matches;
      track.style.transition = instant
        ? "none"
        : "transform " + String(TRACK_DURATION_MS / 1000) + "s " + TRACK_EASE;
      track.style.transform = "translate3d(-" + String(offset) + "px,0,0)";

      pages.forEach(function (p, i) {
        var inactive = i !== pageIndex;
        if (SUPPORTS_INERT) {
          p.inert = inactive;
          p.removeAttribute("aria-hidden");
          return;
        }
        p.removeAttribute("aria-hidden");
        p.querySelectorAll("button, a[href], input, select, textarea").forEach(function (el) {
          if (inactive) {
            if (!el.hasAttribute("data-competitors-tab")) {
              el.setAttribute(
                "data-competitors-tab",
                el.hasAttribute("tabindex") ? el.getAttribute("tabindex") || "" : "__none__",
              );
              el.setAttribute("tabindex", "-1");
            }
          } else {
            var saved = el.getAttribute("data-competitors-tab");
            if (saved !== null) {
              el.removeAttribute("data-competitors-tab");
              if (saved === "__none__") {
                el.removeAttribute("tabindex");
              } else {
                el.setAttribute("tabindex", saved);
              }
            }
          }
        });
      });
    }

    function goTo(nextIdx, opts) {
      var user = opts && opts.userDriven;
      var clamped = Math.max(0, Math.min(pages.length - 1, nextIdx));
      if (clamped === pageIndex) {
        return;
      }
      pageIndex = clamped;
      if (user && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(function () {
          updateDom();
        });
      } else {
        updateDom();
      }
    }

    function onPrev() {
      goTo(pageIndex - 1, { userDriven: true });
    }

    function onNext() {
      goTo(pageIndex + 1, { userDriven: true });
    }

    function onKeyDown(ev) {
      if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        onPrev();
      } else if (ev.key === "ArrowRight") {
        ev.preventDefault();
        onNext();
      }
    }

    var touchStartX = 0;
    var touchStartY = 0;
    var trackingTouch = false;

    function onTouchStart(ev) {
      if (ev.changedTouches.length !== 1) {
        return;
      }
      trackingTouch = true;
      touchStartX = ev.changedTouches[0].clientX;
      touchStartY = ev.changedTouches[0].clientY;
    }

    function onTouchEnd(ev) {
      if (!trackingTouch || ev.changedTouches.length !== 1) {
        return;
      }
      trackingTouch = false;
      var dx = ev.changedTouches[0].clientX - touchStartX;
      var dy = ev.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) {
        return;
      }
      if (dx < 0) {
        onNext();
      } else {
        onPrev();
      }
    }

    function onTouchCancel() {
      trackingTouch = false;
    }

    function onResize() {
      syncLayout();
      updateDom();
    }

    function onMqChange() {
      var anchor = pageIndex * lastChunkSize;
      rebuildPages({ anchorStartIndex: anchor, layoutMorph: true });
    }

    preloadCompetitorImages(data);
    rebuildPages();
    window.requestAnimationFrame(function () {
      syncLayout();
      updateDom();
    });

    prevBtn.addEventListener("click", onPrev);
    nextBtn.addEventListener("click", onNext);
    viewport.addEventListener("keydown", onKeyDown);
    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchend", onTouchEnd, { passive: true });
    viewport.addEventListener("touchcancel", onTouchCancel, { passive: true });
    window.addEventListener("resize", onResize);

    if (typeof MQ_TABLET.addEventListener === "function") {
      MQ_TABLET.addEventListener("change", onMqChange);
      MQ_THREE_COL.addEventListener("change", onMqChange);
    } else {
      MQ_TABLET.addListener(onMqChange);
      MQ_THREE_COL.addListener(onMqChange);
    }

    if (typeof motionQuery.addEventListener === "function") {
      motionQuery.addEventListener("change", updateDom);
    } else {
      motionQuery.addListener(updateDom);
    }

    return function destroy() {
      clearLayoutMorphTimers();
      prevBtn.removeEventListener("click", onPrev);
      nextBtn.removeEventListener("click", onNext);
      viewport.removeEventListener("keydown", onKeyDown);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchCancel);
      window.removeEventListener("resize", onResize);
      if (typeof MQ_TABLET.removeEventListener === "function") {
        MQ_TABLET.removeEventListener("change", onMqChange);
        MQ_THREE_COL.removeEventListener("change", onMqChange);
      } else {
        MQ_TABLET.removeListener(onMqChange);
        MQ_THREE_COL.removeListener(onMqChange);
      }
      if (typeof motionQuery.removeEventListener === "function") {
        motionQuery.removeEventListener("change", updateDom);
      } else {
        motionQuery.removeListener(updateDom);
      }
      nav.textContent = "";
      viewport.textContent = "";
    };
  }

  var mount = document.querySelector("[data-competitors]");
  if (mount) {
    initCompetitorsCarousel(mount);
  }
})();
