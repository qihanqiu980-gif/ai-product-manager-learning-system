(function () {
  "use strict";

  var catalog = [
    { id: "week-01", number: 1, href: "week-01-course-start.html", title: "课程启动与旧知识补齐", status: "长期线起点" },
    { id: "week-02", number: 2, href: "week-02-mechanism-selection.html", title: "机制理解与方案选型", status: "基础判断" },
    { id: "week-03", number: 3, href: "week-03-rag-knowledge-system.html", title: "RAG 知识系统与检索质量", status: "知识系统" },
    { id: "week-04", number: 4, href: "week-04-adaptive-interview-state.html", title: "自适应面试与状态机", status: "对话状态" },
    { id: "week-05", number: 5, href: "week-05-evidence-rubric-scoring.html", title: "证据驱动评分与 Rubric", status: "评分证据" },
    { id: "week-06", number: 6, href: "week-06-eval-set-judge.html", title: "Eval Set 与 Judge", status: "评测设计" },
    { id: "week-07", number: 7, href: "week-07-badcase-regression.html", title: "Badcase 修复与回归", status: "质量迭代" },
    { id: "week-08", number: 8, href: "week-08-ai-risk-guardrails.html", title: "AI 风险边界与防护", status: "风险护栏" },
    { id: "week-09", number: 9, href: "week-09-ai-business-economics.html", title: "AI 商业指标与单位经济", status: "商业判断" },
    { id: "week-10", number: 10, href: "week-10-web-demo-rag-integration.html", title: "Web Demo 与 RAG 接入", status: "工程接入" },
    { id: "week-11", number: 11, href: "week-11-demo-hardening-deployment.html", title: "Demo 稳定化与部署回归", status: "稳定演示" },
    { id: "week-12", number: 12, href: "week-12-portfolio-interview-defense.html", title: "作品集与项目答辩", status: "主线收束" },
    { id: "week-13", number: 13, href: "week-13-feedback-iteration-maintenance.html", title: "反馈迭代与能力补证", status: "延展维护" },
    { id: "week-14", number: 14, href: "week-14-onboarding-30-60-90-plan.html", title: "入职 30-60-90 天落地", status: "延展落地" },
    { id: "week-15", number: 15, href: "week-15-ai-product-operating-system.html", title: "AI 产品团队运营", status: "延展运营" }
  ];

  window.__WEEK_COURSE_CATALOG__ = catalog.slice();

  function createArrow(direction) {
    var button = document.createElement("button");
    button.className = "day-course-carousel__control day-course-carousel__control--" + direction;
    button.type = "button";
    button.setAttribute("aria-label", direction === "previous" ? "查看前一组长期线课程" : "查看后一组长期线课程");
    button.innerHTML = direction === "previous"
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
    return button;
  }

  function renderCards(nav) {
    var currentWeek = nav.getAttribute("data-current-week");
    nav.textContent = "";
    nav.setAttribute("aria-label", "十二周长期线完整课程导航，共 " + catalog.length + " 周；可横向滑动查看更多");

    catalog.forEach(function (item) {
      var card = document.createElement("a");
      card.href = item.href;
      card.setAttribute("data-course-day", item.id);
      if (item.id === currentWeek) card.setAttribute("aria-current", "page");

      var label = document.createElement("span");
      label.className = "day-switcher__day";
      label.textContent = "W" + item.number;

      var copy = document.createElement("span");
      copy.className = "day-switcher__copy";
      var title = document.createElement("strong");
      title.textContent = item.title;
      var status = document.createElement("small");
      status.textContent = item.status;
      copy.append(title, status);
      card.append(label, copy);
      nav.appendChild(card);
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

  document.querySelectorAll("[data-week-course-nav]").forEach(function (nav) {
    renderCards(nav);
    setupCarousel(nav);
  });
})();
