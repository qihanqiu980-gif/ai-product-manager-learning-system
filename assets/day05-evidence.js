(function () {
  "use strict";

  var configElement = document.getElementById("day05-config");
  if (!configElement) return;

  var config;
  try {
    config = JSON.parse(configElement.textContent);
  } catch (error) {
    console.error("Day 05 配置无法解析", error);
    return;
  }

  document.documentElement.dataset.day05Version = "2026-08-12-formal-entry-5";

  var storageKey = config.storage_key;
  var saveTimer;
  var liveTimer;
  var restoredFromLegacy = false;
  var state = loadState();

  var rubricSamples = {
    complete: {
      answer: "我会先看是否真的需要生成式能力。当前知识稳定、规则明确，所以首版用确定性流程加 Prompt，而不是直接做 Agent；如果知识更新频率升高或来源引用成为硬要求，再重评 RAG。",
      status: "score",
      score: 3,
      anchor: "anchor_3：比较 AI 与非 AI 路径，说明当前选择、边界与可检查的重评条件。",
      evidence: "明确提出问题判断、当前方案、暂不选 Agent 的边界，以及触发 RAG 重评的条件。",
      pass: "通过：达到最低 2 分，且存在可定位的选择依据与重评条件。",
      boundary: "模型可建议 3 分；程序仍需校验 quote、criterion_id、rubric_version 与 evidence reference。"
    },
    partial: {
      answer: "我会根据知识是否需要频繁更新来选 Prompt 或 RAG。这个场景先用 Prompt，因为实现更快。",
      status: "score",
      score: 2,
      anchor: "anchor_2：能基于一个业务约束做当前选择，但替代方案、风险或重评触发器不完整。",
      evidence: "有当前选择与一个约束，但没有明确何时放弃 Prompt、是否需要规则兜底。",
      pass: "通过但需保留缺口：最低线已达到，不得把不完整部分扩写为已具备。",
      boundary: "报告只能写已观察到的当前判断，不能声称完成全面技术选型。"
    },
    insufficient: {
      answer: "这个场景我会看实际情况再决定用 Prompt、RAG 还是 Agent。",
      status: "insufficient_evidence",
      score: null,
      anchor: "暂不匹配锚点：回答触及方案选型，但没有业务约束、当前选择或判断依据。",
      evidence: "存在相关表达，但不足以区分 anchor_0、anchor_1 或更高等级。",
      pass: "不参与通过率计算：记录 insufficient_evidence；题数允许时只补问缺失条件。",
      boundary: "不能因为回答短就记低分，也不能把模型猜测补成用户的选择依据。"
    },
    buzzwords: {
      answer: "我熟悉 Prompt、RAG、微调、Agent、工作流、向量数据库和知识图谱，具体要看场景。",
      status: "low",
      score: 1,
      anchor: "anchor_1：识别相关术语，但没有业务约束、取舍、当前选择或验证路径。",
      evidence: "术语很多，但没有可检查的决策依据。",
      pass: "未通过：已有足够证据判断只达到 1 分，不属于证据不足。",
      boundary: "语言流畅度和术语密度不是升分条件。"
    },
    wrong: {
      answer: "只要是 AI 产品就应该直接做 Agent，模型会自己决定流程，规则会限制智能。",
      status: "low",
      score: 0,
      anchor: "anchor_0：已观察到明确错误的唯一方案判断，并把确定性流程职责交给模型。",
      evidence: "回答明确否定职责边界，存在可判定的错误证据。",
      pass: "未通过：这是 low_score，不是 not_observed。",
      boundary: "程序记录 0 分依据；高影响结论仍应提供人工复核入口。"
    },
    unasked: {
      answer: "本轮问题只讨论了跨部门排期冲突，没有询问或触及 AI 方案选型。",
      status: "not_observed",
      score: null,
      anchor: "不匹配任何锚点：该维度没有被问题与回答覆盖。",
      evidence: "没有 AI 方案选型证据。",
      pass: "不参与通过率计算：记录 not_observed，不得记 0 分。",
      boundary: "Coverage Control 决定是否补问；Rubric 此时不应强行评分。"
    }
  };

  var traceRules = {
    metrics: {
      quote: "上线前会测回答准确性和响应速度",
      claim: "quality_metrics",
      criterion: "data_validation.anchor_2",
      score: "2",
      reference: "ans-support-17:v1#28-43"
    },
    handoff: {
      quote: "如果出现错误退款承诺，就先转人工处理",
      claim: "risk_handoff",
      criterion: "risk_boundary.anchor_2",
      score: "2",
      reference: "ans-support-17:v1#44-62"
    },
    invented: {
      quote: "上线后每周做 30 条回归测试",
      claim: null,
      criterion: null,
      score: null
    }
  };

  var transferScenarios = {
    customer_support: {
      invariants: "quote → claim → criterion → score → reference；引用必须回到原始会话，状态与版本必须可回放。",
      changes: "维度改为问题识别、解决正确性、语气与承诺合规；严重错误承诺的人工门槛更低。",
      decisions: "定义抽检范围、低分与严重违规的区别、复核 SLA、是否允许自动处置和申诉入口。",
      deliverable: "客服质检 Rubric + 逐句证据链 + 严重违规人工复核队列。"
    },
    sales_coach: {
      invariants: "保留原始回答、有限 claim、版本化 Rubric、状态区分与可追溯报告。",
      changes: "维度改为需求诊断、异议处理、价值表达和合规意识；不能用成交结果替代过程证据。",
      decisions: "确定哪些行为可自动评分、敏感承诺如何拦截、教练建议与绩效结论怎样隔离。",
      deliverable: "销售能力 Rubric + 对话证据 Schema + 一次只给一个优先缺口的陪练报告。"
    },
    knowledge_assistant: {
      invariants: "Grounding、来源 reference、版本、冲突处理与人工复核仍然不变。",
      changes: "评价对象从人的能力变为回答质量；criterion 改为来源相关性、事实一致性、时效与权限。",
      decisions: "定义无答案状态、来源过期门槛、冲突来源优先级和哪些结论必须拒答。",
      deliverable: "回答质量 Rubric + source → quote → claim 追溯链 + 有限结论报告模板。"
    }
  };

  function createState() {
    return {
      version: 5,
      page_id: config.page_id,
      page_learning: {
        concept_learning: null,
        completed_at: null
      },
      fields: {},
      experiments: {},
      handoff_requests: {},
      deliverables_markdown: "",
      quick_check: null,
      legacy_imported_from: null,
      updated_at: null
    };
  }

  function normalizeState(candidate) {
    var normalized = Object.assign(createState(), candidate || {});
    normalized.fields = normalized.fields && typeof normalized.fields === "object" ? normalized.fields : {};
    normalized.experiments = normalized.experiments && typeof normalized.experiments === "object" ? normalized.experiments : {};
    normalized.handoff_requests = normalized.handoff_requests && typeof normalized.handoff_requests === "object" ? normalized.handoff_requests : {};
    normalized.page_learning = normalized.page_learning && typeof normalized.page_learning === "object" ? normalized.page_learning : { concept_learning: null, completed_at: null };
    return normalized;
  }

  function migrateLegacy(raw, legacyKey) {
    var legacy;
    try {
      legacy = JSON.parse(raw);
    } catch (error) {
      return createState();
    }
    var migrated = createState();
    var answers = legacy.answers || {};
    var outputs = legacy.outputs || {};
    if (outputs.scoring_rubric_v1 || answers.rubric_design) migrated.fields.rubric_anchors = outputs.scoring_rubric_v1 || answers.rubric_design;
    if (outputs.traceability_protocol_v1 || answers.evidence_chain) migrated.fields.trace_fields = outputs.traceability_protocol_v1 || answers.evidence_chain;
    if (outputs.report_template_v1) migrated.fields.report_dimension = outputs.report_template_v1;
    migrated.legacy_imported_from = legacyKey;
    restoredFromLegacy = true;
    return migrated;
  }

  function loadState() {
    try {
      var raw = window.sessionStorage.getItem(storageKey);
      if (raw) return normalizeState(JSON.parse(raw));
      var legacyKeys = Array.isArray(config.legacy_storage_keys) ? config.legacy_storage_keys : [];
      for (var index = 0; index < legacyKeys.length; index += 1) {
        var legacyRaw = window.localStorage.getItem(legacyKeys[index]);
        if (legacyRaw) return normalizeState(migrateLegacy(legacyRaw, legacyKeys[index]));
      }
    } catch (error) {
      return createState();
    }
    return createState();
  }

  function announce(message) {
    var live = document.querySelector("[data-live-message]");
    if (!live) return;
    window.clearTimeout(liveTimer);
    live.textContent = message;
    liveTimer = window.setTimeout(function () {
      if (live.textContent === message) live.textContent = "";
    }, 4200);
  }

  function saveState(message) {
    state.updated_at = new Date().toISOString();
    renderPageReadiness(getProjectState());
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
      field.addEventListener("input", function () {
        state.fields[field.name] = field.value;
        scheduleSave();
      });
      field.addEventListener("change", function () {
        state.fields[field.name] = field.value;
        scheduleSave();
      });
    });
    if (state.deliverables_markdown) renderDeliverables(state.deliverables_markdown);
  }

  function getProjectState() {
    return window.__STUDY_PROJECT_STATE__ || window.__STUDY_PROJECT_SNAPSHOT__ || {};
  }

  function getTrackDay(projectState, dayId) {
    var formal = projectState.formal_state || {};
    var track = projectState.tracks && projectState.tracks[formal.track_id];
    return track && track.days.find(function (day) { return day.id === dayId; });
  }

  function formatUpdatedAt(value) {
    if (!value) return "—";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function renderRouteSteps(steps) {
    var list = document.querySelector("[data-day05-route-steps]");
    if (!list) return;
    list.textContent = "";
    steps.forEach(function (step) {
      var item = document.createElement("li");
      item.textContent = step;
      list.appendChild(item);
    });
  }

  function pageReadiness(projectState) {
    var day05 = getTrackDay(projectState || getProjectState(), "day-05") || {};
    var formalPage = day05.page_learning || {};
    var formalExperiments = formalPage.experiments || {};
    var conceptComplete = formalPage.concept_learning && formalPage.concept_learning.status === "completed" || Boolean(state.page_learning && state.page_learning.concept_learning);
    var rubricComplete = formalExperiments.rubric_lab && formalExperiments.rubric_lab.status === "completed" || Boolean(state.experiments.rubric);
    var traceComplete = formalExperiments.trace_lab && formalExperiments.trace_lab.status === "completed" || Boolean(state.experiments.trace);
    var reportComplete = formalExperiments.report_lab && formalExperiments.report_lab.status === "completed" || Boolean(state.experiments.report);
    return {
      concept: conceptComplete,
      rubric: rubricComplete,
      trace: traceComplete,
      report: reportComplete,
      overall: conceptComplete && rubricComplete && traceComplete && reportComplete,
      formallyRecorded: formalPage.status === "completed"
    };
  }

  function renderPageReadiness(projectState) {
    var readiness = pageReadiness(projectState);
    var labels = {
      concept: readiness.concept ? "已完成" : "待确认",
      rubric: readiness.rubric ? "已运行" : "待运行",
      trace: readiness.trace ? "已运行" : "待运行",
      report: readiness.report ? "已运行" : "待运行",
      overall: readiness.overall ? "ready · 可启动正式评测" : "继续完成网页课程"
    };
    Object.keys(labels).forEach(function (key) {
      document.querySelectorAll('[data-page-readiness="' + key + '"]').forEach(function (element) { element.textContent = labels[key]; });
    });
    var checkpoint = document.querySelector("[data-concept-checkpoint-status]");
    if (checkpoint) checkpoint.textContent = readiness.concept ? "已完成；该记录只表示网页课程进程。" : "阅读概念主线后手动确认，不生成正式掌握。";
    var button = document.querySelector("[data-confirm-concept-learning]");
    if (button) {
      button.disabled = readiness.concept;
      button.textContent = readiness.concept ? "概念主线已记录" : "标记概念主线已学习";
    }
    if (readiness.overall && state.page_learning && !state.page_learning.completed_at) state.page_learning.completed_at = new Date().toISOString();
    return readiness;
  }

  function applyFormalState(projectState) {
    var formal = projectState.formal_state || {};
    var day04 = getTrackDay(projectState, "day-04") || {};
    var day05 = getTrackDay(projectState, "day-05") || {};
    var pendingId = formal.pending_question_id;
    var retestId = formal.required_retest_of_question_id;
    var activeTask = pendingId || retestId;
    var courseActive = day05.formal_status === "in_progress" && formal.day_id === "day-05";
    var assessmentStarted = Boolean(formal.session_id || day05.assessment_status === "in_progress");
    var readiness = renderPageReadiness(projectState);
    var status = courseActive
      ? "课程已开启 · 网页" + (readiness.overall ? "已完成" : "进行中") + " · 正式评测" + (assessmentStarted ? "进行中" : "未开始") + " · 掌握" + (day05.concept_status === "untested" ? "未测试" : day05.concept_status)
      : day05.presentation + " · " + day05.formal_status + " · " + day05.concept_status;
    document.querySelectorAll("[data-day05-status]").forEach(function (element) { element.textContent = status; });
    var day04Complete = day04.formal_status === "completed" && day04.concept_status === "mastered";
    var day05PreviewLocked = Boolean(day05 && day05.formal_status === "not_started");
    var eligible = day05.eligibility_status === "eligible" || day04Complete;
    document.querySelectorAll("[data-day05-eligibility]").forEach(function (element) { element.textContent = (day05.eligibility_status || (day04Complete ? "eligible" : "locked")) + (day04Complete ? " · 前置已满足" : " · 前置未满足"); });
    document.querySelectorAll("[data-day05-course-state]").forEach(function (element) { element.textContent = (day05.formal_status || "not_started") + (courseActive ? " · 已开启" : " · 未开启"); });
    document.querySelectorAll("[data-day05-page-state]").forEach(function (element) { element.textContent = readiness.overall ? "completed · 概念与三实验已完成" : "in_progress · 网页课程进行中"; });
    document.querySelectorAll("[data-day05-assessment-state]").forEach(function (element) { element.textContent = (day05.assessment_status || (assessmentStarted ? "in_progress" : "not_started")) + " · " + (day05.concept_status || "untested"); });
    var orientationTitle = document.querySelector("[data-day05-orientation-title]");
    var assessmentNote = document.querySelector("[data-day05-assessment-note]");
    var summaryBoundary = document.querySelector("[data-day05-summary-boundary]");
    if (orientationTitle) orientationTitle.textContent = assessmentStarted
      ? "状态核对：Day 05 正式课程与网页课程已完成衔接，正式评测正在进行。"
      : courseActive
        ? "状态核对：Day 05 正式课程已开启，网页课程" + (readiness.overall ? "已完成" : "进行中") + "，正式评测尚未开始。"
        : "状态核对：Day 05 尚未正式开启；当前页面学习属于预习。";
    if (assessmentNote) assessmentNote.textContent = assessmentStarted
      ? "正式评测已经创建；当前只继续唯一 session 与 pending question。"
      : "只有明确启动评测后才创建全新 session 与第一题。";
    if (summaryBoundary) summaryBoundary.textContent = assessmentStarted
      ? "Day 05 网页课程已完成且正式评测进行中；最终掌握仍需正式证据覆盖机制解释、场景应用与新场景迁移。"
      : courseActive
        ? "Day 05 课程已开启且网页课程已完成；仍需明确启动正式评测并积累评分证据。"
        : "Day 05 页面学习仍是预习；它不会自行开启正式课程、创建题目或生成掌握证据。";
    var gate = document.querySelector("[data-day05-gate]");
    if (gate) gate.textContent = assessmentStarted ? "正式评测进行中" : courseActive ? "课程已开启 · 待正式评测" : "课程尚未开启";

    var activationControl = document.querySelector("[data-day05-course-activation]");
    var activationTitle = document.querySelector("[data-day05-course-activation-title]");
    var activationCopy = document.querySelector("[data-day05-course-activation-copy]");
    var activationValue = document.querySelector("[data-day05-course-activation-value]");
    var activationButton = document.querySelector("[data-day05-course-activation-button]");
    var activationStatus = document.querySelector("[data-day05-course-activation-status]");
    var activationRequest = state.handoff_requests && state.handoff_requests.activate_course;
    if (activationControl) activationControl.dataset.state = assessmentStarted ? "active" : courseActive ? "confirmed" : eligible ? "ready" : "blocked";
    if (activationTitle) activationTitle.textContent = assessmentStarted ? "当前正式学习入口" : courseActive ? "正式评测入口" : "正式课程入口";
    if (activationCopy) activationCopy.textContent = assessmentStarted
      ? "Day 05 正式评测正在进行。这里直接提供当前唯一正式任务的接力动作，不需要翻到页面后半段。"
      : courseActive
      ? "唯一正式状态源已经确认 Day 05 为 in_progress。下一步可以从这里明确启动正式评测。"
      : eligible
        ? "Day 05 已满足前置条件。点击核心按钮会复制明确的 activate_day 指令；返回当前 Codex 对话粘贴发送，待正式 JSON 写入后再刷新核对。"
        : "Day 05 尚未满足正式开启条件；页面仍可预览，但不能发起越级状态迁移。";
    if (activationValue) activationValue.textContent = assessmentStarted
      ? "assessment = in_progress" + (pendingId ? " · " + pendingId + " 待答" : "")
      : courseActive ? "formal_status = in_progress · 正式课程已开启" : eligible ? "formal_status = not_started · 等待明确开启" : "eligibility ≠ eligible · 暂不可开启";
    if (activationButton) {
      activationButton.disabled = !courseActive && !eligible;
      if (assessmentStarted) {
        activationButton.setAttribute("data-study-entry-action", "continue");
        activationButton.textContent = "继续 Day 05 正式学习";
      } else if (courseActive) {
        activationButton.setAttribute("data-study-entry-action", "start_assessment");
        activationButton.textContent = "启动 Day 05 正式评测";
      } else {
        activationButton.setAttribute("data-study-entry-action", "activate_course");
        activationButton.textContent = activationRequest ? "再次复制 Day 05 开启指令" : "正式开始 Day 05 课程";
      }
    }
    if (activationStatus) activationStatus.textContent = assessmentStarted
      ? "点击复制当前正式接力；回到 Codex 后只处理唯一 pending question。"
      : courseActive
      ? "点击复制启动评测指令；Codex 重读正式 JSON 后才创建新 session。"
      : activationRequest
        ? "开启指令已复制，等待你在当前 Codex 对话发送；页面本地请求不等于正式开启。"
        : eligible
          ? "点击只发起明确开启请求；Codex 写入正式 JSON 后才会生效。"
          : "先完成前置正式任务并清除遗留题目或复测关系。";

    var passedScope = day04Complete
      ? "Day 01—04 均已有正式掌握证据；Day 04 已通过状态机、Coverage Control、报告归因、停止状态边界与 q014 新场景恢复动作。"
      : "Day 01—03 已正式掌握；Day 04 的状态机四要素、Coverage Control、有限报告归因与 degraded 状态选择已有正式证据。";
    var currentGap = retestId
      ? "进入 degraded 后的两层动作仍不稳定：先立即止损，再保留完整失败现场并安排人工或受控恢复。"
      : pendingId
        ? "只处理当前正式待答题要求的一个未验证条件。"
        : courseActive && !assessmentStarted
          ? "Day 05 网页课程已完成；正式缺口是尚无机制解释、场景应用与新场景迁移的评分证据。"
        : day04Complete && day05PreviewLocked
          ? "Day 05 的机制解释、场景应用与迁移验证都尚无正式证据；页面当前只能预览，不能自行创建正式会话。"
        : formal.day_id === "day-05"
          ? "以最新 Day 05 正式题为准。"
          : "当前没有可定位的正式缺口；请重新核对正式记录。";
    var isReteach = Boolean(!pendingId && retestId);
    var currentSurface = pendingId ? "Codex · 当前正式单题" : isReteach ? "网页 · Day 04 聚焦重讲" : courseActive && !assessmentStarted ? "Codex · Day 05 正式评测接力" : courseActive ? "Codex · Day 05 正式评测" : day04Complete ? "网页 · Day 05 课程预览" : "网页 · 当前正式日";
    var switchCondition = pendingId
      ? "提交当前唯一题并完成正式反馈后，重新读取 JSON 再决定下一步。"
      : isReteach
        ? "完成错误节点 → 旧心智模型 → 不同场景实验 → 自己复述后，回 Codex 安排一题新场景延期复测。"
        : courseActive && !assessmentStarted
          ? "学习者明确启动正式评测；Codex 重新读取 JSON 后创建全新 Day 05 session 与第一道题。"
        : courseActive
          ? "按当前 Day 05 正式题的唯一要求作答。"
          : day04Complete && day05PreviewLocked
            ? "继续预习与整理非正式草稿；只有用户明确启动 Day 05 且 Codex 重新读取正式 JSON 后，才能创建正式单题。"
          : "Day 04 正式完成后，重新读取 JSON；只有状态源解锁 Day 05 才能进入正式单题。";
    var routeHref = pendingId ? "#formal-handoff" : isReteach ? "day-04-state-machine-coverage.html#focus-reteach" : courseActive ? "#formal-handoff" : day04Complete ? "#concept-line" : "day-04-state-machine-coverage.html#learning-cockpit-title";
    var routeText = pendingId ? "回 Codex 处理当前正式题" : isReteach ? "回 Day 04 完成聚焦重讲" : courseActive && !assessmentStarted ? "启动 Day 05 正式评测接力" : courseActive ? "继续 Day 05 正式评测" : day04Complete ? "从 Day 05 概念主线开始预习" : "返回当前正式 Day 04";
    var routeSteps = pendingId
      ? ["停留在 Codex，只处理当前唯一正式题；", "保留原始回答，反馈只突出一个最高优先缺口；", "评分回写后重新读取正式 JSON。"]
      : isReteach
        ? ["先在 Day 04 指出错误发生的判断节点；", "用不同场景的单变量实验重建两层动作；", "自己复述后回 Codex，安排一题新场景延期复测。"]
        : courseActive && !assessmentStarted
          ? ["Day 05 正式课程与网页课程进程已经记录；", "机制解释、应用和迁移仍保持未测试，不从实验倒推掌握；", "复制明确启动指令，Codex 重读 JSON 后新建 session 与唯一 q001。"]
        : day04Complete
          ? ["留在网页完成 Day 05 概念、实验与结构化草稿；", "所有结果只保存在当前标签页，不生成正式掌握；", "正式启动时回 Codex 重新读取 JSON，一次只创建并处理一个正式任务。"]
          : ["Day 05 可以预习和运行实验；", "页面结果不创建正式状态；", "Day 04 完成后重新读取 JSON 再解锁。"];
    var formalProgress = courseActive
      ? assessmentStarted
        ? "Day 01—04：正式掌握 · Day 05：课程已开启 / 网页已完成 / 正式评测进行中 / 掌握" + (day05.concept_status || "未测试")
        : "Day 01—04：正式掌握 · Day 05：课程已开启 / 网页已完成 / 正式评测未开始 / 掌握未测试"
      : day04Complete
      ? "Day 01—04：正式掌握 · Day 05：未开始 / 机制解释、应用、迁移证据均锁定"
      : "Day 01—03：正式掌握 · Day 04：部分验证 / 唯一缺口待巩固 · Day 05：未开始 / 正式证据锁定";

    var cockpitTitle = document.querySelector("[data-day05-cockpit-title]");
    var cockpitSummary = document.querySelector("[data-day05-cockpit-summary]");
    var cockpitMode = document.querySelector("[data-day05-cockpit-mode]");
    var cockpitUpdated = document.querySelector("[data-day05-cockpit-updated]");
    if (cockpitTitle) cockpitTitle.textContent = isReteach ? "Day 05 已可预览，但正式主线仍停在 Day 04 的一个缺口。" : courseActive && !assessmentStarted ? "Day 05 课程已开启，网页课程已完成，等待正式评测。" : courseActive ? "Day 05 正式评测进行中。" : day04Complete ? "Day 04 已正式掌握；Day 05 现在只做课程预览。" : "先完成当前正式主线，再解锁 Day 05。";
    if (cockpitSummary) cockpitSummary.textContent = isReteach
      ? "即时复测已经暂停。现在只重建 degraded 后的停止与恢复动作，不重复已通过的状态选择。"
      : courseActive && !assessmentStarted
        ? "概念学习与三个页面实验已记录为课程进程；正式 session 和 pending question 尚未创建，掌握证据仍为空。"
      : day04Complete && day05PreviewLocked
        ? "前置知识已通过，但 Day 05 尚无正式 session 或 pending question。本页用于理解、实验与产出草稿，不回写掌握状态。"
      : "页面会持续以唯一正式状态源决定当前主去向。";
    if (cockpitMode) cockpitMode.textContent = assessmentStarted ? "正式评测" : courseActive ? "课程已开启 · 待正式评测" : "preview_only · 正式证据锁定";
    if (cockpitUpdated) {
      cockpitUpdated.textContent = formatUpdatedAt(projectState.updated_at);
      if (projectState.updated_at) cockpitUpdated.dateTime = projectState.updated_at;
    }

    var progress = document.querySelector("[data-day05-formal-progress]");
    var passed = document.querySelector("[data-day05-passed-scope]");
    var gap = document.querySelector("[data-day05-current-gap]");
    var task = document.querySelector("[data-day05-formal-task]");
    var taskCopy = document.querySelector("[data-day05-formal-task-copy]");
    var surface = document.querySelector("[data-day05-current-surface]");
    var condition = document.querySelector("[data-day05-switch-condition]");
    if (progress) progress.textContent = formalProgress;
    if (passed) passed.textContent = passedScope;
    if (gap) gap.textContent = currentGap;
    if (task) task.textContent = activeTask || (courseActive && !assessmentStarted ? "启动 Day 05 正式评测 · 新建 session 与 q001" : day04Complete && day05PreviewLocked ? "无 pending question · Day 05 未启动" : "当前无待答题");
    if (taskCopy) taskCopy.textContent = isReteach ? " · 保留延期复测关系；当前先重讲，不重复原题。" : pendingId ? " · 当前唯一正式题" : "";
    if (surface) surface.textContent = currentSurface;
    if (condition) condition.textContent = switchCondition;
    if (assessmentStarted) {
      document.querySelectorAll('[data-page-readiness="overall"]').forEach(function (element) {
        element.textContent = pendingId ? "in_progress · " + pendingId + " 待答" : "in_progress · 正式评测进行中";
      });
    }
    renderRouteSteps(routeSteps);

    document.querySelectorAll("[data-day05-primary-route], [data-day05-sticky-action]").forEach(function (link) {
      link.href = routeHref;
      link.textContent = routeText;
    });
    document.querySelectorAll("[data-day05-sticky-surface]").forEach(function (element) { element.textContent = currentSurface; });
    document.querySelectorAll("[data-day05-sticky-condition]").forEach(function (element) { element.textContent = switchCondition; });
    var handoffTitle = document.querySelector("[data-day05-handoff-title]");
    if (handoffTitle) handoffTitle.textContent = courseActive && !assessmentStarted
      ? "正式学习接力：Day 05 课程与网页学习已完成衔接，等待创建正式评测。"
      : courseActive
      ? "正式学习接力：Day 05 正式评测已经开始。"
      : day04Complete
        ? "正式学习接力：Day 04 已完成；Day 05 仍是无正式题的课程预览。"
        : "正式学习接力：本页负责预习，正式主线仍按最新 JSON 处理 Day 04。";
    var assessmentButton = document.querySelector("[data-day05-assessment-button]");
    if (assessmentButton) {
      if (!courseActive) {
        assessmentButton.disabled = true;
        assessmentButton.textContent = "先正式开启 Day 05 课程";
        assessmentButton.setAttribute("data-study-entry-action", "start_assessment");
      } else if (!assessmentStarted) {
        assessmentButton.disabled = false;
        assessmentButton.textContent = state.handoff_requests && state.handoff_requests.start_assessment ? "再次复制 Day 05 正式评测指令" : "复制“启动 Day 05 正式评测”指令";
        assessmentButton.setAttribute("data-study-entry-action", "start_assessment");
      } else {
        assessmentButton.disabled = false;
        assessmentButton.textContent = "复制当前 Day 05 正式学习接力";
        assessmentButton.setAttribute("data-study-entry-action", "continue");
      }
    }

    var stageStates = {
      foundation: "verified",
      "day04-passed": "verified",
      "day04-gap": day04.formal_status === "completed" ? "verified" : "current",
      day05: courseActive ? "current" : "locked"
    };
    var stageCopy = {
      foundation: "正式掌握 · Day 01—03",
      "day04-passed": day04.formal_status === "completed" ? "Day 04 已正式完成" : "已有正式证据，不重复复测",
      "day04-gap": day04.formal_status === "completed" ? "q014 已验证 · 缺口关闭" : (activeTask || "等待正式安排") + " · 先重讲",
      day05: courseActive ? (assessmentStarted ? "正式评测进行中" : "课程已开启 · 网页已完成 · 待评测") : "preview_only · 未测试"
    };
    var gapStageLabel = document.querySelector("[data-day05-gap-stage-label]");
    var gapStageTitle = document.querySelector("[data-day05-gap-stage-title]");
    if (gapStageLabel) gapStageLabel.textContent = day04Complete ? "上一日缺口" : "当前唯一缺口";
    if (gapStageTitle) gapStageTitle.textContent = day04Complete ? "q014 新场景复测已关闭" : "Stop Rules · 安全降级动作";
    Object.keys(stageStates).forEach(function (name) {
      var stage = document.querySelector('[data-day05-progress-stage="' + name + '"]');
      var stageStatus = document.querySelector('[data-day05-stage-status="' + name + '"]');
      if (stage) stage.dataset.state = stageStates[name];
      if (stageStatus) stageStatus.textContent = stageCopy[name];
    });

    window.__STUDY_PAGE_HANDOFF__ = {
      day_id: formal.day_id,
      focus: isReteach ? "Day 04 / Stop Rules / degraded 后的停止与恢复动作" : courseActive ? "Day 05 / Rubric 与证据链 / 正式评测接力" : day04Complete && day05PreviewLocked ? "Day 05 / Rubric 与证据链 / 课程预览" : (formal.day_id || "当前正式范围"),
      page_anchor: isReteach ? "day-04-state-machine-coverage.html#focus-reteach" : day04Complete ? "#concept-line" : "#formal-handoff",
      formal_progress: formalProgress,
      next_surface: currentSurface,
      switch_condition: switchCondition,
      preparation_status: isReteach ? "Day 05 仅为预览；当前 Day 04 聚焦重讲尚需按网页实验确认" : courseActive && readiness.overall ? "Day 05 正式课程已开启；网页概念与三个实验已完成；正式评测 session 尚未创建" : day04Complete && day05PreviewLocked ? "Day 05 页面预览进行中；尚未创建正式 session 或 pending question" : "以正式状态源为准",
      formal_scope: currentGap,
      passed_scope: passedScope,
      reteach_contract: "如果我仍说不理解，请不要重复标准答案。请按错误节点 → 旧心智模型 → 不同场景单变量实验 → 我自己复述 → 新场景复测的顺序推进，并且不要重复已通过范围。"
    };
  }

  function renderRubricSample(sampleId) {
    var sample = rubricSamples[sampleId] || rubricSamples.complete;
    var answer = document.querySelector("[data-rubric-answer]");
    if (answer) answer.textContent = "“" + sample.answer + "”";
  }

  function renderRubricResult(sampleId) {
    var sample = rubricSamples[sampleId];
    var result = document.querySelector("[data-rubric-result]");
    var scoreLabel = sample.score === null ? "N/A" : sample.score + " / 3";
    result.dataset.state = sample.status === "score" ? "pass" : sample.status === "insufficient_evidence" ? "insufficient" : sample.status;
    result.querySelector(".scorecard-top span").textContent = sample.status === "not_observed" || sample.status === "insufficient_evidence" ? "不可评分状态" : sample.status === "low" ? "低分" : "Rubric 通过";
    result.querySelector(".scorecard-top strong").textContent = sample.status === "not_observed" || sample.status === "insufficient_evidence" ? sample.status : scoreLabel;
    result.querySelector("h3").textContent = sample.anchor;
    var items = result.querySelectorAll("dd");
    items[0].textContent = sample.evidence;
    items[1].textContent = sample.anchor;
    items[2].textContent = sample.pass;
    items[3].textContent = sample.boundary;
  }

  function runRubricLab(event) {
    event.preventDefault();
    var sampleId = event.currentTarget.elements.sample.value;
    var sample = rubricSamples[sampleId];
    renderRubricResult(sampleId);
    state.fields.sample = sampleId;
    state.experiments.rubric = { sample: sampleId, outcome: sample.status, score: sample.score, anchor: sample.anchor, completed_at: new Date().toISOString() };
    saveState("锚点评分已完成。页面结果只用于理解 Rubric，不是正式评分。");
  }

  function resetTraceSteps() {
    document.querySelectorAll("[data-trace-step]").forEach(function (step) {
      step.removeAttribute("data-state");
      step.querySelector("strong").textContent = "待验证";
    });
  }

  function setTraceStep(name, status, message) {
    var step = document.querySelector('[data-trace-step="' + name + '"]');
    if (!step) return;
    step.dataset.state = status;
    step.querySelector("strong").textContent = message;
  }

  function runTraceLab(event) {
    event.preventDefault();
    resetTraceSteps();
    var form = event.currentTarget;
    var quoteId = form.elements.trace_quote.value;
    var rule = traceRules[quoteId];
    var claim = form.elements.trace_claim.value;
    var criterion = form.elements.trace_criterion.value;
    var score = form.elements.trace_score.value;
    var reference = form.elements.trace_reference.value.trim();
    var message = document.querySelector("[data-trace-message]");
    var failedAt = null;

    if (quoteId === "invented") {
      setTraceStep("quote", "fail", "原文不存在");
      failedAt = "quote";
      message.textContent = "证据链在 quote 处断开：引用无法在 ans-support-17:v1 中定位，后续 claim 与 score 均不得发布。";
    } else {
      setTraceStep("quote", "pass", "原文可定位");
    }

    if (!failedAt && claim !== rule.claim) {
      setTraceStep("claim", "fail", claim === "full_monitoring" ? "结论越界" : "与引用不符");
      failedAt = "claim";
      message.textContent = "证据链在 claim 处断开：引用真实，但它不能直接支持所选结论。";
    } else if (!failedAt) {
      setTraceStep("claim", "pass", "范围受限");
    }

    if (!failedAt && criterion !== rule.criterion) {
      setTraceStep("criterion", "fail", "维度错配");
      failedAt = "criterion";
      message.textContent = "证据链在 criterion 处断开：claim 与评价维度不一致。";
    } else if (!failedAt) {
      setTraceStep("criterion", "pass", "criterion 匹配");
    }

    if (!failedAt && score !== rule.score) {
      setTraceStep("score", "fail", "锚点不匹配");
      failedAt = "score";
      message.textContent = "证据链在 score 处断开：现有证据只满足已发布的 anchor_2，不能升到 3 分或改成不可评分状态。";
    } else if (!failedAt) {
      setTraceStep("score", "pass", "2 / 3 合法");
    }

    if (!failedAt && reference !== rule.reference) {
      setTraceStep("reference", "fail", /^ans-support-17:v1#\d+-\d+$/.test(reference) ? "位置与 quote 不一致" : "引用不可回放");
      failedAt = "reference";
      message.textContent = /^ans-support-17:v1#\d+-\d+$/.test(reference)
        ? "证据链在 reference 处断开：ID 与版本正确，但字符范围不能精确回放当前 quote；预期 " + rule.reference + "。"
        : "证据链在 reference 处断开：必须包含稳定 answer_id、版本和与当前 quote 一致的位置范围。";
    } else if (!failedAt) {
      setTraceStep("reference", "pass", "可反向回放");
      message.textContent = "整条链通过结构校验：报告可以引用该有限结论。语义争议与高风险结论仍可进入人工复核。";
    }

    state.experiments.trace = {
      values: { quote: quoteId, claim: claim, criterion: criterion, score: score, reference: reference },
      passed: !failedAt,
      failed_at: failedAt,
      message: message.textContent,
      completed_at: new Date().toISOString()
    };
    saveState(!failedAt ? "证据链结构校验通过。" : "已定位证据链的第一个断点：" + failedAt + "。");
    if (failedAt) {
      var fieldMap = { quote: "trace_quote", claim: "trace_claim", criterion: "trace_criterion", score: "trace_score", reference: "trace_reference" };
      var failedField = form.elements[fieldMap[failedAt]];
      if (failedField) failedField.focus();
    }
  }

  function runReportLab(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var facts = {
      coverage: form.elements.report_coverage.value,
      relevance: form.elements.report_relevance.value,
      sufficiency: form.elements.report_sufficiency.value,
      anchor: Number(form.elements.report_anchor.value)
    };
    var outcome;
    if (facts.coverage === "not_asked") {
      outcome = {
        tone: "neutral",
        status: "not_observed",
        title: "该维度未被观察，不能推断能力高低。",
        allowed: "本次没有覆盖该维度，因此不生成分数。",
        blocked: "候选人在该能力上表现不足 / 记 0 分。",
        next: "若该维度为必选能力，回到 Coverage Control 安排新问题。"
      };
    } else if (facts.relevance === "none" || facts.sufficiency === "insufficient") {
      outcome = {
        tone: "warning",
        status: "insufficient_evidence",
        title: "问题已覆盖，但证据不足以稳定匹配锚点。",
        allowed: "回答与该维度相关信息不足，当前保留判断。",
        blocked: "直接给低分，或补写用户没有说过的经历。",
        next: "在题数和追问上限允许时补问一个缺失条件，否则生成有限报告。"
      };
    } else if (facts.anchor <= 1) {
      outcome = {
        tone: "low",
        status: "low_score · " + facts.anchor + " / 3",
        title: "已有足够证据，且只达到低等级锚点。",
        allowed: "现有回答显示该维度达到 " + facts.anchor + " 分；报告同时引用原话和锚点依据。",
        blocked: "写成未观察到或证据不足，隐藏已经出现的负向证据。",
        next: "给一个能产生缺失高阶证据的优先练习，并保留原始回答。"
      };
    } else {
      outcome = {
        tone: "success",
        status: "score · " + facts.anchor + " / 3",
        title: "证据充分，可以发布有限、可追溯的等级结论。",
        allowed: "该维度达到 " + facts.anchor + " 分；结论只覆盖已引用行为，不外推其他能力。",
        blocked: "因为本维度高分，就推断整体能力优秀。",
        next: "保存 rubric_version、quote、criterion_id 与 evidence reference，供复核和纠错。"
      };
    }

    renderReportOutcome(outcome, false);
    state.experiments.report = { facts: facts, outcome: outcome, completed_at: new Date().toISOString() };
    saveState("报告边界已重新计算。状态来自观察事实，不由模型语气决定。");
  }

  function renderReportOutcome(outcome, restored) {
    var result = document.querySelector("[data-report-result]");
    if (!result || !outcome) return;
    result.dataset.state = outcome.tone;
    result.querySelector(".result-status").textContent = outcome.status;
    result.querySelector(".result-updated").textContent = (restored ? "已恢复 · " : "已运行 · ") + new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    result.querySelector("h3").textContent = outcome.title;
    var items = result.querySelectorAll("dd");
    items[0].textContent = outcome.status;
    items[1].textContent = outcome.allowed;
    items[2].textContent = outcome.blocked;
    items[3].textContent = outcome.next;
  }

  function restoreTraceLab() {
    var saved = state.experiments.trace;
    if (!saved) return;
    var values = saved.values || {
      quote: saved.quote,
      claim: saved.claim,
      criterion: saved.criterion,
      score: saved.score,
      reference: saved.reference
    };
    var form = document.querySelector("[data-trace-lab]");
    if (!form || !values.quote) return;
    var names = { quote: "trace_quote", claim: "trace_claim", criterion: "trace_criterion", score: "trace_score", reference: "trace_reference" };
    Object.keys(names).forEach(function (key) {
      if (form.elements[names[key]] && values[key] !== undefined) form.elements[names[key]].value = values[key];
    });
    resetTraceSteps();
    var order = ["quote", "claim", "criterion", "score", "reference"];
    var passLabels = { quote: "原文可定位", claim: "范围受限", criterion: "criterion 匹配", score: "2 / 3 合法", reference: "可反向回放" };
    var failLabels = { quote: "原文不存在", claim: "结论越界", criterion: "维度错配", score: "锚点不匹配", reference: "引用不可回放" };
    order.forEach(function (name) {
      if (!saved.failed_at || order.indexOf(name) < order.indexOf(saved.failed_at)) setTraceStep(name, "pass", passLabels[name]);
      else if (name === saved.failed_at) setTraceStep(name, "fail", failLabels[name]);
    });
    var message = document.querySelector("[data-trace-message]");
    if (message) message.textContent = saved.message || (saved.passed ? "整条链通过结构校验，可以反向回放。" : "已恢复上次证据链断点：" + saved.failed_at + "。");
  }

  function restoreExperiments() {
    if (state.experiments.rubric && state.experiments.rubric.sample) {
      var rubricForm = document.querySelector("[data-rubric-lab]");
      if (rubricForm) rubricForm.elements.sample.value = state.experiments.rubric.sample;
      renderRubricSample(state.experiments.rubric.sample);
      renderRubricResult(state.experiments.rubric.sample);
    }
    restoreTraceLab();
    if (state.experiments.report && state.experiments.report.outcome) {
      var reportForm = document.querySelector("[data-report-lab]");
      var facts = state.experiments.report.facts || {};
      if (reportForm) {
        if (facts.coverage !== undefined) reportForm.elements.report_coverage.value = facts.coverage;
        if (facts.relevance !== undefined) reportForm.elements.report_relevance.value = facts.relevance;
        if (facts.sufficiency !== undefined) reportForm.elements.report_sufficiency.value = facts.sufficiency;
        if (facts.anchor !== undefined) reportForm.elements.report_anchor.value = String(facts.anchor);
      }
      if (typeof state.experiments.report.outcome === "object") renderReportOutcome(state.experiments.report.outcome, true);
    }
  }

  function sourceChecksum(value) {
    var hash = 2166136261;
    for (var index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return "fnv1a-" + (hash >>> 0).toString(16).padStart(8, "0");
  }

  function renderSourceChecksum() {
    var source = document.querySelector("[data-trace-source]");
    var output = document.querySelector("[data-trace-checksum]");
    if (!source || !output) return;
    output.textContent = sourceChecksum(source.textContent.replace(/[“”]/g, ""));
  }

  function setupTransferMap() {
    var select = document.querySelector("[data-transfer-scenario]");
    if (!select) return;
    function render() {
      var scenario = transferScenarios[select.value] || transferScenarios.customer_support;
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
    var fieldNames = Object.keys(rules);
    for (var index = 0; index < fieldNames.length; index += 1) {
      var name = fieldNames[index];
      var field = form.elements[name];
      var value = field ? field.value.trim() : "";
      if (!value) return { field: field, message: "请先填写“" + name + "”对应的结构字段。" };
      var missingToken = rules[name].find(function (token) { return !containsToken(value, token); });
      if (missingToken) return { field: field, message: "“" + name + "”优先补充关键条件：" + missingToken + "。页面不按字数判断。" };
    }
    return null;
  }

  function createDeliverableMarkdown(form) {
    return [
      "# Day 05 三项 v1 产出（网页课程草稿）",
      "",
      "## Scoring Rubric v1",
      "",
      "### 评价维度与职责边界",
      form.elements.rubric_dimensions.value.trim(),
      "",
      "### 0—3 级锚点",
      form.elements.rubric_anchors.value.trim(),
      "",
      "### 通过与不可评分条件",
      form.elements.rubric_pass.value.trim(),
      "",
      "## Evidence Chain / Traceability Schema v1",
      "",
      "### 核心字段",
      form.elements.trace_fields.value.trim(),
      "",
      "### 确定性校验",
      form.elements.trace_validation.value.trim(),
      "",
      "### 冲突与人工复核",
      form.elements.trace_review.value.trim(),
      "",
      "## Grounded Report Template v1",
      "",
      "### 覆盖与可信度摘要",
      form.elements.report_overview.value.trim(),
      "",
      "### 分维度报告结构",
      form.elements.report_dimension.value.trim(),
      "",
      "### 优先缺口与下一步",
      form.elements.report_action.value.trim(),
      "",
      "> 这是网页课程草稿，可记录课程进程，但不代表正式评测通过或正式掌握。",
      ""
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
    state.deliverables_markdown = createDeliverableMarkdown(form);
    renderDeliverables(state.deliverables_markdown);
    saveState("三项 v1 预览已生成。请继续核对字段引用与职责边界。");
  }

  function renderDeliverables(markdown) {
    var preview = document.querySelector("[data-deliverable-preview]");
    if (!preview) return;
    preview.hidden = false;
    preview.querySelector("[data-deliverable-output]").textContent = markdown;
  }

  function confirmConceptLearning() {
    state.page_learning.concept_learning = {
      status: "completed",
      completed_at: new Date().toISOString(),
      evidence_type: "page_checkpoint"
    };
    saveState("概念主线已记录为网页课程进程；正式掌握仍等待评测。 ");
  }

  function gradeQuickCheck(event) {
    event.preventDefault();
    var correctAnswers = { quiz_1: "not_observed", quiz_2: "no", quiz_3: "program" };
    var missing = 0;
    var correct = 0;
    var selections = {};
    var firstMissing = null;
    Object.keys(correctAnswers).forEach(function (name) {
      var selected = event.currentTarget.querySelector('input[name="' + name + '"]:checked');
      if (!selected) {
        missing += 1;
        if (!firstMissing) firstMissing = event.currentTarget.querySelector('input[name="' + name + '"]');
      } else {
        selections[name] = selected.value;
        if (selected.value === correctAnswers[name]) correct += 1;
      }
    });
    var result = document.querySelector("[data-quiz-result]");
    result.hidden = false;
    if (missing) {
      result.dataset.state = "warning";
      result.textContent = "还有 " + missing + " 道未选择。页面只在三道题都完成后给结构诊断。";
      if (firstMissing) firstMissing.focus();
      return;
    }
    state.quick_check = { selections: selections, correct: correct, total: 3, completed_at: new Date().toISOString() };
    if (correct === 3) {
      result.dataset.state = "success";
      result.innerHTML = "<strong>3 / 3，结构判断一致。</strong> 你区分了未观察、claim 越界和程序校验职责；这仍是非正式页面自检。";
    } else {
      result.dataset.state = "warning";
      result.innerHTML = "<strong>答对 " + correct + " / 3。</strong> 优先回看三类状态与 quote → claim → criterion → score → reference 链路；页面不会创建正式复测。";
    }
    saveState();
  }

  function restoreQuickCheck() {
    if (!state.quick_check || !state.quick_check.selections) return;
    var form = document.querySelector("[data-quick-check]");
    if (!form) return;
    Object.keys(state.quick_check.selections).forEach(function (name) {
      var input = form.querySelector('input[name="' + name + '"][value="' + state.quick_check.selections[name] + '"]');
      if (input) input.checked = true;
    });
    var result = document.querySelector("[data-quiz-result]");
    if (!result) return;
    result.hidden = false;
    if (state.quick_check.correct === state.quick_check.total) {
      result.dataset.state = "success";
      result.innerHTML = "<strong>已恢复：3 / 3，结构判断一致。</strong> 这仍是非正式页面自检。";
    } else {
      result.dataset.state = "warning";
      result.innerHTML = "<strong>已恢复：答对 " + state.quick_check.correct + " / " + state.quick_check.total + "。</strong> 页面不会创建正式复测。";
    }
  }

  function buildExport() {
    var projectState = getProjectState();
    var formal = projectState.formal_state || {};
    var track = projectState.tracks && projectState.tracks[formal.track_id];
    var day05 = track && track.days.find(function (day) { return day.id === "day-05"; });
    return {
      export_type: "ai-pm-study-day05-course-progress",
      export_version: 3,
      page_id: config.page_id,
      source_page: config.source_page,
      formal_state_source: config.formal_state_source,
      formal_learning_state: {
        source_updated_at: projectState.updated_at,
        active_day_id: formal.day_id,
        active_session_id: formal.session_id,
        pending_question_id: formal.pending_question_id,
        page_day: day05 ? {
          formal_status: day05.formal_status,
          concept_status: day05.concept_status,
          presentation: day05.presentation,
          requires_completed_days: day05.requires_completed_days
        } : null
      },
      fields: Object.assign({}, state.fields),
      page_learning: Object.assign({}, state.page_learning),
      experiments: Object.assign({}, state.experiments),
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

  function copyText(value, successMessage) {
    if (!value) {
      announce("当前还没有可复制的三项 v1 预览。");
      return;
    }
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
      announce(copied ? successMessage : "浏览器阻止了复制，请手动选择预览内容。");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () { announce(successMessage); }).catch(fallback);
    } else {
      fallback();
    }
  }

  function setupReadingProgress() {
    var sections = Array.prototype.slice.call(document.querySelectorAll("[data-chapter-section]"));
    var links = Array.prototype.slice.call(document.querySelectorAll("[data-section-link]"));
    var progressBar = document.querySelector("[data-reading-progress]");
    var progressText = document.querySelector("[data-progress-text]");
    function updateProgress() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      var percent = Math.round(ratio * 100);
      if (progressBar) progressBar.style.width = percent + "%";
      if (progressText) progressText.textContent = percent + "%";
    }
    if ("IntersectionObserver" in window) {
      var observer = new IntersectionObserver(function (entries) {
        var visible = entries.filter(function (entry) { return entry.isIntersecting; }).sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; });
        if (!visible.length) return;
        var id = visible[0].target.id;
        links.forEach(function (link) {
          if (link.getAttribute("data-section-link") === id) link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
      }, { rootMargin: "-18% 0px -62% 0px", threshold: [0, 0.2, 0.5] });
      sections.forEach(function (section) { observer.observe(section); });
    }
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    updateProgress();
  }

  var rubricForm = document.querySelector("[data-rubric-lab]");
  var rubricSelect = rubricForm && rubricForm.elements.sample;
  if (rubricForm) rubricForm.addEventListener("submit", runRubricLab);
  if (rubricSelect) rubricSelect.addEventListener("change", function () { renderRubricSample(rubricSelect.value); });

  var traceForm = document.querySelector("[data-trace-lab]");
  if (traceForm) traceForm.addEventListener("submit", runTraceLab);

  var reportForm = document.querySelector("[data-report-lab]");
  if (reportForm) reportForm.addEventListener("submit", runReportLab);

  var deliverableForm = document.querySelector("[data-deliverable-builder]");
  if (deliverableForm) deliverableForm.addEventListener("submit", buildDeliverables);

  var quickCheck = document.querySelector("[data-quick-check]");
  if (quickCheck) quickCheck.addEventListener("submit", gradeQuickCheck);

  var conceptLearningButton = document.querySelector("[data-confirm-concept-learning]");
  if (conceptLearningButton) conceptLearningButton.addEventListener("click", confirmConceptLearning);

  document.addEventListener("study-entry-copied", function (event) {
    var detail = event.detail || {};
    if (detail.day_id && detail.day_id !== "day-05") return;
    if (detail.action !== "activate_course" && detail.action !== "start_assessment") return;
    state.handoff_requests[detail.action] = { status: "copied", copied_at: detail.copied_at || new Date().toISOString() };
    saveState();
    applyFormalState(getProjectState());
  });

  var clearButton = document.querySelector("[data-clear-session-draft]");
  if (clearButton) clearButton.addEventListener("click", function () {
    if (!window.confirm("只清除当前标签页的 Day 05 预览草稿？正式记录和旧 localStorage 缓存不会被删除。")) return;
    window.sessionStorage.removeItem(storageKey);
    window.location.reload();
  });

  var copyButton = document.querySelector("[data-copy-deliverables]");
  if (copyButton) copyButton.addEventListener("click", function () { copyText(state.deliverables_markdown, "三项 v1 预览 Markdown 已复制。"); });

  var exportJson = document.querySelector("[data-export-json]");
  if (exportJson) exportJson.addEventListener("click", function () {
    exportFile(JSON.stringify(buildExport(), null, 2), "day05-evidence-review-preview.json", "application/json;charset=utf-8");
    announce("Day 05 预览 JSON 已生成，不会回写正式状态。");
  });

  var exportMarkdown = document.querySelector("[data-export-markdown]");
  if (exportMarkdown) exportMarkdown.addEventListener("click", function () {
    exportFile(state.deliverables_markdown || "# Day 05 页面预览\n\n尚未生成三项 v1 产出。\n", "day05-evidence-review-preview.md", "text/markdown;charset=utf-8");
    announce("Day 05 预览 Markdown 已生成，不会回写正式状态。");
  });

  var printButton = document.querySelector("[data-print]");
  if (printButton) printButton.addEventListener("click", function () { window.print(); });

  restoreFields();
  setupTransferMap();
  renderRubricSample(rubricSelect ? rubricSelect.value : "complete");
  restoreExperiments();
  restoreQuickCheck();
  renderSourceChecksum();
  applyFormalState(getProjectState());
  document.addEventListener("study-state-ready", function (event) { applyFormalState(event.detail.state); });
  setupReadingProgress();

  if (restoredFromLegacy) {
    var status = document.querySelector("[data-save-status]");
    if (status) status.textContent = "已只读迁移旧草稿到当前标签页 · 旧 localStorage 未删除";
    saveState("已从旧 Day 05 草稿恢复可映射内容，旧缓存保持不变。");
  }
})();
