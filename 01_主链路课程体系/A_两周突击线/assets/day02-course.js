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
    requirements: {
      correct: "path_first",
      passTitle: "判断已经回到需求事实与最小实现路径。",
      failTitle: "技术名词仍然跑在用户问题与约束前面。",
      known: "首版只需按固定名单提醒逾期合同，不理解自然语言，也不生成内容或调用多个系统。",
      error: "先挑模型或 Agent，再倒推它能做什么；没有先判断任务是否根本需要生成式 AI。",
      why: "方案选型比较的是解决路径，不是技术先进程度。固定输入、固定规则、固定动作可以由普通程序更稳定地完成。",
      chain: "列出输入/动作/边界 → 判断是否需要语义生成 → 比较非 AI、规则与 AI 路径 → 选择能验证核心假设的最小组合。",
      invariant: "无论场景如何变化，都先问“任务需要什么能力”，再问“哪种实现足够”，最后才进入具体模型选择。"
    },
    ownership: {
      correct: "split_control",
      passTitle: "生成任务与硬规则已经分给合适的执行者。",
      failTitle: "概率性模型仍被要求承担必须精确执行的控制。",
      known: "客服助手既要理解自由文本并起草回复，又必须保证退款金额公式、审批权限和每日上限完全准确。",
      error: "把所有步骤都交给 Prompt，或因为有生成任务就把全部流程都做成模型判断。",
      why: "模型擅长语义理解和语言生成，却不能保证计数、金额、权限和状态迁移每次都严格一致。",
      chain: "模型提取诉求并生成候选回复 → 程序查订单与权限 → 程序计算金额/上限 → 合法才写入 → 留存结果。",
      invariant: "语义候选可由模型提出；金额、计数、权限、校验、状态写入和兜底必须由确定性程序掌握。"
    },
    knowledge: {
      correct: "rag_for_sources",
      passTitle: "外部知识需求已经正确映射到检索增强方案。",
      failTitle: "RAG、微调和换模型仍被当成互相替代的万能升级。",
      known: "政策助手必须依据每天更新的公司制度回答，并展示可核对的最新条款来源。",
      error: "把变化中的知识训练进模型，或只换更大模型，却没有在调用时取得权威资料并限制回答。",
      why: "微调主要改变行为或任务能力，不适合承担每日更新的事实；RAG 才是在运行时检索资料、放入上下文并要求模型基于来源生成。",
      chain: "识别外部/时效/引用需求 → 检索权威制度 → 将片段与问题放入 Context → LLM 生成 → 核对引用与版本。",
      invariant: "知识缺口优先比较检索；稳定行为缺口且有高质量样本才比较微调；两者都必须从可复现根因出发。"
    },
    workflow: {
      correct: "fixed_workflow",
      passTitle: "固定工作流与 Agent 的边界已经分清。",
      failTitle: "自动化、Web 形态或代码量仍被误当成 Agent 触发器。",
      known: "系统每天固定 10 点调用同一个接口创建日程；输入、顺序和失败分支都能预先写死。",
      error: "因为任务会自动执行或存在 API，就直接引入模型自主规划与多工具编排。",
      why: "Agent 的价值来自目标驱动的动态拆解、工具选择和中间结果决策；固定路径用普通程序更便宜、可测且易恢复。",
      chain: "确认步骤固定 → 程序按时调用单一接口 → 按预定义结果成功/重试/告警 → 保存状态，不让模型改计划。",
      invariant: "只有出现动态多步决策、多工具选择、按中间结果调整路径和跨步骤状态时，才重新比较 Agent 或多步工作流。"
    },
    adr: {
      correct: "mapped_trigger",
      passTitle: "替代方案、不选原因与重评触发器已经逐项对应。",
      failTitle: "宽泛 Badcase 或技术清单仍无法恢复当时的决策逻辑。",
      known: "当前不用 RAG、微调和复杂 Agent，但团队需要知道未来哪种事实变化会让旧选择失效。",
      error: "只写“效果不好就重评”或罗列技术，没有说明根因如何指向某个替代方案。",
      why: "同一个 Badcase 可能来自知识、行为、流程或产品定义问题；不先归因，就无法知道该重评哪条路径。",
      chain: "记录背景与选择 → 对每个替代方案写当前不选原因 → 写对应事实触发器 → 补后果/风险 → 规定重评而非自动切换。",
      invariant: "ADR 保存的是有时间边界的决策逻辑；触发器只启动重新比较，不能替未来团队提前做出技术结论。"
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
    var day03 = getDay(lastProjectState, "day-03") || {};
    var day07 = getDay(lastProjectState, "day-07") || {};
    var completed = day02.formal_status === "completed";
    var mastered = day02.concept_status === "mastered";
    var historicalSession = day02.session_id || config.historical_session_id || "session-dbf06515";
    var activeLabel = formal.day_id === "day-07" && day07.formal_status === "in_progress"
      ? "Day 07 正式课程进行中"
      : "当前正式位置：" + (formal.day_id || "未识别");
    var passed = "Day 02 已正式验证：从需求比较 Prompt + LLM、确定性程序、RAG、Fine-tuning 与 Agent；能写出 ADR 的背景、选择、替代方案、取舍、风险、不选原因和重评触发器，并区分固定工作流与自主多步执行。";
    var reviewBoundary = mastered
      ? "方案选型与 ADR 均已掌握，正式会话已结束；保持层按既有计划复习，下一节点为 2026-08-23，D+30 节点为 2026-09-08。提前结束二次确认仍保留在十二周长期线。"
      : "Day 02 当前掌握状态为 " + (day02.concept_status || "unknown") + "；仍以正式记录为准。";
    var task = formal.pending_question_id || formal.required_retest_of_question_id || (formal.day_id === "day-07" ? "继续 Day 07 网页课程；Day 02 无待答题或复测关系" : "按当前正式状态源继续");
    var surface = "网页 · Day 02 已掌握复盘";
    var condition = "完成本地复盘后返回 " + activeLabel + "；本页不自动重复正式测试已掌握范围，只有你明确提出时才安排新的正式复测。";

    setText("[data-later-page-status]", completed ? "Day 02 课程已完成 · mastery = " + (day02.concept_status || "unknown") : "Day 02 状态需核对 · 本页不伪造完成");
    setText("[data-later-formal-summary]", "Day 02 " + (day02.formal_status || "unknown") + " / " + (day02.concept_status || "unknown") + "；" + activeLabel + "；历史 session = " + historicalSession + "。");
    setText("[data-later-cockpit-title]", mastered ? "Day 02 已正式掌握：按需复盘，不重复证明。" : "Day 02 正式记录已读取：本页不改写历史状态。");
    setText("[data-later-cockpit-summary]", "Day 02 正式会话 " + historicalSession + " 已结束且没有 pending question。网页复盘只写当前标签页，不创建 session、评分、错题、复测关系或掌握证据。");
    setText("[data-later-cockpit-mode]", mastered ? "REVIEW · MASTERED PRESERVED" : "FORMAL REVIEW");
    setText("[data-later-cockpit-updated]", formatDate(lastProjectState.updated_at));
    setText("[data-later-passed-scope]", passed);
    setText("[data-later-current-gap]", reviewBoundary);
    setText("[data-later-formal-task]", task);
    setText("[data-later-current-surface]", surface);
    setText("[data-later-switch-condition]", condition);
    setText("[data-later-sticky-surface]", surface);
    setText("[data-later-sticky-condition]", condition);
    setText("[data-formal-handoff-title]", "Day 02 已正式掌握：本页只用于复盘和保持。" );
    setText("[data-formal-handoff-summary]", "网页复盘不会重启已结束的 Day 02 会话，也不会覆盖方案选型、ADR 与 Agent 边界的正式证据。当前正式主线是 " + activeLabel + "。" );

    var stageState = {
      foundation: day01.concept_status === "mastered" ? "verified" : "gap",
      day02: mastered ? "verified" : completed ? "gap" : "preview",
      day03: day03.concept_status === "mastered" ? "verified" : day03.formal_status === "completed" ? "gap" : "preview",
      current: formal.day_id === "day-07" && day07.formal_status === "in_progress" ? "preview" : "gap"
    };
    Object.keys(stageState).forEach(function (name) {
      var node = document.querySelector('[data-later-progress-stage="' + name + '"]');
      if (node) node.dataset.state = stageState[name];
    });
    setText('[data-later-stage-status="foundation"]', day01.concept_status === "mastered" ? "前序正式完成 · mastered" : "以正式记录为准");
    setText('[data-later-stage-status="day02"]', completed ? "课程完成 · " + (day02.concept_status || "unknown") : "未完成");
    setText('[data-later-stage-status="day03"]', day03.formal_status === "completed" ? "课程完成 · " + (day03.concept_status || "unknown") : "未完成");
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
        setTransferFeedback(id, completed, completed ? "方案已记录。可以打开示例，找一处继续补强。" : "再补充一点：至少写清需求事实、所选路径与判断依据或重评条件。" );
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
      saveState(completed ? "综合方案工作坊已保存。" : "工作坊方案还没有覆盖完整选型与 ADR 链路。" );
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
      "# 我的 Day 02 方案选型与 ADR 理解地图", "",
      "## 从需求到实现路径：我的理解或疑问", answer("requirements_teachback", "尚未记录"), "",
      "## 模型与程序职责分工：我的理解或疑问", answer("ownership_teachback", "尚未记录"), "",
      "## RAG 与微调启用边界：我的理解或疑问", answer("knowledge_teachback", "尚未记录"), "",
      "## 固定工作流与 Agent：我的理解或疑问", answer("workflow_teachback", "尚未记录"), "",
      "## ADR 与重评触发器：我的理解或疑问", answer("adr_teachback", "尚未记录"), "",
      "## 综合方案工作坊", answer("final_diagnosis", "尚未完成工作坊"), "",
      "> 这是 Day 02 本地复盘痕迹，不是新一次正式评测，不会覆盖既有 mastered 证据。"
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
      if (!window.confirm("只清除当前标签页新保存的 Day 02 复盘练习与草稿？正式记录不会被删除。")) return;
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
  if (state.migrated_legacy_key) saveState("旧 Day 02 草稿已只读迁移到新的复盘闭环；原数据未删除。" );
})();
