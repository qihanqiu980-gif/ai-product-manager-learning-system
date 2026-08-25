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
    mapping: {
      correct: "concrete_pair",
      passTitle: "具体输入已经和可模仿输出形成完整映射。",
      failTitle: "标签或原则仍被误当成了 Few-shot 示例。",
      known: "助手要识别退款投诉，候选示例中只有一项同时给出用户原话、结构化结果和它覆盖的边界。",
      error: "只写“退款场景”“正确分类”或抽象提醒，没有展示模型实际会看到什么、应该具体返回什么。",
      why: "模型无法从案例名称推断团队心中的完整判断链；它需要在上下文中看到可直接模仿的 Input → Expected Output。",
      chain: "放入具体用户原话 → 给出完整目标 JSON → 说明该示例守住的退款边界 → 用新用例验证是否可模仿。",
      invariant: "Few-shot 示例必须包含具体输入与合格输出；标签、原则和解释都不能代替这组映射。"
    },
    examples: {
      correct: "missing_boundary",
      passTitle: "新增示例正好补上了现有 Badcase 的决策边界。",
      failTitle: "相似成功案例仍在重复已经会走的分支。",
      known: "退款助手已有“材料齐全 → 进入审核”，真实错误却是把材料不足的申请也直接送审。",
      error: "继续增加材料齐全的成功案例，没有展示哪项条件变化会触发“请求补充”。",
      why: "示例数量本身不产生信息增益；只有覆盖相反动作的关键差异，模型才看得见分界。",
      chain: "定位高频 Badcase → 保留材料齐全分支 → 新增材料不足分支 → 固定其他条件 → 用边界测试集回归。",
      invariant: "选例先服务关键决策边界，再验证稳定性；更多、更长或措辞更专业都不是目标。"
    },
    schema: {
      correct: "items_enum",
      passTitle: "数组容器与数组元素的约束已经放回正确层级。",
      failTitle: "required、enum 或长度约束仍放在了错误对象上。",
      known: "risk_flags 是数组：允许为空、最多 3 项；每一项是三个允许值之一的字符串，并且不能重复。",
      error: "把元素允许值写在数组外层，或把允许值误写成 required 字段名。",
      why: "数组外层约束集合规模与重复，items 才约束集合中每个值；required 只声明对象必须出现哪些字段。",
      chain: "声明 type=array → 外层设置 maxItems/uniqueItems → items 声明 string → 在 items 内设置 enum。",
      invariant: "Schema 约束必须跟随数据层级：对象管 properties/required，数组管数量，items 管单个元素。"
    },
    validation: {
      correct: "business_reject",
      passTitle: "结构合约与业务事实已经分别验收。",
      failTitle: "Schema 通过或模型自证仍被误当成事实成立。",
      known: "推荐 JSON 完全符合 Schema，但 source_ids 指向真实课程目录中不存在的对象。",
      error: "把字段存在、类型正确理解为引用真实，或让产生候选的模型再次为自己作证。",
      why: "Schema 只能验证候选长得是否符合契约；课程是否存在必须由确定性权威数据源核对。",
      chain: "保留原始候选 → JSON 解析通过 → Schema 通过 → 查询真实目录 → 拒绝不存在的 ID → 记录业务错误。",
      invariant: "解析、Schema、业务校验回答三个不同问题；只有全部通过，候选才有资格进入下游。"
    },
    retry: {
      correct: "exact_repair",
      passTitle: "纠错范围、重新验收和停止条件都已明确。",
      failTitle: "笼统重写或程序补丁仍绕过了完整校验。",
      known: "$.evidence_quotes 期望 array、实际是 string；其余字段是否可靠尚未证明。",
      error: "只说“再试一次”，或手工包成数组后直接放行，没有限制模型改动，也没有重新证明整份候选。",
      why: "不具体的反馈容易重复犯错或破坏正确字段；局部修补也不能证明业务事实和其他结构仍然有效。",
      chain: "阻断并留存候选 → 反馈路径/期望/实际 → 只修违规项且只回 JSON → 全量重验 → 最多 2 次 → 超限兜底。",
      invariant: "每次重试都必须错误具体、范围受控、重新全验且有固定上限；失败结果永不带病交付。"
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
    var day02 = getDay(lastProjectState, "day-02") || {};
    var day03 = getDay(lastProjectState, "day-03") || {};
    var day04 = getDay(lastProjectState, "day-04") || {};
    var day07 = getDay(lastProjectState, "day-07") || {};
    var completed = day03.formal_status === "completed";
    var mastered = day03.concept_status === "mastered";
    var activeLabel = formal.day_id === "day-07" && day07.formal_status === "in_progress"
      ? "Day 07 正式课程进行中"
      : "当前正式位置：" + (formal.day_id || "未识别");
    var passed = "Day 03 已正式验证：完整 Input → Expected Output、follow_up / new_question 对照分支、字段类型与 enum / required / 长度 / 数组 / 去重 / additionalProperties 契约，以及具体错误反馈、每次重验、最多 2 次和超限转人工。";
    var reviewBoundary = mastered
      ? "解释、应用与跨场景迁移均已 verified；保持层为 scheduled。Few-shot 复习节点为 2026-08-23 / 2026-09-08，Schema 复习节点为 2026-08-24 / 2026-09-09。"
      : "Day 03 当前掌握状态为 " + (day03.concept_status || "unknown") + "；仍以正式记录为准。";
    var task = formal.pending_question_id || formal.required_retest_of_question_id || (formal.day_id === "day-07" ? "继续 Day 07 网页课程；Day 03 无待答题或复测关系" : "按当前正式状态源继续");
    var surface = "网页 · Day 03 已掌握复盘";
    var condition = "完成本地复盘后返回 " + activeLabel + "；本页不自动重复正式测试已掌握范围，只有你明确提出时才安排新的正式复测。";

    setText("[data-later-page-status]", completed ? "Day 03 课程已完成 · mastery = " + (day03.concept_status || "unknown") : "Day 03 状态需核对 · 本页不伪造完成");
    setText("[data-later-formal-summary]", "Day 03 " + (day03.formal_status || "unknown") + " / " + (day03.concept_status || "unknown") + "；" + activeLabel + "；历史 session = " + (day03.session_id || "无") + "。");
    setText("[data-later-cockpit-title]", mastered ? "Day 03 已正式掌握：按需复盘，不重复证明。" : "Day 03 正式记录已读取：本页不改写历史状态。");
    setText("[data-later-cockpit-summary]", "Day 03 正式会话 " + (day03.session_id || "历史会话") + " 已结束且没有 pending question。网页复盘只写当前标签页，不创建 session、评分、错题、复测关系或掌握证据。");
    setText("[data-later-cockpit-mode]", mastered ? "REVIEW · MASTERED PRESERVED" : "FORMAL REVIEW");
    setText("[data-later-cockpit-updated]", formatDate(lastProjectState.updated_at));
    setText("[data-later-passed-scope]", passed);
    setText("[data-later-current-gap]", reviewBoundary);
    setText("[data-later-formal-task]", task);
    setText("[data-later-current-surface]", surface);
    setText("[data-later-switch-condition]", condition);
    setText("[data-later-sticky-surface]", surface);
    setText("[data-later-sticky-condition]", condition);
    setText("[data-formal-handoff-title]", "Day 03 已正式掌握：本页只用于复盘和保持。" );
    setText("[data-formal-handoff-summary]", "网页复盘不会重启已结束的 Day 03 会话，也不会覆盖 Few-shot、Schema、有限重试及迁移的正式证据。当前正式主线是 " + activeLabel + "。" );

    var stageState = {
      foundation: day02.concept_status === "mastered" ? "verified" : "gap",
      day03: mastered ? "verified" : completed ? "gap" : "preview",
      day04: day04.concept_status === "mastered" ? "verified" : day04.formal_status === "completed" ? "gap" : "preview",
      current: formal.day_id === "day-07" && day07.formal_status === "in_progress" ? "preview" : "gap"
    };
    Object.keys(stageState).forEach(function (name) {
      var node = document.querySelector('[data-later-progress-stage="' + name + '"]');
      if (node) node.dataset.state = stageState[name];
    });
    setText('[data-later-stage-status="foundation"]', day02.concept_status === "mastered" ? "前序正式完成 · mastered" : "以正式记录为准");
    setText('[data-later-stage-status="day03"]', completed ? "课程完成 · " + (day03.concept_status || "unknown") : "未完成");
    setText('[data-later-stage-status="day04"]', day04.formal_status === "completed" ? "课程完成 · " + (day04.concept_status || "unknown") : "未完成");
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
        setTransferFeedback(id, completed, completed ? "方案已记录。可以打开示例，找一处继续补强。" : "再补充一点：至少写清当前事实、程序规则和合法动作或状态。" );
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
      saveState(completed ? "综合控制工作坊已保存。" : "工作坊方案还没有覆盖完整控制链。" );
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
      "# 我的 Day 03 Few-shot、Schema 与有限重试理解地图", "",
      "## 完整输入输出映射：我的理解或疑问", answer("mapping_teachback", "尚未记录"), "",
      "## 对照分支与固定验证：我的理解或疑问", answer("examples_teachback", "尚未记录"), "",
      "## Schema 字段与层级：我的理解或疑问", answer("schema_teachback", "尚未记录"), "",
      "## 三层确定性验收：我的理解或疑问", answer("validation_teachback", "尚未记录"), "",
      "## 有限重试与安全兜底：我的理解或疑问", answer("retry_teachback", "尚未记录"), "",
      "## 综合契约工作坊", answer("final_diagnosis", "尚未完成工作坊"), "",
      "> 这是 Day 03 本地复盘痕迹，不是新一次正式评测，不会覆盖既有 mastered 证据。"
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
      if (!window.confirm("只清除当前标签页新保存的 Day 03 复盘练习与草稿？正式记录和旧草稿都不会被删除。")) return;
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
  if (state.migrated_legacy_key) saveState("旧 Day 03 草稿已只读迁移到新的复盘闭环；原数据未删除。" );
})();
