(function () {
  "use strict";

  var snapshot = window.__STUDY_PROJECT_SNAPSHOT__;
  var scriptUrl = document.currentScript && document.currentScript.src;
  if (!snapshot) return;

  function getTrack(state) {
    return state.tracks && state.tracks[state.formal_state.track_id];
  }

  function getDay(state, dayId) {
    var track = getTrack(state);
    return track && track.days.find(function (day) { return day.id === dayId; });
  }

  function dayNumber(day) {
    var prefix = day && /^week-/i.test(day.id || "") ? "Week" : "Day";
    return day && Number.isFinite(Number(day.number))
      ? prefix + " " + String(day.number).padStart(2, "0")
      : "当前课程";
  }

  function trackLabel(track) {
    return track && track.label ? track.label : "当前路线";
  }

  function masteredCount(track) {
    return track && Array.isArray(track.days)
      ? track.days.filter(function (day) { return day.concept_status === "mastered"; }).length
      : 0;
  }

  function statusLabel(day, format) {
    var pending = day.pending_question_ordinal ? " · 第 " + day.pending_question_ordinal + " 题待答" : "";
    var deferredRetest = !day.pending_question_id && day.required_retest_of_question_id ? " · 先重讲，待延期复测" : "";
    if (format === "concept") {
      if (day.concept_status === "mastered") return "已掌握";
      if (day.concept_status === "needs_reinforcement") return "待巩固";
      if (day.concept_status === "practicing") return "练习中";
      return "未测试";
    }
    if (format === "course") {
      if (day.formal_status === "completed") {
        if (day.presentation === "history") return "已完成 · 历史复盘";
        return day.concept_status === "mastered" ? "已完成 · 正式掌握" : "课程已完成 · 掌握缺口保留";
      }
      if (day.formal_status === "in_progress") {
        if (day.assessment_status === "not_started" && day.page_learning && day.page_learning.status === "completed") return "网页课程已完成 · 待正式评测";
        if (day.assessment_status === "not_started" && day.page_learning && day.page_learning.status === "in_progress") return "正式课程进行中 · 网页学习中";
        if (day.assessment_status === "not_started") return "正式课程已开启 · 待正式评测";
        return "正式评测进行中" + pending + deferredRetest;
      }
      return day.page ? "学习页已就绪 · 未测试" : "尚未开始";
    }
    if (day.formal_status === "completed") {
      if (day.presentation === "history") return "已完成 · 历史复盘";
      return day.concept_status === "mastered" ? "已完成 · 正式掌握" : "课程已完成 · 掌握缺口保留";
    }
    if (day.formal_status === "in_progress") {
      if (day.assessment_status === "not_started" && day.page_learning && day.page_learning.status === "completed") return "课程已开启 · 网页已完成 · 待评测";
      if (day.assessment_status === "not_started" && day.page_learning && day.page_learning.status === "in_progress") return "课程已开启 · 网页学习中";
      if (day.assessment_status === "not_started") return "课程已开启 · 待评测";
      return "评测中" + pending + deferredRetest;
    }
    return "未开始";
  }

  function learningPosition(state) {
    var track = getTrack(state);
    var formal = state.formal_state || {};
    var formalDay = getDay(state, formal.day_id);
    if (!track || !formalDay) return null;
    var hasOpenTask = Boolean(
      formal.pending_question_id ||
      formal.required_retest_of_question_id ||
      formalDay.formal_status === "in_progress" ||
      formal.session_state === "in_progress"
    );
    if (hasOpenTask || formalDay.formal_status !== "completed") {
      return { day: formalDay, formalDay: formalDay, kind: "active" };
    }
    var formalIndex = track.days.findIndex(function (day) { return day.id === formalDay.id; });
    var nextDay = track.days.slice(formalIndex + 1).find(function (day) { return day.formal_status !== "completed"; });
    return { day: nextDay || formalDay, formalDay: formalDay, kind: nextDay ? "next" : "complete" };
  }

  function dayPageHref(day) {
    if (!day || !day.page) return "";
    if (scriptUrl) return new URL("../" + day.page, scriptUrl).href;
    return day.page;
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach(function (element) {
      element.textContent = value == null ? "—" : String(value);
    });
  }

  function applyState(state, sourceKind) {
    var track = getTrack(state);
    var formal = state.formal_state;
    var position = learningPosition(state);
    var activeDay = position && position.day;
    var formalDay = position && position.formalDay;
    if (!track || !activeDay || !formalDay) return;

    document.documentElement.dataset.formalStateSource = sourceKind;
    document.documentElement.dataset.activeStudyDay = activeDay.id;
    document.documentElement.dataset.recentFormalDay = formalDay.id;
    document.documentElement.dataset.learningPosition = position.kind;
    window.__STUDY_PROJECT_STATE__ = state;

    document.querySelectorAll("[data-study-day-status]").forEach(function (element) {
      var day = getDay(state, element.getAttribute("data-study-day-status"));
      if (day) element.textContent = statusLabel(day, element.getAttribute("data-study-status-format") || "switcher");
    });

    document.querySelectorAll("[data-study-day-item]").forEach(function (element) {
      var dayId = element.getAttribute("data-study-day-item");
      var isCurrent = dayId === activeDay.id;
      element.classList.toggle("day-item--current", isCurrent);
      element.dataset.formalStatus = getDay(state, dayId)?.formal_status || "unknown";
      element.dataset.learningPosition = isCurrent ? position.kind : dayId === formalDay.id && formalDay.formal_status === "completed" ? "recently_completed" : "none";
    });

    setText("[data-study-active-session]", formal.session_id || "当前无正式会话");
    setText("[data-study-pending-question]", formal.pending_question_id || "当前无待答题");
    setText("[data-study-active-day]", dayNumber(activeDay));
    setText("[data-study-active-day-title]", activeDay.title);
    setText("[data-study-active-day-status]", statusLabel(activeDay, "switcher"));
    setText("[data-study-track-label]", trackLabel(track));
    setText("[data-study-mastered-count]", "已掌握 " + masteredCount(track) + " 项");
    setText("[data-study-recent-completion]", dayNumber(formalDay) + " " + statusLabel(formalDay, "switcher"));
    setText(
      "[data-study-active-day-formal-summary]",
      position.kind === "next"
        ? dayNumber(formalDay) + " 已完成 · 下一阶段 " + dayNumber(activeDay) + " 未启动"
        : dayNumber(activeDay) + " " + statusLabel(activeDay, "switcher")
    );
    setText("[data-study-state-updated]", state.updated_at);

    document.querySelectorAll("[data-study-current-question-title]").forEach(function (element) {
      element.textContent = formal.current_question && formal.current_question.title
        ? formal.current_question.title
        : "当前无待答题";
    });

    document.querySelectorAll("[data-study-active-day-link]").forEach(function (link) {
      var href = dayPageHref(activeDay);
      if (href) link.href = href;
      link.textContent = position.kind === "next" ? "打开 " + dayNumber(activeDay) + " 课程预览" : "继续 " + dayNumber(activeDay) + " 网页学习";
    });

    document.querySelectorAll("[data-study-primary-transition]").forEach(function (button) {
      var courseActive = activeDay.formal_status === "in_progress";
      var assessmentStarted = Boolean(formal.session_id || activeDay.assessment_status === "in_progress");
      var pageLearningCompleted = Boolean(activeDay.page_learning && activeDay.page_learning.status === "completed");
      button.disabled = false;
      button.setAttribute("data-study-target-day", activeDay.id);
      if (position.kind === "next" || activeDay.formal_status === "not_started") {
        button.setAttribute("data-study-entry-action", "activate_course");
        button.textContent = "正式开始 " + dayNumber(activeDay) + " 课程";
      } else if (courseActive && !assessmentStarted && pageLearningCompleted) {
        button.setAttribute("data-study-entry-action", "start_assessment");
        button.textContent = "复制“启动 " + dayNumber(activeDay) + " 正式评测”指令";
      } else if (courseActive && !assessmentStarted) {
        button.setAttribute("data-study-entry-action", "continue_course_page");
        button.disabled = true;
        button.textContent = "完成 " + dayNumber(activeDay) + " 网页课程后启动评测";
      } else if (assessmentStarted) {
        button.setAttribute("data-study-entry-action", "continue");
        button.textContent = "复制当前正式学习接力";
      } else {
        button.disabled = true;
        button.textContent = "等待正式状态确认";
      }
    });

    var pageLearningInProgress = activeDay.page_learning && activeDay.page_learning.status === "in_progress";
    var nextStageTitle = position.kind === "next"
      ? dayNumber(activeDay) + " 课程页已就绪，正式课程尚未开启。"
      : activeDay.assessment_status === "not_started" && pageLearningInProgress
        ? dayNumber(activeDay) + " 正式课程进行中。"
      : activeDay.assessment_status === "not_started"
        ? dayNumber(activeDay) + " 正式课程已开启，等待正式评测。"
        : dayNumber(activeDay) + " 正式学习进行中。";
    var nextStageCopy = position.kind === "next"
      ? "可以预览页面；点击“正式开始课程”会复制明确的 activate_day 指令，只有 Codex 重读并写入正式 JSON 后才算开启。"
      : activeDay.assessment_status === "not_started" && pageLearningInProgress
        ? "先完成网页概念学习、架构实验与 mock 项目；确认网页课程完成后，再由 Codex 重新读取 JSON 并创建全新正式评测 session。"
      : activeDay.assessment_status === "not_started"
        ? "课程状态已由正式 JSON 确认为 in_progress；网页学习与正式评测仍分开，下一步需要明确启动正式评测。"
        : "请按当前唯一 session 与 pending question 继续，不沿用旧题号，也不跳过正式证据。";
    setText("[data-study-next-stage-title]", nextStageTitle);
    setText("[data-study-next-stage-copy]", nextStageCopy);

    document.querySelectorAll("[data-study-next-action]").forEach(function (element) {
      if (formal.pending_question_id) {
        element.textContent = "完成并提交当前待答题 " + formal.pending_question_id + "。";
      } else if (formal.required_retest_of_question_id) {
        element.textContent = "先补讲未通过条件，再为 " + formal.required_retest_of_question_id + " 安排一题新场景延期复测。";
      } else if (position.kind === "next") {
        element.textContent = dayNumber(formalDay) + " 已正式完成；下一阶段为 " + dayNumber(activeDay) + "（尚未启动）。可以继续网页预习；正式启动前请回 Codex 重新读取 JSON。";
      } else if (activeDay.formal_status === "in_progress" && activeDay.assessment_status === "not_started" && pageLearningInProgress) {
        element.textContent = dayNumber(activeDay) + " 正式课程已开启，当前从网页完成概念学习、实验和项目骨架；完成后再明确启动正式评测。";
      } else if (activeDay.formal_status === "in_progress" && activeDay.assessment_status === "not_started") {
        element.textContent = dayNumber(activeDay) + " 正式课程已开启" + (activeDay.page_learning && activeDay.page_learning.status === "completed" ? "，网页课程已完成" : "") + "；下一步由你明确启动正式评测，Codex 重新读取 JSON 后创建全新 session 与第一道正式题。";
      } else {
        element.textContent = "当前没有待答题；请从正式记录确认下一步。";
      }
    });

    document.dispatchEvent(new CustomEvent("study-state-ready", { detail: { state: state, source: sourceKind } }));
  }

  applyState(snapshot, "generated_snapshot");

  if (window.location.protocol !== "file:") {
    var sourceUrl = new URL("../02_复盘总结/学习状态/study-project.json", document.currentScript.src);
    window.fetch(sourceUrl, { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("state source returned " + response.status);
        return response.json();
      })
      .then(function (state) { applyState(state, "formal_json"); })
      .catch(function () {
        document.documentElement.dataset.formalStateSource = "generated_snapshot";
      });
  }
})();
