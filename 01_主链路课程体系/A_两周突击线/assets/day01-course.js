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
    role: {
      correct: "product_owner_boundary",
      passTitle: "产品结果责任与专业实施责任已经分开。",
      failTitle: "AI 产品经理仍被缩成需求传递者或模型训练执行者。",
      known: "医疗问答助手可能给出高风险建议，算法、研发、法务与业务都参与交付。",
      error: "把风险门槛完全交给算法团队，或要求产品经理亲自训练模型和实现服务才算负责。",
      why: "AI 产品经理要定义用户价值、评测标准、权限、兜底和上线门槛，并对产品结果负责；专业团队负责各自实现和审核。",
      chain: "定义用户与风险 → 设证据/权限/门槛 → 协同算法研发实现 → 用数据验收 → 高风险不达标则阻断或降级。",
      invariant: "产品经理不替代算法、研发或法务，但必须确保有人承担实现，并对用户价值、风险边界和业务结果作出产品决定。"
    },
    map: {
      correct: "full_chain",
      passTitle: "知识地图已经从真实问题走到可验证的产品结果。",
      failTitle: "链路仍从模型开始，或在上线动作处提前结束。",
      known: "团队拿到一个“做 AI 客服”的方向，但用户问题、上线门槛、成本与商业结果尚未定义。",
      error: "直接进入模型选择和开发，或把上线当成终点，没有证明用户问题、风险、成本与业务结果。",
      why: "AI 产品经理的地图用于连续做决定；缺少任何关键节点，后续技术方案和上线数据都可能回答错问题。",
      chain: "用户/业务问题 → 目标与假设 → AI 必要性 → 方案与实现 → 评测/Badcase → 风险/成本门槛 → 上线实验 → 商业结果。",
      invariant: "地图必须同时覆盖价值、可行性、质量、风险、成本和结果；技术实现只是中间一段。"
    },
    necessity: {
      correct: "split_ai_rules",
      passTitle: "真正需要 AI 的语义任务与固定规则已经拆开。",
      failTitle: "AI 标签仍替代了必要性判断，或硬规则被交给概率输出。",
      known: "投诉系统要理解用户自由文本并生成个性化说明，同时按固定公式计算赔付且限制审批权限。",
      error: "因为要理解文本就让模型接管整条流程，或因为有固定规则就否定所有 AI 价值。",
      why: "AI 必要性应落到子任务：开放语义与生成可能需要模型；固定计算、权限和状态更适合确定性程序。",
      chain: "拆分子任务 → 标出语义不确定性 → 分配模型候选 → 程序计算/权限/写入 → 核对是否比非 AI 基线更有价值。",
      invariant: "先证明哪一项能力非 AI 难以稳定完成，再选择 AI；同一产品可以同时包含 AI、规则与普通界面。"
    },
    gate: {
      correct: "block_and_regress",
      passTitle: "Badcase、系统风险和上线门槛已经形成完整闭环。",
      failTitle: "修一个错误或人工接管个案仍被误当成系统可以上线。",
      known: "简历筛选助手编造候选人经历；同类高严重度错误在离线回归中重复出现。",
      error: "只修改 Prompt、处理当前个案后继续放量，没有复跑原 Badcase、正常/边界用例，也没有系统性阻断。",
      why: "个案人工接管只保护当前用户；重复高严重度错误说明风险尚未稳定控制，必须阻断上线或停止放量。",
      chain: "阻断错误输出 → 根因归因 → 修复 → 原 Badcase + 正常/边界回归 → 核对严重错误率与成本 → 达标才放行。",
      invariant: "上线门槛同时看质量、严重度、可控性和单位成本；修复动作不等于修复证据，单次成功也不等于稳定。"
    },
    mvp: {
      correct: "core_loop",
      passTitle: "七天首版已经围绕一个可验证价值闭环冻结。",
      failTitle: "功能数量、技术亮点或基础设施仍挤占核心假设。",
      known: "团队只有 7 天，要验证用户是否能完成一轮与经历相关的面试练习并获得有证据的反馈。",
      error: "把语音、知识库、账号支付和管理后台都列为首版必做，导致核心练习闭环无法及时验证。",
      why: "MVP 不是最少功能清单，而是验证一个关键假设所需的最小完整体验；延后项必须被明确写出。",
      chain: "写核心假设 → 列必须完成的端到端行为 → 删除不影响本次验证的能力 → 标记延后 → 定义成功指标与停止条件。",
      invariant: "范围由当前要验证的假设决定；“以后有用”和“技术上能做”都不是进入本轮 MVP 的充分理由。"
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
    var day01 = getDay(lastProjectState, "day-01") || {};
    var day02 = getDay(lastProjectState, "day-02") || {};
    var day07 = getDay(lastProjectState, "day-07") || {};
    var completed = day01.formal_status === "completed";
    var mastered = day01.concept_status === "mastered";
    var historicalSessions = Array.isArray(config.historical_session_ids) ? config.historical_session_ids.join(" / ") : "session-e3867cb56c9b / session-8f11a2c490d7";
    var activeLabel = formal.day_id === "day-07" && day07.formal_status === "in_progress"
      ? "Day 07 正式课程进行中"
      : "当前正式位置：" + (formal.day_id || "未识别");
    var passed = "Day 01 已正式验证：AI 产品经理职责与算法 / 研发边界、从用户问题到商业结果的完整知识地图、AI 必要性、Badcase 根因与回归、风险分级、单次会话成本与 Context 压缩，以及 7 天 MVP 的核心闭环和延后范围。";
    var reviewBoundary = mastered
      ? "两段正式会话均已结束，无 pending question 或 required retest。保持计划包含 2026-08-22 / 2026-08-23 与 D+30 的 2026-09-06 / 09-07 / 09-08；提前结束二次确认仍保留在十二周长期线。"
      : "Day 01 当前掌握状态为 " + (day01.concept_status || "unknown") + "；仍以正式记录为准。";
    var task = formal.pending_question_id || formal.required_retest_of_question_id || (formal.day_id === "day-07" ? "继续 Day 07 网页课程；Day 01 无待答题或复测关系" : "按当前正式状态源继续");
    var surface = "网页 · Day 01 已掌握复盘";
    var condition = "完成本地复盘后返回 " + activeLabel + "；本页不自动重复正式测试已掌握范围，只有你明确提出时才安排新的正式复测。";

    setText("[data-later-page-status]", completed ? "Day 01 课程已完成 · mastery = " + (day01.concept_status || "unknown") : "Day 01 状态需核对 · 本页不伪造完成");
    setText("[data-later-formal-summary]", "Day 01 " + (day01.formal_status || "unknown") + " / " + (day01.concept_status || "unknown") + "；" + activeLabel + "；历史 sessions = " + historicalSessions + "。");
    setText("[data-later-cockpit-title]", mastered ? "Day 01 已正式掌握：按需复盘，不重复证明。" : "Day 01 正式记录已读取：本页不改写历史状态。");
    setText("[data-later-cockpit-summary]", "Day 01 两段正式会话 " + historicalSessions + " 均已结束且没有 pending question。网页复盘只写当前标签页，不创建 session、评分、错题、复测关系或掌握证据。");
    setText("[data-later-cockpit-mode]", mastered ? "REVIEW · MASTERED PRESERVED" : "FORMAL REVIEW");
    setText("[data-later-cockpit-updated]", formatDate(lastProjectState.updated_at));
    setText("[data-later-passed-scope]", passed);
    setText("[data-later-current-gap]", reviewBoundary);
    setText("[data-later-formal-task]", task);
    setText("[data-later-current-surface]", surface);
    setText("[data-later-switch-condition]", condition);
    setText("[data-later-sticky-surface]", surface);
    setText("[data-later-sticky-condition]", condition);
    setText("[data-formal-handoff-title]", "Day 01 已正式掌握：本页只用于复盘和保持。" );
    setText("[data-formal-handoff-summary]", "网页复盘不会重启已结束的 Day 01 会话，也不会覆盖职责边界、知识地图、上线门槛与 MVP 范围的正式证据。当前正式主线是 " + activeLabel + "。" );

    var stageState = {
      foundation: mastered ? "verified" : "gap",
      day01: mastered ? "verified" : completed ? "gap" : "preview",
      day02: day02.concept_status === "mastered" ? "verified" : day02.formal_status === "completed" ? "gap" : "preview",
      current: formal.day_id === "day-07" && day07.formal_status === "in_progress" ? "preview" : "gap"
    };
    Object.keys(stageState).forEach(function (name) {
      var node = document.querySelector('[data-later-progress-stage="' + name + '"]');
      if (node) node.dataset.state = stageState[name];
    });
    setText('[data-later-stage-status="foundation"]', mastered ? "19 题旧知识核验 · 全部通过" : "以正式记录为准");
    setText('[data-later-stage-status="day01"]', completed ? "课程完成 · " + (day01.concept_status || "unknown") : "未完成");
    setText('[data-later-stage-status="day02"]', day02.formal_status === "completed" ? "课程完成 · " + (day02.concept_status || "unknown") : "未完成");
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
        setTransferFeedback(id, completed, completed ? "方案已记录。可以打开示例，找一处继续补强。" : "再补充一点：至少写清当前事实、产品决定、判断依据与边界或验证动作。" );
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
      saveState(completed ? "综合产品决策工作坊已保存。" : "工作坊方案还没有覆盖完整产品决策与 MVP 链路。" );
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
      "# 我的 Day 01 AI 产品决策地图", "",
      "## 产品结果与职责边界：我的理解或疑问", answer("role_teachback", "尚未记录"), "",
      "## 从用户问题到商业结果：我的理解或疑问", answer("map_teachback", "尚未记录"), "",
      "## AI 必要性与程序分工：我的理解或疑问", answer("necessity_teachback", "尚未记录"), "",
      "## Badcase、风险、成本与上线门槛：我的理解或疑问", answer("gate_teachback", "尚未记录"), "",
      "## MVP 范围冻结：我的理解或疑问", answer("mvp_teachback", "尚未记录"), "",
      "## 综合产品决策工作坊", answer("final_diagnosis", "尚未完成工作坊"), "",
      "> 这是 Day 01 本地复盘痕迹，不是新一次正式评测，不会覆盖既有 mastered 证据。"
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
      if (!window.confirm("只清除当前标签页新保存的 Day 01 复盘练习与草稿？两段正式记录不会被删除。")) return;
      window.sessionStorage.removeItem(storageKey);
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
  if (state.migrated_legacy_key) saveState("旧 Day 01 草稿已只读迁移到新的复盘闭环；原数据未删除。" );
})();
