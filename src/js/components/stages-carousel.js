/**
 * Mobile stages carousel: bounded slides (no wrap), autoplay until last slide (unless reduced motion), swipe, dots, arrows.
 * @param {HTMLElement} mount — element with [data-stages-mobile-carousel] inside
 * @returns {() => void} teardown
 */
function initStagesCarousel(mount) {
  const root = mount.querySelector("[data-stages-mobile-carousel]");
  const track = mount.querySelector("[data-stages-carousel-track]");
  const viewport = mount.querySelector("[data-stages-carousel-viewport]");
  const prevBtn = mount.querySelector("[data-stages-carousel-prev]");
  const nextBtn = mount.querySelector("[data-stages-carousel-next]");
  const dotNodes = Array.from(mount.querySelectorAll("[data-stages-carousel-dot]"));
  const slides = Array.from(mount.querySelectorAll("[data-stages-carousel-slide]"));
  const live = mount.querySelector("[data-stages-carousel-live]");

  if (!root || !track || !viewport || !prevBtn || !nextBtn || dotNodes.length === 0) {
    return function noop() {};
  }

  const SLIDE_COUNT = 5;
  const SWIPE_THRESHOLD_PX = 48;
  const AUTOPLAY_MS = 4000;

  let index = 0;
  let autoplayTimerId = null;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  function autoplayEnabled() {
    return !motionQuery.matches;
  }

  function clearAutoplay() {
    if (autoplayTimerId !== null) {
      window.clearInterval(autoplayTimerId);
      autoplayTimerId = null;
    }
  }

  function startAutoplay() {
    clearAutoplay();
    if (!autoplayEnabled()) {
      return;
    }
    autoplayTimerId = window.setInterval(function () {
      goTo(index + 1, { fromAutoplay: true });
    }, AUTOPLAY_MS);
  }

  function restartAutoplay() {
    startAutoplay();
  }

  function slideLabel(i) {
    return "Слайд " + String(i + 1) + " из " + String(SLIDE_COUNT);
  }

  function updateDom(opts) {
    var announce = opts && opts.announce;
    var pct = (100 / SLIDE_COUNT) * index;
    track.style.transform = "translate3d(-" + String(pct) + "%,0,0)";

    prevBtn.disabled = index <= 0;
    nextBtn.disabled = index >= SLIDE_COUNT - 1;

    dotNodes.forEach(function (dot, i) {
      var on = i === index;
      dot.setAttribute("aria-selected", on ? "true" : "false");
      dot.classList.toggle("is-active", on);
    });

    slides.forEach(function (slide, i) {
      slide.setAttribute("aria-hidden", i === index ? "false" : "true");
    });

    if (live && announce) {
      live.textContent = slideLabel(index);
    }
  }

  function goTo(nextIndex, opts) {
    var fromAutoplay = opts && opts.fromAutoplay;
    var userDriven = opts && opts.userDriven;
    var clamped = Math.max(0, Math.min(SLIDE_COUNT - 1, nextIndex));
    if (clamped === index) {
      if (fromAutoplay && nextIndex > index) {
        clearAutoplay();
      }
      return;
    }
    index = clamped;
    updateDom({ announce: Boolean(userDriven) });
    if (!fromAutoplay) {
      restartAutoplay();
    }
  }

  function onPrev() {
    goTo(index - 1, { userDriven: true });
  }

  function onNext() {
    goTo(index + 1, { userDriven: true });
  }

  function onPrevClick() {
    onPrev();
  }

  function onNextClick() {
    onNext();
  }

  function onDotClick(ev) {
    var t = ev.currentTarget;
    var raw = t.getAttribute("data-index");
    var i = raw === null ? NaN : Number.parseInt(raw, 10);
    if (!Number.isFinite(i)) {
      return;
    }
    goTo(i, { userDriven: true });
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
      if (index < SLIDE_COUNT - 1) {
        goTo(index + 1, { userDriven: true });
      }
    } else {
      if (index > 0) {
        goTo(index - 1, { userDriven: true });
      }
    }
  }

  function onMotionChange() {
    if (autoplayEnabled()) {
      startAutoplay();
    } else {
      clearAutoplay();
    }
  }

  prevBtn.addEventListener("click", onPrevClick);
  nextBtn.addEventListener("click", onNextClick);
  dotNodes.forEach(function (dot) {
    dot.addEventListener("click", onDotClick);
  });
  viewport.addEventListener("touchstart", onTouchStart, { passive: true });
  viewport.addEventListener("touchend", onTouchEnd, { passive: true });

  if (typeof motionQuery.addEventListener === "function") {
    motionQuery.addEventListener("change", onMotionChange);
  } else {
    motionQuery.addListener(onMotionChange);
  }

  updateDom({ announce: false });
  startAutoplay();

  return function destroy() {
    clearAutoplay();
    prevBtn.removeEventListener("click", onPrevClick);
    nextBtn.removeEventListener("click", onNextClick);
    dotNodes.forEach(function (dot) {
      dot.removeEventListener("click", onDotClick);
    });
    viewport.removeEventListener("touchstart", onTouchStart);
    viewport.removeEventListener("touchend", onTouchEnd);
    if (typeof motionQuery.removeEventListener === "function") {
      motionQuery.removeEventListener("change", onMotionChange);
    } else {
      motionQuery.removeListener(onMotionChange);
    }
  };
}

window.initStagesCarousel = initStagesCarousel;
