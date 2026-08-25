(function () {
  "use strict";

  var scriptUrl = document.currentScript && document.currentScript.src;

  function getState() {
    return window.__STUDY_PROJECT_STATE__ || window.__STUDY_PROJECT_SNAPSHOT__ || {};
  }

  function getFormalDay(state) {
    var formal = state.formal_state || {};
    var track = state.tracks && state.tracks[formal.track_id];
    return track && track.days.find(function (day) { return day.id === formal.day_id; });
  }

  function getDay(state, dayId) {
    var formal = state.formal_state || {};
    var track = state.tracks && state.tracks[formal.track_id];
    return track && track.days.find(function (day) { return day.id === dayId; });
  }

  function getCatalogDay(dayId) {
    var catalog = window.__DAY_COURSE_CATALOG__ || [];
    return catalog.find(function (day) { return day.id === dayId; }) || null;
  }

  function labelDay(day) {
    var prefix = day && /^week-/i.test(day.id || "") ? "Week" : "Day";
    return prefix + " " + String(day && day.number || "—").padStart(2, "0");
  }

  function getLearningPosition(state) {
    var formal = state.formal_state || {};
    var track = state.tracks && state.tracks[formal.track_id];
    var formalDay = getFormalDay(state);
    if (!track || !formalDay) return { day: {}, formalDay: {}, kind: "unknown" };
    var hasOpenTask = Boolean(formal.pending_question_id || formal.required_retest_of_question_id || formalDay.formal_status === "in_progress" || formal.session_state === "in_progress");
    if (hasOpenTask || formalDay.formal_status !== "completed") return { day: formalDay, formalDay: formalDay, kind: "active" };
    var index = track.days.findIndex(function (day) { return day.id === formalDay.id; });
    var nextDay = track.days.slice(index + 1).find(function (day) { return day.formal_status !== "completed"; });
    return { day: nextDay || formalDay, formalDay: formalDay, kind: nextDay ? "next" : "complete" };
  }

  function buildContinuationPrompt(requestedAction, targetDayId) {
    var state = getState();
    var formal = state.formal_state || {};
    var position = getLearningPosition(state);
    var day = getDay(state, targetDayId) || position.day || {};
    var formalDay = position.formalDay || {};
    var pageHandoff = window.__STUDY_PAGE_HANDOFF__ || null;
    var hasPageHandoff = Boolean(pageHandoff && pageHandoff.day_id === formal.day_id);
    var dayLabel = labelDay(day);
    var formalDayLabel = labelDay(formalDay);
    var assessmentReady = Boolean(day.formal_status === "in_progress" && day.assessment_status === "not_started" && day.page_learning && day.page_learning.status === "completed");
    var nextInstruction = requestedAction === "activate_course"
      ? "我现在明确正式启动 " + dayLabel + " 课程（activate_day）。请重新读取正式 JSON，核对开启资格和旧 session / pending question / required retest；条件满足后只把该课程的正式课程状态切换为 in_progress，并同步页面只读快照。本次只开启课程，不创建 session、题目、评分、错题、复测关系或掌握证据。"
      : requestedAction === "start_assessment"
        ? "我现在明确启动 " + dayLabel + " 正式评测（start_assessment）。请重新读取正式 JSON，确认该课程正式课程已开启，且当前无 session、pending question 或 required retest 后，创建全新的 " + dayLabel + " session 与唯一 q001；本轮只出一道机制解释题，不沿用上一阶段会话或旧题号，也不把网页完成当成正式掌握。"
        : formal.pending_question_id
      ? "请一次只处理这一道题，保留我的原始回答，并按‘结论 → 已有证据 → 一个最高优先缺口 → 下一步动作’给反馈；如果需要复测，再只给一道新场景题。"
      : formal.required_retest_of_question_id
        ? "当前没有待答题。请先针对 " + formal.required_retest_of_question_id + " 未通过的条件做聚焦重讲，不要立即重复原题；完成重讲后，再按正式记录安排一道新场景延期复测。"
        : position.kind === "next"
          ? formalDayLabel + " 已正式完成。下一阶段是 " + dayLabel + "，但尚未启动；请先重新读取正式 JSON，不要沿用已完成会话的旧题号，也不要把网页预习当成正式掌握。"
          : assessmentReady
            ? "我现在明确启动 " + dayLabel + " 正式评测。请重新读取正式 JSON，确认当前无 session、pending question 或 required retest 后，创建全新的 " + dayLabel + " session 与 q001；本轮只出一道机制解释题，不沿用上一日会话或旧题号，也不把网页完成当成正式掌握。"
          : "当前没有待答题。请先核对正式记录并明确下一步。";
    var lines = [
      "请继续‘AI 产品经理转型学习项目’的正式学习。",
      "",
      "先读取唯一状态源：" + ((state.state_source && state.state_source.path) || "02_复盘总结/学习状态/study-project.json"),
      position.kind === "next"
        ? "学习位置：" + formalDayLabel + " · " + (formalDay.title || "未识别") + " 已完成；下一正式阶段 " + dayLabel + " · " + (day.title || "未识别") + " 尚未启动"
        : "当前学习：" + dayLabel + " · " + (day.title || "未识别"),
      "当前正式测验会话：" + (formal.session_id || "无"),
      "最近已完成会话：" + (formal.previous_session_id || (formal.session_state === "completed" ? formal.session_id : "无")),
      "当前待答题：" + (formal.pending_question_id || "无"),
      "保留复测关系：" + (formal.required_retest_of_question_id || "无"),
      "当前评测记录：" + (formal.source_record || "尚未创建"),
      "上一阶段证据记录：" + (formal.previous_source_record || "无"),
      "课程状态：" + (day.formal_status || "未知") + "；网页课程：" + ((day.page_learning && day.page_learning.status) || "未记录") + "；正式评测：" + (day.assessment_status || "未记录") + "；掌握：" + (day.concept_status || "未知"),
    ];
    if (requestedAction === "activate_course") lines.push("本次请求动作：activate_day · 只开启正式课程，不创建正式评测。");
    if (requestedAction === "start_assessment") lines.push("本次请求动作：start_assessment · 新建正式评测 session 与唯一第一题。");
    if (hasPageHandoff) {
      lines.push(
        "正式知识进度：" + (pageHandoff.formal_progress || "以正式状态源中的分层证据为准"),
        "当前网页知识定位：" + pageHandoff.focus,
        "建议网页锚点：" + pageHandoff.page_anchor,
        "网页准备状态：" + pageHandoff.preparation_status,
        "当前工作台：" + (pageHandoff.next_surface || "按当前正式任务判断"),
        "切换条件：" + (pageHandoff.switch_condition || "完成当前唯一任务后重新读取正式状态"),
        "本题只验证：" + pageHandoff.formal_scope,
        "已通过且不要重复：" + pageHandoff.passed_scope
      );
    }
    lines.push(
      "",
      "回复开头先显示学习定位条：正式位置、已通过范围、当前唯一任务、当前工作台与切换条件。定位条不是评分；正式反馈仍从结论开始，并保持‘结论 → 原话证据 → 一个最高优先缺口 → 下一步’的顺序。",
      nextInstruction,
      hasPageHandoff ? pageHandoff.reteach_contract : "",
      "网页实验、自检和草稿可以记录课程进程，但不能直接改变正式掌握状态。不要复测已掌握内容，也不要提前进入下一天。"
    );
    return lines.filter(function (line, index) { return line !== "" || lines[index - 1] !== ""; }).join("\n");
  }

  function announce(message) {
    document.querySelectorAll("[data-formal-entry-status]").forEach(function (element) {
      element.textContent = message;
    });
    document.querySelectorAll("[data-study-launcher-status]").forEach(function (element) {
      element.textContent = message;
    });
  }

  function fallbackCopy(text) {
    var field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    var copied = false;
    try { copied = document.execCommand("copy"); } catch (error) { copied = false; }
    field.remove();
    return copied;
  }

  function entrySuccessMessage(action) {
    if (action === "activate_course") return "课程开启指令已复制。请回到当前 Codex 对话粘贴发送；只有 Codex 写入正式 JSON 后，页面才会显示正式课程已开启。";
    if (action === "start_assessment") return "正式评测指令已复制。请回到当前 Codex 对话粘贴发送；Codex 重读正式 JSON 后才会创建新 session 与第一题。";
    return "已复制。回到当前 Codex 对话粘贴即可继续正式学习。";
  }

  function pageSessionKey(dayId) {
    return "ai-pm-page-session:" + dayId;
  }

  function launcherDismissalKey(dayId) {
    return "ai-pm-entry-dismissed:" + dayId;
  }

  function launcherSignature(pageDayId, entry) {
    var state = getState();
    var formal = state.formal_state || {};
    var day = getDay(state, pageDayId) || {};
    return [
      pageDayId,
      entry.action,
      entry.targetDayId || pageDayId,
      day.formal_status || "unknown",
      day.assessment_status || "unknown",
      day.page_learning && day.page_learning.status || "unrecorded",
      formal.session_id || "no-session",
      formal.pending_question_id || "no-pending",
      formal.required_retest_of_question_id || "no-retest"
    ].join("|");
  }

  function readLauncherDismissal(dayId) {
    try { return window.sessionStorage.getItem(launcherDismissalKey(dayId)); } catch (error) { return null; }
  }

  function writeLauncherDismissal(dayId, signature) {
    try { window.sessionStorage.setItem(launcherDismissalKey(dayId), signature); } catch (error) { /* 页面仍可继续 */ }
  }

  function confirmPersistentCourseEntry(source) {
    var launcher = source && source.closest ? source.closest("[data-study-entry-launcher]") : document.querySelector("[data-study-entry-launcher]");
    if (!launcher || launcher.hidden) return;
    var nav = document.querySelector("[data-course-day-nav][data-current-day]");
    var pageDayId = nav && nav.getAttribute("data-current-day");
    var signature = launcher.getAttribute("data-entry-signature");
    if (pageDayId && signature) writeLauncherDismissal(pageDayId, signature);
    launcher.hidden = true;
    document.body.classList.remove("has-study-entry-launcher");
  }

  function readPageSession(dayId) {
    try {
      var raw = window.sessionStorage.getItem(pageSessionKey(dayId));
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function writePageSession(dayId, mode) {
    var value = { day_id: dayId, mode: mode, started_at: new Date().toISOString(), formal_effect: "none" };
    try { window.sessionStorage.setItem(pageSessionKey(dayId), JSON.stringify(value)); } catch (error) { /* 页面仍可继续 */ }
    return value;
  }

  function pageLearningTarget() {
    return document.querySelector("[data-chapter-section], .archive-section, .day03-learning, main > section:nth-of-type(2)");
  }

  function startPageSession(button, action, dayId) {
    var mode = action === "review_page" ? "review" : "preview";
    var session = writePageSession(dayId, mode);
    var panel = button.closest("[data-generic-course-activation]");
    var status = panel && panel.querySelector("[data-formal-entry-status]");
    var target = pageLearningTarget();
    var message = mode === "review"
      ? "本次复盘已开始。历史掌握保持不变；需要正式复测时，请回 Codex 明确提出。"
      : "页面预习已开始。本次记录只保存在当前标签页，不会越级开启正式课程。";
    if (status) status.textContent = message;
    document.querySelectorAll("[data-study-launcher-status]").forEach(function (element) { element.textContent = message; });
    button.textContent = mode === "review" ? "继续本页复盘" : "继续页面预习";
    button.dataset.pageSessionStartedAt = session.started_at;
    renderGenericCourseActivation();
    renderPersistentCourseEntry();
    if (!target) return;
    var heading = target.querySelector("h2, h1") || target;
    if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  function renderGenericCourseActivation() {
    if (document.querySelector("[data-day05-course-activation]")) return;
    var nav = document.querySelector("[data-course-day-nav][data-current-day]");
    if (!nav) return;

    var pageDayId = nav.getAttribute("data-current-day");
    var state = getState();
    var position = getLearningPosition(state);
    var day = getDay(state, pageDayId);
    var descriptor = day || getCatalogDay(pageDayId);
    if (!descriptor) return;
    var existing = document.querySelector("[data-generic-course-activation]");

    if (!existing) {
      var hero = nav.closest("section");
      var parent = hero && hero.parentNode;
      if (!parent) return;
      existing = document.createElement("div");
      existing.className = "formal-course-entry-wrap";
      existing.setAttribute("data-generic-course-activation", "");
      existing.innerHTML = '<section class="shell formal-course-entry" aria-label="课程学习与复盘入口"><div><h2 data-generic-course-title>课程入口</h2><p data-generic-course-copy></p></div><div class="formal-course-entry__state"><span>当前页面状态</span><strong data-generic-course-value></strong></div><div class="formal-course-entry__action"><button class="button" type="button" data-generic-course-button></button><span data-formal-entry-status aria-live="polite"></span></div></section>';
      parent.insertBefore(existing, hero.nextSibling);
    }

    var formal = state.formal_state || {};
    var isFormalDay = Boolean(day && formal.day_id === pageDayId);
    var assessmentStarted = Boolean(isFormalDay && (formal.session_id || day.assessment_status === "in_progress"));
    var eligible = Boolean(day && (day.eligibility_status === "eligible" || day.formal_status === "in_progress"));
    var pageSession = readPageSession(pageDayId);
    var title = existing.querySelector("[data-generic-course-title]");
    var button = existing.querySelector("[data-generic-course-button]");
    var copy = existing.querySelector("[data-generic-course-copy]");
    var value = existing.querySelector("[data-generic-course-value]");
    var status = existing.querySelector("[data-formal-entry-status]");
    button.setAttribute("data-study-target-day", pageDayId);
    button.disabled = false;

    if (day && day.formal_status === "completed") {
      existing.dataset.state = "review";
      title.textContent = labelDay(descriptor) + " 复盘入口";
      button.setAttribute("data-study-entry-action", "review_page");
      button.textContent = pageSession && pageSession.mode === "review" ? "继续本页复盘" : "开始复盘 " + labelDay(descriptor);
      copy.textContent = day.concept_status === "mastered"
        ? "这一天已有正式掌握证据。重新阅读、实验和整理草稿不会撤销历史掌握，也不会自动创建新题。"
        : "这一天的课程已经正式完成，但掌握缺口仍保留。重新阅读和实验只作为复盘，不会把待巩固范围改写为已掌握。";
      value.textContent = "formal_status = completed · mastery = " + (day.concept_status || "以正式记录为准");
      if (status) status.textContent = pageSession && pageSession.mode === "review" ? "本标签页已进入复盘模式。" : "复盘只记录本次页面活动，不修改正式状态。";
    } else if (day && day.formal_status === "in_progress" && isFormalDay && !assessmentStarted && day.page_learning && day.page_learning.status === "completed") {
      existing.dataset.state = "confirmed";
      title.textContent = labelDay(descriptor) + " 正式学习入口";
      button.setAttribute("data-study-entry-action", "start_assessment");
      button.textContent = "复制“启动 " + labelDay(descriptor) + " 正式评测”指令";
      copy.textContent = "正式课程已经开启；页面学习与正式评测仍分开。下一步由学习者明确启动正式评测。";
      value.textContent = "formal_status = in_progress · assessment = not_started";
      if (status) status.textContent = "复制后返回当前 Codex 对话粘贴发送；Codex 重读 JSON 后才创建新 session。";
    } else if (day && day.formal_status === "in_progress" && isFormalDay && !assessmentStarted) {
      existing.dataset.state = "ready";
      title.textContent = labelDay(descriptor) + " 正式课程进行中";
      button.setAttribute("data-study-entry-action", "continue_course_page");
      button.textContent = "继续 " + labelDay(descriptor) + " 网页课程";
      button.disabled = false;
      copy.textContent = "当前先完成网页概念学习、实验与项目骨架；确认课程完成后，才会开放正式评测接力。";
      value.textContent = "formal_status = in_progress · page_learning = " + ((day.page_learning && day.page_learning.status) || "in_progress");
      if (status) status.textContent = "本页草稿和实验只记录课程进程，不直接生成正式评分。";
    } else if (day && day.formal_status === "in_progress" && isFormalDay) {
      existing.dataset.state = "confirmed";
      title.textContent = labelDay(descriptor) + " 正式学习入口";
      button.setAttribute("data-study-entry-action", "continue");
      button.textContent = "复制当前正式学习接力";
      copy.textContent = "正式评测已经开始。继续时只处理唯一 session 与 pending question。";
      value.textContent = "assessment = in_progress · 按当前正式题继续";
      if (status) status.textContent = "页面不会新建第二个 session 或重复已通过范围。";
    } else if (day && day.formal_status === "not_started" && eligible && position.day && position.day.id === pageDayId) {
      existing.dataset.state = "ready";
      title.textContent = labelDay(descriptor) + " 正式课程入口";
      button.setAttribute("data-study-entry-action", "activate_course");
      button.textContent = "正式开始 " + labelDay(descriptor) + " 课程";
      copy.textContent = "本页已满足前置条件，但正式课程尚未开启。按钮只生成 activate_day 接力请求；最终状态以唯一正式 JSON 为准。";
      value.textContent = "eligible + not_started · 等待明确开启";
      if (status) status.textContent = "点击不会在浏览器中伪造 in_progress。";
    } else {
      existing.dataset.state = "preview";
      title.textContent = labelDay(descriptor) + " 页面学习入口";
      button.setAttribute("data-study-entry-action", "preview_page");
      button.textContent = pageSession && pageSession.mode === "preview" ? "继续页面预习" : "开始页面预习 " + labelDay(descriptor);
      copy.textContent = "本页可以提前阅读、实验和整理草稿，但当前正式主线仍由唯一 JSON 决定；页面预习不会越级开启课程。";
      value.textContent = day ? "formal_status = " + (day.formal_status || "not_started") + " · 当前不可正式开启" : "preview_only · 尚未进入正式状态源";
      if (status) status.textContent = pageSession && pageSession.mode === "preview" ? "本标签页已进入页面预习模式。" : "预习记录只保存在当前标签页。";
    }
  }

  function getPageEntryState(pageDayId) {
    var state = getState();
    var formal = state.formal_state || {};
    var position = getLearningPosition(state);
    var formalDay = getFormalDay(state);
    var day = getDay(state, pageDayId);
    var descriptor = day || getCatalogDay(pageDayId);
    if (!descriptor) return null;
    var isFormalDay = Boolean(day && formal.day_id === pageDayId);
    var assessmentStarted = Boolean(isFormalDay && (formal.session_id || day.assessment_status === "in_progress"));
    var eligible = Boolean(day && (day.eligibility_status === "eligible" || day.formal_status === "in_progress"));
    var pageSession = readPageSession(pageDayId);

    if (!isFormalDay && formal.pending_question_id) {
      return {
        state: "active",
        title: labelDay(formalDay) + " · 有正式待答",
        action: "continue",
        targetDayId: formal.day_id,
        label: "回 Codex · 完成当前正式任务",
        status: formal.pending_question_id + " 待答 · 本页仍可预习，但不能替代正式作答。"
      };
    }
    if (!isFormalDay && formal.required_retest_of_question_id) {
      return {
        state: "active",
        title: labelDay(formalDay) + " · 聚焦重讲待继续",
        action: "continue",
        targetDayId: formal.day_id,
        label: "回 Codex · 继续聚焦重讲",
        status: formal.required_retest_of_question_id + " 保留复测关系 · 本页预习不计入正式掌握。"
      };
    }

    if (day && day.formal_status === "completed") {
      return {
        state: "review",
        title: labelDay(descriptor) + (day.concept_status === "mastered" ? " · 已掌握" : " · 课程已完成，待巩固"),
        action: "review_page",
        label: pageSession && pageSession.mode === "review" ? "继续本页复盘" : "开始复盘 " + labelDay(descriptor),
        status: pageSession && pageSession.mode === "review"
          ? "本标签页已进入复盘模式。"
          : day.concept_status === "mastered"
            ? "复盘不会撤销历史掌握或创建新题。"
            : "课程完成不等于正式掌握；复盘不会补写缺失证据或创建新题。"
      };
    }
    if (day && day.formal_status === "in_progress" && isFormalDay && assessmentStarted) {
      return {
        state: "active",
        title: labelDay(descriptor) + " · 正式评测中",
        action: "continue",
        label: "继续 " + labelDay(descriptor) + " 正式学习",
        status: formal.pending_question_id ? formal.pending_question_id + " 待答 · 点击复制正式接力" : "点击复制当前正式学习接力"
      };
    }
    if (day && day.formal_status === "in_progress" && isFormalDay && day.page_learning && day.page_learning.status === "completed") {
      return {
        state: "ready",
        title: labelDay(descriptor) + " · 课程已开启",
        action: "start_assessment",
        label: "启动 " + labelDay(descriptor) + " 正式评测",
        status: "点击复制明确评测指令；Codex 重读 JSON 后创建新 session。"
      };
    }
    if (day && day.formal_status === "in_progress" && isFormalDay) {
      return {
        state: "active",
        title: labelDay(descriptor) + " · 正式课程进行中",
        action: "continue_course_page",
        label: "继续 " + labelDay(descriptor) + " 网页学习",
        status: "先完成课程概念、实验和项目骨架；完成确认后再启动正式评测。"
      };
    }
    if (day && day.formal_status === "not_started" && eligible && position.day && position.day.id === pageDayId) {
      return {
        state: "ready",
        title: labelDay(descriptor) + " · 可正式开启",
        action: "activate_course",
        label: "正式开始 " + labelDay(descriptor) + " 课程",
        status: "点击复制开启指令；只有 Codex 写入正式 JSON 后才生效。"
      };
    }
    return {
      state: "preview",
      title: labelDay(descriptor) + " · 页面预习",
      action: "preview_page",
      label: pageSession && pageSession.mode === "preview" ? "继续页面预习" : "开始页面预习 " + labelDay(descriptor),
      status: pageSession && pageSession.mode === "preview" ? "本标签页已进入页面预习模式。" : "预习只保存在当前标签页，不改变正式状态。"
    };
  }

  function renderPersistentCourseEntry() {
    var nav = document.querySelector("[data-course-day-nav][data-current-day]");
    if (!nav || !document.body || !document.body.classList) return;
    var pageDayId = nav.getAttribute("data-current-day");
    var entry = getPageEntryState(pageDayId);
    if (!entry) return;
    var launcher = document.querySelector("[data-study-entry-launcher]");
    if (!launcher) {
      launcher = document.createElement("aside");
      launcher.className = "study-entry-launcher";
      launcher.setAttribute("data-study-entry-launcher", "");
      launcher.setAttribute("aria-label", "当前页面学习入口");
      launcher.innerHTML = '<div class="study-entry-launcher__copy"><span>学习入口</span><strong data-study-launcher-title></strong><small data-study-launcher-status aria-live="polite"></small></div><div class="study-entry-launcher__actions"><button class="button" type="button" data-study-launcher-button></button><button class="study-entry-launcher__dismiss" type="button" data-study-launcher-dismiss>本次不再提示</button></div>';
      document.body.appendChild(launcher);
    }
    var signature = launcherSignature(pageDayId, entry);
    launcher.setAttribute("data-entry-signature", signature);
    if (readLauncherDismissal(pageDayId) === signature) {
      launcher.hidden = true;
      document.body.classList.remove("has-study-entry-launcher");
      return;
    }
    launcher.hidden = false;
    document.body.classList.add("has-study-entry-launcher");
    launcher.dataset.state = entry.state;
    launcher.querySelector("[data-study-launcher-title]").textContent = entry.title;
    launcher.querySelector("[data-study-launcher-status]").textContent = entry.status;
    var button = launcher.querySelector("[data-study-launcher-button]");
    button.setAttribute("data-study-entry-action", entry.action);
    button.setAttribute("data-study-target-day", entry.targetDayId || pageDayId);
    button.textContent = entry.label;
    button.disabled = Boolean(entry.disabled);
    var dismiss = launcher.querySelector("[data-study-launcher-dismiss]");
    if (dismiss && !dismiss.__studyEntryDismissBound) {
      dismiss.__studyEntryDismissBound = true;
      dismiss.addEventListener("click", function () { confirmPersistentCourseEntry(dismiss); });
    }
    bindStudyEntryActions();
  }

  function emitEntryCopied(action, targetDayId) {
    document.dispatchEvent(new CustomEvent("study-entry-copied", {
      detail: { action: action, day_id: targetDayId || null, copied_at: new Date().toISOString() }
    }));
  }

  function copyContinuationPrompt(action, targetDayId, source) {
    var prompt = buildContinuationPrompt(action, targetDayId);
    var successMessage = entrySuccessMessage(action);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(prompt).then(function () {
        announce(successMessage);
        emitEntryCopied(action, targetDayId);
        confirmPersistentCourseEntry(source);
      }).catch(function () {
        if (fallbackCopy(prompt)) {
          announce(successMessage);
          emitEntryCopied(action, targetDayId);
          confirmPersistentCourseEntry(source);
        } else {
          announce("复制被浏览器阻止，请手动选择页面中的继续学习指令。");
        }
      });
    } else {
      if (fallbackCopy(prompt)) {
        announce(successMessage);
        emitEntryCopied(action, targetDayId);
        confirmPersistentCourseEntry(source);
      } else {
        announce("复制被浏览器阻止，请手动选择页面中的继续学习指令。");
      }
    }
  }

  function continueCoursePage(button) {
    var target = pageLearningTarget();
    var status = button.closest("[data-generic-course-activation]")?.querySelector("[data-formal-entry-status]");
    var message = "继续当前正式网页课程；页面活动不会直接生成正式评分。";
    if (status) status.textContent = message;
    announce(message);
    if (!target) return;
    var heading = target.querySelector("h2, h1") || target;
    if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  function updateRecordLinks() {
    var state = getState();
    var formal = state.formal_state || {};
    var record = formal.source_record || formal.previous_source_record;
    if (!record || !scriptUrl) return;
    var href = new URL("../" + record, scriptUrl).href;
    document.querySelectorAll("[data-formal-record-link]").forEach(function (link) {
      link.href = href;
      if (!formal.source_record && formal.previous_source_record) link.textContent = "查看上一阶段正式记录";
    });
  }

  function bindStudyEntryActions() {
    document.querySelectorAll("[data-study-entry-action]").forEach(function (button) {
      if (button.__studyEntryBound) return;
      button.__studyEntryBound = true;
      button.addEventListener("click", function () {
        if (button.disabled) return;
        var action = button.getAttribute("data-study-entry-action") || "continue";
        var dayId = button.getAttribute("data-study-target-day");
        if (action === "review_page" || action === "preview_page") {
          startPageSession(button, action, dayId);
          confirmPersistentCourseEntry(button);
        } else if (action === "continue_course_page") {
          continueCoursePage(button);
          confirmPersistentCourseEntry(button);
        } else copyContinuationPrompt(action, dayId, button);
      });
    });
  }

  renderGenericCourseActivation();
  renderPersistentCourseEntry();
  document.querySelectorAll("[data-copy-formal-entry]").forEach(function (button) {
    button.addEventListener("click", function () { copyContinuationPrompt("continue", button.getAttribute("data-study-target-day")); });
  });
  bindStudyEntryActions();
  updateRecordLinks();
  document.addEventListener("study-state-ready", function () {
    updateRecordLinks();
    renderGenericCourseActivation();
    renderPersistentCourseEntry();
    bindStudyEntryActions();
  });
})();
