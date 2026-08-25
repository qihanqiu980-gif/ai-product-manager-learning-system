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
  var saveTimer = null;
  var liveTimer = null;
  var lastProjectState = getProjectState();

  var guidedDefinitions = {
    rubric: {
      correct: "anchor_only",
      passTitle: "评分回到了已发布锚点，而不是回答风格。",
      failTitle: "评分仍被术语、长度或模型整体感觉带偏。",
      known: "回答术语很多，但没有出现锚点要求的选择、约束与验证指标。",
      error: "把表达形式当成评价维度，跳过了已发布的可观察证据条件。",
      why: "长回答和专业词可能与能力无关，也无法稳定区分相邻等级。",
      chain: "读取 rubric_version → 锁定 criterion → 查找必要证据 → 匹配锚点或返回不可评分状态。",
      invariant: "任何评分都只能使用评分前发布的维度、锚点、证据和边界。"
    },
    anchors: {
      correct: "validate2",
      passTitle: "候选分数被锚点校正，发布职责保持分离。",
      failTitle: "模型或人工仍在用整体印象绕过必要证据。",
      known: "3 分要求三项行为，当前原话只直接支持前两项。",
      error: "把听起来成熟的回答升级为 3 分，忽略了缺失的可观察增量。",
      why: "模型置信度和人工感觉都不能创造原话中不存在的行为。",
      chain: "模型提出候选 → 程序按锚点拒绝越级 → 发布 2 分或进入语义争议复核。",
      invariant: "相邻等级必须由可观察增量区分，三方都不能无证据补分。"
    },
    grounding: {
      correct: "narrow_claim",
      passTitle: "真实引用只支撑它直接允许的有限结论。",
      failTitle: "引用虽然真实，结论仍添加了没有来源的新事实。",
      known: "原话只说特殊情况转人工，没有审计、触发规则或完整升级机制。",
      error: "把关键词相关误当成结论被原话完整蕴含。",
      why: "Grounding 检查的是证据与 claim 的范围关系，不只是 quote 是否存在。",
      chain: "精确核对 quote → 圈出 claim 新增事实 → 缩小或拒绝 claim → 重新匹配 criterion 与 score。",
      invariant: "任何结论范围都必须小于等于逐字证据直接支持的范围。"
    },
    trace: {
      correct: "stale_recompute",
      passTitle: "旧版本被诚实保留，新版本进入重新提取和评分。",
      failTitle: "版本变化仍被覆盖或静默忽略，审核链已经断开。",
      known: "正式记录绑定 proposal v1，当前来源已经更新为 v2。",
      error: "把文本相似当成证据身份相同，或覆盖历史后失去当时评分依据。",
      why: "没有 source_version、位置和规则版本，就无法重放结论当时看见的事实。",
      chain: "保留 v1 历史 → 标记旧引用 stale → 对 v2 重新提取 → 使用指定 Rubric 重新校验和发布。",
      invariant: "所有可编辑来源的证据引用都必须绑定版本，变化后失效或重算。"
    },
    report: {
      correct: "insufficient",
      passTitle: "已覆盖但证据不足，没有被伪装成低分或未观察。",
      failTitle: "采样事实、证据充分度和真实低分仍被压成一个数字。",
      known: "该维度已经提问，回答相关，但只有“会测试”，不足以匹配稳定锚点。",
      error: "把相关但不足误写成未观察，或在没有充分负向证据时强行给 0 分。",
      why: "not_observed、insufficient_evidence 和 low_score 对应不同原因与下一步。",
      chain: "核对 coverage → 核对相关证据 → 判断充分度 → score=null + insufficient_evidence + 明确补充项。",
      invariant: "没有观察或证据不足永远不能单独证明能力低。"
    }
  };

  function blankState() {
    return {
      version: 3,
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
    next.version = 3;
    next.fields = next.fields && typeof next.fields === "object" ? next.fields : {};
    next.modules = next.modules && typeof next.modules === "object" ? next.modules : {};
    next.ability = Object.assign(blankState().ability, next.ability || {});
    return next;
  }

  function loadState() {
    try {
      var current = window.sessionStorage.getItem(storageKey);
      if (current) return normaliseState(JSON.parse(current));
      if (window.sessionStorage.getItem(migrationSkipKey) !== "1") {
        var legacySessionKeys = Array.isArray(config.legacy_session_keys) ? config.legacy_session_keys : [];
        for (var sessionIndex = 0; sessionIndex < legacySessionKeys.length; sessionIndex += 1) {
          var sessionValue = window.sessionStorage.getItem(legacySessionKeys[sessionIndex]);
          if (!sessionValue) continue;
          return normaliseState(Object.assign(JSON.parse(sessionValue), { migrated_legacy_key: legacySessionKeys[sessionIndex] }));
        }
        var legacyKeys = Array.isArray(config.legacy_keys) ? config.legacy_keys : [];
        for (var index = 0; index < legacyKeys.length; index += 1) {
          var legacyValue = window.localStorage.getItem(legacyKeys[index]);
          if (!legacyValue) continue;
          return normaliseState(Object.assign(JSON.parse(legacyValue), { migrated_legacy_key: legacyKeys[index] }));
        }
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
          ? "旧草稿已只读迁移到当前标签页；旧数据未删除"
          : "本页复盘仅保存在当前标签页";
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
      function remember() {
        state.fields[field.name] = field.type === "checkbox" ? field.checked : field.value;
        scheduleSave();
      }
      field.addEventListener("input", remember);
      field.addEventListener("change", remember);
    });
  }

  function getProjectState() {
    return window.__STUDY_PROJECT_STATE__ || window.__STUDY_PROJECT_SNAPSHOT__ || {};
  }

  function getTrack(stateSource) {
    var formal = stateSource.formal_state || {};
    return stateSource.tracks && stateSource.tracks[formal.track_id];
  }

  function getDay(stateSource, dayId) {
    var track = getTrack(stateSource);
    return track && Array.isArray(track.days) ? track.days.find(function (day) { return day.id === dayId; }) : null;
  }

  function formatDate(value) {
    if (!value) return "—";
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach(function (node) { node.textContent = value; });
  }

  function applyFormalState(stateSource) {
    lastProjectState = stateSource || {};
    var formal = lastProjectState.formal_state || {};
    var day04 = getDay(lastProjectState, "day-04") || {};
    var day05 = getDay(lastProjectState, "day-05") || {};
    var day06 = getDay(lastProjectState, "day-06") || {};
    var day07 = getDay(lastProjectState, "day-07") || {};
    var completed = day05.formal_status === "completed";
    var needsReinforcement = day05.concept_status === "needs_reinforcement";
    var activeLabel = formal.day_id === "day-07" && day07.formal_status === "in_progress"
      ? "Day 07 正式课程进行中"
      : "当前正式位置：" + (formal.day_id || "未识别");
    var passed = "Day 05 机制解释已验证：Grounding 支撑方向、Traceability 回放与版本失效，以及 Rubric 锚点和模型 / 程序 / 人工的发布职责均有正式证据。";
    var gap = needsReinforcement
      ? "场景应用与新业务迁移仍为 pending；q003 未作答后随会话关闭，不自动恢复、不把网页练习计为通过。"
      : "Day 05 当前掌握状态为 " + (day05.concept_status || "unknown") + "；仍以正式记录为准。";
    var task = formal.pending_question_id || formal.required_retest_of_question_id || (formal.day_id === "day-07" ? "继续 Day 07 网页课程；Day 05 无待答题或复测关系" : "按当前正式状态源继续");
    var surface = "网页 · Day 05 待巩固复盘";
    var condition = "完成本地复盘后返回 " + activeLabel + "；只有你未来明确要求时，才为 Day 05 待巩固范围安排新的正式验证。";

    setText("[data-later-page-status]", completed ? "Day 05 课程已完成 · mastery = " + (day05.concept_status || "unknown") : "Day 05 状态需核对 · 本页不伪造完成");
    setText("[data-later-formal-summary]", "Day 05 " + (day05.formal_status || "unknown") + " / " + (day05.assessment_status || "unknown") + " / " + (day05.concept_status || "unknown") + "；" + activeLabel + "；正式 session = " + (formal.session_id || "无") + "。");
    setText("[data-later-cockpit-title]", completed ? "Day 05 课程已完成：保留待巩固范围，按需复盘。" : "Day 05 正式记录已读取：本页不改写历史状态。");
    setText("[data-later-cockpit-summary]", "Day 05 正式评测 " + (day05.session_id || "历史会话") + " 已关闭且没有 pending question。网页复盘只写当前标签页，不创建 session、评分、错题、复测关系或掌握证据。");
    setText("[data-later-cockpit-mode]", needsReinforcement ? "REVIEW · GAP PRESERVED" : "FORMAL REVIEW");
    setText("[data-later-cockpit-updated]", formatDate(lastProjectState.updated_at));
    setText("[data-later-passed-scope]", passed);
    setText("[data-later-current-gap]", gap);
    setText("[data-later-formal-task]", task);
    setText("[data-later-current-surface]", surface);
    setText("[data-later-switch-condition]", condition);
    setText("[data-later-sticky-surface]", surface);
    setText("[data-later-sticky-condition]", condition);
    setText("[data-formal-handoff-title]", "Day 05 课程已完成：机制解释已验证，应用与迁移缺口保留。" );
    setText("[data-formal-handoff-summary]", "网页复盘不会重启已关闭的 Day 05 会话，也不会把 needs_reinforcement 改成 mastered。当前正式主线是 " + activeLabel + "。" );

    var stageState = {
      foundation: day04.concept_status === "mastered" ? "verified" : "gap",
      day05: needsReinforcement ? "gap" : completed ? "verified" : "preview",
      day06: day06.concept_status === "mastered" ? "verified" : "gap",
      current: formal.day_id === "day-07" && day07.formal_status === "in_progress" ? "preview" : "gap"
    };
    Object.keys(stageState).forEach(function (name) {
      var node = document.querySelector('[data-later-progress-stage="' + name + '"]');
      if (node) node.dataset.state = stageState[name];
    });
    setText('[data-later-stage-status="foundation"]', day04.concept_status === "mastered" ? "正式完成 · mastered" : "以正式记录为准");
    setText('[data-later-stage-status="day05"]', completed ? "课程完成 · " + (day05.assessment_status || "unknown") + " · " + (day05.concept_status || "unknown") : "未完成");
    setText('[data-later-stage-status="day06"]', day06.formal_status === "completed" ? "正式完成 · " + (day06.concept_status || "unknown") : "未完成");
    setText('[data-later-stage-status="current"]', activeLabel);
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
      ? "你的选择与本模块边界一致。继续核对完整判断链，不只记住选项。"
      : "当前只修正这个错误节点；看完解析后可以修改并再次提交。";
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
    var definition = guidedDefinitions[id];
    var pass = values.decision === definition.correct;
    return { pass: pass, title: pass ? definition.passTitle : definition.failTitle, definition: definition, values: values, updated_at: new Date().toISOString() };
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
        updateProgress();
        saveState(result.pass ? "关键误区已辨清；继续完成开放式场景迁移。" : "判断链已展开；修改后可以直接重试。" );
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
        setTransferFeedback(id, completed, completed ? "方案已记录。可以打开示例，找一处继续补强。" : "再补充一点：至少写清证据、规则和允许发布的结果。" );
        updateProgress();
        saveState(completed ? "开放式场景方案已保存。" : "场景方案还需要一条完整证据链。" );
      });
      if (moduleState.transfer && moduleState.transfer.answer) setTransferFeedback(id, Boolean(moduleState.transfer.completed), moduleState.transfer.completed ? "已恢复你的场景方案，可以继续对照修改。" : "上次方案还比较简略，可以结合提示补充。" );
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
        button.textContent = open ? "收起示例" : (id === "final" ? "查看示例架构" : "打开示例方案");
      });
    });
  }

  function setupTeachbacks() {
    document.querySelectorAll("[data-teachback-form]").forEach(function (form) {
      var id = form.getAttribute("data-teachback-form");
      var moduleState = getModuleState(id);
      var status = document.querySelector('[data-teachback-status="' + id + '"]');
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var field = form.querySelector("textarea");
        var answer = field ? field.value.trim() : "";
        var completed = answer.length >= 5;
        moduleState.teachback = { completed: completed, answer: answer, updated_at: new Date().toISOString() };
        if (status) { status.dataset.state = completed ? "pass" : "gap"; status.textContent = completed ? "学习笔记已保存。" : "写下一句理解或一个具体疑问即可保存。"; }
        saveState(completed ? "学习笔记已保存到当前标签页。" : "先写下一句理解或疑问。" );
      });
      if (moduleState.teachback && moduleState.teachback.answer && status) { status.dataset.state = "pass"; status.textContent = "已恢复上次学习笔记。"; }
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
      var previousChecks = normaliseChecks(state.final_practice.checks);
      form.querySelectorAll('input[name="final_check"]').forEach(function (field) { field.checked = previousChecks.indexOf(field.value) >= 0; });
      if (state.final_practice.completed && feedback) feedback.hidden = false;
    }
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var values = valuesOf(form);
      var answer = String(values.final_diagnosis || "").trim();
      var checks = normaliseChecks(values.final_check);
      var completed = answer.length >= 100 && checks.length === 5;
      state.final_practice = { completed: completed, answer: answer, checks: checks, updated_at: new Date().toISOString() };
      if (error) error.textContent = completed ? "" : "请沿五步路线补充方案，并完成五项覆盖核对。";
      if (feedback) feedback.hidden = !completed;
      updateProgress();
      saveState(completed ? "综合评分工作坊已保存。" : "工作坊方案还没有覆盖完整证据链。" );
    });
  }

  function updateProgress() {
    moduleOrder.forEach(function (id) {
      var moduleState = getModuleState(id);
      var count = [moduleState.guided, moduleState.transfer].filter(function (item) { return item && item.completed; }).length;
      var status = document.querySelector('[data-module-status="' + id + '"]');
      if (status) { status.textContent = count + " / 2 步"; status.dataset.state = count === 2 ? "complete" : count > 0 ? "progress" : "empty"; }
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

  function answerCardMarkdown() {
    function answer(name, fallback) {
      var value = String(state.fields[name] || "").trim();
      return value || "（" + fallback + "）";
    }
    return [
      "# 我的 Day 05 评分与证据链理解地图", "",
      "## 已发布评分规则：我的理解或疑问", answer("rubric_teachback", "尚未记录"), "",
      "## 锚点与发布职责：我的理解或疑问", answer("anchors_teachback", "尚未记录"), "",
      "## Grounding：我的理解或疑问", answer("grounding_teachback", "尚未记录"), "",
      "## Traceability：我的理解或疑问", answer("trace_teachback", "尚未记录"), "",
      "## 报告状态：我的理解或疑问", answer("report_teachback", "尚未记录"), "",
      "## 综合评分工作坊", answer("final_diagnosis", "尚未完成工作坊"), "",
      "> 这是 Day 05 本地复盘痕迹，不是正式评分答案，不会把应用与迁移缺口改写为已掌握。"
    ].join("\n");
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
      catch (error) { announce("复制被浏览器阻止，请手动选择理解地图内容。" ); }
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
    if (build) build.addEventListener("click", function () { state.answer_card = answerCardMarkdown(); renderAnswerCard(state.answer_card); saveState("理解地图已由你的笔记和工作坊方案生成。" ); });
    if (toggle) toggle.addEventListener("click", function () { if (!panel) return; panel.hidden = !panel.hidden; toggle.textContent = panel.hidden ? "展开理解地图" : "收起理解地图"; });
    if (copy) copy.addEventListener("click", function () { copyText(state.answer_card || answerCardMarkdown(), "理解地图已复制。" ); });
    if (state.answer_card) renderAnswerCard(state.answer_card);
  }

  function setupActions() {
    var clear = document.querySelector("[data-clear-session-draft]");
    if (clear) clear.addEventListener("click", function () {
      if (!window.confirm("只清除当前标签页的 Day 05 复盘练习与草稿？正式记录和旧 localStorage 数据不会被删除。")) return;
      window.sessionStorage.removeItem(storageKey);
      (config.legacy_session_keys || []).forEach(function (key) { window.sessionStorage.removeItem(key); });
      window.sessionStorage.setItem(migrationSkipKey, "1");
      state = blankState();
      window.location.reload();
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
        if (link.getAttribute("data-section-link") === active.id) { link.setAttribute("aria-current", "location"); activeLink = link; }
        else link.removeAttribute("aria-current");
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
  if (state.migrated_legacy_key) saveState("旧 Day 05 草稿已只读迁移到新的复盘闭环；原数据未删除。" );
})();
