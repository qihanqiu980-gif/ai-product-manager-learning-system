(function () {
  "use strict";

  document.documentElement.dataset.day04LabVersion = "2026-08-11-stop-states-3";

  var projectState = window.__STUDY_PROJECT_STATE__ || window.__STUDY_PROJECT_SNAPSHOT__ || {};
  var formalState = projectState.formal_state || {};
  var officialSessionId = formalState.session_id || "day04-unassigned";
  var officialQuestionId = formalState.pending_question_id || null;
  var questionDefinition = formalState.current_question || null;
  var storageKey = "ai-pm-day04-preview:" + officialSessionId;
  var saveTimer;
  var liveTimer;
  var state = loadState();

  function createState() {
    return {
      version: 4,
      page_id: "day04",
      session_id: officialSessionId,
      pending_question_id: officialQuestionId,
      fields: {},
      composed_answer: "",
      question_drafts: {},
      deliverables_markdown: "",
      state_lab: null,
      coverage_lab: null,
      stop_lab: null,
      focus_reteach: null,
      degradation_reteach: null,
      quiz: null,
      updated_at: null
    };
  }

  function loadState() {
    try {
      var raw = window.sessionStorage.getItem(storageKey);
      var loaded = Object.assign(createState(), raw ? JSON.parse(raw) : {});
      if (Number(loaded.version || 0) < 4) {
        loaded.version = 4;
        loaded.degradation_reteach = null;
      }
      loaded.question_drafts = loaded.question_drafts && typeof loaded.question_drafts === "object" ? loaded.question_drafts : {};
      if (loaded.pending_question_id && loaded.pending_question_id !== officialQuestionId) {
        var archivedFields = {};
        Object.keys(loaded.fields || {}).forEach(function (key) {
          if (key.indexOf("formal_") === 0) {
            archivedFields[key] = loaded.fields[key];
            delete loaded.fields[key];
          }
        });
        loaded.question_drafts[loaded.pending_question_id] = {
          fields: archivedFields,
          composed_answer: loaded.composed_answer,
          archived_at: new Date().toISOString()
        };
        loaded.composed_answer = "";
      }
      loaded.session_id = officialSessionId;
      loaded.pending_question_id = officialQuestionId;
      return loaded;
    } catch (error) {
      return createState();
    }
  }

  function findDay(stateSource, dayId) {
    var source = stateSource || {};
    var formal = source.formal_state || {};
    var track = source.tracks && source.tracks[formal.track_id];
    return track && track.days.find(function (day) { return day.id === dayId; });
  }

  function questionOrdinal(formal) {
    if (formal.pending_question_ordinal !== null && formal.pending_question_ordinal !== undefined && formal.pending_question_ordinal !== "" && Number.isFinite(Number(formal.pending_question_ordinal))) {
      return Number(formal.pending_question_ordinal);
    }
    var reference = formal.pending_question_id || formal.required_retest_of_question_id || "";
    var match = reference.match(/q(\d+)$/);
    return match ? Number(match[1]) : 0;
  }

  function formatUpdatedAt(value) {
    if (!value) return "—";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function routeForState(stateSource) {
    var source = stateSource || {};
    var formal = source.formal_state || {};
    var day04 = findDay(source, "day-04") || {};
    var ordinal = questionOrdinal(formal);
    var pendingId = formal.pending_question_id;
    var retestId = formal.required_retest_of_question_id;
    var activeQuestionId = pendingId || retestId;
    var pendingShort = activeQuestionId ? activeQuestionId.split("-").pop() : "当前题";
    var pendingTitle = formal.current_question && formal.current_question.title;
    var pendingPrompt = formal.current_question && formal.current_question.prompt;
    var isAttributionQuestion = pendingId === "session-0d45ddbd-q010" || /归因|报告句/.test(pendingTitle || "");
    var isDegradationQuestion = pendingId === "session-0d45ddbd-q012" || /q01[1-3]$/.test(retestId || "") || /安全降级|validation_failed|校验失败/.test((pendingTitle || "") + " " + (pendingPrompt || ""));
    var isDegradationActionQuestion = retestId === "session-0d45ddbd-q013" || /动作聚焦|不再选择状态|只写出两项程序动作/.test((pendingTitle || "") + " " + (pendingPrompt || ""));
    var route = {
      title: "先定位知识缺口，再决定去网页还是回 Codex。",
      summary: "网页负责理解、对照和实验；Codex 负责正式单题反馈；正式 JSON 负责记录进度。",
      mode: "课程参考",
      verified: "请从正式记录核对已通过范围。",
      gap: "当前没有可定位的 Day 04 正式任务。",
      question: pendingId || "当前无待答题",
      questionCopy: pendingTitle || "",
      primaryHref: "#orientation",
      primaryText: "从概念主线开始",
      secondaryHref: "#formal-question",
      secondaryText: "查看正式状态",
      readiness: "页面阅读与实验不改变正式掌握状态。",
      scopeFocus: "以正式题为准",
      scopePassed: "不要重复已经评分通过的范围",
      routeSteps: ["先核对当前正式状态；", "只学习当前唯一缺口；", "准备好后回 Codex 处理一项正式任务。"],
      focus: "Day 04 学习导航",
      pageAnchor: "#orientation",
      focusModule: "none",
      focusVariant: "none",
      focusTitle: "先定位当前唯一缺口，再选择对应实验。",
      focusLead: "这里不会把整章重新讲一遍，只拆解正式记录里尚未通过的一个判断节点。",
      focusCurrentStep: 2,
      focusSteps: [
        { label: "场景事实", title: "先读取题目给出的确定性事实", copy: "不先猜状态名。" },
        { label: "规则条件", title: "找出真正决定分支的条件", copy: "区分业务事实与系统契约。" },
        { label: "错误节点", title: "定位当前回答跳错的位置", copy: "只修一个最高优先缺口。" },
        { label: "程序动作", title: "把正确判断落成状态与动作", copy: "结果需要可实现、可记录、可恢复。" }
      ],
      oldModel: "看到一个表面信号 → 直接选择看起来最接近的状态",
      oldCopy: "这会跳过真正拥有优先级的确定性条件。",
      newModel: "场景事实 → 规则优先级 → 合法状态 → 必须动作",
      newCopy: "每一步都能回到题干事实、程序 Guard 和恢复动作。",
      bridgeTitle: "怎样迁移回当前正式题",
      bridgeCopy: "只迁移刚才验证过的判断顺序，不复制示例答案。",
      bridgeAction: "去整理当前正式题"
    };

    if (formal.day_id !== "day-04") return route;

    if (day04.formal_status === "completed") {
      route.title = "Day 04 已完成正式学习，网页现在用于复习与迁移。";
      route.summary = "三个子范围均已有正式证据，q014 已关闭最后缺口；下一正式阶段是 Day 05，但尚未启动。";
      route.mode = "已正式完成 · 可复习";
      route.verified = "状态流转、能力覆盖、停止规则与异常恢复动作均已完成正式验证。";
      route.gap = "当前没有 Day 04 正式缺口。";
      route.question = "无 pending question · Day 04 已完成";
      route.questionCopy = "";
      route.primaryHref = "#transfer-lab";
      route.primaryText = "做一次跨场景迁移";
      route.secondaryHref = "day-05-rubric-grounding-report.html";
      route.secondaryText = "打开 Day 05 课程预览";
      route.readiness = "留在网页可做 Day 04 复习或 Day 05 预习；要启动 Day 05 正式学习时，回 Codex 重新读取 JSON，一次只创建一个正式任务。";
      route.scopeFocus = "当前无正式待答题";
      route.scopePassed = "Day 04 全部正式范围已掌握，不重复复测";
      route.routeSteps = ["Day 04 当前没有正式缺口；", "网页复习与迁移不会改变正式状态；", "正式推进时从 Day 05 开始，不沿用 Day 04 的旧题号。"];
      route.focus = "Day 04 / 已完成正式学习 / 复习与迁移";
      route.pageAnchor = "#transfer-lab";
      return route;
    }

    if (isDegradationQuestion) {
      route.title = "你现在只需要补一个判断：业务做完，不等于结果已经可以交付。";
      route.summary = "状态机、Coverage Control 与有限报告归因已经通过。当前只验证 validation_failed 达到上限时，异常分支为什么优先于正常完成。";
      route.mode = pendingId ? "正式复测待答 · 安全降级边界" : "聚焦重讲 · 安全降级边界";
      route.verified = "能识别计划问题与覆盖已经完成；也知道达到失败上限后不能继续自动重试。";
      route.gap = "仍把“业务步骤完成”当成 completed，忽略最终输出尚未通过确定性校验。";
      route.question = activeQuestionId || "等待正式安排";
      route.questionCopy = pendingTitle || "安全降级与业务完成边界";
      route.primaryHref = "#focus-reteach";
      route.primaryText = "先做 2 分钟异常优先级实验";
      route.secondaryHref = "#formal-question";
      route.secondaryText = pendingId ? "查看当前正式题" : "查看正式复测关系";
      route.readiness = "先区分“业务事实”和“交付契约”，再选择 degraded 或 completed。";
      route.scopeFocus = "validation_failed 达到上限时的安全降级与两层动作";
      route.scopePassed = "状态机、Coverage Control、limited_report 与报告归因";
      route.routeSteps = ["先确认业务内容是否做完；", "再检查输出是否通过确定性校验；", pendingId ? "异常达到上限时选择合法状态，并写出停止与恢复动作。" : "完成对照后等待一题新场景复测。"];
      route.focus = "Stop Rules / 安全降级与业务完成边界";
      route.pageAnchor = "#focus-reteach";
      route.focusModule = "degradation";
      route.focusVariant = isDegradationActionQuestion ? "degradation_actions" : "degradation_state";
      route.focusTitle = "不要把“业务做完”当成“结果可以交付”。";
      route.focusLead = "当前正式题只验证异常停止优先级：当结构校验连续失败并达到上限时，即使计划问题和能力覆盖全部完成，也不能进入 completed。";
      route.focusCurrentStep = 2;
      route.focusSteps = [
        { label: "业务事实", title: "计划问题与必覆盖维度是否完成？", copy: "这是必要条件，但不是 completed 的全部条件。" },
        { label: "交付契约", title: "最终输出是否已保存并通过结构校验？", copy: "validation_failed=true 表示结果仍不可安全发布。" },
        { label: "分支优先级", title: "异常达到上限是否覆盖正常完成？", copy: "你当前的错误发生在这里。" },
        { label: "恢复动作", title: "停止重试后怎样保留现场并恢复？", copy: "保留原始回答与失败日志，提供人工或手动入口。" }
      ];
      route.oldModel = "题目与覆盖已完成 → completed";
      route.oldCopy = "它只看见业务完成，却跳过了“输出必须通过机器契约校验”这个交付条件。";
      route.newModel = "业务完成 + validation_passed → completed；失败到上限 → degraded";
      route.newCopy = "异常分支优先。程序先停止自动重试、保留失败现场，再提供人工复核或手动处理入口。";
      route.bridgeCopy = "迁移四步：业务事实 → 交付契约 → 异常优先级 → 停止与恢复动作。不要复制知识助手示例。";
      route.bridgeAction = pendingId ? "去整理 " + pendingShort + " 的状态与动作" : "查看正式复测关系";
      if (isDegradationActionQuestion) {
        route.title = "你现在只需要补两层动作：立即止损，再保留与恢复。";
        route.summary = pendingId
          ? "安全降级状态选择已经通过；当前正式题不再让你选择 degraded，只验证进入该状态后的两层动作。"
          : "正式记录已暂停即时复测并保留 q013 的复测关系；当前只重建进入 degraded 后的“立即止损”与“保留和恢复”。";
        route.mode = pendingId ? "正式复测待答 · 安全降级动作" : "聚焦重讲 · 安全降级动作";
        route.primaryText = pendingId ? "先做 2 分钟两层动作实验" : "先做两层动作对照并完成重讲";
        route.verified = "已经会在 validation_failed 达到上限时选择 degraded，并说明异常优先于正常完成。";
        route.gap = "只说状态还不够：缺少“立即止损”和“保留与恢复”两层动作。";
        route.readiness = pendingId
          ? "这次网页实验会固定触发条件与 Next State，只让你练“立即止损”和“保留与恢复”。"
          : "当前没有待答题。先完成两层动作对照，再回 Codex 安排一题新场景延期复测。";
        route.scopeFocus = pendingId
          ? "degraded 之后的两层动作：停止重试并阻止交付；保存完整失败现场并安排人工或受控恢复"
          : "q013 未通过条件：立即止损；保留完整失败现场并安排人工或受控恢复";
        route.scopePassed = "degraded 状态选择、异常优先级及前序全部子范围";
        route.focus = "Stop Rules / degraded 后的停止与恢复动作";
        route.routeSteps = ["先用三状态对照确认它们不是固定流程；", "状态 degraded 已经给定，不再重复选择；", pendingId ? "只写“立即止损”和“保留与恢复”两层动作。" : "完成两层动作对照后回 Codex，等待新场景延期复测。"];
        route.focusTitle = "进入 degraded 不是处理完成：先止损，再保留与恢复。";
        route.focusLead = pendingId
          ? "当前正式题已经给定 degraded。你只需要说明：自动流程怎样停住，以及已有数据、失败现场与后续恢复怎样处理。"
          : "正式记录已经确认状态应为 degraded。当前重讲只补两层动作：怎样立即停止自动流程和阻止交付，以及怎样保留完整失败现场并安排人工或受控恢复。";
        route.focusCurrentStep = 2;
        route.focusSteps = [
          { label: "异常触发", title: "结构校验连续失败并达到上限", copy: "这个事实已经给定，不再复测。" },
          { label: "合法状态", title: "Next State = degraded", copy: "q012 已经通过，不再重复选择。" },
          { label: "立即止损", title: "停止自动重试，并阻止未校验结果正式交付", copy: "先阻止失败继续扩大，也不能把不合格结果伪装成完成。" },
          { label: "保留与恢复", title: "保存五类失败现场，转人工复核或受控重试", copy: "原始输入、模型输出、校验错误、重试次数和日志都要可追溯；恢复后必须重新校验。" }
        ];
        route.oldModel = "degraded → exit_confirmation_pending → completed";
        route.oldCopy = "这把三个互斥分支误画成固定流程，而且跳过了真正要执行的止损、留证和恢复动作。";
        route.newModel = "当前事实选一个分支；进入 degraded 后先止损，再保留与恢复";
        route.newCopy = "立即止损负责停止自动重试和阻止未校验结果交付；保留与恢复负责保存五类失败现场，并转人工复核或受控重试后重新校验。";
        route.bridgeCopy = "迁移时只保留两层动作：先阻止自动流程继续扩大失败；再保存原始输入、模型输出、校验错误、重试次数和日志，安排人工或受控恢复。";
        route.bridgeAction = pendingId ? "去整理 " + pendingShort + " 的两项动作" : "查看正式接力说明";
      }
      if (state.degradation_reteach && state.degradation_reteach.outcome && state.degradation_reteach.outcome.passed && pendingId) {
        route.primaryHref = "#formal-question";
        route.primaryText = "去整理 " + pendingShort + " 正式回答";
        route.secondaryHref = "#focus-reteach";
        route.secondaryText = "重新做异常优先级实验";
        route.readiness = "已完成页面异常优先级对照（非正式）。下一步只处理 " + pendingShort + "，正式评分仍由 Codex 完成。";
      } else if (state.degradation_reteach && state.degradation_reteach.outcome && state.degradation_reteach.outcome.passed && retestId) {
        route.primaryHref = "#formal-question";
        route.primaryText = "回 Codex 安排延期新场景复测";
        route.secondaryHref = "#focus-reteach";
        route.secondaryText = "重新做两层动作对照";
        route.readiness = "本页两层动作对照已通过（非正式）。当前仍没有待答题；回 Codex 后应换场景延期复测，不重复 q013。";
      }
      return route;
    }

    if (isAttributionQuestion || formal.required_retest_of_question_id === "session-0d45ddbd-q009") {
      route.title = "你现在只需要补一个判断：证据缺口应该归因给本次采集过程。";
      route.summary = "状态机四要素和 Coverage Control 子范围已正式通过；Stop Rules 中 limited_report 与 not_observed 也已答对。当前只剩报告归因边界。";
      route.mode = pendingId ? "正式复测待答 · 先理解后提交" : "聚焦重讲 · 暂不重复答题";
      route.verified = "会选择 limited_report；会用 not_observed 表示从未提问、完全无证据。";
      route.gap = "不能把“本次流程未采集证据”写成“用户缺少经验或能力较弱”。";
      route.question = pendingId || formal.required_retest_of_question_id || "等待正式安排";
      route.questionCopy = pendingTitle || "报告归因边界";
      route.primaryHref = "#focus-reteach";
      route.primaryText = "先做 2 分钟归因对照";
      route.secondaryHref = "#formal-question";
      route.secondaryText = pendingId ? "查看当前正式题" : "查看正式复测关系";
      route.readiness = "先理解“观察事实 → 证据状态 → 归因对象 → 结论边界”，再用自己的话作答。";
      route.scopeFocus = "报告归因：把原因放回本次采集过程";
      route.scopePassed = "limited_report、not_observed 及其触发依据";
      route.routeSteps = ["看不同场景的错误节点对照；", "运行归因实验，观察第一个断点；", pendingId ? "回到 " + pendingShort + "，只提交一条自己的报告句。" : "等待正式会话创建一题新场景延期复测。"];
      route.focus = "Stop Rules / 报告归因边界";
      route.pageAnchor = "#focus-reteach";
      route.focusModule = "attribution";
      route.focusTitle = "不要先背正确句子，先找到错误发生在哪个判断节点。";
      route.focusLead = "这一步不再考你选择 limited_report，也不再考 not_observed。它只验证：系统没有采集证据时，报告不能把原因写成学习者没有能力或经验。";
      route.focusCurrentStep = 2;
      route.focusSteps = [
        { label: "观察事实", title: "本次问过什么、拿到什么证据？", copy: "先描述流程事实，不推测人的真实能力。" },
        { label: "证据状态", title: "not_observed / insufficient_evidence / score", copy: "状态由观察事实决定，不由报告语气决定。" },
        { label: "归因对象", title: "缺口来自本次采集过程，还是来自用户能力？", copy: "你当前的错误发生在这里。" },
        { label: "结论边界", title: "报告最多能说到哪一步？", copy: "没有证据时只能说无法判断。" }
      ];
      route.oldModel = "没有看到证据 → 用户没有经验 → 能力较弱";
      route.oldCopy = "第一步只说明系统没看到，后两步却变成了对人的推断。这个跳跃没有引用证据，也无法复核。";
      route.newModel = "本次采集范围 → 当前证据状态 → 可以下的结论";
      route.newCopy = "把主语放回本次流程、当前回答或已观察行为，再说明信息边界。";
      route.bridgeCopy = "保留三段逻辑：本次采集范围 → 证据状态 → 能否判断。不要复制客服示例，也不要重复已通过的 limited_report 与 not_observed。";
      route.bridgeAction = pendingId ? "去整理当前正式题的一句话" : "查看正式复测关系";
      if (state.focus_reteach && state.focus_reteach.outcome && state.focus_reteach.outcome.passed && pendingId) {
        route.primaryHref = "#formal-question";
        route.primaryText = "去整理 " + pendingShort + " 正式回答";
        route.secondaryHref = "#focus-reteach";
        route.secondaryText = "重新做归因对照";
        route.readiness = "已完成页面归因对照（非正式）。下一步只处理 " + pendingShort + "，正式评分仍由 Codex 完成。";
      }
      return route;
    }

    if (ordinal >= 7 || formal.required_retest_of_question_id && /q00[7-9]$/.test(formal.required_retest_of_question_id)) {
      route.title = "你现在位于 Stop Rules：先判断是否还能继续，再决定报告边界。";
      route.mode = pendingId ? "停止规则正式题待答" : "停止规则聚焦重讲";
      route.verified = "状态流转与 Coverage Control 子范围已通过正式验证。";
      route.gap = "停止分支、有限报告或未观察维度的边界仍需验证。";
      route.question = pendingId || formal.required_retest_of_question_id || "等待正式安排";
      route.questionCopy = pendingTitle || "Stop Rules";
      route.primaryHref = "#stop-lab";
      route.primaryText = "先运行停止规则实验";
      route.scopeFocus = "Stop Rules 当前未通过条件";
      route.scopePassed = "状态机四要素与能力覆盖控制";
      route.routeSteps = ["先确认系统还能不能继续；", "再区分 completed、limited_report 与 continue；", "最后只回答当前正式题要求的一个条件。"];
      route.focus = "Stop Rules / 停止规则";
      route.pageAnchor = "#stop-lab";
      return route;
    }

    if (ordinal >= 3) {
      route.title = "你现在位于 Coverage Control：把“问过”与“拿到证据”分开。";
      route.mode = pendingId ? "能力覆盖正式题待答" : "能力覆盖聚焦重讲";
      route.verified = "状态机四要素已经通过正式验证。";
      route.gap = "覆盖状态、证据深度、稳定 ID 或剩余预算仍需验证。";
      route.question = pendingId || formal.required_retest_of_question_id || "等待正式安排";
      route.questionCopy = pendingTitle || "Coverage Control";
      route.primaryHref = "#coverage-lab";
      route.primaryText = "先运行能力覆盖实验";
      route.scopeFocus = "Coverage Control 当前未通过条件";
      route.scopePassed = "Event、Guard、Action、Next State";
      route.routeSteps = ["先区分流程状态与能力评分；", "只改变覆盖或证据深度一个变量；", "再回当前正式题说明字段写入。"];
      route.focus = "Coverage Control / 能力覆盖控制";
      route.pageAnchor = "#coverage-lab";
      return route;
    }

    route.title = "你现在位于 State Machine：先理解一次合法流转的四个问题。";
    route.mode = pendingId ? "状态流转正式题待答" : "状态流转聚焦重讲";
    route.verified = "Day 01—03 已完成，不在本章重复复测。";
    route.gap = "Event、Guard、Action、Next State 及模型与程序边界仍需验证。";
    route.question = pendingId || formal.required_retest_of_question_id || "等待正式安排";
    route.questionCopy = pendingTitle || "State Machine";
    route.primaryHref = "#state-lab";
    route.primaryText = "先运行状态流转实验";
    route.scopeFocus = "状态流转当前未通过条件";
    route.scopePassed = "Day 01—03 已掌握范围";
    route.routeSteps = ["先把一次流转拆成四个问题；", "改变 Guard 条件观察路由；", "再回当前正式题组织回答。"];
    route.focus = "State Machine / 状态机";
    route.pageAnchor = "#state-lab";
    return route;
  }

  function renderRouteList(container, steps) {
    if (!container) return;
    container.textContent = "";
    steps.forEach(function (step) {
      var item = document.createElement("li");
      item.textContent = step;
      container.appendChild(item);
    });
  }

  function focusPreparationPassed(route) {
    if (route.focusModule === "attribution") return Boolean(state.focus_reteach && state.focus_reteach.outcome && state.focus_reteach.outcome.passed);
    if (route.focusModule === "degradation") return Boolean(state.degradation_reteach && state.degradation_reteach.outcome && state.degradation_reteach.outcome.passed);
    return false;
  }

  function renderFocusLesson(route) {
    var title = document.querySelector("[data-focus-title]");
    var lead = document.querySelector("[data-focus-lead]");
    var oldModel = document.querySelector("[data-focus-old-model]");
    var oldCopy = document.querySelector("[data-focus-old-copy]");
    var newModel = document.querySelector("[data-focus-new-model]");
    var newCopy = document.querySelector("[data-focus-new-copy]");
    if (title) title.textContent = route.focusTitle;
    if (lead) lead.textContent = route.focusLead;
    if (oldModel) oldModel.textContent = route.oldModel;
    if (oldCopy) oldCopy.textContent = route.oldCopy;
    if (newModel) newModel.textContent = route.newModel;
    if (newCopy) newCopy.textContent = route.newCopy;

    document.querySelectorAll("[data-focus-step]").forEach(function (step, index) {
      var definition = route.focusSteps[index] || route.focusSteps[route.focusSteps.length - 1];
      var label = step.querySelector("[data-focus-step-label]");
      var stepTitle = step.querySelector("[data-focus-step-title]");
      var copy = step.querySelector("[data-focus-step-copy]");
      if (label) label.textContent = definition.label;
      if (stepTitle) stepTitle.textContent = definition.title;
      if (copy) copy.textContent = definition.copy;
      if (index === route.focusCurrentStep) step.setAttribute("data-current", "");
      else step.removeAttribute("data-current");
    });

    document.querySelectorAll("[data-focus-module]").forEach(function (module) {
      module.hidden = module.getAttribute("data-focus-module") !== route.focusModule;
    });
    var degradationForm = document.querySelector("[data-degradation-lab]");
    if (degradationForm) {
      var actionOnly = route.focusVariant === "degradation_actions";
      degradationForm.elements.validation_state.disabled = actionOnly;
      degradationForm.elements.next_state.disabled = actionOnly;
      if (actionOnly) {
        degradationForm.elements.validation_state.value = "failed_limit";
        degradationForm.elements.next_state.value = "degraded";
      }
      var degradationSubmit = degradationForm.querySelector("[data-degradation-submit]");
      if (degradationSubmit) degradationSubmit.textContent = actionOnly ? "检查两层安全降级动作" : "运行异常优先级检查";
    }
    var bridgeTitle = document.querySelector("[data-focus-bridge-title]");
    var bridgeCopy = document.querySelector("[data-focus-bridge-copy]");
    var bridgeAction = document.querySelector("[data-focus-bridge-action]");
    if (bridgeTitle) bridgeTitle.textContent = route.bridgeTitle;
    if (bridgeCopy) bridgeCopy.textContent = route.bridgeCopy;
    if (bridgeAction) {
      bridgeAction.textContent = route.bridgeAction;
      bridgeAction.href = route.question && route.question !== "当前无待答题" ? "#formal-question" : route.secondaryHref;
    }
  }

  function renderLearningCockpit(stateSource) {
    var source = stateSource || projectState;
    var formal = source.formal_state || {};
    var day04 = findDay(source, "day-04") || {};
    var ordinal = questionOrdinal(formal);
    var route = routeForState(source);
    var title = document.querySelector("[data-cockpit-title]");
    var summary = document.querySelector("[data-cockpit-summary]");
    var mode = document.querySelector("[data-cockpit-mode]");
    var updated = document.querySelector("[data-cockpit-updated]");
    var verified = document.querySelector("[data-cockpit-verified]");
    var gap = document.querySelector("[data-cockpit-gap]");
    var question = document.querySelector("[data-cockpit-question]");
    var questionCopy = document.querySelector("[data-cockpit-question-copy]");
    var primary = document.querySelector("[data-cockpit-primary]");
    var secondary = document.querySelector("[data-cockpit-secondary]");
    var heroRoute = document.querySelector("[data-hero-learning-route]");
    var readiness = document.querySelector("[data-cockpit-readiness]");
    var progressSummary = document.querySelector("[data-cockpit-progress-summary]");
    var surface = document.querySelector("[data-cockpit-surface]");
    var switchCondition = document.querySelector("[data-cockpit-switch-condition]");
    if (title) title.textContent = route.title;
    if (summary) summary.textContent = route.summary;
    if (mode) mode.textContent = route.mode;
    if (updated) {
      updated.textContent = formatUpdatedAt(source.updated_at);
      if (source.updated_at) updated.dateTime = source.updated_at;
    }
    if (verified) verified.textContent = route.verified;
    if (gap) gap.textContent = route.gap;
    if (question) question.textContent = route.question;
    if (questionCopy) questionCopy.textContent = route.questionCopy ? " · " + route.questionCopy : "";
    if (primary) {
      primary.href = route.primaryHref;
      primary.textContent = route.primaryText;
    }
    if (secondary) {
      secondary.href = route.secondaryHref;
      secondary.textContent = route.secondaryText;
    }
    if (heroRoute) {
      heroRoute.href = route.primaryHref;
      heroRoute.textContent = route.primaryText;
    }
    if (readiness) readiness.textContent = route.readiness;
    renderRouteList(document.querySelector("[data-cockpit-route]"), route.routeSteps);
    renderFocusLesson(route);

    var stageState = {
      "state-machine": day04.formal_status === "completed" || ordinal >= 3 ? "verified" : "current",
      coverage: day04.formal_status === "completed" || ordinal >= 7 ? "verified" : ordinal >= 3 ? "current" : "pending",
      "stop-rules": day04.formal_status === "completed" ? "verified" : ordinal >= 7 ? "current" : "pending"
    };
    var stageCopy = {
      "state-machine": stageState["state-machine"] === "verified" ? "正式子范围已通过 · q002" : "当前学习范围",
      coverage: stageState.coverage === "verified" ? "正式子范围已通过 · q006" : stageState.coverage === "current" ? "当前学习范围" : "尚未进入",
      "stop-rules": stageState["stop-rules"] === "verified" ? "正式子范围已通过" : stageState["stop-rules"] === "current" ? "正在巩固 · " + (formal.pending_question_id || formal.required_retest_of_question_id || "等待安排") : "尚未进入"
    };
    var stageSummary = {
      verified: "正式通过",
      current: "待巩固",
      pending: "尚未进入"
    };
    var formalProgress = "状态流转：" + stageSummary[stageState["state-machine"]] + " · 能力覆盖：" + stageSummary[stageState.coverage] + " · 停止规则：" + stageSummary[stageState["stop-rules"]];
    var nextSurface = route.primaryHref === "#formal-question" ? "Codex · 正式接力" : "网页 · 理解与实验";
    if (progressSummary) progressSummary.textContent = formalProgress;
    if (surface) surface.textContent = nextSurface;
    if (switchCondition) switchCondition.textContent = route.readiness;
    Object.keys(stageState).forEach(function (name) {
      var stage = document.querySelector('[data-cockpit-stage="' + name + '"]');
      var status = document.querySelector('[data-cockpit-stage-status="' + name + '"]');
      if (stage) stage.dataset.state = stageState[name];
      if (status) status.textContent = stageCopy[name];
    });

    var focus = document.querySelector("[data-formal-scope-focus]");
    var passed = document.querySelector("[data-formal-scope-passed]");
    if (focus) focus.textContent = route.scopeFocus;
    if (passed) passed.textContent = route.scopePassed;

    window.__STUDY_PAGE_HANDOFF__ = {
      day_id: "day-04",
      focus: route.focus,
      page_anchor: route.pageAnchor,
      formal_progress: formalProgress,
      next_surface: nextSurface,
      switch_condition: route.readiness,
      preparation_status: focusPreparationPassed(route) ? "当前页面对照实验已通过（非正式）" : "当前页面理解准备未标记完成",
      formal_scope: route.scopeFocus,
      passed_scope: route.scopePassed,
      reteach_contract: "如果我仍说不理解，请不要直接重复标准答案：先指出错误发生的判断节点，再解释旧心智模型为什么失败，给一个不同场景的最小对照，指定网页实验与观察变量，最后才进入一题新场景复测。"
    };
  }

  function evaluateAttribution(values) {
    var rules = {
      not_asked: {
        fact: "从未询问，也没有任何相关证据。",
        status: "not_observed",
        conclusion: "unable",
        example: "本次未覆盖升级处理情境，暂无可引用证据，因此无法判断该能力水平。"
      },
      partial: {
        fact: "询问过，但只有一句泛泛回答，不能稳定匹配判断条件。",
        status: "insufficient_evidence",
        conclusion: "unable",
        example: "本次已涉及升级处理，但现有信息不足以形成可靠判断。"
      },
      clear_low: {
        fact: "询问过，且有充分证据显示处理方式不符合已发布规则。",
        status: "low_score",
        conclusion: "weak",
        example: "现有回答在升级处理维度只达到低等级锚点，结论仅限于本次已观察行为。"
      }
    };
    var rule = rules[values.observation_fact] || rules.not_asked;
    var failedAt = null;
    if (values.evidence_status !== rule.status) failedAt = "证据状态";
    else if (values.attribution !== "process") failedAt = "归因对象";
    else if (values.conclusion !== rule.conclusion) failedAt = "结论边界";
    var passed = !failedAt;
    var explanation;
    if (failedAt === "证据状态") {
      explanation = "先回到观察事实：题目是否问过、是否存在相关内容、证据是否足以匹配锚点。状态不能凭语气选择。";
    } else if (failedAt === "归因对象") {
      explanation = "这里把系统的采集边界写成了用户的经历或能力。报告必须引用本次流程与已观察证据，而不是补写用户画像。";
    } else if (failedAt === "结论边界") {
      explanation = rule.conclusion === "unable"
        ? "没有足够证据时只能保留判断，不能写成能力较弱。"
        : "这里已经有充分负向证据，不能再写成无法判断；但结论仍只覆盖本次已观察行为。";
    } else {
      explanation = "四个节点一致。不同场景示例：" + rule.example + " 迁移到 q010 时请保留逻辑，不要复制这句话。";
    }
    return {
      passed: passed,
      failed_at: failedAt,
      node: passed ? "四个节点一致" : "断点：" + failedAt,
      heading: passed ? "报告边界成立，可以迁移回正式题。" : "先修正“" + failedAt + "”，后续结论暂不发布。",
      fact: rule.fact,
      status: values.evidence_status + (values.evidence_status === rule.status ? " · 与事实一致" : " · 应为 " + rule.status),
      attribution: values.attribution === "process" ? "归因于本次流程与已采集证据" : "归因于用户没有经验 · 越界",
      conclusion: values.conclusion === "unable" ? "当前无法判断能力水平" : "能力较弱",
      explanation: explanation
    };
  }

  function renderAttributionResult(outcome) {
    var result = document.querySelector("[data-attribution-result]");
    if (!result || !outcome) return;
    result.dataset.state = outcome.passed ? "pass" : "fail";
    result.querySelector(".result-status").textContent = outcome.passed ? "结构一致" : "发现越界";
    result.querySelector("[data-attribution-node]").textContent = outcome.node;
    result.querySelector("h3").textContent = outcome.heading;
    var items = result.querySelectorAll("dd");
    items[0].textContent = outcome.fact;
    items[1].textContent = outcome.status;
    items[2].textContent = outcome.attribution;
    items[3].textContent = outcome.conclusion;
    result.querySelector("[data-attribution-explanation]").textContent = outcome.explanation;
  }

  function runAttributionLab(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var values = {
      observation_fact: form.elements.observation_fact.value,
      evidence_status: form.elements.evidence_status.value,
      attribution: form.elements.attribution.value,
      conclusion: form.elements.conclusion.value
    };
    var outcome = evaluateAttribution(values);
    state.focus_reteach = { values: values, outcome: outcome, completed_at: new Date().toISOString() };
    renderAttributionResult(outcome);
    saveState(outcome.passed ? "归因边界对照已通过。下一步可整理当前正式题；这不是正式评分。" : "已定位第一个错误节点：" + outcome.failed_at + "。");
    renderLearningCockpit(projectState);
  }

  function restoreAttributionLab() {
    if (!state.focus_reteach || !state.focus_reteach.values) return;
    var form = document.querySelector("[data-attribution-lab]");
    if (!form) return;
    Object.keys(state.focus_reteach.values).forEach(function (name) {
      if (form.elements[name]) form.elements[name].value = state.focus_reteach.values[name];
    });
    renderAttributionResult(state.focus_reteach.outcome || evaluateAttribution(state.focus_reteach.values));
  }

  function evaluateDegradation(values) {
    var failed = values.validation_state === "failed_limit";
    var expectedState = failed ? "degraded" : "completed";
    var failedAt = null;
    if (values.next_state !== expectedState) failedAt = "Next State";
    else if (failed && values.retry_action !== "stop_and_block") failedAt = "立即止损";
    else if (failed && values.evidence_bundle !== "full_context") failedAt = "失败现场";
    else if (failed && values.recovery !== "manual") failedAt = "恢复路径";
    var passed = !failedAt;
    var explanation;
    if (failedAt === "Next State") {
      explanation = failed
        ? "业务内容已经完成，只满足 completed 的一部分条件。结构校验失败并达到上限时，异常分支优先，结果不能冻结为正式完成。"
        : "结构校验已经通过，且业务内容完成，此时才满足 completed 的交付条件。";
    } else if (failedAt === "立即止损") {
      explanation = "达到失败上限后必须同时做两件事：停止自动重试，阻止未通过校验的结果被标记为正式交付。只写“查日志”还没有止住自动链路。";
    } else if (failedAt === "失败现场") {
      explanation = "只保存一句失败摘要无法复现问题。至少要冻结原始输入、模型输出、校验错误、重试次数和日志，人工或程序才知道从哪里恢复。";
    } else if (failedAt === "恢复路径") {
      explanation = "保存现场后还要指定恢复入口：转人工复核，或在修复 Prompt、Schema、规则后做受控重试；新结果必须重新校验，不能直接进入 completed。";
    } else {
      explanation = failed
        ? "两层动作完整：先停止自动重试并阻止未校验结果交付；再保存原始输入、模型输出、校验错误、重试次数和日志，转人工复核或受控重试并重新校验。"
        : "判断链成立：业务完成且校验通过，才可以进入 completed；当前不需要异常恢复入口。";
    }
    return {
      passed: passed,
      failed_at: failedAt,
      node: passed ? "异常优先级一致" : "断点：" + failedAt,
      heading: passed ? "业务完成与交付契约已经分开。" : "先修正“" + failedAt + "”，后续状态暂不发布。",
      business: "计划问题与必覆盖内容全部完成 · 只是业务事实",
      validation: failed ? "结构校验连续失败并达到上限 · 输出不可安全交付" : "结构校验通过 · 输出满足机器契约",
      nextState: values.next_state + (values.next_state === expectedState ? " · 合法" : " · 应为 " + expectedState),
      containment: failed
        ? (values.retry_action === "stop_and_block" ? "停止自动重试，并阻止未校验结果正式交付" : "继续自动重试 · 已超过上限且仍可能错误交付")
        : "校验已通过 · 按正常完成路径封存",
      evidence: failed
        ? (values.evidence_bundle === "full_context" ? "原始输入、模型输出、校验错误、重试次数和日志 · 完整" : "只有失败摘要 · 无法稳定复现和恢复")
        : "按正常完成路径保存最终输入、输出与验证记录",
      recovery: failed
        ? (values.recovery === "manual" ? "转人工复核或受控重试；新结果必须重新校验" : "直接标记完成 · 越过恢复和重新校验")
        : "无需异常恢复；本次可以进入 completed",
      explanation: explanation
    };
  }

  function renderDegradationResult(outcome) {
    var result = document.querySelector("[data-degradation-result]");
    if (!result || !outcome) return;
    var actionOnly = routeForState(projectState).focusVariant === "degradation_actions";
    result.dataset.state = outcome.passed ? "pass" : "fail";
    result.querySelector(".result-status").textContent = outcome.passed ? "结构一致" : "发现越界";
    result.querySelector("[data-degradation-node]").textContent = outcome.node;
    result.querySelector("h3").textContent = outcome.passed && actionOnly ? "两层安全降级动作已经完整。" : outcome.heading;
    var items = result.querySelectorAll("dd");
    items[0].textContent = outcome.business;
    items[1].textContent = outcome.validation;
    items[2].textContent = outcome.nextState;
    items[3].textContent = outcome.containment;
    items[4].textContent = outcome.evidence;
    items[5].textContent = outcome.recovery;
    result.querySelector("[data-degradation-explanation]").textContent = outcome.explanation;
  }

  function runDegradationLab(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var values = {
      validation_state: form.elements.validation_state.value,
      next_state: form.elements.next_state.value,
      retry_action: form.elements.retry_action.value,
      evidence_bundle: form.elements.evidence_bundle.value,
      recovery: form.elements.recovery.value
    };
    var outcome = evaluateDegradation(values);
    state.degradation_reteach = { values: values, outcome: outcome, completed_at: new Date().toISOString() };
    renderDegradationResult(outcome);
    saveState(outcome.passed ? "异常优先级对照已通过。下一步可整理当前正式题；这不是正式评分。" : "已定位第一个错误节点：" + outcome.failed_at + "。");
    renderLearningCockpit(projectState);
    if (!outcome.passed) {
      var fieldByBreakpoint = {
        "Next State": "next_state",
        "立即止损": "retry_action",
        "失败现场": "evidence_bundle",
        "恢复路径": "recovery"
      };
      var breakpointField = form.elements[fieldByBreakpoint[outcome.failed_at]];
      if (breakpointField && !breakpointField.disabled) breakpointField.focus();
    }
  }

  function restoreDegradationLab() {
    if (!state.degradation_reteach || !state.degradation_reteach.values) return;
    var form = document.querySelector("[data-degradation-lab]");
    if (!form) return;
    Object.keys(state.degradation_reteach.values).forEach(function (name) {
      if (form.elements[name]) form.elements[name].value = state.degradation_reteach.values[name];
    });
    renderDegradationResult(state.degradation_reteach.outcome || evaluateDegradation(state.degradation_reteach.values));
  }

  function setupStateTrioGuide() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll("[data-stop-state-example]"));
    var cards = Array.prototype.slice.call(document.querySelectorAll("[data-stop-state-card]"));
    var trace = document.querySelector("[data-state-branch-trace]");
    if (!buttons.length || !trace) return;
    var examples = {
      degraded: {
        trigger: "校验连续失败并达到上限",
        state: "degraded · 安全降级",
        action: "停止自动重试并阻止未校验结果交付",
        exit: "人工复核或受控重试重新校验通过后"
      },
      exit_confirmation_pending: {
        trigger: "用户主动请求退出，但还没有确认",
        state: "exit_confirmation_pending · 等待退出确认",
        action: "保存当前回答与进度，暂停清空和正式完成",
        exit: "用户明确确认退出或取消退出后"
      },
      completed: {
        trigger: "题数、覆盖、保存和结构校验全部通过",
        state: "completed · 正常完成",
        action: "冻结本次 session 与证据版本，生成正式报告",
        exit: "本次 session 保持终态；重开需要新的明确事件"
      }
    };

    function selectExample(name) {
      var example = examples[name] || examples.degraded;
      buttons.forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.getAttribute("data-stop-state-example") === name));
      });
      cards.forEach(function (card) {
        if (card.getAttribute("data-stop-state-card") === name) card.setAttribute("data-active", "");
        else card.removeAttribute("data-active");
      });
      trace.dataset.state = name;
      trace.querySelector("[data-state-trace-trigger]").textContent = example.trigger;
      trace.querySelector("[data-state-trace-state]").textContent = example.state;
      trace.querySelector("[data-state-trace-action]").textContent = example.action;
      trace.querySelector("[data-state-trace-exit]").textContent = example.exit;
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () { selectExample(button.getAttribute("data-stop-state-example")); });
    });
    selectExample("degraded");
  }

  function renderFormalQuestion() {
    var kind = document.querySelector("[data-formal-question-kind]");
    var title = document.querySelector("[data-formal-question-title]");
    var prompt = document.querySelector("[data-formal-question-prompt]");
    var fields = document.querySelector("[data-formal-fields]");
    var hints = document.querySelector("[data-answer-hint-list]");
    var form = document.querySelector("[data-formal-answer]");
    var noQuestion = document.querySelector("[data-formal-no-question]");
    var badge = document.querySelector(".chapter-section--formal .formal-badge");
    var route = routeForState(projectState);
    var hasQuestion = Boolean(officialQuestionId && questionDefinition);
    if (!hasQuestion) {
      var retestId = formalState.required_retest_of_question_id;
      var day04Complete = findDay(projectState, "day-04")?.formal_status === "completed";
      if (kind) kind.textContent = retestId ? "正式学习状态 · 补讲阶段" : day04Complete ? "正式学习状态 · Day 04 已完成" : "正式学习状态 · 暂无待答题";
      if (title) title.textContent = retestId ? "即时复测已暂停：先重讲，再换场景复测。" : day04Complete ? "Day 04 已正式完成，当前没有待答题。" : "当前没有待答题。";
      if (prompt) prompt.textContent = retestId
        ? "正式记录保留 " + retestId + " 的复测关系，但现在不应继续重复作答。当前只重讲一个缺口：" + route.gap + " 完成本页对照后回 Codex，由正式会话安排新场景延期复测。"
        : day04Complete
          ? "状态流转、Coverage Control、停止规则和 q014 新场景恢复动作均已通过。下一正式阶段为 Day 05；本页只用于复习与迁移，不再生成 Day 04 正式题。"
          : "请从正式记录确认下一步；页面不会自行生成题目。";
      if (fields) fields.textContent = "";
      if (form) form.hidden = true;
      if (noQuestion) {
        noQuestion.hidden = false;
        var retestCode = noQuestion.querySelector("[data-formal-retest-id]");
        if (retestCode) retestCode.textContent = retestId || "无";
        var retestGuidance = noQuestion.querySelector("[data-formal-retest-guidance]");
        if (retestGuidance) retestGuidance.textContent = retestId
          ? "当前聚焦：" + route.focus + "。完成页面重讲后回 Codex，正式会话必须换场景延期复测，不重复原题。"
          : day04Complete
            ? "Day 04 已完成且无复测关系。可以留在网页复习；正式推进时从 Day 05 开始。"
            : "请从正式记录确认下一步；页面不会自行创建题目。";
      }
      if (badge) badge.textContent = retestId ? "先重讲" : day04Complete ? "已正式完成" : "等待正式安排";
      var answerHint = document.querySelector("[data-answer-hint]");
      var composed = document.querySelector("[data-composed-answer]");
      if (answerHint) answerHint.hidden = true;
      if (composed) composed.hidden = true;
      return;
    }
    if (form) form.hidden = false;
    if (noQuestion) noQuestion.hidden = true;
    if (badge) badge.textContent = "等待回答";
    if (kind) kind.textContent = "当前正式题 · " + (questionDefinition.kind || "待答");
    if (title) title.textContent = questionDefinition.title || "当前正式题";
    if (prompt) prompt.textContent = questionDefinition.prompt || "";
    if (fields) {
      fields.textContent = "";
      (questionDefinition.fields || []).forEach(function (definition, index, list) {
        var wrapper = document.createElement("div");
        var label = document.createElement("label");
        var marker = document.createElement("span");
        var textarea = document.createElement("textarea");
        var fieldId = "formal-" + definition.id;
        wrapper.className = "answer-field" + (index === list.length - 1 && list.length % 2 === 1 ? " answer-field--wide" : "");
        label.htmlFor = fieldId;
        marker.textContent = definition.label;
        label.append(marker, document.createTextNode(definition.prompt || definition.label));
        textarea.id = fieldId;
        textarea.name = "formal_" + definition.id;
        textarea.rows = index === list.length - 1 ? 5 : 4;
        textarea.setAttribute("data-persist", "");
        textarea.placeholder = "请写出可检查的判断、依据或字段，不按字数评分。";
        wrapper.append(label, textarea);
        fields.appendChild(wrapper);
      });
    }
    if (hints) {
      hints.textContent = "";
      (questionDefinition.hints || []).forEach(function (hint) {
        var item = document.createElement("li");
        item.textContent = hint;
        hints.appendChild(item);
      });
    }
  }

  function saveState(message) {
    state.updated_at = new Date().toISOString();
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(state));
      var status = document.querySelector("[data-save-status]");
      if (status) status.textContent = "草稿已保存到当前标签页 · " + new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    } catch (error) {
      var failed = document.querySelector("[data-save-status]");
      if (failed) failed.textContent = "当前标签页无法保存草稿，请及时复制或导出";
    }
    if (message) announce(message);
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () { saveState(); }, 220);
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

  function restoreFields() {
    document.querySelectorAll("[data-persist]").forEach(function (field) {
      if (typeof state.fields[field.name] === "string") field.value = state.fields[field.name];
      if (field.dataset.persistBound === "true") return;
      field.dataset.persistBound = "true";
      field.addEventListener("input", function () {
        state.fields[field.name] = field.value;
        scheduleSave();
      });
      field.addEventListener("change", function () {
        state.fields[field.name] = field.value;
        scheduleSave();
      });
    });

    if (state.composed_answer) renderComposedAnswer(state.composed_answer);
    if (state.deliverables_markdown) renderDeliverables(state.deliverables_markdown);
  }

  function applyFreshFormalState(nextProjectState) {
    var nextFormalState = nextProjectState && nextProjectState.formal_state;
    if (!nextFormalState || nextFormalState.day_id !== "day-04") return;
    var nextQuestionId = nextFormalState.pending_question_id;
    var changed = nextQuestionId !== officialQuestionId;
    projectState = nextProjectState;
    formalState = nextFormalState;
    officialSessionId = nextFormalState.session_id || officialSessionId;
    officialQuestionId = nextQuestionId;
    questionDefinition = nextFormalState.current_question || null;
    if (changed) {
      var archivedFields = {};
      Object.keys(state.fields || {}).forEach(function (key) {
        if (key.indexOf("formal_") === 0) {
          archivedFields[key] = state.fields[key];
          delete state.fields[key];
        }
      });
      if (state.pending_question_id) {
        state.question_drafts[state.pending_question_id] = {
          fields: archivedFields,
          composed_answer: state.composed_answer,
          archived_at: new Date().toISOString()
        };
      }
      state.pending_question_id = nextQuestionId;
      state.composed_answer = "";
      document.querySelector("[data-composed-answer]").hidden = true;
    }
    renderFormalQuestion();
    restoreFields();
    renderLearningCockpit(nextProjectState);
    if (changed) saveState(nextQuestionId
      ? "正式题已更新，上一题页面草稿已保留在当前标签页历史中。"
      : "正式状态已进入补讲阶段，上一题页面草稿已保留在当前标签页历史中。");
  }

  function setStatePath(activeName) {
    document.querySelectorAll("[data-state-node]").forEach(function (node) {
      node.classList.toggle("is-active", node.getAttribute("data-state-node") === activeName);
    });
  }

  function runStateLab(event) {
    event.preventDefault();
    var autoRun = event.type === "change";
    var form = event.currentTarget;
    var currentState = form.elements.current_state.value;
    var selectedEvent = form.elements.event.value;
    var suggestion = form.elements.llm_suggestion.value;
    var followUpCount = Number(form.elements.follow_up_count.value);
    var uncovered = form.elements.uncovered_capability.value;
    var result = document.querySelector("[data-state-result]");
    var guard;
    var action;
    var nextState;
    var title;
    var reason;
    var visualState;
    var resultState;

    if (selectedEvent === "exit_requested") {
      guard = "允许记录退出意图，但不能直接清空状态或生成确定性报告。";
      action = "保存当前回答与进度，写入 exit_requested，等待后续确认。";
      nextState = "exit_confirmation_pending";
      title = "退出请求被转换为待确认状态。";
      reason = "退出是用户意图，不等于系统已经完成面试。";
      visualState = "completion_check";
      resultState = "blocked";
    } else if (currentState !== "evaluating_answer" || selectedEvent !== "evaluation_validated") {
      guard = "失败：当前状态与事件不构成合法组合。";
      action = "拒绝跳转并记录 illegal_transition，保留现有状态。";
      nextState = currentState;
      title = "程序拦截了非法流转。";
      reason = "只有回答分析完成并通过校验后，才允许依据模型建议选择追问、换题或进入完成检查。";
      visualState = currentState;
      resultState = "error";
    } else if (suggestion === "ask_follow_up" && followUpCount >= 1) {
      guard = "不通过：follow_up_count 已达到 1 / 1。";
      action = uncovered === "none"
        ? "保存分析与拒绝原因，进入完成条件检查。"
        : "保存回答与覆盖证据，拒绝超限追问，选择针对“" + capabilityLabel(uncovered) + "”的新主问题，并记录拒绝原因。";
      nextState = uncovered === "none" ? "completion_check" : "asking_question";
      title = "模型建议被安全拒绝。";
      reason = "LLM 可以提出 ask_follow_up，但最终路由必须服从程序中的追问上限和能力覆盖规则。";
      visualState = nextState;
      resultState = "blocked";
    } else if (suggestion === "complete") {
      guard = "只允许进入完成检查，不能由模型直接宣布 completed。";
      action = "保存分析，检查计划题数、必覆盖能力、回答保存与校验状态。";
      nextState = "completion_check";
      title = "模型的完成建议进入二次程序检查。";
      reason = "completed 是产品状态，不是自然语言结论。";
      visualState = "completion_check";
      resultState = "blocked";
    } else {
      guard = suggestion === "ask_follow_up"
        ? "通过：当前状态合法，分析已校验，追问次数仍有额度。"
        : "通过：当前状态合法，分析已校验，程序允许选择新主问题。";
      action = suggestion === "ask_follow_up"
        ? "保存回答与分析，follow_up_count + 1，写入候选追问。"
        : "保存回答与覆盖证据，选择最高优先级的未充分覆盖能力并写入新主问题。";
      nextState = "asking_question";
      title = suggestion === "ask_follow_up" ? "追问建议被接受。" : "程序准备展示新的主问题。";
      reason = "建议满足当前状态、校验、计数与覆盖条件，因此可以转回提问状态。";
      visualState = "asking_question";
      resultState = "allowed";
    }

    result.dataset.state = resultState;
    result.querySelector(".result-status").textContent = resultState === "allowed" ? "Guard 通过" : resultState === "error" ? "非法流转" : "Guard 拦截";
    result.querySelector("[data-state-updated]").textContent = (autoRun ? "已自动更新 · " : "已手动运行 · ") +
      new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    result.querySelector("h3").textContent = title;
    var items = result.querySelectorAll("dd");
    items[0].textContent = guard;
    items[1].textContent = action;
    items[2].textContent = nextState;
    result.querySelector(".result-reason").textContent = reason;
    setStatePath(visualState);

    var log = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) +
      " | " + currentState + " + " + selectedEvent + " | suggestion=" + suggestion + " | guard=" +
      (resultState === "allowed" ? "passed" : "blocked") + " | next_state=" + nextState;
    document.querySelector("[data-event-log]").textContent = log;

    state.state_lab = {
      current_state: currentState,
      event: selectedEvent,
      llm_suggestion: suggestion,
      follow_up_count: followUpCount,
      uncovered_capability: uncovered,
      guard: guard,
      action: action,
      next_state: nextState,
      reason: reason
    };
    saveState(autoRun
      ? "选项已更新，状态流转结果已自动重新计算。"
      : "状态流转已重新运行。试着修改追问次数，观察 Guard 如何改变结果。");
  }

  function capabilityLabel(value) {
    var labels = { data: "数据能力", collaboration: "协作推进", product: "产品判断", ai: "AI 方案理解", none: "无" };
    return labels[value] || value;
  }

  function composeFormalAnswer(event) {
    event.preventDefault();
    if (!officialQuestionId || !questionDefinition) {
      announce("当前没有待答题；请先完成聚焦重讲，不要生成或提交新的正式答案。");
      return;
    }
    var definitions = questionDefinition.fields || [];
    var names = definitions.map(function (definition) { return "formal_" + definition.id; });
    var labels = definitions.map(function (definition) { return definition.label; });
    var missing = [];
    var values = names.map(function (name, index) {
      var field = event.currentTarget.elements[name];
      var value = field.value.trim();
      if (!value) missing.push(labels[index]);
      return value;
    });
    var error = document.querySelector("[data-formal-error]");

    if (missing.length) {
      error.textContent = "先补全“" + missing[0] + "”。" + (missing.length > 1 ? "其余 " + (missing.length - 1) + " 项会在完成后继续检查。" : "不要求长，但要具体。");
      event.currentTarget.elements[names[labels.indexOf(missing[0])]].focus();
      return;
    }

    error.textContent = "";
    var answer = values.map(function (value, index) { return labels[index] + "：" + value; }).join("\n\n");

    state.composed_answer = answer;
    renderComposedAnswer(answer);
    saveState("完整作答草稿已生成。请通读逻辑后再提交到正式学习对话。");
  }

  function renderComposedAnswer(answer) {
    var container = document.querySelector("[data-composed-answer]");
    container.hidden = false;
    container.querySelector("[data-answer-preview]").textContent = answer;
  }

  function toggleHint() {
    var button = document.querySelector("[data-toggle-hint]");
    var hint = document.querySelector("[data-answer-hint]");
    var next = hint.hidden;
    hint.hidden = !next;
    button.setAttribute("aria-expanded", String(next));
    button.textContent = next ? "收起作答提示" : "查看作答提示";
  }

  function runCoverageLab() {
    var rows = Array.prototype.slice.call(document.querySelectorAll("[data-capability]"));
    var remaining = Number(document.querySelector("[data-remaining-questions]").value);
    var candidates = rows.map(function (row) {
      var status = row.querySelector("[data-coverage-status]").value;
      var depth = Number(row.querySelector("[data-evidence-depth]").value);
      var priority = Number(row.getAttribute("data-priority"));
      var statusScore = status === "uncovered" ? 5 : status === "partial" ? 3 : 0;
      return {
        id: row.getAttribute("data-capability"),
        label: row.getAttribute("data-label"),
        status: status,
        depth: depth,
        priority: priority,
        score: statusScore + (3 - depth) + priority
      };
    }).sort(function (a, b) { return b.score - a.score; });

    var best = candidates[0];
    var result = document.querySelector("[data-coverage-result]");
    var questions = {
      product: "讲一个你必须在用户价值、实现成本和上线风险之间做取舍的产品决策。你用什么证据验证最后的选择？",
      ai: "面对同一需求，你如何判断应使用 Prompt、RAG、Agent、确定性规则或非 AI 方案？",
      data: "上线后核心转化率从 8% 降到 5%，你会先看哪些数据、提出哪些原因假设，并怎样验证？",
      collaboration: "讲一个研发、设计或运营目标不一致的场景。你如何定位分歧、推动决策并验证结果？"
    };

    result.querySelector("span").textContent = "推荐优先级 · 剩余 " + remaining + " 道主问题";
    result.querySelector("h3").textContent = "优先覆盖：“" + best.label + "”";
    result.querySelector("p").textContent = "候选问题：" + questions[best.id] + " 程序应更新 coverage_status、evidence_depth、question_id 与 remaining_main_questions。";

    state.coverage_lab = { remaining_questions: remaining, candidates: candidates, recommendation: best, question: questions[best.id] };
    saveState("能力覆盖优先级已计算。修改覆盖状态后可以重新比较。");
  }

  function runStopLab(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var facts = {
      planned_complete: form.elements.planned_complete.checked,
      coverage_complete: form.elements.coverage_complete.checked,
      answer_saved: form.elements.answer_saved.checked,
      validation_passed: form.elements.validation_passed.checked,
      exit_requested: form.elements.exit_requested.checked,
      validation_failed: form.elements.validation_failed.checked,
      completed_questions: Number(form.elements.completed_questions.value)
    };
    var stateName;
    var status;
    var title;
    var explanation;

    if (facts.validation_failed) {
      stateName = "degraded";
      status = "error";
      title = "系统异常分支：进入 degraded。";
      explanation = "立即止损：停止自动重试并阻止未校验结果交付。保留与恢复：保存原始输入、模型输出、校验错误、重试次数和日志，转人工复核或受控重试并重新校验。";
    } else if (facts.exit_requested) {
      stateName = "exit_confirmation_pending";
      status = "warning";
      title = "用户意图分支：进入 exit_confirmation_pending。";
      explanation = "保存当前回答与进度，暂停清空和正式完成，等待用户确认或取消。它不是 degraded 后的下一站；详细确认分支仍在长期线学习。";
    } else if (facts.planned_complete && facts.coverage_complete && facts.answer_saved && facts.validation_passed) {
      stateName = "completed";
      status = "success";
      title = "交付契约全部通过：进入 completed。";
      explanation = "程序冻结本次 session、证据与报告版本，再生成正式报告。completed 不是 degraded 或退出确认之后自动到达的最后一站。";
    } else if (facts.completed_questions >= 1 && facts.answer_saved && facts.validation_passed) {
      stateName = "limited_report";
      status = "warning";
      title = "只能生成有限报告。";
      explanation = "已达到最低证据门槛，但计划或能力覆盖尚未完成；未观察维度必须标记为 not_observed / insufficient_evidence。";
    } else {
      stateName = "continue";
      status = "warning";
      title = "证据不足，继续面试或返回设置。";
      explanation = "尚未完成至少一道可用主问题，不能生成报告。";
    }

    var result = document.querySelector("[data-stop-result]");
    result.dataset.state = status;
    result.querySelector(".result-status").textContent = stateName;
    result.querySelector("h3").textContent = title;
    result.querySelector("p").textContent = explanation;

    state.stop_lab = { facts: facts, result: stateName, explanation: explanation };
    saveState("停止规则已检查。可以切换退出、校验失败或完成条件继续观察。");
  }

  function setupTransferMap() {
    var select = document.querySelector("[data-transfer-scenario]");
    if (!select) return;
    var scenarios = {
      customer_support: {
        invariants: "状态机、结构校验、引用用户诉求、失败降级",
        changes: "覆盖意图识别、解决结果、情绪与合规风险；严重承诺立即转人工",
        decisions: "定义可自动解决范围、升级条件、可引用证据与客服 SLA",
        deliverable: "意图覆盖表 + 转人工规则 + Badcase 回归记录"
      },
      sales_copilot: {
        invariants: "轮次状态、问题覆盖、证据引用、停止与超限规则",
        changes: "覆盖需求挖掘、异议处理、价值表达与下一步承诺，禁止虚构客户信息",
        decisions: "确定陪练评分维度、角色边界、敏感信息处理和复练门槛",
        deliverable: "销售能力 Rubric + 会话状态图 + 证据化复盘报告"
      },
      knowledge_assistant: {
        invariants: "请求状态、输出 Schema、来源证据、错误恢复与日志",
        changes: "覆盖检索命中、来源时效、权限范围与无答案处理，不再关注面试能力覆盖",
        decisions: "选择知识源、引用标准、拒答条件、过期策略和人工维护流程",
        deliverable: "知识源登记 + 引用协议 + 无答案/过期降级测试"
      }
    };

    function render() {
      var scenario = scenarios[select.value] || scenarios.customer_support;
      document.querySelector("[data-transfer-invariants]").textContent = scenario.invariants;
      document.querySelector("[data-transfer-changes]").textContent = scenario.changes;
      document.querySelector("[data-transfer-decisions]").textContent = scenario.decisions;
      document.querySelector("[data-transfer-deliverable]").textContent = scenario.deliverable;
    }

    select.addEventListener("change", render);
    render();
  }

  function buildDeliverables(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var fields = [
      "deliverable_event", "deliverable_guard", "deliverable_action", "deliverable_next_state",
      "deliverable_capability", "deliverable_evidence", "deliverable_fields",
      "deliverable_normal_stop", "deliverable_limited_report", "deliverable_exception"
    ];
    var missing = fields.filter(function (name) { return !form.elements[name].value.trim(); });
    var error = document.querySelector("[data-builder-error]");
    if (missing.length) {
      error.textContent = "还有 " + missing.length + " 个结构字段未填写。每项可以简短，但不能留空。";
      form.elements[missing[0]].focus();
      return;
    }
    error.textContent = "";
    var markdown = createDeliverableMarkdown(form);
    state.deliverables_markdown = markdown;
    renderDeliverables(markdown);
    saveState("三项 v1 预览已生成。请检查是否可以直接交给研发实现。");
  }

  function createDeliverableMarkdown(form) {
    return [
      "# Day 04 三项 v1 产出",
      "",
      "## State Machine v1",
      "",
      "- Event：" + form.elements.deliverable_event.value.trim(),
      "- Guard：" + form.elements.deliverable_guard.value.trim(),
      "- Action：" + form.elements.deliverable_action.value.trim(),
      "- Next State：" + form.elements.deliverable_next_state.value.trim(),
      "",
      "## Coverage Table v1",
      "",
      "- 优先补齐能力：" + form.elements.deliverable_capability.value.trim(),
      "- 需要获得的证据：" + form.elements.deliverable_evidence.value.trim(),
      "- 程序更新字段：" + form.elements.deliverable_fields.value.trim(),
      "",
      "## Stop Rules v1",
      "",
      "- 正常完成：" + form.elements.deliverable_normal_stop.value.trim(),
      "- 有限报告：" + form.elements.deliverable_limited_report.value.trim(),
      "- 异常与退出：" + form.elements.deliverable_exception.value.trim(),
      "",
      "> 页面预览与快速自检不等于正式掌握。正式状态以 " + officialSessionId + " 的单题评分为准。",
      ""
    ].join("\n");
  }

  function renderDeliverables(markdown) {
    var preview = document.querySelector("[data-deliverable-preview]");
    preview.hidden = false;
    preview.querySelector("[data-deliverable-output]").textContent = markdown;
  }

  function gradeQuickCheck(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var answers = { quiz_1: "program", quiz_2: "asking_question", quiz_3: "not_observed" };
    var missing = [];
    var correct = 0;
    Object.keys(answers).forEach(function (name) {
      var selected = form.querySelector('input[name="' + name + '"]:checked');
      if (!selected) missing.push(name);
      else if (selected.value === answers[name]) correct += 1;
    });

    var result = document.querySelector("[data-quiz-result]");
    result.hidden = false;
    if (missing.length) {
      result.dataset.state = "warning";
      result.textContent = "还有 " + missing.length + " 道题未选择。快速自测需要完成三题后再提交。";
      return;
    }

    state.quiz = { correct: correct, total: 3, completed_at: new Date().toISOString() };
    if (correct === 3) {
      result.dataset.state = "success";
      result.innerHTML = "<strong>3 / 3，主线理解正确。</strong> 你已经能区分模型建议与程序路由、合法 Next State，以及“未观察不等于零分”。这只是低风险自检，正式题仍需单独提交。";
    } else {
      result.dataset.state = "warning";
      result.innerHTML = "<strong>答对 " + correct + " / 3。</strong> 建议回看对应实验：路由权属于确定性程序；换题后回到 asking_question；未充分观察的能力不能记 0 分。";
    }
    saveState();
  }

  function copyText(text, message) {
    if (!text) {
      announce("当前还没有可复制的内容。");
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { announce(message); }).catch(function () { fallbackCopy(text, message); });
    } else {
      fallbackCopy(text, message);
    }
  }

  function fallbackCopy(text, message) {
    var area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
      announce(message);
    } catch (error) {
      announce("浏览器阻止了复制，请手动选择预览内容。");
    }
    area.remove();
  }

  function buildFormalSubmission() {
    var handoff = window.__STUDY_PAGE_HANDOFF__ || {};
    return [
      "AI 产品经理转型学习项目 · Day 04 正式作答",
      "正式会话：" + officialSessionId,
      "待答题：" + (officialQuestionId || "无"),
      "当前知识定位：" + (handoff.focus || "Day 04 当前正式范围"),
      "页面准备状态：" + (handoff.preparation_status || "未记录"),
      "本题只验证：" + (handoff.formal_scope || "以正式题为准"),
      "已通过且不重复：" + (handoff.passed_scope || "以正式记录为准"),
      "",
      "请保留以下原始回答，按当前单题 rubric 评分；不要把页面自检当作正式掌握，也不要提前进入下一题。",
      "",
      state.composed_answer
    ].join("\n");
  }

  function buildExport() {
    var latestProjectState = window.__STUDY_PROJECT_STATE__ || projectState;
    var latestFormalState = latestProjectState.formal_state || formalState;
    return {
      export_type: "ai-pm-study-day04-preview",
      export_version: 2,
      project: "AI 产品经理转型学习项目",
      page_id: "day04",
      session_id: state.session_id,
      pending_question_id: state.pending_question_id,
      formal_learning_state: {
        source: latestProjectState.state_source && latestProjectState.state_source.path,
        source_updated_at: latestProjectState.updated_at,
        track_id: latestFormalState.track_id,
        day_id: latestFormalState.day_id,
        session_id: latestFormalState.session_id,
        session_state: latestFormalState.session_state,
        pending_question_id: latestFormalState.pending_question_id,
        question_state: latestFormalState.question_state
      },
      source_page: "01_主链路课程体系/A_两周突击线/day-04-state-machine-coverage.html",
      fields: Object.assign({}, state.fields),
      composed_answer: state.composed_answer,
      deliverables_markdown: state.deliverables_markdown,
      experiments: {
        focus_reteach: state.focus_reteach,
        degradation_reteach: state.degradation_reteach,
        state_lab: state.state_lab,
        coverage_lab: state.coverage_lab,
        stop_lab: state.stop_lab
      },
      quick_check: state.quiz,
      sync_note: "页面实验与快速自检不等于正式掌握。请将正式题作答提交给当前 Codex 会话评分；Early Termination Confirmation 不在本次测验范围内。",
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

  function setupReadingProgress() {
    var sections = Array.prototype.slice.call(document.querySelectorAll("[data-chapter-section]"));
    var links = Array.prototype.slice.call(document.querySelectorAll("[data-section-link]"));
    var progressBar = document.querySelector("[data-reading-progress]");
    var progressText = document.querySelector("[data-progress-text]");

    function updateProgress() {
      var root = document.documentElement;
      var max = root.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      var percent = Math.round(ratio * 100);
      progressBar.style.transform = "scaleX(" + ratio + ")";
      progressText.textContent = percent + "%";
    }

    function updateActiveSection() {
      var marker = Math.min(240, window.innerHeight * 0.32);
      var active = sections.find(function (section) {
        var rect = section.getBoundingClientRect();
        return rect.top <= marker && rect.bottom > marker;
      }) || sections.find(function (section) {
        return section.getBoundingClientRect().top > marker;
      }) || sections[sections.length - 1];
      if (!active) return;
      links.forEach(function (link) {
        if (link.getAttribute("data-section-link") === active.id) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    }

    function updateReadingState() {
      updateProgress();
      updateActiveSection();
    }

    window.addEventListener("scroll", updateReadingState, { passive: true });
    window.addEventListener("resize", updateReadingState);
    updateReadingState();
  }

  var stateLabForm = document.querySelector("[data-state-lab]");
  stateLabForm.addEventListener("submit", runStateLab);
  stateLabForm.addEventListener("change", function (event) {
    if (event.target.matches("select")) runStateLab(event);
  });
  var attributionForm = document.querySelector("[data-attribution-lab]");
  if (attributionForm) attributionForm.addEventListener("submit", runAttributionLab);
  var degradationForm = document.querySelector("[data-degradation-lab]");
  if (degradationForm) degradationForm.addEventListener("submit", runDegradationLab);
  document.querySelector("[data-formal-answer]").addEventListener("submit", composeFormalAnswer);
  document.querySelector("[data-toggle-hint]").addEventListener("click", toggleHint);
  document.querySelector("[data-run-coverage]").addEventListener("click", runCoverageLab);
  document.querySelector("[data-stop-lab]").addEventListener("submit", runStopLab);
  document.querySelector("[data-deliverable-builder]").addEventListener("submit", buildDeliverables);
  document.querySelector("[data-quick-check]").addEventListener("submit", gradeQuickCheck);
  document.querySelector("[data-copy-answer]").addEventListener("click", function () { copyText(buildFormalSubmission(), "正式提交包已复制，可以直接粘贴到当前 Codex 对话。"); });
  document.querySelector("[data-copy-deliverables]").addEventListener("click", function () { copyText(state.deliverables_markdown, "三项 v1 Markdown 已复制。"); });
  var clearDraftButton = document.querySelector("[data-clear-session-draft]");
  if (clearDraftButton) clearDraftButton.addEventListener("click", function () {
    if (!window.confirm("只清除当前标签页的 Day 04 草稿？正式 session、评分记录和已归档的学习历史不会被删除。")) return;
    window.sessionStorage.removeItem(storageKey);
    window.location.reload();
  });
  document.querySelector("[data-export-json]").addEventListener("click", function () { exportFile(JSON.stringify(buildExport(), null, 2), "day04-" + officialSessionId + "-preview.json", "application/json;charset=utf-8"); });
  document.querySelector("[data-export-markdown]").addEventListener("click", function () {
    var markdown = state.deliverables_markdown || "# Day 04 学习记录\n\n尚未生成三项 v1 预览。\n";
    if (state.composed_answer) markdown += "\n## 当前正式题作答\n\n" + state.composed_answer + "\n";
    exportFile(markdown, "day04-" + officialSessionId + "-preview.md", "text/markdown;charset=utf-8");
  });

  renderFormalQuestion();
  restoreFields();
  restoreAttributionLab();
  restoreDegradationLab();
  renderLearningCockpit(projectState);
  setupStateTrioGuide();
  setupTransferMap();
  document.addEventListener("study-state-ready", function (event) { applyFreshFormalState(event.detail.state); });
  setupReadingProgress();
})();
