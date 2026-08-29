(function () {
  "use strict";

  var catalogs = {
    w01: [
      { id: "w01-d01", label: "W1D1", href: "w01-d01-agent-pm-capability-map.html", title: "AI PM 能力地图", status: "已创建 · 可进入" },
      { id: "w01-d02", label: "W1D2", href: "w01-d02-llm-capability-boundaries.html", title: "LLM 能力边界", status: "已创建 · 可进入" },
      { id: "w01-d03", label: "W1D3", href: "w01-d03-prompt-product-role.html", title: "Prompt 产品作用", status: "已创建 · 可进入" },
      { id: "w01-d04", label: "W1D4", href: "w01-d04-ai-scenario-fit.html", title: "AI 场景适配", status: "已创建 · 可进入" },
      { id: "w01-d05", label: "W1D5", href: "w01-d05-agent-shape-selection.html", title: "AI 产品形态", status: "已创建 · 可进入" },
      { id: "w01-d06", label: "W1D6", href: "w01-d06-opportunity-assessment.html", title: "机会判断", status: "已创建 · 可进入" },
      { id: "w01-d07", label: "W1D7", href: "w01-d07-opportunity-pitch.html", title: "立项口述", status: "已创建 · 可进入" }
    ],
    w02: [
      { id: "w02-d01", label: "W2D1", href: "w02-d01-prompt-boundary.html", title: "Prompt 边界", status: "已创建 · 可进入" },
      { id: "w02-d02", label: "W2D2", href: "w02-d02-rag-basics.html", title: "RAG 基础", status: "已创建 · 可进入" },
      { id: "w02-d03", label: "W2D3", href: "w02-d03-data-material-structure.html", title: "数据与材料", status: "已创建 · 可进入" },
      { id: "w02-d04", label: "W2D4", href: "w02-d04-agent-tool-calls.html", title: "Agent 工具调用", status: "已创建 · 可进入" },
      { id: "w02-d05", label: "W2D5", href: "w02-d05-rule-model-human.html", title: "规则 / 模型 / 人工", status: "已创建 · 可进入" },
      { id: "w02-d06", label: "W2D6", href: "", title: "方案选型 ADR", status: "待制作" },
      { id: "w02-d07", label: "W2D7", href: "", title: "选型答辩", status: "待制作" }
    ]
  };

  function weekLabel(weekKey) {
    return weekKey === "w02" ? "W2" : "W1";
  }

  function currentWeekFrom(nav) {
    var current = nav.getAttribute("data-current-day") || "";
    var match = current.match(/^(w\d{2})-/);
    return match && catalogs[match[1]] ? match[1] : "w01";
  }

  function createArrow(direction, weekKey) {
    var button = document.createElement("button");
    button.className = "day-course-carousel__control day-course-carousel__control--" + direction;
    button.type = "button";
    button.setAttribute("aria-label", direction === "previous" ? "查看前一个 " + weekLabel(weekKey) + " 日课" : "查看后一个 " + weekLabel(weekKey) + " 日课");
    button.innerHTML = direction === "previous"
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
    return button;
  }

  function render(nav) {
    var current = nav.getAttribute("data-current-day");
    var weekKey = currentWeekFrom(nav);
    var catalog = catalogs[weekKey] || catalogs.w01;
    nav.textContent = "";
    nav.setAttribute("aria-label", weekLabel(weekKey) + " 每日课程导航，共 7 天；可横向滑动查看更多");

    catalog.forEach(function (item) {
      var card = document.createElement(item.href ? "a" : "div");
      if (item.href) {
        card.href = item.href;
      } else {
        card.className = "day-switcher__locked";
        card.setAttribute("aria-disabled", "true");
      }
      card.setAttribute("data-course-day", item.id);
      if (item.id === current) card.setAttribute("aria-current", "page");

      var day = document.createElement("span");
      day.className = "day-switcher__day";
      day.textContent = item.label;

      var copy = document.createElement("span");
      copy.className = "day-switcher__copy";

      var title = document.createElement("strong");
      title.textContent = item.title;

      var status = document.createElement("small");
      status.textContent = item.status;

      copy.append(title, status);
      card.append(day, copy);
      nav.appendChild(card);
    });
  }

  function setupCarousel(nav) {
    var weekKey = currentWeekFrom(nav);
    var wrapper = document.createElement("div");
    wrapper.className = "shell day-course-carousel";

    var previous = createArrow("previous", weekKey);
    var next = createArrow("next", weekKey);

    nav.classList.remove("shell");
    nav.parentNode.insertBefore(wrapper, nav);
    wrapper.append(previous, nav, next);

    var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function step(direction) {
      var card = nav.querySelector("[data-course-day]");
      var amount = card ? card.getBoundingClientRect().width + 1 : nav.clientWidth * 0.8;
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
    window.addEventListener("resize", updateControls);
    if ("ResizeObserver" in window) new ResizeObserver(updateControls).observe(nav);

    window.requestAnimationFrame(function () {
      var active = nav.querySelector('[aria-current="page"]');
      if (active) active.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
      updateControls();
    });
  }

  document.querySelectorAll("[data-course-day-nav]").forEach(function (nav) {
    render(nav);
    setupCarousel(nav);
  });
})();
