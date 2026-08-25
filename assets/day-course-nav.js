(function () {
  "use strict";

  var catalog = [
    { id: "day-01", number: 1, href: "day-01-history.html", title: "知识地图与 MVP", fallbackStatus: "已完成 · 历史复盘" },
    { id: "day-02", number: 2, href: "day-02-history.html", title: "方案选型与 ADR", fallbackStatus: "已完成 · 历史复盘" },
    { id: "day-03", number: 3, href: "day-03-few-shot-json-schema.html", title: "Prompt 与 Schema", fallbackStatus: "已完成 · 正式掌握" },
    { id: "day-04", number: 4, href: "day-04-state-machine-coverage.html", title: "状态机与覆盖", fallbackStatus: "已完成 · 正式掌握" },
    { id: "day-05", number: 5, href: "day-05-rubric-grounding-report.html", title: "Rubric 与证据链", fallbackStatus: "课程已完成" },
    { id: "day-06", number: 6, href: "day-06-web-project-skeleton.html", title: "Web 项目骨架", fallbackStatus: "正式课程进行中" },
    { id: "day-07", number: 7, href: "day-07-model-api-final-report.html", title: "模型 API 与报告", fallbackStatus: "正式课程进行中" },
    { id: "day-08", number: 8, previewHref: "../../教师资料/未来课程参考答案/Day07-14/day-08-minimum-rag-citations.html", title: "最小 RAG 与引用", fallbackStatus: "页面可预览 · 正式未开放" },
    { id: "day-09", number: 9, previewHref: "../../教师资料/未来课程参考答案/Day07-14/day-09-eval-set-release-gate.html", title: "Eval 与上线门槛", fallbackStatus: "页面可预览 · 正式未开放" },
    { id: "day-10", number: 10, previewHref: "../../教师资料/未来课程参考答案/Day07-14/day-10-badcase-safety-privacy.html", title: "Badcase 与风险", fallbackStatus: "页面可预览 · 正式未开放" },
    { id: "day-11", number: 11, previewHref: "../../教师资料/未来课程参考答案/Day07-14/day-11-metrics-cost-unit-economics.html", title: "指标、成本与商业", fallbackStatus: "页面可预览 · 正式未开放" },
    { id: "day-12", number: 12, previewHref: "../../教师资料/未来课程参考答案/Day07-14/day-12-ux-failure-mobile-export.html", title: "体验、恢复与导出", fallbackStatus: "页面可预览 · 正式未开放" },
    { id: "day-13", number: 13, previewHref: "../../教师资料/未来课程参考答案/Day07-14/day-13-testing-release-deployment.html", title: "测试、发布与部署", fallbackStatus: "页面可预览 · 正式未开放" },
    { id: "day-14", number: 14, previewHref: "../../教师资料/未来课程参考答案/Day07-14/day-14-portfolio-defense.html", title: "作品集与答辩", fallbackStatus: "页面可预览 · 正式未开放" }
  ];

  window.__DAY_COURSE_CATALOG__ = catalog.slice();

  function getProjectState() {
    return window.__STUDY_PROJECT_STATE__ || window.__STUDY_PROJECT_SNAPSHOT__ || {};
  }

  function getFormalDay(projectState, dayId) {
    var tracks = projectState.tracks || {};
    var track = tracks.two_week_sprint || tracks[projectState.formal_state && projectState.formal_state.track_id];
    if (!track || !Array.isArray(track.days)) return null;
    return track.days.find(function (day) { return day.id === dayId; }) || null;
  }

  function statusText(item, projectState) {
    var day = getFormalDay(projectState, item.id);
    if (!item.href && !item.previewHref && !day) return item.fallbackStatus;
    if (!day) return item.fallbackStatus;
    if (day.formal_status === "completed") {
      if (day.presentation === "history") return "已完成 · 历史复盘";
      if (day.concept_status === "mastered") return "已完成 · 正式掌握";
      return "课程已完成 · 掌握缺口保留";
    }
    if (day.formal_status === "not_started") return "未开始";
    if (day.formal_status === "in_progress") {
      if (day.assessment_status === "not_started" && day.page_learning && day.page_learning.status === "completed") return "网页课程已完成 · 待正式评测";
      if (day.assessment_status === "not_started" && day.page_learning && day.page_learning.status === "in_progress") return "正式课程进行中 · 网页学习中";
      if (day.assessment_status === "not_started") return "正式课程已开启 · 待正式评测";
      return "正式评测中";
    }
    return item.fallbackStatus;
  }

  function createArrow(direction) {
    var button = document.createElement("button");
    button.className = "day-course-carousel__control day-course-carousel__control--" + direction;
    button.type = "button";
    button.setAttribute("aria-label", direction === "previous" ? "查看前一天课程卡片" : "查看后一天课程卡片");
    button.innerHTML = direction === "previous"
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
    return button;
  }

  function renderCards(nav) {
    var currentDay = nav.getAttribute("data-current-day");
    var projectState = getProjectState();
    nav.textContent = "";
    nav.setAttribute("aria-label", "两周突击线课程导航，共 " + catalog.length + " 天；可横向滑动查看更多");

    catalog.forEach(function (item) {
      var card = document.createElement(item.href || item.previewHref ? "a" : "div");
      if (item.href) card.href = item.href;
      else if (item.previewHref) {
        card.href = item.previewHref;
        card.className = "day-switcher__preview";
        card.setAttribute("aria-label", "预览 Day " + String(item.number).padStart(2, "0") + " 课程范围；正式课程尚未开放");
      }
      else {
        card.className = "day-switcher__locked";
        card.setAttribute("aria-disabled", "true");
      }
      card.setAttribute("data-course-day", item.id);
      if (item.id === currentDay) card.setAttribute("aria-current", "page");

      var dayLabel = document.createElement("span");
      dayLabel.className = "day-switcher__day";
      dayLabel.textContent = "Day " + String(item.number).padStart(2, "0");

      var copy = document.createElement("span");
      copy.className = "day-switcher__copy";
      var title = document.createElement("strong");
      title.textContent = item.title;
      var status = document.createElement("small");
      status.setAttribute("data-study-day-status", item.id);
      status.textContent = statusText(item, projectState);
      copy.append(title, status);
      card.append(dayLabel, copy);
      nav.appendChild(card);
    });
  }

  function refreshStatuses(nav) {
    var projectState = getProjectState();
    catalog.forEach(function (item) {
      var status = nav.querySelector('[data-study-day-status="' + item.id + '"]');
      if (status) status.textContent = statusText(item, projectState);
    });
  }

  function setupCarousel(nav) {
    var wrapper = document.createElement("div");
    wrapper.className = "shell day-course-carousel";
    var previous = createArrow("previous");
    var next = createArrow("next");
    nav.classList.remove("shell");
    nav.parentNode.insertBefore(wrapper, nav);
    wrapper.append(previous, nav, next);

    var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function step(direction) {
      var firstCard = nav.querySelector("[data-course-day]");
      var amount = firstCard ? firstCard.getBoundingClientRect().width + 1 : nav.clientWidth * 0.8;
      nav.scrollBy({ left: direction * amount, behavior: reducedMotion ? "auto" : "smooth" });
    }
    function updateControls() {
      var max = Math.max(0, nav.scrollWidth - nav.clientWidth);
      previous.disabled = nav.scrollLeft <= 2;
      next.disabled = nav.scrollLeft >= max - 2;
      wrapper.classList.toggle("is-scrollable", max > 2);
    }

    previous.addEventListener("click", function () { step(-1); });
    next.addEventListener("click", function () { step(1); });
    nav.addEventListener("scroll", updateControls, { passive: true });
    nav.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      var cards = Array.prototype.slice.call(nav.querySelectorAll("a"));
      var index = cards.indexOf(document.activeElement);
      if (index < 0) return;
      var nextIndex = event.key === "ArrowRight" ? Math.min(cards.length - 1, index + 1) : Math.max(0, index - 1);
      if (nextIndex === index) return;
      event.preventDefault();
      cards[nextIndex].focus();
      cards[nextIndex].scrollIntoView({ block: "nearest", inline: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
    });

    window.requestAnimationFrame(function () {
      var current = nav.querySelector('[aria-current="page"]');
      if (current) current.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
      updateControls();
    });
    window.addEventListener("resize", updateControls);
    if ("ResizeObserver" in window) new ResizeObserver(updateControls).observe(nav);
  }

  document.querySelectorAll("[data-course-day-nav]").forEach(function (nav) {
    renderCards(nav);
    setupCarousel(nav);
    document.addEventListener("study-state-ready", function () { refreshStatuses(nav); });
  });
})();
