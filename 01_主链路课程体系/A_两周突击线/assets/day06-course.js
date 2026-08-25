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
    pageflow: {
      correct: "verify_restore",
      passTitle: "URL 服从服务端事实，页面回到唯一合法状态。",
      failTitle: "页面仍在用地址反向创造业务事实。",
      known: "用户访问结果页，但服务端档案仍处于材料收集状态。",
      error: "在读取和核对 session 之前，就把访问意图当成了完成事实。",
      why: "URL 可被手输、收藏、回退或分享；它不能证明资源属于当前用户，也不能证明流程已完成。",
      chain: "读取 session → 核对权限与状态 → 返回 current_state / next_route → 页面解释并恢复。",
      invariant: "所有多步骤产品中，页面只能投影服务端事实，不能决定事实。"
    },
    responsibility: {
      correct: "server_guard",
      passTitle: "最终状态留在 Server Guard 的确定性控制内。",
      failTitle: "候选或页面仍获得了不属于它的写入权。",
      known: "模型给出 approved 候选，但权限检查尚未完成。",
      error: "把概率性候选或公开页面动作当成最终业务裁决。",
      why: "Model 不拥有当前权限与完整 session 事实，Browser 也不是可信执行环境。",
      chain: "Browser 发业务字段 → Server 核对权限和 session → 校验候选 → 程序决定状态与合法路由。",
      invariant: "秘密、权限、Guard 和最终写入权始终留在可信服务端。"
    },
    contract: {
      correct: "stable_error",
      passTitle: "错误已经变成程序能识别和恢复的合同。",
      failTitle: "客户端仍需要靠状态码或自然语言猜业务语义。",
      known: "HTTP 返回 200，但正文只写自然语言 upload failed。",
      error: "Contract 没有定义稳定 code、retryable、recovery_action 和 current_state。",
      why: "200 只描述传输层；自然语言 message 不稳定，无法可靠驱动页面和恢复流程。",
      chain: "区分传输与业务结果 → 返回稳定错误结构 → 保留事实 → 执行明确恢复动作。",
      invariant: "每个接口都要让成功、阻断、故障和重放拥有可编程语义。"
    },
    state: {
      correct: "same_id",
      passTitle: "结果未知时保留原身份，先核对而不是制造第二次写入。",
      failTitle: "恢复动作仍可能重复写入或丢失原业务事实。",
      known: "请求超时只代表客户端没有收到结果，服务端可能已经保存。",
      error: "把结果未知误判成写入失败，并准备创建新请求身份或清空输入。",
      why: "按钮禁用只覆盖当前页面；刷新、网络重放和多设备仍可能绕过它。",
      chain: "保留输入 / session_id / request_id → 查询事实或同 ID 重试 → 服务端重放同一结果。",
      invariant: "所有重要写入都要有稳定幂等身份、原子写入和明确恢复出口。"
    },
    mock: {
      correct: "skeleton_ready",
      passTitle: "Mock 结论停在了它真正覆盖的证据范围内。",
      failTitle: "验收结论超过了当前测试实际观察到的范围。",
      known: "页面、幂等和超时恢复已通过，但没有真实模型调用。",
      error: "把确定性骨架证据扩大成模型质量、延迟、成本或 Grounding 证据。",
      why: "固定响应绕过了真实 Provider 的认证、限流、漂移和概率性失败。",
      chain: "确认骨架已验收 → 列出未验证项 → 保持 Contract / Guard → 单独接入和验证模型层。",
      invariant: "Mock 只证明它实际覆盖的确定性行为，任何未运行能力都必须明确披露。"
    }
  };

  function blankState() {
    return {
      version: 2,
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
    var day05 = getDay(lastProjectState, "day-05") || {};
    var day06 = getDay(lastProjectState, "day-06") || {};
    var day07 = getDay(lastProjectState, "day-07") || {};
    var completed = day06.formal_status === "completed";
    var mastered = day06.concept_status === "mastered";
    var day06Label = completed ? (mastered ? "已正式完成并掌握" : "课程已完成，掌握状态以正式记录为准") : "当前状态不是 completed，请核对正式状态源";
    var activeLabel = formal.day_id === "day-07" && day07.formal_status === "in_progress"
      ? "Day 07 正式课程进行中"
      : "当前正式位置：" + (formal.day_id || "未识别");
    var passed = mastered
      ? "Day 06 正式评测已覆盖机制解释、场景应用和新场景迁移；历史掌握不会因网页复盘被撤销。"
      : "Day 06 历史证据以 study-project.json 为准；本页不新增、删除或改写正式证据。";
    var gap = day05.concept_status === "needs_reinforcement"
      ? "Day 05 的应用与迁移缺口仍保留；本页不复测。Day 06 没有新的正式缺口。"
      : "Day 06 没有新的正式缺口；复盘中的疑问只保存在当前标签页。";
    var task = formal.pending_question_id || formal.required_retest_of_question_id || (formal.day_id === "day-07" ? "继续 Day 07 网页课程；正式评测尚未启动" : "按当前正式状态源继续");
    var surface = "网页 · Day 06 本地复盘";
    var condition = "复盘结束后返回 " + activeLabel + "；不要重启 Day 06 session，也不要把页面进度写成正式掌握。";

    setText("[data-later-page-status]", "Day 06 " + day06Label + " · 本页仅用于复盘");
    setText("[data-later-formal-summary]", "Day 06 " + (day06.formal_status || "unknown") + " / " + (day06.concept_status || "unknown") + "；" + activeLabel + "；正式 session = " + (formal.session_id || "无") + "。");
    setText("[data-later-cockpit-title]", mastered ? "Day 06 已正式掌握：这里保留可重做的 Web 骨架复盘。" : "Day 06 正式记录已读取：本页不改写历史证据。");
    setText("[data-later-cockpit-summary]", "页面只读取唯一正式状态源。你的复盘检查、场景方案、学习笔记和工作坊只写当前标签页，不创建 session、题目、评分或复测关系。");
    setText("[data-later-cockpit-mode]", completed ? "FORMAL REVIEW" : "STATE CHECK");
    setText("[data-later-cockpit-updated]", formatDate(lastProjectState.updated_at));
    setText("[data-later-passed-scope]", passed);
    setText("[data-later-current-gap]", gap);
    setText("[data-later-formal-task]", task);
    setText("[data-later-current-surface]", surface);
    setText("[data-later-switch-condition]", condition);
    setText("[data-later-sticky-surface]", surface);
    setText("[data-later-sticky-condition]", condition);
    setText("[data-formal-handoff-title]", completed ? "Day 06 已正式完成：复盘后返回当前正式主线。" : "Day 06 当前不处于已完成状态：请先核对正式状态源。");
    setText("[data-formal-handoff-summary]", completed
      ? "Day 06 历史掌握保持不变。本页不会创建新会话；当前正式主线是 " + activeLabel + "。"
      : "本页只能阅读和保存当前标签页练习，不会伪造 completed 或 mastered。" );

    var stageState = {
      foundation: "verified",
      day05: day05.concept_status === "mastered" ? "verified" : "gap",
      day06: mastered ? "verified" : "gap",
      current: formal.day_id === "day-07" && day07.formal_status === "in_progress" ? "preview" : "gap"
    };
    Object.keys(stageState).forEach(function (name) {
      var node = document.querySelector('[data-later-progress-stage="' + name + '"]');
      if (node) node.dataset.state = stageState[name];
    });
    setText('[data-later-stage-status="foundation"]', "正式完成 · mastered");
    setText('[data-later-stage-status="day05"]', day05.formal_status === "completed" ? (day05.concept_status === "mastered" ? "正式掌握" : "课程完成 · 缺口保留") : "未完成");
    setText('[data-later-stage-status="day06"]', day06Label);
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
      ? "你的选择与本模块边界一致。继续看完整判断链，避免只记住选项。"
      : "当前只修正这一个错误节点；看完解析后可以修改并再次提交。";
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
        setTransferFeedback(id, completed, completed ? "方案已记录。可以打开示例，找一处继续补强。" : "再补充一点：至少写清事实、责任人和失败后的合法下一步。" );
        updateProgress();
        saveState(completed ? "开放式场景方案已保存。" : "场景方案还需要一条完整判断链。" );
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
      saveState(completed ? "综合 Web 骨架工作坊已保存。" : "工作坊方案还没有覆盖完整链路。" );
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
      "# 我的 Day 06 Web 骨架理解地图", "",
      "## Page Flow：我的理解或疑问", answer("pageflow_teachback", "尚未记录"), "",
      "## Browser / Server / Model 职责：我的理解或疑问", answer("responsibility_teachback", "尚未记录"), "",
      "## API Contract：我的理解或疑问", answer("contract_teachback", "尚未记录"), "",
      "## State / Request / Recovery：我的理解或疑问", answer("state_teachback", "尚未记录"), "",
      "## Runnable Mock：我的理解或疑问", answer("mock_teachback", "尚未记录"), "",
      "## 综合 Web 骨架工作坊", answer("final_diagnosis", "尚未完成工作坊"), "",
      "> 这是 Day 06 本地复盘痕迹，不是正式评分答案，也不会覆盖既有掌握证据。"
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
      if (!window.confirm("只清除当前标签页的 Day 06 复盘练习与草稿？正式记录和旧 localStorage 数据不会被删除。")) return;
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
  if (state.migrated_legacy_key) saveState("旧 Day 06 草稿已只读迁移到新的复盘闭环；原数据未删除。" );
})();
