(function () {
  "use strict";

  var configElement = document.getElementById("day06-config");
  if (!configElement) return;

  var config;
  try {
    config = JSON.parse(configElement.textContent);
  } catch (error) {
    console.error("Day 06 配置无法解析", error);
    return;
  }

  document.documentElement.dataset.day06Version = "2026-08-11-web-blueprint-final-1";
  var storageKey = config.storage_key;
  var saveTimer;
  var liveTimer;
  var state = loadState();

  var responsibilityRules = {
    render: { owner: "browser", label: "Browser", io: "输入：服务端返回的 page/session 数据；输出：可访问界面、字段级反馈与临时草稿。", risk: "交给模型或数据层会把表现逻辑和业务判断混在一起。" },
    api_key: { owner: "server", label: "Server Proxy", io: "输入：process.env.MODEL_API_KEY；输出：只用于服务端到模型 API 的 Authorization。", risk: "进入前端、Prompt、日志或导出即构成密钥泄露，必须移除并轮换。" },
    route: { owner: "server", label: "Server Proxy", io: "输入：session.state、event、Guard 与校验结果；输出：合法 next_state / next_route。", risk: "浏览器或模型直接路由会绕过状态上限、覆盖与恢复规则。" },
    candidate: { owner: "model", label: "Model API（Day 07）", io: "输入：脱敏 Prompt 与允许的上下文；输出：候选追问或候选分析。", risk: "候选输出不能直接写入状态或决定页面跳转。" },
    session: { owner: "server", label: "Server Proxy + Data", io: "服务端校验后写入 session、answer_id、request_id 与 versions；数据层负责持久化。", risk: "只存在浏览器会导致刷新丢失、跨设备不一致和可篡改。" },
    audit: { owner: "data", label: "Data & Logs", io: "输入：事件、session_id、状态、错误码与版本；输出：最小必要审计记录。", risk: "记录回答全文、Prompt 或密钥会扩大隐私与泄露面。" }
  };

  var recoveryRules = {
    none: { state: "safe", status: "边界安全 · mock 成功", action: "服务端返回结构化 mock 结果；程序校验 Schema 后更新 session。", feedback: "显示下一页面；明确‘无真实模型评分’。", recovery: "success → next_route" },
    empty: { state: "recover", status: "输入校验失败", action: "浏览器即时拦截，服务端仍二次校验并返回 422 EMPTY_INPUT；session 不推进。", feedback: "聚焦输入框，保留已选设置，不使用字数门槛。", recovery: "return_to_input" },
    duplicate: { state: "recover", status: "重复提交被幂等处理", action: "按钮进入 submitting；服务端按 request_id 返回同一结果，不重复写 answer。", feedback: "保持一次提交结果，不显示两条回答。", recovery: "idempotent_replay" },
    timeout: { state: "recover", status: "请求超时", action: "AbortController 中止等待；保留草稿与同一 request_id，允许安全重试。", feedback: "提示超时与重试，不清空回答。", recovery: "retry_same_request" },
    network: { state: "recover", status: "网络失败", action: "进入 recoverable_error，保留 session_id、题目和草稿；恢复后 GET 最新 session。", feedback: "显示恢复入口和当前保存范围。", recovery: "reload_session" },
    schema: { state: "recover", status: "结构校验失败", action: "服务端返回 422 与字段级错误；不推进 session，不把无效结果写入报告。", feedback: "显示唯一优先结构缺口，修正后再提交。", recovery: "repair_payload" }
  };

  var transfers = {
    customer_support: {
      invariants: "浏览器不持有密钥、服务端代理模型、session 为业务状态源、request_id 幂等、错误可恢复。",
      changes: "页面改为会话队列、客服工作台、质检结果；状态增加 waiting_human、escalated 与 resolved。",
      decisions: "定义自动回复范围、转人工条件、客服 SLA、敏感承诺拦截和会话恢复优先级。",
      deliverable: "客服页面流 + 会话状态 Schema + 转人工 API Contract + 断网恢复测试。"
    },
    sales_coach: {
      invariants: "设置、练习、复盘三阶段；服务端保管密钥并校验状态；草稿与正式记录分离。",
      changes: "设置页增加角色和异议类型，面试页变成角色扮演，结果页展示证据化陪练建议。",
      decisions: "区分训练建议与绩效评价，定义合规话术、重复提交与中途退出恢复规则。",
      deliverable: "陪练信息架构 + 轮次状态机 + 对话 API + 合规失败恢复用例。"
    },
    knowledge_assistant: {
      invariants: "浏览器只显示和收集输入；服务端处理权限、检索与模型；日志最小化且不含密钥。",
      changes: "页面变为提问、来源详情、历史记录；状态增加 retrieving、no_answer、source_expired。",
      decisions: "定义知识权限、引用门槛、过期来源、无答案与冲突来源的恢复路径。",
      deliverable: "知识助手页面流 + 检索 API Contract + source state Schema + 无答案回归测试。"
    }
  };

  var focusReteach = {
    quiz_1: {
      title: "先定位秘密跨越信任边界的那一步。",
      error: "把“前端变量看起来不可见”误当成“秘密没有进入浏览器”。",
      oldModel: "旧规则是：只要 UI 不显示、变量名不直白，密钥就算安全。它忽略了构建产物、DevTools、网络请求和错误日志都可被客户端读取。",
      experiment: "换成企业知识助手：浏览器扩展需要调用检索服务。只改变“凭证由谁读取”，沿构建包 → 请求 → 日志回放一次泄露路径，并标出第一处无法撤回的复制。",
      retest: "新场景复测：销售陪练需要第三方语音服务。请只说明凭证跨越哪些信任边界、哪一层应代理请求，以及泄露后第一项恢复动作。"
    },
    quiz_2: {
      title: "先区分界面锁定和业务幂等。",
      error: "把“按钮已经禁用”误当成“服务端只会写入一次”。",
      oldModel: "旧规则是：用户无法再次点击，就不会重复提交。它没有覆盖网络重试、刷新、多个标签页和第一次响应晚到。",
      experiment: "换成移动端客服工作台：原请求超时后系统自动重试，但原响应随后到达。只改变 request_id 是否稳定，观察回答记录会出现一条还是两条。",
      retest: "新场景复测：知识助手的收藏操作被网关重放。请定义一次业务写入的稳定身份、重复请求的返回方式和页面恢复条件。"
    },
    quiz_3: {
      title: "先拆开 URL、页面状态和业务事实。",
      error: "把“地址栏能到达结果页”误当成“会话已经允许展示结果”。",
      oldModel: "旧规则是：路由名称就是业务状态。它忽略了 session 可能不存在、未完成、已过期或已被撤销。",
      experiment: "换成企业知识助手：用户直接打开来源详情 URL，但文档权限刚被收回。只改变服务端权限事实，观察同一路由应渲染详情、错误还是返回入口。",
      retest: "新场景复测：销售陪练复盘链接被复制到另一个账号。请写出页面展示前必须重新核对的事实、Guard 和失败后的恢复动作。"
    }
  };

  var quickCheckAnswers = { quiz_1: "server_env", quiz_2: "idempotency", quiz_3: "verify_session" };

  function createState() {
    return { version: 1, page_id: config.page_id, fields: {}, experiments: {}, deliverables_markdown: "", quick_check: null, updated_at: null };
  }

  function loadState() {
    try {
      var raw = window.sessionStorage.getItem(storageKey);
      var loaded = Object.assign(createState(), raw ? JSON.parse(raw) : {});
      loaded.fields = loaded.fields && typeof loaded.fields === "object" ? loaded.fields : {};
      loaded.experiments = loaded.experiments && typeof loaded.experiments === "object" ? loaded.experiments : {};
      return loaded;
    } catch (error) {
      return createState();
    }
  }

  function announce(message) {
    var live = document.querySelector("[data-live-message]");
    if (!live) return;
    window.clearTimeout(liveTimer);
    live.textContent = message;
    liveTimer = window.setTimeout(function () { if (live.textContent === message) live.textContent = ""; }, 4200);
  }

  function saveState(message) {
    state.updated_at = new Date().toISOString();
    var status = document.querySelector("[data-save-status]");
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(state));
      if (status) status.textContent = "草稿已保存到当前标签页 · " + new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    } catch (error) {
      if (status) status.textContent = "当前标签页保存不可用，请及时导出";
    }
    if (message) announce(message);
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () { saveState(); }, 260);
  }

  function restoreFields() {
    document.querySelectorAll("[data-persist]").forEach(function (field) {
      if (typeof state.fields[field.name] === "string") field.value = state.fields[field.name];
      else state.fields[field.name] = field.value;
      field.addEventListener("input", function () { state.fields[field.name] = field.value; scheduleSave(); });
      field.addEventListener("change", function () { state.fields[field.name] = field.value; scheduleSave(); });
    });
    if (state.deliverables_markdown) renderDeliverables(state.deliverables_markdown);
  }

  function getTrackDay(projectState, dayId) {
    var formal = projectState.formal_state || {};
    var track = projectState.tracks && projectState.tracks[formal.track_id || "two_week_sprint"];
    return track && Array.isArray(track.days) ? track.days.find(function (day) { return day.id === dayId; }) : null;
  }

  function formatUpdatedAt(value) {
    if (!value) return "—";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function renderRouteSteps(steps) {
    var list = document.querySelector("[data-day06-route-steps]");
    if (!list) return;
    list.textContent = "";
    steps.forEach(function (step) {
      var item = document.createElement("li");
      item.textContent = step;
      list.appendChild(item);
    });
  }

  function applyFormalState(projectState) {
    var formal = projectState.formal_state || {};
    var day04 = getTrackDay(projectState, "day-04") || {};
    var day05 = getTrackDay(projectState, "day-05") || {};
    var day06 = getTrackDay(projectState, "day-06") || {};
    var pendingId = formal.pending_question_id;
    var retestId = formal.required_retest_of_question_id;
    var day04Complete = day04.formal_status === "completed" && day04.concept_status === "mastered";
    var day05Complete = day05.formal_status === "completed";
    var day06Active = formal.day_id === "day-06" && day06.formal_status === "in_progress";
    var assessmentStarted = Boolean(day06Active && (formal.session_id || day06.assessment_status === "in_progress"));
    var activeTask = pendingId || retestId;
    var formalProgress = day04Complete && day05Complete && day06Active
      ? "Day 01—04：正式掌握 · Day 05：课程完成，掌握缺口保留 · Day 06：正式课程进行中"
      : "以最新正式 JSON 为准；当前正式位置为 " + (formal.day_id || "未识别");
    var passedScope = day04Complete
      ? "Day 01—04 均已有正式掌握证据；Day 05 课程已完成，机制解释层证据保留，未完成的应用与迁移层不会被伪装为已掌握。"
      : "只保留正式 JSON 中已经验证的知识层；本页不会补写任何正式评分证据。";
    var currentGap = activeTask
      ? "只处理当前正式任务 " + activeTask + " 指向的一个未验证条件。"
      : day06Active
        ? "Day 06 正式课程已开启；当前完成页面流、服务端代理、四层状态与失败恢复的网页学习，正式评测尚未启动。"
        : "Day 06 尚未成为当前正式课程，请回到学习总览核对状态。";
    var currentSurface = assessmentStarted ? "Codex · Day 06 正式评测" : day06Active ? "网页 · Day 06 正式课程" : "网页 · Day 06 页面预习";
    var switchCondition = assessmentStarted
      ? "完成当前唯一正式题并等待状态更新；网页实验仍只作为课程进程。"
      : day06Active
        ? "完成概念学习、三个架构实验与可运行 mock 骨架后，再明确启动 Day 06 正式评测。"
        : "正式开启 Day 06 后再把页面活动记入课程进程。";
    var routeHref = assessmentStarted ? "#formal-handoff" : "#page-flow";
    var routeText = assessmentStarted ? "查看 Day 06 正式接力" : "开始 Day 06 网页学习";
    var routeSteps = assessmentStarted
      ? ["回 Codex 只处理当前唯一正式题；", "保留网页草稿，不把实验结果直接当成评分；", "正式状态更新后重新读取 JSON。"]
      : ["从页面流与前后端职责开始；", "完成状态、路由、安全恢复实验并运行 mock 项目；", "完成网页课程后，再明确启动 Day 06 正式评测。"];

    document.querySelectorAll("[data-day06-status]").forEach(function (element) {
      element.textContent = assessmentStarted ? "正式评测进行中" : day06Active ? "正式课程进行中 · 评测未开始" : "页面预习 · 未正式开启";
    });
    var title = document.querySelector("[data-day06-cockpit-title]");
    var summary = document.querySelector("[data-day06-cockpit-summary]");
    var mode = document.querySelector("[data-day06-cockpit-mode]");
    var updated = document.querySelector("[data-day06-cockpit-updated]");
    if (title) title.textContent = assessmentStarted ? "Day 06 正式评测已启动，网页保留为课程与实验工作台。" : day06Active ? "Day 06 已正式开启，从页面流开始搭建 Web 产品骨架。" : "先核对正式主线，再进入 Day 06 页面预习。";
    if (summary) summary.textContent = assessmentStarted
      ? "正式评分只在 Codex 当前唯一任务中形成；本页继续保留课程草稿、实验和 mock 项目。"
      : day06Active
        ? "当前先完成概念学习、架构实验、协议草稿和 mock 项目验收；这些活动记录课程进程，但不会自行生成正式评分。"
        : "本页可以提前阅读，但不会越级改变正式状态。";
    if (mode) mode.textContent = assessmentStarted ? "assessment · in_progress" : day06Active ? "course · in_progress" : "preview · not_started";
    if (updated) {
      updated.textContent = formatUpdatedAt(projectState.updated_at);
      if (projectState.updated_at) updated.dateTime = projectState.updated_at;
    }

    var progress = document.querySelector("[data-day06-formal-progress]");
    var passed = document.querySelector("[data-day06-passed-scope]");
    var gap = document.querySelector("[data-day06-current-gap]");
    var task = document.querySelector("[data-day06-formal-task]");
    var surface = document.querySelector("[data-day06-current-surface]");
    var condition = document.querySelector("[data-day06-switch-condition]");
    if (progress) progress.textContent = formalProgress;
    if (passed) passed.textContent = passedScope;
    if (gap) gap.textContent = currentGap;
    if (task) task.textContent = activeTask || (day06Active ? "Day 06 网页课程 · 正式评测尚未启动" : "无正式 Day 06 任务");
    if (surface) surface.textContent = currentSurface;
    if (condition) condition.textContent = switchCondition;
    renderRouteSteps(routeSteps);

    document.querySelectorAll("[data-day06-primary-route], [data-day06-sticky-action], [data-day06-formal-route]").forEach(function (link) {
      link.href = routeHref;
      link.textContent = routeText;
    });
    document.querySelectorAll("[data-day06-sticky-surface]").forEach(function (element) { element.textContent = currentSurface; });
    document.querySelectorAll("[data-day06-sticky-condition]").forEach(function (element) { element.textContent = switchCondition; });
    var handoffTitle = document.querySelector("[data-day06-handoff-title]");
    if (handoffTitle) handoffTitle.textContent = assessmentStarted
      ? "正式学习接力：继续 Day 06 当前唯一正式任务。"
      : "正式学习接力：先完成 Day 06 网页课程，再启动正式评测。";

    var stageStates = { foundation: day04Complete ? "verified" : "current", day04: day04Complete ? "verified" : "current", day05: day05Complete ? "verified" : "current", day06: day06Active ? "current" : "locked" };
    var stageCopy = {
      foundation: day04Complete ? "正式掌握 · 不重复复测" : "以正式 JSON 为准",
      day04: day04Complete ? "mastered · q014 缺口已关闭" : "尚有正式条件待处理",
      day05: day05Complete ? "课程已完成 · 掌握缺口保留" : "尚未完成",
      day06: assessmentStarted ? "正式评测进行中" : day06Active ? "正式课程进行中 · 评测未开始" : "尚未正式开启"
    };
    Object.keys(stageStates).forEach(function (name) {
      var stage = document.querySelector('[data-day06-progress-stage="' + name + '"]');
      var stageStatus = document.querySelector('[data-day06-stage-status="' + name + '"]');
      if (stage) stage.dataset.state = stageStates[name];
      if (stageStatus) stageStatus.textContent = stageCopy[name];
    });

    window.__STUDY_PAGE_HANDOFF__ = {
      day_id: formal.day_id,
      focus: "Day 06 / 独立 Web 项目骨架 / 页面流、服务端代理与四层状态",
      page_anchor: "day-06-web-project-skeleton.html#page-flow",
      formal_progress: formalProgress,
      next_surface: currentSurface,
      switch_condition: switchCondition,
      preparation_status: assessmentStarted ? "Day 06 正式评测已启动；按唯一 session 与题目继续" : "Day 06 正式课程已开启；网页学习进行中，尚无正式 session 或 pending question",
      formal_scope: currentGap,
      passed_scope: passedScope,
      reteach_contract: "如果我仍说不理解，请不要重复标准答案。请按错误节点 → 旧心智模型 → 不同场景单变量实验 → 我自己复述 → 新场景复测推进，并且不要重复已通过范围。"
    };
  }

  function runResponsibilityLab(event, restoring) {
    event.preventDefault();
    var form = event.currentTarget;
    var task = form.elements.task.value;
    var selectedOwner = form.elements.owner.value;
    var rule = responsibilityRules[task];
    var passed = selectedOwner === rule.owner;
    var result = document.querySelector("[data-responsibility-result]");
    result.dataset.state = passed ? "allowed" : "blocked";
    result.querySelector(".result-status").textContent = passed ? "职责匹配" : "职责错配";
    result.querySelector(".result-updated").textContent = "已运行 · " + new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    result.querySelector("h3").textContent = passed ? "该动作分配在正确控制面。" : "当前分配会造成越权或状态失真。";
    var items = result.querySelectorAll("dd");
    items[0].textContent = rule.label;
    items[1].textContent = rule.io;
    items[2].textContent = rule.risk;
    state.experiments.responsibility = { task: task, selected_owner: selectedOwner, correct_owner: rule.owner, passed: passed };
    if (!restoring) saveState(passed ? "职责分配正确。" : "已定位职责错配，请对照正确控制面。");
    if (!restoring && !passed) form.elements.owner.focus();
  }

  function routeDecision(page, sessionState, eventName) {
    if (eventName === "request_failed") return { allowed: true, page: "error", session: "recoverable_error", guard: "请求失败事件可从当前交互页进入恢复状态。", action: "保存草稿、session_id、request_id 与错误码。" };
    if (page === "setup" && sessionState === "draft" && eventName === "settings_submitted") return { allowed: true, page: "interview", session: "interviewing", guard: "设置结构通过，服务端已创建 session。", action: "保存 session_id 并展示 current_question。" };
    if (page === "interview" && sessionState === "interviewing" && eventName === "answer_submitted") return { allowed: true, page: "interview", session: "interviewing", guard: "question_id 最新、回答非空、request_id 未处理。", action: "幂等保存回答，读取下一道问题。" };
    if (page === "interview" && sessionState === "interviewing" && eventName === "interview_completed") return { allowed: true, page: "result", session: "completed", guard: "停止条件、保存与结构校验全部通过。", action: "冻结 session 并生成 mock 报告。" };
    if (page === "error" && sessionState === "recoverable_error" && eventName === "retry_success") return { allowed: true, page: "interview", session: "interviewing", guard: "重试成功且服务端返回最新 session。", action: "恢复当前题与草稿，清除页面错误状态。" };
    if (page === "result" && sessionState === "completed" && eventName === "restart") return { allowed: true, page: "setup", session: "draft", guard: "用户明确开始新会话。", action: "保留历史 session，创建新的设置草稿。" };
    return { allowed: false, page: page, session: sessionState, guard: "当前页面、session.state 与事件不构成合法组合。", action: "拒绝跳转并记录 ILLEGAL_TRANSITION；重新 GET 最新 session。" };
  }

  function runRouteLab(event, restoring) {
    event.preventDefault();
    var form = event.currentTarget;
    var decision = routeDecision(form.elements.page.value, form.elements.session.value, form.elements.event.value);
    var result = document.querySelector("[data-route-result]");
    result.querySelectorAll("[data-route-node]").forEach(function (node) { node.classList.toggle("is-current", node.getAttribute("data-route-node") === decision.page); });
    var panel = result.querySelector(".route-decision");
    panel.dataset.state = decision.allowed ? "allowed" : "blocked";
    panel.querySelector(".result-status").textContent = decision.allowed ? "合法流转" : "非法流转";
    panel.querySelector("h3").textContent = decision.allowed ? "程序允许进入 /" + decision.page + "。" : "程序保留当前页面与会话状态。";
    var items = panel.querySelectorAll("dd");
    items[0].textContent = decision.guard;
    items[1].textContent = decision.action;
    items[2].textContent = "/" + decision.page + " · session.state=" + decision.session;
    state.experiments.route = { current_page: form.elements.page.value, current_session: form.elements.session.value, event: form.elements.event.value, decision: decision };
    if (!restoring) saveState(decision.allowed ? "页面与会话状态已合法流转。" : "非法跳转已被拦截。");
    if (!restoring && !decision.allowed) form.elements.event.focus();
  }

  function runSecurityLab(event, restoring) {
    event.preventDefault();
    var form = event.currentTarget;
    var keyLocation = form.elements.key_location.value;
    var failure = form.elements.failure.value;
    var result = document.querySelector("[data-security-result]");
    var outcome;
    if (keyLocation !== "server_env") {
      var locations = { frontend: "前端构建产物", prompt: "Prompt / 请求体", log: "日志 / console", export: "导出文件" };
      outcome = {
        state: "blocked",
        status: "SECURITY_BLOCK",
        title: "密钥边界不合法，停止本次设计。",
        security: "API Key 出现在" + locations[keyLocation] + "，存在泄露与复制风险。",
        action: "移除全部副本；若曾暴露，立即轮换密钥并检查日志与历史构建物。",
        feedback: "不继续调用模型，也不把失败细节回显给前端。",
        recovery: "remove_secret → rotate_key → security_review"
      };
    } else {
      var rule = recoveryRules[failure];
      outcome = {
        state: rule.state,
        status: rule.status,
        title: failure === "none" ? "安全边界通过，mock 请求可以完成。" : "边界安全，进入对应恢复路径。",
        security: "API Key 仅由服务端环境变量读取，不进入浏览器、Prompt、日志或导出。",
        action: rule.action,
        feedback: rule.feedback,
        recovery: rule.recovery
      };
    }
    result.dataset.state = outcome.state;
    result.querySelector(".result-status").textContent = outcome.status;
    result.querySelector(".result-updated").textContent = "已运行 · " + new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    result.querySelector("h3").textContent = outcome.title;
    var items = result.querySelectorAll("dd");
    items[0].textContent = outcome.security;
    items[1].textContent = outcome.action;
    items[2].textContent = outcome.feedback;
    items[3].textContent = outcome.recovery;
    state.experiments.security = { key_location: keyLocation, failure: failure, outcome: outcome.status, recovery: outcome.recovery };
    if (!restoring) saveState(outcome.state === "blocked" ? "密钥位置不合法，设计已阻断。" : "安全与恢复规则已检查。");
    if (!restoring && outcome.state === "blocked") form.elements.key_location.focus();
  }

  function setupTransferMap() {
    var select = document.querySelector("[data-transfer-scenario]");
    if (!select) return;
    function render() {
      var scenario = transfers[select.value] || transfers.customer_support;
      document.querySelector("[data-transfer-invariants]").textContent = scenario.invariants;
      document.querySelector("[data-transfer-changes]").textContent = scenario.changes;
      document.querySelector("[data-transfer-decisions]").textContent = scenario.decisions;
      document.querySelector("[data-transfer-deliverable]").textContent = scenario.deliverable;
    }
    select.addEventListener("change", render);
    render();
  }

  function containsToken(value, token) {
    return value.toLocaleLowerCase("zh-CN").indexOf(String(token).toLocaleLowerCase("zh-CN")) !== -1;
  }

  function validateDeliverables(form) {
    var rules = config.required_structures || {};
    var names = Object.keys(rules);
    for (var index = 0; index < names.length; index += 1) {
      var name = names[index];
      var field = form.elements[name];
      var value = field ? field.value.trim() : "";
      if (!value) return { field: field, message: "请先填写“" + name + "”对应结构。" };
      var missing = rules[name].find(function (token) { return !containsToken(value, token); });
      if (missing) return { field: field, message: "“" + name + "”优先补充：" + missing + "。页面不按字数判断。" };
    }
    return null;
  }

  function createMarkdown(form) {
    return [
      "# Day 06 五项产出（课程 / 项目骨架预览）", "",
      "## 1. Page Flow / 信息架构", "", form.elements.page_flow.value.trim(), "",
      "## 2. 前后端职责图", "", form.elements.responsibility_map.value.trim(), "",
      "## 3. API Contract v1", "", form.elements.api_contract.value.trim(), "",
      "## 4. Session State Schema v1", "", form.elements.session_schema.value.trim(), "",
      "## 5. 最小可运行项目骨架与运行说明", "", form.elements.run_handoff.value.trim(), "",
      "- skeleton_path: " + config.skeleton_path,
      "- run: cd '" + config.skeleton_path + "' && npm start", "",
      "> Day 06 不接真实模型 API；页面与 Demo 不回写正式学习状态。", ""
    ].join("\n");
  }

  function buildDeliverables(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var issue = validateDeliverables(form);
    var error = document.querySelector("[data-builder-error]");
    if (issue) {
      error.textContent = issue.message;
      if (issue.field) issue.field.focus();
      return;
    }
    error.textContent = "";
    document.querySelectorAll("[data-persist]").forEach(function (field) { state.fields[field.name] = field.value; });
    state.deliverables_markdown = createMarkdown(form);
    renderDeliverables(state.deliverables_markdown);
    saveState("五项产出预览已生成；正式状态保持不变。");
  }

  function renderDeliverables(markdown) {
    var preview = document.querySelector("[data-deliverable-preview]");
    if (!preview) return;
    preview.hidden = false;
    preview.querySelector("[data-deliverable-output]").textContent = markdown;
  }

  function renderFocusReteach(name) {
    var panel = document.querySelector("[data-day06-focus-reteach]");
    var content = focusReteach[name];
    if (!panel || !content) return;
    panel.hidden = false;
    panel.querySelector("[data-day06-focus-title]").textContent = content.title;
    panel.querySelector("[data-day06-error-node]").textContent = content.error;
    panel.querySelector("[data-day06-old-model]").textContent = content.oldModel;
    panel.querySelector("[data-day06-new-experiment]").textContent = content.experiment;
    panel.querySelector("[data-day06-retest]").textContent = content.retest;
  }

  function hideFocusReteach() {
    var panel = document.querySelector("[data-day06-focus-reteach]");
    if (panel) panel.hidden = true;
  }

  function gradeQuickCheck(event) {
    event.preventDefault();
    var missing = 0;
    var correct = 0;
    var firstMissing = null;
    var firstWrong = null;
    var answers = {};
    Object.keys(quickCheckAnswers).forEach(function (name) {
      var selected = event.currentTarget.querySelector('input[name="' + name + '"]:checked');
      if (!selected) {
        missing += 1;
        if (!firstMissing) firstMissing = event.currentTarget.querySelector('input[name="' + name + '"]');
        return;
      }
      answers[name] = selected.value;
      if (selected.value === quickCheckAnswers[name]) correct += 1;
      else if (!firstWrong) firstWrong = name;
    });
    var result = document.querySelector("[data-quiz-result]");
    result.hidden = false;
    if (missing) {
      result.dataset.state = "warning";
      result.textContent = "还有 " + missing + " 道未选择。已聚焦第一道缺失题；完成三题后再给非正式结构诊断。";
      hideFocusReteach();
      if (firstMissing) firstMissing.focus();
      return;
    }
    state.quick_check = { correct: correct, total: 3, answers: answers, focus: firstWrong, completed_at: new Date().toISOString() };
    if (correct === 3) {
      result.dataset.state = "success";
      result.innerHTML = "<strong>3 / 3，架构主线一致。</strong> 你识别了密钥边界、幂等双保险和路由必须回查 session；这不是正式掌握。";
      hideFocusReteach();
    } else {
      result.dataset.state = "warning";
      result.innerHTML = "<strong>答对 " + correct + " / 3。</strong> 页面只聚焦第一个错误节点，并换场景重讲；不会创建正式复测。";
      renderFocusReteach(firstWrong);
      var panel = document.querySelector("[data-day06-focus-reteach]");
      if (panel) panel.focus ? panel.focus() : null;
    }
    saveState();
  }

  function restoreExperiments() {
    var responsibility = state.experiments.responsibility;
    var responsibilityForm = document.querySelector("[data-responsibility-lab]");
    if (responsibility && responsibilityForm) {
      responsibilityForm.elements.task.value = responsibility.task;
      responsibilityForm.elements.owner.value = responsibility.selected_owner;
      runResponsibilityLab({ preventDefault: function () {}, currentTarget: responsibilityForm }, true);
    }
    var route = state.experiments.route;
    var routeForm = document.querySelector("[data-route-lab]");
    if (route && routeForm) {
      routeForm.elements.page.value = route.current_page;
      routeForm.elements.session.value = route.current_session;
      routeForm.elements.event.value = route.event;
      runRouteLab({ preventDefault: function () {}, currentTarget: routeForm }, true);
    }
    var security = state.experiments.security;
    var securityForm = document.querySelector("[data-security-lab]");
    if (security && securityForm) {
      securityForm.elements.key_location.value = security.key_location;
      securityForm.elements.failure.value = security.failure;
      runSecurityLab({ preventDefault: function () {}, currentTarget: securityForm }, true);
    }
  }

  function restoreQuickCheck() {
    var saved = state.quick_check;
    if (!saved || !saved.answers) return;
    Object.keys(saved.answers).forEach(function (name) {
      var input = document.querySelector('input[name="' + name + '"][value="' + saved.answers[name] + '"]');
      if (input) input.checked = true;
    });
    var result = document.querySelector("[data-quiz-result]");
    if (!result) return;
    result.hidden = false;
    if (saved.correct === saved.total) {
      result.dataset.state = "success";
      result.innerHTML = "<strong>3 / 3，已恢复上次非正式自检。</strong> 这仍不是正式掌握。";
      hideFocusReteach();
    } else {
      result.dataset.state = "warning";
      result.innerHTML = "<strong>已恢复上次非正式自检：" + saved.correct + " / " + saved.total + "。</strong> 继续处理第一个错误节点。";
      renderFocusReteach(saved.focus);
    }
  }

  function getProjectState() {
    return window.__STUDY_PROJECT_STATE__ || window.__STUDY_PROJECT_SNAPSHOT__ || {};
  }

  function buildExport() {
    var project = getProjectState();
    var formal = project.formal_state || {};
    return {
      export_type: "ai-pm-study-day06-preview",
      export_version: 1,
      page_id: config.page_id,
      source_page: config.source_page,
      skeleton_path: config.skeleton_path,
      formal_learning_state: { source_updated_at: project.updated_at, active_day_id: formal.day_id, active_session_id: formal.session_id, pending_question_id: formal.pending_question_id },
      experiments: Object.assign({}, state.experiments),
      fields: Object.assign({}, state.fields),
      deliverables_markdown: state.deliverables_markdown,
      quick_check: state.quick_check,
      formal_boundary: config.formal_boundary,
      exported_at: new Date().toISOString()
    };
  }

  function exportFile(content, filename, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function copyText(value) {
    if (!value) return announce("当前还没有可复制的五项产出预览。");
    function fallback() {
      var area = document.createElement("textarea");
      area.value = value;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      var copied = false;
      try { copied = document.execCommand("copy"); } catch (error) { copied = false; }
      area.remove();
      announce(copied ? "五项产出 Markdown 已复制。" : "浏览器阻止了复制，请手动选择预览内容。");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(function () { announce("五项产出 Markdown 已复制。"); }).catch(fallback);
    else fallback();
  }

  function setupReadingProgress() {
    var sections = Array.prototype.slice.call(document.querySelectorAll("[data-chapter-section]"));
    var links = Array.prototype.slice.call(document.querySelectorAll("[data-section-link]"));
    var bar = document.querySelector("[data-reading-progress]");
    var text = document.querySelector("[data-progress-text]");
    function update() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var percent = Math.round((max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0) * 100);
      if (bar) bar.style.width = percent + "%";
      if (text) text.textContent = percent + "%";
    }
    if ("IntersectionObserver" in window) {
      var observer = new IntersectionObserver(function (entries) {
        var visible = entries.filter(function (entry) { return entry.isIntersecting; }).sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; });
        if (!visible.length) return;
        var id = visible[0].target.id;
        links.forEach(function (link) { if (link.getAttribute("data-section-link") === id) link.setAttribute("aria-current", "location"); else link.removeAttribute("aria-current"); });
      }, { rootMargin: "-18% 0px -62% 0px", threshold: [0, .2, .5] });
      sections.forEach(function (section) { observer.observe(section); });
    }
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  var responsibilityForm = document.querySelector("[data-responsibility-lab]");
  if (responsibilityForm) responsibilityForm.addEventListener("submit", runResponsibilityLab);
  var routeForm = document.querySelector("[data-route-lab]");
  if (routeForm) routeForm.addEventListener("submit", runRouteLab);
  var securityForm = document.querySelector("[data-security-lab]");
  if (securityForm) securityForm.addEventListener("submit", runSecurityLab);
  var builder = document.querySelector("[data-deliverable-builder]");
  if (builder) builder.addEventListener("submit", buildDeliverables);
  var quick = document.querySelector("[data-quick-check]");
  if (quick) quick.addEventListener("submit", gradeQuickCheck);

  var clearButton = document.querySelector("[data-clear-session-draft]");
  if (clearButton) clearButton.addEventListener("click", function () {
    if (!window.confirm("只清除当前标签页的 Day 06 课程草稿？正式记录与可运行项目文件不会被删除。")) return;
    window.sessionStorage.removeItem(storageKey);
    window.location.reload();
  });

  var copyButton = document.querySelector("[data-copy-deliverables]");
  if (copyButton) copyButton.addEventListener("click", function () { copyText(state.deliverables_markdown); });
  var exportJson = document.querySelector("[data-export-json]");
  if (exportJson) exportJson.addEventListener("click", function () { exportFile(JSON.stringify(buildExport(), null, 2), "day06-web-blueprint-preview.json", "application/json;charset=utf-8"); announce("Day 06 预览 JSON 已生成，不会回写正式状态。"); });
  var exportMarkdown = document.querySelector("[data-export-markdown]");
  if (exportMarkdown) exportMarkdown.addEventListener("click", function () { exportFile(state.deliverables_markdown || "# Day 06 预览\n\n尚未生成五项产出。\n", "day06-web-blueprint-preview.md", "text/markdown;charset=utf-8"); announce("Day 06 预览 Markdown 已生成，不会回写正式状态。"); });
  var printButton = document.querySelector("[data-print]");
  if (printButton) printButton.addEventListener("click", function () { window.print(); });

  restoreFields();
  restoreExperiments();
  restoreQuickCheck();
  setupTransferMap();
  setupReadingProgress();
  applyFormalState(getProjectState());
  document.addEventListener("study-state-ready", function () { applyFormalState(getProjectState()); });
})();
