(function () {
  "use strict";

  var configNode = document.querySelector('[type="application/json"][data-later-config]');
  if (!configNode) return;

  var config;
  try { config = JSON.parse(configNode.textContent); }
  catch (error) { document.documentElement.dataset.courseConfigError = "invalid_json"; return; }

  var storageKey = config.storage_key;
  var migrationSkipKey = storageKey + ":skip-legacy";
  var moduleOrder = Array.isArray(config.module_order) ? config.module_order : [];
  var moduleLabels = config.module_labels || {};
  var guidedDefinitions = config.guided_definitions || {};
  var saveTimer = null;
  var liveTimer = null;
  var lastProjectState = getProjectState();

  function blankState() {
    return {
      version: 1,
      fields: {},
      modules: {},
      final_practice: null,
      ability: { explain: false, judge: false, apply: false, transfer: false },
      answer_card: "",
      migrated_legacy_key: null,
      updated_at: null
    };
  }

  function normaliseState(value) {
    var next = Object.assign(blankState(), value || {});
    next.fields = next.fields && typeof next.fields === "object" ? next.fields : {};
    next.modules = next.modules && typeof next.modules === "object" ? next.modules : {};
    next.ability = Object.assign(blankState().ability, next.ability || {});
    return next;
  }

  function loadState() {
    try {
      var current = window.sessionStorage.getItem(storageKey);
      if (current) return normaliseState(JSON.parse(current));
      var skipLegacy = window.sessionStorage.getItem(migrationSkipKey) === "1";
      if (!skipLegacy) {
        (config.legacy_session_keys || []).some(function (key) {
          var value = window.sessionStorage.getItem(key);
          if (!value) return false;
          current = Object.assign(JSON.parse(value), { migrated_legacy_key: key });
          return true;
        });
        if (current) return normaliseState(current);
      }
    } catch (error) { return blankState(); }
    return blankState();
  }

  var state = loadState();

  function announce(message) {
    var live = document.querySelector("[data-live-message]");
    if (!live) return;
    window.clearTimeout(liveTimer);
    live.textContent = message;
    live.classList.add("is-visible");
    liveTimer = window.setTimeout(function () { live.classList.remove("is-visible"); }, 3200);
  }

  function saveState(message) {
    state.updated_at = new Date().toISOString();
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(state));
      document.querySelectorAll("[data-save-status]").forEach(function (node) {
        node.textContent = state.migrated_legacy_key
          ? "旧草稿已迁移到当前标签页；旧数据未删除"
          : "本页练习仅保存在当前标签页";
      });
      if (message) announce(message);
    } catch (error) { announce("当前标签页练习保存失败；正式状态未受影响。"); }
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () { saveState(); }, 180);
  }

  function getModuleState(id) {
    if (!state.modules[id]) state.modules[id] = {};
    return state.modules[id];
  }

  function restoreFields() {
    document.querySelectorAll("[data-persist]").forEach(function (field) {
      if (!field.name) return;
      if (Object.prototype.hasOwnProperty.call(state.fields, field.name)) {
        if (field.type === "checkbox" || field.type === "radio") field.checked = state.fields[field.name] === field.value || state.fields[field.name] === true;
        else field.value = state.fields[field.name];
      }
      field.addEventListener("input", function () {
        state.fields[field.name] = field.type === "checkbox" ? field.checked : field.value;
        scheduleSave();
      });
      field.addEventListener("change", function () {
        state.fields[field.name] = field.type === "checkbox" ? field.checked : field.value;
        scheduleSave();
      });
    });
  }

  function getProjectState() {
    return window.__STUDY_PROJECT_STATE__ || window.__STUDY_PROJECT_SNAPSHOT__ || {};
  }

  function setText(selector, text) {
    document.querySelectorAll(selector).forEach(function (node) { node.textContent = text; });
  }

  function formatDate(value) {
    if (!value) return "—";
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function allAbilityComplete() {
    return Boolean(state.ability.explain && state.ability.judge && state.ability.apply && state.ability.transfer);
  }

  function applyFormalState(stateSource) {
    lastProjectState = stateSource || {};
    var formal = lastProjectState.formal_state || {};
    var tracks = lastProjectState.tracks || {};
    var track = tracks[formal.track_id] || tracks.two_week_sprint || {};
    var days = Array.isArray(track.days) ? track.days : [];
    var activeDay = days.find(function (day) { return day.id === formal.day_id; }) || {};
    var activePrefix = /^week-/i.test(activeDay.id || "") ? "Week" : "Day";
    var activeLabel = activeDay.number ? activePrefix + " " + String(activeDay.number).padStart(2, "0") : "当前正式课程";
    var mastered = days.filter(function (day) { return day.concept_status === "mastered"; }).length;
    var status = "W12 是十二周长期线的作品集、岗位映射与项目答辩页；当前正式主线仍以 study-project.json 为准。";
    var formalProgress = activeLabel + " · " + (activeDay.title || "未读取到标题") + "；已掌握 " + mastered + " 项；当前 session = " + (formal.session_id || "无") + "。";
    var practiceReady = allAbilityComplete();
    var condition = practiceReady
      ? "W12 页面四项学习活动已完成；下一步是在 Codex 中确认是否进入正式评测或完成长期线收束。"
      : "先完成 W12 的六个作品集答辩模块与综合项目答辩工作坊；页面活动不会写入正式 JSON。";

    setText("[data-later-page-status]", status);
    setText("[data-later-cockpit-title]", "W12 项目答辩：让作品集主线、PRD、架构、评测风险商业证据、JD 映射和追问卡支撑岗位能力表达。");
    setText("[data-later-cockpit-summary]", formalProgress + "网页只记录当前标签页草稿，不创建长期线正式掌握。");
    setText("[data-later-cockpit-mode]", "WEEK 12 PREVIEW");
    setText("[data-later-cockpit-updated]", formatDate(lastProjectState.updated_at));
    setText("[data-later-passed-scope]", "承接 W4 的能力覆盖、状态机与停止规则；不重做已验证内容。");
    setText("[data-later-current-gap]", "W12 需要把 PRD、架构、评测、风险、商业、作品集和项目答辩放进同一条岗位证据链。");
    setText("[data-later-formal-task]", "制定 W12 作品集、岗位映射与项目答辩方案草稿；不写入正式状态源");
    setText("[data-later-current-surface]", "网页 · 十二周长期线 W12");
    setText("[data-later-switch-condition]", condition);
    setText("[data-later-sticky-surface]", "网页 · W12 作品集与项目答辩");
    setText("[data-later-sticky-condition]", condition);
    setText("[data-later-formal-summary]", formalProgress);
    setText("[data-formal-handoff-title]", "W12 接力：页面完成后，再决定是否启动正式评测。");
    setText("[data-formal-handoff-summary]", "网页里的作品集主线、PRD、架构、评测风险商业证据、JD 映射、答辩追问卡和理解地图只是草稿证据。正式长期线是否记录 Week 12，需要 Codex 重新读取并写入唯一正式状态源。");
    setText("[data-formal-handoff-primary]", practiceReady ? "核对我的 W12 理解地图" : "继续 W12 答辩方案");
    setText("[data-copy-formal-entry]", "复制 W12 答辩接力");

    setText('[data-later-stage-status="foundation"]', "W1 产物与两周突击线记录可作为输入");
    setText('[data-later-stage-status="week01"]', "作为长期线基础输入，不在本页改写");
    setText('[data-later-stage-status="week02"]', "作为 W12 作品集与项目答辩前置输入，不在本页改写");
    setText('[data-later-stage-status="formal"]', "正式状态源未由本页改写");

    window.__STUDY_PAGE_HANDOFF__ = {
      track: "twelve_week_depth",
      week_id: config.week_id || "week-12",
      focus: config.day_label + " / " + config.knowledge_anchor,
      page_anchor: config.page_anchor,
      current_formal_state: formalProgress,
      next_surface: "Codex · 是否记录 Week 12 课程进程或启动正式评测",
      switch_condition: condition,
      formal_scope: "本页不创建 session、pending question、评分、错题、复测关系、真实面试、录用结果、商业成果、岗位背书或掌握证据；只生成 W12 作品集与项目答辩方案草稿。",
      reteach_contract: "若 W12 方案只停留在“把材料放进作品集”，请按‘Portfolio Spine → PRD Story → Architecture → Evidence → JD Mapping → Defense Cards’重新收敛。"
    };
  }

  function valuesOf(form) {
    var values = {};
    new FormData(form).forEach(function (value, key) {
      if (Object.prototype.hasOwnProperty.call(values, key)) values[key] = [].concat(values[key], value);
      else values[key] = value;
    });
    return values;
  }

  function restoreFormValues(form, values) {
    Object.keys(values || {}).forEach(function (name) {
      var field = form.elements[name];
      if (!field) return;
      if (window.RadioNodeList && field instanceof window.RadioNodeList) {
        Array.prototype.forEach.call(field, function (item) {
          var expected = Array.isArray(values[name]) ? values[name] : [values[name]];
          item.checked = expected.indexOf(item.value) >= 0;
        });
      } else field.value = values[name];
    });
  }

  function appendFeedbackRow(list, label, value) {
    var wrapper = document.createElement("div");
    var term = document.createElement("dt");
    var description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    wrapper.append(term, description);
    list.appendChild(wrapper);
  }

  function renderGuidedFeedback(container, result) {
    if (!container) return;
    container.hidden = false;
    container.dataset.state = result.pass ? "pass" : "gap";
    container.replaceChildren();
    var title = document.createElement("h3");
    title.textContent = result.title;
    var summary = document.createElement("p");
    summary.textContent = result.pass
      ? "你的选择抓住了本模块的第一个产品决策。继续看完整判断链，确认它能换场景复用。"
      : "先修正这个错误节点。你可以直接改选项再提交，不需要重做其他模块。";
    var list = document.createElement("dl");
    list.className = "feedback-chain";
    appendFeedbackRow(list, "已知事实", result.definition.known);
    appendFeedbackRow(list, "第一个错误节点", result.definition.error);
    appendFeedbackRow(list, "旧判断为什么失败", result.definition.why);
    appendFeedbackRow(list, "正确决策链", result.definition.chain);
    appendFeedbackRow(list, "换场景后保持不变", result.definition.invariant);
    container.append(title, summary, list);
  }

  function evaluateGuided(id, values) {
    var definition = guidedDefinitions[id] || {};
    var decisionCorrect = values.decision === definition.correct;
    return {
      pass: decisionCorrect,
      title: decisionCorrect ? definition.passTitle : definition.failTitle,
      definition: definition,
      values: values,
      updated_at: new Date().toISOString()
    };
  }

  function setupGuidedPractices() {
    document.querySelectorAll("[data-guided-practice]").forEach(function (form) {
      var id = form.getAttribute("data-guided-practice");
      var moduleState = getModuleState(id);
      var feedback = document.querySelector('[data-guided-feedback="' + id + '"]');
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var result = evaluateGuided(id, valuesOf(form));
        moduleState.guided = { completed: result.pass, result: result, values: result.values, updated_at: result.updated_at };
        renderGuidedFeedback(feedback, result);
        refreshProgressAndHandoff();
        saveState(result.pass ? "关键判断已辨清；继续完成场景迁移。" : "解析已展开；修改后可以再次提交。");
      });
      if (moduleState.guided && moduleState.guided.values) {
        restoreFormValues(form, moduleState.guided.values);
        renderGuidedFeedback(feedback, moduleState.guided.result || evaluateGuided(id, moduleState.guided.values));
      }
    });
  }

  function setTransferFeedback(id, completed, message) {
    var container = document.querySelector('[data-transfer-feedback="' + id + '"]');
    if (!container) return;
    container.hidden = false;
    container.dataset.state = completed ? "pass" : "gap";
    var paragraph = container.querySelector("p");
    if (paragraph && message) paragraph.textContent = message;
    var reveal = container.querySelector("[data-reveal-reference]");
    if (reveal) reveal.hidden = !completed;
  }

  function setupTransferPractices() {
    document.querySelectorAll("[data-transfer-practice]").forEach(function (form) {
      var id = form.getAttribute("data-transfer-practice");
      var moduleState = getModuleState(id);
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var field = form.querySelector("textarea");
        var answer = field ? field.value.trim() : "";
        var completed = answer.length >= 24;
        moduleState.transfer = { completed: completed, answer: answer, updated_at: new Date().toISOString() };
        setTransferFeedback(id, completed, completed
          ? "方案已记录。打开示例后，挑一处补得更具体。"
          : "再补一层：写清本周动作、验收物和失败时下一步。");
        refreshProgressAndHandoff();
        saveState(completed ? "场景方案已记录。" : "场景方案还需要补充。");
      });
      if (moduleState.transfer && moduleState.transfer.answer) {
        setTransferFeedback(id, Boolean(moduleState.transfer.completed), moduleState.transfer.completed
          ? "已恢复你的场景方案，可以继续修改。"
          : "上次方案还比较简略，可以结合提示补充。");
      }
    });
  }

  function setupReferenceToggles() {
    document.querySelectorAll("[data-reveal-reference]").forEach(function (button) {
      button.addEventListener("click", function () {
        var id = button.getAttribute("data-reveal-reference");
        var panel = document.querySelector('[data-reference-panel="' + id + '"]');
        if (!panel) return;
        var open = panel.hidden;
        panel.hidden = !open;
        button.setAttribute("aria-expanded", String(open));
        button.textContent = open ? "收起示例" : (id === "final" ? "查看示例方案" : "打开示例方案");
      });
    });
  }

  function setTeachbackStatus(id, completed, message) {
    var status = document.querySelector('[data-teachback-status="' + id + '"]');
    if (!status) return;
    status.dataset.state = completed ? "pass" : "gap";
    status.textContent = message;
  }

  function setupTeachbacks() {
    document.querySelectorAll("[data-teachback-form]").forEach(function (form) {
      var id = form.getAttribute("data-teachback-form");
      var moduleState = getModuleState(id);
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var field = form.querySelector("textarea");
        var answer = field ? field.value.trim() : "";
        var completed = answer.length >= 5;
        moduleState.teachback = { completed: completed, answer: answer, updated_at: new Date().toISOString() };
        setTeachbackStatus(id, completed, completed ? "学习笔记已保存。" : "写下一句理解或一个具体疑问即可保存。");
        refreshProgressAndHandoff();
        saveState(completed ? "学习笔记已保存到当前标签页。" : "先写下一句理解或疑问。");
      });
      if (moduleState.teachback && moduleState.teachback.answer) {
        setTeachbackStatus(id, Boolean(moduleState.teachback.completed), moduleState.teachback.completed ? "已恢复上次学习笔记。" : "上次笔记还没有内容。");
      }
    });
  }

  function normaliseChecks(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  function setupFinalChallenge() {
    var form = document.querySelector("[data-final-challenge]");
    if (!form) return;
    var error = document.querySelector("[data-final-error]");
    var feedback = document.querySelector("[data-final-feedback]");
    if (state.final_practice) {
      normaliseChecks(state.final_practice.checks).forEach(function (value) {
        var field = form.querySelector('input[name="final_check"][value="' + value + '"]');
        if (field) field.checked = true;
      });
      if (state.final_practice.completed && feedback) feedback.hidden = false;
    }
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var values = valuesOf(form);
      var answer = String(values.final_diagnosis || "").trim();
      var checks = normaliseChecks(values.final_check);
      var completed = answer.length >= 100 && checks.length === 5;
      state.final_practice = { completed: completed, answer: answer, checks: checks, updated_at: new Date().toISOString() };
      if (error) error.textContent = completed ? "" : "请沿五步路线补充 W12 作品集与答辩方案，并完成五项覆盖核对。";
      if (feedback) feedback.hidden = !completed;
      refreshProgressAndHandoff();
      saveState(completed ? "W12 综合作品集答辩方案已保存；可以查看示例。" : "W12 作品集答辩方案还没有覆盖完整链路。");
    });
  }

  function updateProgress() {
    moduleOrder.forEach(function (id) {
      var moduleState = getModuleState(id);
      var count = [moduleState.guided, moduleState.transfer].filter(function (item) { return item && item.completed; }).length;
      var status = document.querySelector('[data-module-status="' + id + '"]');
      if (status) {
        status.textContent = count + " / 2 步";
        status.dataset.state = count === 2 ? "complete" : count > 0 ? "progress" : "empty";
      }
    });

    var evidence = {
      explain: moduleOrder.length > 0 && moduleOrder.every(function (id) { return Boolean(getModuleState(id).guided); }),
      judge: moduleOrder.length > 0 && moduleOrder.every(function (id) { return Boolean(getModuleState(id).guided && getModuleState(id).guided.completed); }),
      apply: moduleOrder.length > 0 && moduleOrder.every(function (id) { return Boolean(getModuleState(id).transfer && getModuleState(id).transfer.completed); }),
      transfer: Boolean(state.final_practice && state.final_practice.completed)
    };
    state.ability = evidence;
    var completedCount = Object.keys(evidence).filter(function (name) { return evidence[name]; }).length;
    var bar = document.querySelector("[data-ability-progress]");
    var text = document.querySelector("[data-ability-progress-text]");
    if (bar) bar.style.width = (completedCount / 4 * 100) + "%";
    if (text) text.textContent = completedCount + " / 4";
    Object.keys(evidence).forEach(function (name) {
      var item = document.querySelector('[data-ability-evidence="' + name + '"]');
      var label = document.querySelector('[data-ability-status="' + name + '"]');
      if (item) item.dataset.state = evidence[name] ? "complete" : "pending";
      if (label) label.textContent = evidence[name] ? "已完成" : (name === "explain" ? "未探索" : "未完成");
    });
  }

  function refreshProgressAndHandoff() {
    updateProgress();
    applyFormalState(lastProjectState || getProjectState());
  }

  function answerCardMarkdown() {
    function answer(name, fallback) {
      var value = String(state.fields[name] || "").trim();
      return value || "（" + fallback + "）";
    }
    var lines = ["# 我的 W12 作品集、岗位映射与项目答辩理解地图", ""];
    moduleOrder.forEach(function (id) {
      lines.push("## " + (moduleLabels[id] || id), answer(id + "_teachback", "还没有记录这一模块的学习笔记"), "");
    });
    lines.push("## W12 综合作品集答辩方案", answer("final_diagnosis", "还没有完成 W12 综合工作坊"), "");
    lines.push("> 这是网页学习草稿，不是正式掌握证据；疑问和未定项应保留到 Codex 正式接力。");
    return lines.join("\n");
  }

  function renderAnswerCard(value) {
    var panel = document.querySelector("[data-answer-card]");
    var output = document.querySelector("[data-answer-card-output]");
    var toggle = document.querySelector("[data-toggle-answer-card]");
    var copy = document.querySelector("[data-copy-answer-card]");
    if (output) output.textContent = value;
    if (panel) panel.hidden = false;
    if (toggle) { toggle.disabled = false; toggle.textContent = "收起理解地图"; }
    if (copy) copy.disabled = false;
  }

  function copyText(value, message) {
    function fallback() {
      var field = document.createElement("textarea");
      field.value = value;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      try { document.execCommand("copy"); announce(message); }
      catch (error) { announce("复制被浏览器阻止，请手动选择预览内容。"); }
      field.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(function () { announce(message); }).catch(fallback);
    else fallback();
  }

  function setupAnswerCard() {
    var build = document.querySelector("[data-build-answer-card]");
    var toggle = document.querySelector("[data-toggle-answer-card]");
    var copy = document.querySelector("[data-copy-answer-card]");
    var panel = document.querySelector("[data-answer-card]");
    if (build) build.addEventListener("click", function () {
      state.answer_card = answerCardMarkdown();
      renderAnswerCard(state.answer_card);
      saveState("W12 理解地图已由你的笔记和答辩方案草稿汇总。");
    });
    if (toggle) toggle.addEventListener("click", function () {
      if (!panel) return;
      panel.hidden = !panel.hidden;
      toggle.textContent = panel.hidden ? "展开理解地图" : "收起理解地图";
      announce(panel.hidden ? "理解地图已收起。" : "理解地图已展开。");
    });
    if (copy) copy.addEventListener("click", function () { copyText(state.answer_card || answerCardMarkdown(), "理解地图已复制。"); });
    if (state.answer_card) renderAnswerCard(state.answer_card);
  }

  function setupActions() {
    var clear = document.querySelector("[data-clear-session-draft]");
    if (clear) clear.addEventListener("click", function () {
      if (!window.confirm("只清除当前标签页的 " + config.day_label + " 练习与草稿？正式记录不会被删除。")) return;
      window.sessionStorage.removeItem(storageKey);
      (config.legacy_session_keys || []).forEach(function (key) { window.sessionStorage.removeItem(key); });
      window.sessionStorage.setItem(migrationSkipKey, "1");
      state = blankState();
      window.location.reload();
    });
    document.querySelectorAll("[data-copy-formal-entry]").forEach(function (button) {
      button.addEventListener("click", function () {
        copyText(JSON.stringify(window.__STUDY_PAGE_HANDOFF__ || {}, null, 2), "W12 答辩接力已复制。");
      });
    });
  }

  function setupSectionNavigation() {
    var sections = Array.prototype.slice.call(document.querySelectorAll("[data-chapter-section]"));
    var links = Array.prototype.slice.call(document.querySelectorAll("[data-section-link]"));
    var nav = document.querySelector(".later-rail nav");
    var activeId = "";

    function revealActiveLink(link) {
      if (!nav || !link) return;
      var navRect = nav.getBoundingClientRect();
      var linkRect = link.getBoundingClientRect();
      var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var behavior = reduceMotion ? "auto" : "smooth";
      var nextTop = nav.scrollTop;
      var nextLeft = nav.scrollLeft;

      if (nav.scrollHeight > nav.clientHeight + 1) {
        if (linkRect.top < navRect.top + 6) nextTop += linkRect.top - navRect.top - 6;
        else if (linkRect.bottom > navRect.bottom - 6) nextTop += linkRect.bottom - navRect.bottom + 6;
      }
      if (nav.scrollWidth > nav.clientWidth + 1) {
        if (linkRect.left < navRect.left + 6) nextLeft += linkRect.left - navRect.left - 6;
        else if (linkRect.right > navRect.right - 6) nextLeft += linkRect.right - navRect.right + 6;
      }
      nav.scrollTo({ top: nextTop, left: nextLeft, behavior: behavior });
    }

    function update(forceReveal) {
      var active = sections[0];
      sections.forEach(function (section) { if (section.getBoundingClientRect().top <= 170) active = section; });
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) active = sections[sections.length - 1];
      if (!active) return;
      var activeLink = null;
      links.forEach(function (link) {
        if (link.getAttribute("data-section-link") === active.id) {
          link.setAttribute("aria-current", "location");
          activeLink = link;
        } else link.removeAttribute("aria-current");
      });
      if (forceReveal || active.id !== activeId) revealActiveLink(activeLink);
      activeId = active.id;
    }
    window.addEventListener("scroll", function () { update(false); }, { passive: true });
    window.addEventListener("resize", function () { update(true); });
    update(true);
  }

  restoreFields();
  setupGuidedPractices();
  setupTransferPractices();
  setupTeachbacks();
  setupFinalChallenge();
  setupReferenceToggles();
  setupAnswerCard();
  setupActions();
  setupSectionNavigation();
  updateProgress();
  applyFormalState(lastProjectState);
  document.addEventListener("study-state-ready", function (event) { applyFormalState(event.detail.state); });
  if (state.migrated_legacy_key) saveState("旧 W12 草稿已迁移到新的学习闭环；原数据未删除。");
})();
