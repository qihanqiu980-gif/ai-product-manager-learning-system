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
    adapter: {
      correct: "stop_rotate",
      passTitle: "先止损，再恢复正确的服务端边界。",
      failTitle: "第一个错误节点仍未被阻断。",
      known: "Key 已经进入浏览器请求体，HTTPS 只能保护传输过程，不能阻止前端代码或调试工具读取它。",
      error: "秘密跨过了 Browser 边界；继续调用、记录原请求或只改 Prompt 都是在扩大泄露面。",
      why: "一旦密钥进入客户端，它就可以被复制、重放和滥用，无法再靠模型约束补救。",
      chain: "停止调用 → 轮换密钥 → Browser 只发业务字段 → Server Proxy 调用 Provider Adapter。",
      invariant: "任何 AI 产品中，凭证和供应商认证都留在服务端。"
    },
    candidate: {
      correct: "validate_reject",
      passTitle: "结构合法不等于业务合法。",
      failTitle: "你仍把可解析候选当成了可执行事实。",
      known: "JSON 结构合法，但逐字引用不存在，模型还试图决定 session 完成状态。",
      error: "候选通过解析之后，quote 校验与状态权限校验尚未通过。",
      why: "Schema 只能检查形状；它不知道原回答事实，也不拥有业务状态写入权。",
      chain: "保留原回答 → 拒绝无效分数与越权字段 → 确定性校验 → 程序决定下一动作或降级。",
      invariant: "模型可以生成候选内容，程序必须裁决事实、权限和状态。"
    },
    retry: {
      correct: "degrade",
      passTitle: "达到上限后停止调用，并保住原业务事实。",
      failTitle: "恢复策略仍会丢事实或放大失败。",
      known: "用户回答已经提交，模型连续超时，固定的一次重试额度已用完。",
      error: "失败归一化之后，应先检查重试上限，而不是继续调用或删除回答。",
      why: "无限重试放大成本和延迟；删除回答则把 Provider 故障错误地转嫁给用户。",
      chain: "保留 answer/request_id → 停止模型调用 → 写入 score=null 的可校验降级对象 → 继续有限流程。",
      invariant: "任何可重试故障都要有稳定请求身份、明确上限和诚实降级。"
    },
    flow: {
      correct: "block_stale",
      passTitle: "旧题候选被 Guard 阻断，当前 session 不被反向改写。",
      failTitle: "模型建议仍然绕过了当前 session 事实。",
      known: "候选追问属于旧 question_id，服务端已经进入下一道基础题。",
      error: "在候选动作展示前，没有核对 current_question 与请求携带的题目身份。",
      why: "有价值的追问也可能已经过期；展示它会让页面和服务端 session 分叉。",
      chain: "核对 question_id → Guard 阻断 stale 候选 → 保持当前题与状态 → 程序继续合法流程。",
      invariant: "所有模型生成的动作都要服从当前 session、权限、次数和停止条件。"
    },
    report: {
      correct: "null_partial",
      passTitle: "没有逐字证据，就不发布非空分数。",
      failTitle: "模型摘要仍被当成了正式证据。",
      known: "摘要语义合理，但 evidence_quote 不是当前回答的逐字子串。",
      error: "claim/score 生成之后，Grounding 校验没有通过。",
      why: "合理改写可能扩大原意；无法从报告回放到原话的结论不能被复核。",
      chain: "保留原回答 → 丢弃或缩小越界 claim → score=null → 报告标记 partial 与 limitation。",
      invariant: "结论范围不得超过可回放的原始证据范围。"
    }
  };

  function blankState() {
    return {
      version: 2,
      fields: {},
      labs: {},
      quiz: null,
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
    next.version = 2;
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
        var legacySessionKeys = Array.isArray(config.legacy_session_keys) ? config.legacy_session_keys : [];
        for (var sessionIndex = 0; sessionIndex < legacySessionKeys.length; sessionIndex += 1) {
          var sessionValue = window.sessionStorage.getItem(legacySessionKeys[sessionIndex]);
          if (!sessionValue) continue;
          return normaliseState(Object.assign(JSON.parse(sessionValue), { migrated_legacy_key: legacySessionKeys[sessionIndex] }));
        }

        var legacyKeys = Array.isArray(config.legacy_keys) ? config.legacy_keys : [];
        for (var index = 0; index < legacyKeys.length; index += 1) {
          var legacy = window.localStorage.getItem(legacyKeys[index]);
          if (!legacy) continue;
          return normaliseState(Object.assign(JSON.parse(legacy), { migrated_legacy_key: legacyKeys[index] }));
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

  function setText(selector, text) {
    document.querySelectorAll(selector).forEach(function (node) { node.textContent = text; });
  }

  function allAbilityComplete() {
    return Boolean(state.ability.explain && state.ability.judge && state.ability.apply && state.ability.transfer);
  }

  function webPracticeReady() {
    return allAbilityComplete();
  }

  function applyFormalState(stateSource) {
    lastProjectState = stateSource || {};
    var formal = lastProjectState.formal_state || {};
    var day05 = getDay(lastProjectState, "day-05") || {};
    var day06 = getDay(lastProjectState, "day-06") || {};
    var day07 = getDay(lastProjectState, "day-07") || {};
    var courseCompleted = day07.formal_status === "completed";
    var courseActive = formal.day_id === "day-07" && day07.formal_status === "in_progress";
    var assessmentStarted = Boolean(courseActive && (formal.session_id || day07.assessment_status === "in_progress"));
    var pageCompleted = Boolean(day07.page_learning && day07.page_learning.status === "completed");
    var practiceReady = webPracticeReady();
    var passed = "Day 01–04：正式掌握；Day 06：正式掌握。Day 05 课程已完成，但应用与迁移缺口保留。";
    var gap = day05.concept_status === "needs_reinforcement"
      ? "Day 05 · Rubric 与证据链的应用、迁移证据仍待巩固；本次不复测、不改写。"
      : "当前无额外保留缺口；以 study-project.json 为准。";
    var task;
    var surface;
    var condition;
    var status;
    var cockpitTitle;
    var cockpitMode;
    var handoffTitle;
    var handoffSummary;
    var handoffPrimary;
    var handoffPrimaryHref = "#summary";
    var copyLabel;
    var preparationStatus;
    var formalScope;

    if (assessmentStarted) {
      task = formal.pending_question_id || formal.required_retest_of_question_id || "按 Day 07 唯一正式会话继续";
      surface = "Codex · Day 07 正式评测";
      condition = "回到唯一 session，一次只处理一道题；不要再次启动或创建新会话。";
      status = "Day 07 正式评测进行中";
      cockpitTitle = "Day 07 正式评测进行中：只推进唯一会话。";
      cockpitMode = "ASSESSMENT IN PROGRESS";
      handoffTitle = "正式评测进行中：回到唯一 Day 07 会话继续当前题。";
      handoffSummary = "不要再次创建或启动新的评测会话；网页课程只用于继续理解、查看示例和复盘学习笔记。";
      handoffPrimary = "查看我的理解地图";
      copyLabel = "复制当前评测接力";
      preparationStatus = "Day 07 正式评测已启动；按唯一会话继续";
      formalScope = "Day 07 正式评测已启动；只继续当前唯一 session 与 pending question，不重复启动、不创建第二条正式主线，网页练习不生成评分或掌握证据";
    } else if (courseCompleted) {
      task = "Day 07 已正式完成；本页仅用于复盘，不创建新会话";
      surface = "网页 · Day 07 复盘";
      condition = "只做概念复盘与学习笔记补充；不得创建新的 Day 07 session 或改写既有掌握证据。";
      status = "Day 07 已正式完成 · 本页仅用于复盘";
      cockpitTitle = "Day 07 已正式完成：这里保留概念讲解与课程复盘。";
      cockpitMode = "FORMALLY COMPLETED";
      handoffTitle = "Day 07 已正式完成：本页只用于复盘、查漏和学习笔记补充。";
      handoffSummary = "不会创建新的 Day 07 session，也不会改写既有掌握证据。";
      handoffPrimary = "查看我的理解地图";
      copyLabel = "复制当前复盘状态";
      preparationStatus = "Day 07 已正式完成；网页只保留概念复盘与工作坊回看";
      formalScope = "Day 07 正式课程已经完成；本页只用于复盘，不创建新 session、题目、评分、复测关系，也不改写既有掌握证据";
    } else if (courseActive) {
      task = pageCompleted
        ? "Day 07 网页课程已完成；等待你明确启动正式评测"
        : practiceReady
          ? "五个概念模块与端到端工作坊已完成；核对理解地图后确认课程完成"
          : "完成五个概念模块与端到端工作坊";
      surface = "网页 · Day 07 正式课程";
      condition = practiceReady
        ? "页面内四项能力活动已完成；核对理解地图后，再明确发送“启动 Day 07 正式评测”。"
        : "完成五个概念模块与端到端工作坊后，再明确发送“启动 Day 07 正式评测”。";
      status = "Day 07 正式课程已开启 · 正式评测尚未启动";
      cockpitTitle = "Day 07 已正式开启：从理解走到独立应用。";
      cockpitMode = "COURSE IN PROGRESS";
      handoffTitle = "正式学习接力：网页课程完成后，仍需另行启动正式评测。";
      handoffSummary = "概念解释、错误辨析、场景方案、端到端工作坊和理解地图都属于网页学习。完成页面内四项能力活动后，再回到 Codex 明确发送“启动 Day 07 正式评测”。";
      handoffPrimary = practiceReady ? "核对我的理解地图" : "继续课程学习";
      copyLabel = "复制当前学习接力";
      preparationStatus = pageCompleted
        ? "Day 07 网页课程已完成；等待明确启动正式评测"
        : practiceReady
          ? "Day 07 页面内四项能力活动已完成；等待核对理解地图"
          : "Day 07 正式课程已开启；概念学习与端到端工作坊进行中，尚无正式 session 或 pending question";
      formalScope = "本次只推进 Day 07 网页课程；正式评测尚未启动，不创建题目、评分、复测关系或掌握证据";
    } else {
      task = "Day 07 不是当前正式课程；按学习总览中的最新位置继续";
      surface = "学习总览 · 核对正式位置";
      condition = "本页只可预览或复盘；不要从这里越级启动 Day 07 正式评测。";
      status = "Day 07 尚未成为当前正式课程，请回到学习总览核对状态";
      cockpitTitle = "正在核对 Day 07 正式课程状态。";
      cockpitMode = "STATE CHECK";
      handoffTitle = "Day 07 不是当前正式课程：请先核对学习总览。";
      handoffSummary = "本页可以预览，但不会越级创建 Day 07 session、题目、评分或掌握证据。";
      handoffPrimary = "查看我的理解地图";
      copyLabel = "复制当前学习接力";
      preparationStatus = "Day 07 不是当前正式课程；网页内容只作预习或复盘";
      formalScope = "Day 07 当前不在正式主线上；本页只可预览或复盘，不创建 Day 07 session、题目、评分、复测关系或掌握证据";
    }

    var day05Progress = day05.formal_status === "completed"
      ? (day05.concept_status === "mastered" ? "正式掌握" : "课程完成，掌握缺口保留")
      : "未完成";
    var day06Progress = day06.formal_status === "completed"
      ? (day06.concept_status === "mastered" ? "正式掌握" : "课程完成")
      : "未完成";
    var day07Progress = courseCompleted
      ? (day07.concept_status === "mastered" ? "正式掌握" : "课程完成")
      : assessmentStarted
        ? "正式评测进行中"
        : courseActive
          ? "正式课程进行中"
          : day07.eligibility_status === "eligible" ? "可学习，尚未正式开启" : "未正式开启";
    var formalProgress = "Day 01–04：正式掌握 · Day 05：" + day05Progress + " · Day 06：" + day06Progress + " · Day 07：" + day07Progress;

    setText("[data-later-page-status]", status);
    setText("[data-later-cockpit-title]", cockpitTitle);
    setText("[data-later-cockpit-summary]", formalProgress + "。网页概念学习、带提示实操、端到端工作坊和理解地图只记录课程活动，不直接生成正式掌握证据。");
    setText("[data-later-cockpit-mode]", cockpitMode);
    setText("[data-later-cockpit-updated]", formatDate(lastProjectState.updated_at));
    setText("[data-later-passed-scope]", passed);
    setText("[data-later-current-gap]", gap);
    setText("[data-later-formal-task]", task);
    setText("[data-later-current-surface]", surface);
    setText("[data-later-switch-condition]", condition);
    setText("[data-later-sticky-surface]", surface);
    setText("[data-later-sticky-condition]", condition);
    setText("[data-later-formal-summary]", "Day 06 " + (day06.formal_status || "unknown") + " + " + (day06.concept_status || "unknown") + "；Day 07 " + (day07.formal_status || "unknown") + " / " + (day07.assessment_status || "unknown") + "；当前正式 session = " + (formal.session_id || "无") + "。" );
    setText("[data-formal-handoff-title]", handoffTitle);
    setText("[data-formal-handoff-summary]", handoffSummary);
    setText("[data-formal-handoff-primary]", handoffPrimary);
    setText("[data-copy-formal-entry]", copyLabel);
    document.querySelectorAll("[data-formal-handoff-primary]").forEach(function (node) { node.setAttribute("href", handoffPrimaryHref); });

    var stageStates = { foundation: "verified", day05: day05.concept_status === "mastered" ? "verified" : "gap", day06: day06.concept_status === "mastered" ? "verified" : "gap", current: courseCompleted ? "verified" : courseActive ? "preview" : "gap" };
    Object.keys(stageStates).forEach(function (name) {
      var node = document.querySelector('[data-later-progress-stage="' + name + '"]');
      if (node) node.dataset.state = stageStates[name];
    });
    setText('[data-later-stage-status="foundation"]', "正式完成 · mastered");
    setText('[data-later-stage-status="day05"]', day05.concept_status === "mastered" ? "正式完成 · mastered" : "课程完成 · 掌握缺口保留");
    setText('[data-later-stage-status="day06"]', day06.concept_status === "mastered" ? "正式完成 · mastered" : "以 JSON 为准");
    setText('[data-later-stage-status="current"]', assessmentStarted
      ? "正式评测进行中"
      : courseCompleted
        ? (day07.concept_status === "mastered" ? "正式完成 · mastered" : "课程完成 · " + (day07.concept_status || "以 JSON 为准"))
        : courseActive ? "正式课程进行中 · assessment not_started" : "等待正式开启");

    window.__STUDY_PAGE_HANDOFF__ = {
      day_id: formal.day_id,
      focus: config.day_label + " / " + config.knowledge_anchor,
      page_anchor: config.page_anchor,
      formal_progress: formalProgress,
      next_surface: surface,
      switch_condition: condition,
      preparation_status: preparationStatus,
      formal_scope: formalScope,
      passed_scope: passed,
      reteach_contract: "若我出现概念混淆，请按‘白话解释 → 旧心智模型 → 错误方案 → 可观察示例 → 带提示实操’重新教学；不要只重复标准答案，且正式复测必须在 Codex 中按最新状态安排。"
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
      ? "你的选择与本模块的控制边界一致。继续核对完整判断链，而不是只记住选项。"
      : "当前只处理这一个错误节点；修正后可以再次提交，不需要重做其他模块。";
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
    var reason = String(values[id + "_reason"] || "").trim();
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
        saveState(result.pass ? "关键判断已辨清；可以继续做带提示的场景方案。" : "解析已经展开；回看错误节点后可以直接修改再试。");
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
          ? "方案已记录。可以打开示例方案，找一处继续补强。"
          : "再补充一点：至少写清谁负责决定，以及失败后产品怎么继续。");
        refreshProgressAndHandoff();
        saveState(completed ? "场景方案已记录；示例方案现在可以打开。" : "场景方案还需要补充一层职责或失败动作。");
      });
      if (moduleState.transfer && moduleState.transfer.answer) {
        setTransferFeedback(id, Boolean(moduleState.transfer.completed), moduleState.transfer.completed
          ? "已恢复你的场景方案。可以继续对照示例修改。"
          : "上次方案还比较简略，可以结合提示继续补充。");
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
        button.textContent = open ? "收起示例" : (id === "final" ? "查看示例架构" : "打开示例方案");
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

    function restoreFinal() {
      if (!state.final_practice) return;
      var checks = normaliseChecks(state.final_practice.checks);
      form.querySelectorAll('input[name="final_check"]').forEach(function (field) { field.checked = checks.indexOf(field.value) >= 0; });
      if (state.final_practice.completed && feedback) feedback.hidden = false;
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var values = valuesOf(form);
      var answer = String(values.final_diagnosis || "").trim();
      var checks = normaliseChecks(values.final_check);
      var completed = answer.length >= 100 && checks.length === 5;
      state.final_practice = { completed: completed, answer: answer, checks: checks, updated_at: new Date().toISOString() };
      if (error) error.textContent = completed ? "" : "请沿工作坊路线补充方案，并完成五项覆盖核对。";
      if (feedback) feedback.hidden = !completed;
      refreshProgressAndHandoff();
      saveState(completed ? "端到端工作坊方案已保存；现在可以查看示例架构。" : "工作坊方案还没有覆盖完整链路。");
    });
    restoreFinal();
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
    return [
      "# 我的 Day 07 理解地图",
      "",
      "## Browser / Server Proxy / Provider Adapter：我的理解或疑问",
      answer("adapter_teachback", "还没有记录这一模块的学习笔记"),
      "",
      "## 候选与确定性校验：我的理解或疑问",
      answer("candidate_teachback", "还没有记录这一模块的学习笔记"),
      "",
      "## Guard 与状态推进：我的理解或疑问",
      answer("flow_teachback", "还没有记录这一模块的学习笔记"),
      "",
      "## 有限重试与安全降级：我的理解或疑问",
      answer("retry_teachback", "还没有记录这一模块的学习笔记"),
      "",
      "## Grounded Report：我的理解或疑问",
      answer("report_teachback", "还没有记录这一模块的学习笔记"),
      "",
      "## 端到端工作坊方案",
      answer("final_diagnosis", "还没有完成端到端工作坊"),
      "",
      "> 这是课程中的理解地图，不是正式评分答案或掌握证据；疑问和不完整理解也可以保留。"
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

  function setupAnswerCard() {
    var build = document.querySelector("[data-build-answer-card]");
    var toggle = document.querySelector("[data-toggle-answer-card]");
    var copy = document.querySelector("[data-copy-answer-card]");
    var panel = document.querySelector("[data-answer-card]");
    if (build) build.addEventListener("click", function () {
      state.answer_card = answerCardMarkdown();
      renderAnswerCard(state.answer_card);
      saveState("理解地图已由你的学习笔记和工作坊方案汇总。");
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

  function setupActions() {
    var clear = document.querySelector("[data-clear-session-draft]");
    if (clear) clear.addEventListener("click", function () {
      if (!window.confirm("只清除当前标签页的 " + config.day_label + " 练习与草稿？正式记录和旧 localStorage 数据不会被删除。")) return;
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
  if (state.migrated_legacy_key) saveState("旧 Day 07 草稿已迁移到新的学习闭环；原数据未删除。");
})();
