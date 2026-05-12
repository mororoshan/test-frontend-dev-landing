/** Breakpoint aligned with `stages-section.css` (desktop vs mobile stages). */
var STAGES_LAYOUT_MAX_WIDTH_PX = 1280;

var stagesMount = document.querySelector("[data-stages]");
if (stagesMount) {
  var stagesMq = window.matchMedia(
    "(max-width: " + String(STAGES_LAYOUT_MAX_WIDTH_PX) + "px)",
  );
  var stagesDestroyCarousel = null;
  var stagesLoadedIsMobile = null;
  /** In-memory cache: template URL → HTML string (filled after first successful fetch). */
  var stagesTemplateCache = Object.create(null);

  function stagesTearDownCarousel() {
    if (typeof stagesDestroyCarousel === "function") {
      stagesDestroyCarousel();
      stagesDestroyCarousel = null;
    }
  }

  function stagesTemplatePath(isMobile) {
    return isMobile
      ? "./templates/data-stages-mobile.html"
      : "./templates/data-stages-desktop.html";
  }

  function stagesApplyHtml(html, isMobile) {
    stagesTearDownCarousel();
    stagesMount.innerHTML = html;
    stagesLoadedIsMobile = isMobile;
    if (isMobile && typeof window.initStagesCarousel === "function") {
      stagesDestroyCarousel = window.initStagesCarousel(stagesMount);
    }
  }

  function stagesLoad() {
    var requestedMobile = stagesMq.matches;
    var path = stagesTemplatePath(requestedMobile);
    var cached = stagesTemplateCache[path];
    if (cached !== undefined) {
      if (stagesMq.matches !== requestedMobile) {
        stagesLoad();
        return;
      }
      stagesApplyHtml(cached, requestedMobile);
      return;
    }
    window
      .fetch(path, { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("data-stages template: " + String(response.status));
        }
        return response.text();
      })
      .then(function (templateHtml) {
        if (stagesMq.matches !== requestedMobile) {
          stagesLoad();
          return;
        }
        stagesTemplateCache[path] = templateHtml;
        stagesApplyHtml(templateHtml, requestedMobile);
      })
      .catch(function (error) {
        console.error(error);
      });
  }

  /** Fires only when (max-width: 1280px) starts/stopping matching — no debounce, unlike `resize`. */
  function stagesOnLayoutMqChange() {
    var nowMobile = stagesMq.matches;
    if (nowMobile !== stagesLoadedIsMobile) {
      stagesLoad();
    }
  }

  stagesLoad();
  if (typeof stagesMq.addEventListener === "function") {
    stagesMq.addEventListener("change", stagesOnLayoutMqChange);
  } else {
    stagesMq.addListener(stagesOnLayoutMqChange);
  }
}
