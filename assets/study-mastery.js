(function () {
  "use strict";

  var statusLabels = {
    verified: "已有正式证据",
    verified_partial: "部分范围已验证",
    scheduled: "已排间隔复习",
    pending: "待正式验证",
    pending_question: "当前题待答",
    retest_pending: "新场景复测待答",
    reteach_deferred: "先重讲，延期复测",
    locked: "尚未解锁",
    not_scheduled: "尚未排期"
  };

  function render(state) {
    var formal = state.formal_state || {};
    var track = state.tracks && state.tracks[formal.track_id];
    var policy = state.mastery_policy;
    if (!track || !policy) return;

    document.querySelectorAll("[data-study-mastery]").forEach(function (container) {
      var targetDayId = container.getAttribute("data-study-mastery-day") || formal.day_id;
      var day = track.days.find(function (item) { return item.id === targetDayId; });
      if (!day || !day.mastery) return;
      container.textContent = "";
      day.mastery.layers.forEach(function (layer, index) {
        var definition = policy.evidence_layers.find(function (item) { return item.id === layer.id; }) || {};
        var item = document.createElement("li");
        var number = document.createElement("span");
        var title = document.createElement("strong");
        var detail = document.createElement("small");
        number.textContent = String(index + 1).padStart(2, "0") + " · " + (statusLabels[layer.status] || layer.status);
        title.textContent = definition.label || layer.id;
        detail.textContent = layer.evidence || definition.question || "等待后续正式证据";
        item.dataset.masteryStatus = layer.status;
        item.append(number, title, detail);
        container.appendChild(item);
      });
    });

    var retest = policy.retest_policy;
    document.querySelectorAll("[data-retest-policy]").forEach(function (element) {
      element.textContent = "复测只针对未通过条件，必须换场景并先补讲；最多连续 " + retest.max_immediate_targeted_retests + " 次，之后暂停即时追问，改为补讲后延期复测。";
    });
  }

  var initial = window.__STUDY_PROJECT_STATE__ || window.__STUDY_PROJECT_SNAPSHOT__;
  if (initial) render(initial);
  document.addEventListener("study-state-ready", function (event) { render(event.detail.state); });
})();
