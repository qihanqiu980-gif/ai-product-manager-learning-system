(function () {
  "use strict";

  var body = document.body;
  var sessionId = body.getAttribute("data-session-id") || "day03-unassigned";
  var officialComplete = body.getAttribute("data-page-status") === "completed";
  var storageKey = "ai-pm-day03-learning-v1:" + sessionId;
  var restoredFromLegacyStorage = false;
  var nodes = [
    "welcome",
    "fewshot-concept",
    "fewshot-scenario",
    "fewshot-builder",
    "schema-concept",
    "schema-design",
    "retry-design",
    "deliverables",
    "handoff"
  ];
  var labels = {
    "welcome": "开始前说明",
    "fewshot-concept": "Few-shot 原理",
    "fewshot-scenario": "Few-shot 范例选择",
    "fewshot-builder": "Prompt v1 草稿",
    "schema-concept": "JSON Schema 与校验",
    "schema-design": "字段与约束设计",
    "retry-design": "有限重试机制",
    "deliverables": "三项 v1 交付物",
    "handoff": "导出与状态回写"
  };
  var evaluationRubrics = {
    fewshot_scenario: {
      noun: "方案",
      criteria: [
        {
          id: "grounded_followup",
          label: "证据充分时围绕原回答做针对性追问",
          groups: [[/证据|具体|原话|原回答|用户回答/], [/追问|针对|围绕|细化|深入/]],
          evidence: /证据|具体|原话|原回答|用户回答|追问|针对|围绕|细化|深入/,
          advice: "补写示例 1 的具体输入，并写出一句引用原回答后提出的针对性追问。"
        },
        {
          id: "insufficient_branch",
          label: "证据不足时保留判断并请求补充",
          groups: [[/证据不足|信息不足|不足|insufficient_evidence|缺少/], [/补充|继续追问|请求|保留判断|不下|不确定|明确不足/]],
          evidence: /证据不足|信息不足|不足|insufficient_evidence|补充|继续追问|保留判断|不确定/,
          advice: "补写示例 2 的安全输出：明确证据缺口、不下确定结论，并请求用户补充。"
        },
        {
          id: "no_fabrication",
          label: "明确禁止虚构用户经历或结论",
          groups: [[/不虚构|禁止虚构|不得虚构|不编造|禁止编造|幻觉|虚假|事实依据/]],
          evidence: /不虚构|禁止虚构|不得虚构|不编造|禁止编造|幻觉|虚假|事实依据/,
          advice: "明确写出“不得补写用户未提供的项目、职责、数据或结果”。"
        },
        {
          id: "input_output",
          label: "两个示例都包含输入场景与期望输出",
          groups: [[/输入|input|场景/], [/期望输出|输出行为|expected output|模型应该|模型需要|输出场景/]],
          evidence: /输入|input|场景|期望输出|输出行为|expected output|模型应该|模型需要|输出场景/,
          advice: "把每个示例统一写成“输入场景 / 期望输出 / 选择理由”三段，避免只写原则。"
        },
        {
          id: "branch_value",
          label: "说明两个示例覆盖不同分支的价值",
          groups: [[/正常|边界|不同|分支|互补|对比|一正一反|充分.*不足|不足.*充分/], [/价值|更有|信息增益|覆盖|普通成功|badcase|风险/]],
          evidence: /正常|边界|不同|分支|互补|对比|信息增益|覆盖|普通成功|badcase|风险/,
          advice: "补充选择理由：这两个示例分别覆盖正常路径与风险边界，信息增益高于两个相似成功案例。"
        },
        {
          id: "verification",
          label: "提出后续用固定测试用例验证",
          groups: [[/固定.*(测试|评测|用例)|测试用例|评测集|回归|验证|指标/]],
          evidence: /固定.*(测试|评测|用例)|测试用例|评测集|回归|验证|指标/,
          advice: "增加验证计划：用固定的正常、证据不足和诱导虚构用例做回归测试。"
        }
      ]
    },
    prompt_draft: {
      noun: "Prompt 草稿",
      transform: function (answer) {
        var start = answer.indexOf("# Few-shot Examples");
        var end = answer.indexOf("# Output Format");
        if (start === -1) return answer;
        return answer.slice(start, end === -1 ? answer.length : end);
      },
      criteria: [
        {
          id: "two_examples",
          label: "两个示例均已实质补全",
          test: function (answer) {
            var one = answer.match(/Example 1[\s\S]*?(?=Example 2|$)/i);
            var two = answer.match(/Example 2[\s\S]*/i);
            function hasContract(section) {
              return /Input|输入/i.test(section) && /Expected Output|期望输出|输出行为/i.test(section);
            }
            return Boolean(one && two && hasContract(one[0]) && hasContract(two[0]) && answer.indexOf("[请补全") === -1);
          },
          evidence: /Example 1|示例 1|Example 2|示例 2/i,
          advice: "分别补全 Example 1 和 Example 2，避免只留下原则或占位提示。"
        },
        {
          id: "example_contract",
          label: "示例包含 Input 与 Expected Output",
          groups: [[/input|输入|用户回答|current_answer/i], [/expected output|期望输出|输出行为|assistant|模型输出/i]],
          evidence: /input|输入|expected output|期望输出|输出行为|模型输出/i,
          advice: "为两个示例分别标出 Input 和 Expected Output，让模型看到可模仿的完整映射。"
        },
        {
          id: "grounded_example",
          label: "正常分支引用证据并提出具体追问",
          groups: [[/引用|原话|证据|current_answer/i], [/追问|follow.?up|针对|围绕/i]],
          evidence: /引用|原话|证据|current_answer|追问|follow.?up|针对|围绕/i,
          advice: "在正常示例的输出中引用一段用户原话，并只提出一个针对性追问。"
        },
        {
          id: "safe_example",
          label: "风险分支识别证据不足且不虚构",
          groups: [[/insufficient_evidence|证据不足|信息不足/i], [/不虚构|不得虚构|不编造|请求补充|继续追问|不下.*结论/i]],
          evidence: /insufficient_evidence|证据不足|不虚构|不得虚构|不编造|请求补充|不下.*结论/i,
          advice: "在风险示例中输出 insufficient_evidence，说明缺口，并明确不得生成用户未提供的经历。"
        },
        {
          id: "example_value",
          label: "说明每个示例为什么值得放入 Prompt",
          groups: [[/示例价值|为什么|价值|代表|覆盖|正常路径|风险边界|边界场景/i]],
          evidence: /示例价值|为什么|价值|代表|覆盖|正常路径|风险边界|边界场景/i,
          advice: "在每个示例后增加“示例价值”，说明它覆盖的决策分支和 Badcase。"
        }
      ]
    },
    schema_design: {
      noun: "字段设计",
      criteria: [
        { id: "action_enum", label: "next_action 使用受控 enum", groups: [[/next_action/], [/enum|枚举|ask_new_question|ask_follow_up|insufficient_evidence/]], evidence: /next_action|enum|枚举/, advice: "把 next_action 定义为 string enum，并列出仅允许的三个动作。" },
        { id: "question", label: "question 定义类型与长度/分支约束", groups: [[/question|下一问题/], [/string|字符串|长度|minLength|maxLength|证据不足|分支/]], evidence: /question|下一问题|string|字符串|长度|minLength|maxLength/, advice: "补充 question 的 string 类型、长度限制，以及证据不足分支如何表达。" },
        { id: "summary", label: "analysis_summary 是简短可展示摘要", groups: [[/analysis_summary|分析摘要/], [/简短|展示|摘要|string|字符串|长度|不.*推理/]], evidence: /analysis_summary|分析摘要|简短|展示|摘要/, advice: "说明 analysis_summary 仅保存简短可展示摘要，不要求暴露隐藏推理过程。" },
        { id: "evidence", label: "evidence_quotes 使用数组并限制数量/长度", groups: [[/evidence_quotes|引用证据/], [/array|数组/], [/maxItems|minItems|数量|长度|maxLength/]], evidence: /evidence_quotes|引用证据|array|数组|maxItems|数量|长度/, advice: "将 evidence_quotes 设为 string array，并限制最大条数和单条长度。" },
        { id: "risk", label: "risk_flags 使用受控枚举数组", groups: [[/risk_flags|风险标记/], [/array|数组/], [/enum|枚举|insufficient_evidence|possible_fabrication|privacy_risk|off_topic/]], evidence: /risk_flags|风险标记|enum|枚举/, advice: "将 risk_flags 设为去重的 enum 数组，列出允许的风险值。" },
        { id: "root_rules", label: "根对象声明 required 与禁止额外字段", groups: [[/required|必填/], [/additionalProperties|额外字段|多余字段/], [/false|不允许|禁止/]], evidence: /required|必填|additionalProperties|额外字段/, advice: "列出 required，并把根对象 additionalProperties 设为 false。" }
      ]
    },
    retry_design: {
      noun: "重试流程",
      criteria: [
        { id: "parse_validate", label: "先解析 JSON，再执行 Schema 校验", groups: [[/JSON\.parse|JSON 解析|解析/], [/Schema|模式|校验/]], evidence: /JSON\.parse|JSON 解析|解析|Schema|模式|校验/, advice: "明确第一步保存原始输出并解析 JSON，解析成功后再做 Schema 校验。" },
        { id: "error_detail", label: "收集具体错误路径与原因", groups: [[/错误路径|字段路径|validation_errors|错误信息|错误原因|具体错误/]], evidence: /错误路径|字段路径|validation_errors|错误信息|错误原因|具体错误/, advice: "记录具体字段路径、违反的规则和错误原因，不要只写“格式不对”。" },
        { id: "repair_prompt", label: "定向修复 Prompt 携带上次输出且禁止新增事实", groups: [[/上次输出|原始输出|raw_output/], [/只修复|修复结构|不得新增|不新增|禁止新增|不得.*事实/]], evidence: /上次输出|原始输出|raw_output|只修复|修复结构|不得新增|不新增/, advice: "重试 Prompt 应携带上次输出和校验错误，并要求只修结构、不得新增事实。" },
        { id: "retry_limit", label: "设置明确的最大重试次数", groups: [[/最多.*[12两二]\s*次|最大.*[12两二]\s*次|重试.*[12两二]\s*次|attempt.*[12]/i]], evidence: /最多.*[12两二]\s*次|最大.*[12两二]\s*次|重试.*[12两二]\s*次|attempt.*[12]/i, advice: "写出明确上限，例如 Schema/业务校验最多重试 2 次。" },
        { id: "revalidate", label: "每次重试后重新解析、Schema 与业务校验", groups: [[/重新解析|再次解析|再解析/], [/再次校验|重新校验|再校验/], [/业务校验|证据比对|原文.*比对/]], evidence: /重新解析|再次解析|再解析|再次校验|重新校验|业务校验|证据比对/, advice: "说明每次重试后都要重新解析、Schema 校验，并执行证据等业务校验。" },
        { id: "fallback_log", label: "超限后安全降级并保存诊断日志", groups: [[/降级|人工处理|返回安全/], [/记录|日志|保存/], [/attempt|raw_output|validation_errors|model|prompt_version|时间|timestamp/]], evidence: /降级|人工处理|日志|attempt|raw_output|validation_errors|prompt_version|timestamp/, advice: "补充超限后的安全降级，以及 attempt、raw_output、validation_errors、版本和时间等日志字段。" },
        { id: "api_retry", label: "区分 Schema 修复与 API 瞬时错误", groups: [[/API|超时|限流|网络/], [/指数退避|退避|backoff|瞬时错误/], [/Schema|结构|校验/]], evidence: /API|超时|限流|指数退避|退避|Schema|结构|校验/, advice: "把 API 超时/限流与 Schema 错误分开：前者退避重试，后者使用定向修复提示。" }
      ]
    }
  };
  var defaultSchema = {
    "type": "object",
    "properties": {
      "next_action": {
        "type": "string",
        "enum": ["ask_new_question", "ask_follow_up", "insufficient_evidence"]
      },
      "question": {
        "type": "string",
        "minLength": 1,
        "maxLength": 300
      },
      "analysis_summary": {
        "type": "string",
        "minLength": 1,
        "maxLength": 500
      },
      "evidence_quotes": {
        "type": "array",
        "items": {
          "type": "string",
          "maxLength": 200
        },
        "minItems": 1,
        "maxItems": 5
      },
      "risk_flags": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["possible_fabrication", "privacy_risk", "unsafe_advice"]
        },
        "uniqueItems": true,
        "maxItems": 3
      }
    },
    "required": ["next_action", "question", "analysis_summary", "evidence_quotes", "risk_flags"],
    "additionalProperties": false
  };
  var defaultRetry = [
    "1. 模型输出后先执行 JSON 解析与 JSON Schema 校验，任何违规输出都不得进入业务流程。",
    "2. 校验失败时，把 validator 返回的字段路径、期望约束和实际错误反馈给模型，要求只返回修正后的 JSON。",
    "3. 每次重新生成后必须再次执行同一 Schema 校验，通过后才能放行。",
    "4. 首次生成失败后最多重新生成 2 次。",
    "5. 两次重试仍失败时停止模型调用，进入固定错误响应、安全降级或人工审核；AI 面试教练 v1 默认转人工审核。",
    "6. 不能无限重试：持续调用会增加成本、延迟和资源占用，重复生成也不保证解决根因，可能形成死循环或放大故障。"
  ].join("\n");

  function createState() {
    return {
      version: 1,
      session_id: sessionId,
      current_node: officialComplete ? "deliverables" : "welcome",
      completed_nodes: officialComplete ? nodes.slice(0, 8) : [],
      answers: {},
      outputs: {},
      evaluations: {},
      exported_at: null,
      updated_at: null
    };
  }

  function loadState() {
    try {
      var raw = window.sessionStorage.getItem(storageKey);
      if (!raw) {
        raw = window.localStorage.getItem(storageKey);
        restoredFromLegacyStorage = Boolean(raw);
      }
      if (!raw) return createState();
      var parsed = JSON.parse(raw);
      return Object.assign(createState(), parsed, { session_id: sessionId });
    } catch (error) {
      return createState();
    }
  }

  var state = loadState();
  var saveTimer;

  function saveState(message) {
    state.updated_at = new Date().toISOString();
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(state));
      document.querySelector("[data-save-status]").textContent = officialComplete
        ? "正式状态已同步 · 当前标签页草稿已保存 " + new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
        : "已保存到当前标签页 · " + new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    } catch (error) {
      document.querySelector("[data-save-status]").textContent = "当前标签页保存不可用，请及时导出";
    }
    if (message) announce(message);
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () { saveState(); }, 350);
  }

  function announce(message) {
    var live = document.querySelector("[data-live-message]");
    live.textContent = message;
    window.setTimeout(function () {
      if (live.textContent === message) live.textContent = "";
    }, 4200);
  }

  function nodeIndex(name) {
    return nodes.indexOf(name);
  }

  function isUnlocked(name) {
    var index = nodeIndex(name);
    if (index === 0) return true;
    var previous = nodes[index - 1];
    return state.completed_nodes.indexOf(previous) !== -1;
  }

  function showNode(name, options) {
    if (!isUnlocked(name)) {
      announce("请先完成当前节点，后续内容会按顺序解锁。");
      return;
    }
    state.current_node = name;
    document.querySelectorAll("[data-node]").forEach(function (node) {
      node.hidden = node.getAttribute("data-node") !== name;
    });
    updateUI();
    saveState();
    if (!options || options.focus !== false) {
      var active = document.querySelector('[data-node="' + name + '"]');
      active.setAttribute("tabindex", "-1");
      active.focus({ preventScroll: true });
      active.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }
  }

  function completeNode(name) {
    if (state.completed_nodes.indexOf(name) === -1) state.completed_nodes.push(name);
    var next = nodes[nodeIndex(name) + 1];
    saveState(labels[name] + "已完成，下一节点已解锁。");
    if (next) showNode(next);
  }

  function updateUI() {
    var completedCount = state.completed_nodes.length;
    var progress = Math.round((completedCount / (nodes.length - 1)) * 100);
    if (state.current_node === "handoff") progress = 100;
    document.querySelector("[data-progress-text]").textContent = progress + "%";
    document.querySelector("[data-progress-bar]").style.width = progress + "%";
    document.querySelector("[data-current-label]").textContent = labels[state.current_node];
    document.querySelectorAll("[data-go-node]").forEach(function (button) {
      var target = button.getAttribute("data-go-node");
      var unlocked = isUnlocked(target);
      button.disabled = !unlocked;
      button.setAttribute("aria-current", target === state.current_node ? "step" : "false");
      button.setAttribute("data-completed", String(state.completed_nodes.indexOf(target) !== -1));
    });
    document.querySelectorAll("[data-session-id-display]").forEach(function (item) {
      item.textContent = sessionId;
    });
  }

  function restoreFields() {
    document.querySelectorAll("[data-persist]").forEach(function (field) {
      var name = field.name;
      var saved = state.answers[name];
      if (field.hasAttribute("data-output")) saved = state.outputs[name];
      if (typeof saved === "string") field.value = saved;
      field.addEventListener("input", function () {
        if (field.hasAttribute("data-output")) state.outputs[name] = field.value;
        else state.answers[name] = field.value;
        scheduleSave();
      });
    });

    var promptDraft = document.querySelector('[name="prompt_draft"]');
    var finalPrompt = document.querySelector('[name="final_prompt"]');
    if (!state.outputs.final_prompt) {
      finalPrompt.value = finalPrompt.value.trim() || state.answers.prompt_draft || promptDraft.value;
      state.outputs.final_prompt = finalPrompt.value;
    }
    if (!state.outputs.final_schema) {
      var schemaField = document.querySelector('[name="final_schema"]');
      var schemaText = schemaField.value.trim() || JSON.stringify(defaultSchema, null, 2);
      schemaField.value = schemaText;
      state.outputs.final_schema = schemaText;
    }
    if (!state.outputs.final_retry) {
      var retryField = document.querySelector('[name="final_retry"]');
      var retryText = retryField.value.trim() || defaultRetry;
      retryField.value = retryText;
      state.outputs.final_retry = retryText;
    }
  }

  function showError(name, message) {
    var error = document.querySelector('[data-error-for="' + name + '"]');
    if (!error) return;
    error.textContent = message;
    error.hidden = false;
  }

  function clearError(name) {
    var error = document.querySelector('[data-error-for="' + name + '"]');
    if (error) error.hidden = true;
  }

  function matchesCriterion(answer, criterion) {
    if (criterion.test) return criterion.test(answer);
    return criterion.groups.every(function (group) {
      return group.some(function (pattern) { return pattern.test(answer); });
    });
  }

  function evidenceSnippet(answer, pattern) {
    if (!pattern) return "";
    var match = answer.match(pattern);
    if (!match) return "";
    var index = match.index || 0;
    var start = Math.max(0, index - 34);
    var end = Math.min(answer.length, index + match[0].length + 54);
    var snippet = answer.slice(start, end).replace(/\s+/g, " ").trim();
    if (start > 0) snippet = "…" + snippet;
    if (end < answer.length) snippet += "…";
    return "“" + snippet + "”";
  }

  function evaluateAnswer(name, rawAnswer) {
    var rubric = evaluationRubrics[name];
    if (!rubric) return null;
    var answer = rubric.transform ? rubric.transform(rawAnswer) : rawAnswer;
    var results = rubric.criteria.map(function (criterion) {
      var covered = matchesCriterion(answer, criterion);
      return {
        id: criterion.id,
        label: criterion.label,
        covered: covered,
        evidence: covered ? evidenceSnippet(answer, criterion.evidence) : "",
        advice: criterion.advice
      };
    });
    var coveredItems = results.filter(function (item) { return item.covered; });
    var missingItems = results.filter(function (item) { return !item.covered; });
    var ratio = coveredItems.length / results.length;
    var level = ratio >= 0.84 ? "结构较完整" : ratio >= 0.55 ? "方向正确，仍有关键缺口" : "已有思路，需要补齐关键结构";
    return {
      name: name,
      noun: rubric.noun,
      total: results.length,
      covered_count: coveredItems.length,
      ratio: ratio,
      level: level,
      covered: coveredItems,
      missing: missingItems,
      generated_at: new Date().toISOString()
    };
  }

  function appendTextElement(parent, tag, className, textValue) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = textValue;
    parent.appendChild(element);
    return element;
  }

  function renderEvaluation(name, answer) {
    var container = document.querySelector('[data-evaluation="' + name + '"]');
    var report = evaluateAnswer(name, answer);
    if (!container || !report) return;
    container.textContent = "";

    var overview = document.createElement("div");
    overview.className = "evaluation-overview";
    var overviewCopy = document.createElement("div");
    appendTextElement(overviewCopy, "h3", "", report.level);
    appendTextElement(overviewCopy, "p", "", "页面从你的原文中识别到 " + report.covered_count + " / " + report.total + " 项关键要素。以下结论用于帮助你改写，而不是用关键词替代正式评分。");
    overview.appendChild(overviewCopy);
    appendTextElement(overview, "span", "evaluation-count", "已覆盖 " + report.covered_count + " 项");
    var progress = document.createElement("div");
    progress.className = "evaluation-progress";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", "作答关键要素覆盖情况");
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", String(report.total));
    progress.setAttribute("aria-valuenow", String(report.covered_count));
    var progressBar = document.createElement("span");
    progressBar.style.width = Math.round(report.ratio * 100) + "%";
    progress.appendChild(progressBar);
    overview.appendChild(progress);
    container.appendChild(overview);

    var columns = document.createElement("div");
    columns.className = "evaluation-columns";
    var coveredSection = document.createElement("section");
    appendTextElement(coveredSection, "h4", "", "你已经写到");
    var coveredList = document.createElement("ul");
    if (report.covered.length) {
      report.covered.forEach(function (item) {
        var li = document.createElement("li");
        appendTextElement(li, "strong", "", item.label);
        if (item.evidence) appendTextElement(li, "span", "evaluation-evidence", item.evidence);
        coveredList.appendChild(li);
      });
    } else {
      appendTextElement(coveredList, "li", "", "暂未识别到足够明确的关键要素，请先按题目要求补全两个示例。");
    }
    coveredSection.appendChild(coveredList);
    columns.appendChild(coveredSection);

    var missingSection = document.createElement("section");
    missingSection.className = "evaluation-missing";
    appendTextElement(missingSection, "h4", "", report.missing.length ? "优先补充" : "可以继续优化");
    var missingList = document.createElement("ul");
    if (report.missing.length) {
      report.missing.forEach(function (item) {
        var li = document.createElement("li");
        appendTextElement(li, "strong", "", item.label);
        appendTextElement(li, "span", "evaluation-advice", item.advice);
        missingList.appendChild(li);
      });
    } else {
      appendTextElement(missingList, "li", "", "关键结构已覆盖。下一版可继续压缩重复表述，并让每个 Input 与 Expected Output 可以单独复制测试。");
    }
    missingSection.appendChild(missingList);
    columns.appendChild(missingSection);
    container.appendChild(columns);

    var revision = document.createElement("div");
    revision.className = "revision-advice";
    appendTextElement(revision, "strong", "", "下一版怎么改");
    var nextAdvice = report.missing.length
      ? report.missing[0].advice + (report.missing.length > 1 ? " 其余 " + (report.missing.length - 1) + " 项缺口已保留，完成这一项后再继续。" : "")
      : "保留现有结构，进一步把抽象原则改成可直接测试的输入—输出示例，并删去重复说明。";
    appendTextElement(revision, "span", "", nextAdvice);
    container.appendChild(revision);
    appendTextElement(container, "p", "evaluation-caveat", "说明：这是浏览器内的透明规则诊断，不调用在线模型，也不会把结果自动写成“已掌握”。正式评价仍以导出后的 rubric 审阅为准。");

    state.evaluations[name] = {
      level: report.level,
      covered: report.covered.map(function (item) { return item.label; }),
      missing: report.missing.map(function (item) { return item.label; }),
      suggestions: report.missing.map(function (item) { return item.advice; }),
      generated_at: report.generated_at
    };
  }

  function submitExercise(name) {
    var field = document.querySelector('[name="' + name + '"]');
    var answer = field.value.trim();
    if (!answer) {
      showError(name, "请先写下你的判断；页面会按关键结构指出缺口，不按字数评分。");
      field.focus();
      return;
    }
    if (name === "prompt_draft" && answer.indexOf("[请补全") !== -1) {
      showError(name, "请先把两个 Few-shot 示例中的占位提示替换成你自己的 Input、Expected Output 与示例价值。");
      field.focus();
      return;
    }
    var report = evaluateAnswer(name, answer);
    if (report && report.covered_count === 0) {
      showError(name, "暂未识别到题目要求的关键结构。请至少写出一个明确的输入、规则、输出或验证要素。");
      field.focus();
      return;
    }
    clearError(name);
    state.answers[name] = answer;
    if (name === "prompt_draft") {
      state.outputs.final_prompt = answer;
      document.querySelector('[name="final_prompt"]').value = answer;
    }
    renderEvaluation(name, answer);
    var feedback = document.querySelector('[data-feedback="' + name + '"]');
    if (feedback) feedback.hidden = false;
    saveState("已保存你的原始作答，并生成针对当前答案的修改诊断。页面自检不改变正式掌握状态。");
    feedback.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  function validateSchema() {
    var result = document.querySelector("[data-schema-result]");
    var text = document.querySelector('[name="final_schema"]').value;
    try {
      var schema = JSON.parse(text);
      var issues = [];
      if (schema.type !== "object") issues.push("根 type 应为 object");
      if (!schema.properties || typeof schema.properties !== "object") issues.push("缺少 properties");
      if (!Array.isArray(schema.required)) issues.push("required 应为数组");
      if (schema.additionalProperties !== false) issues.push("建议 additionalProperties 设为 false");
      ["next_action", "question", "analysis_summary", "evidence_quotes", "risk_flags"].forEach(function (key) {
        if (!schema.properties || !schema.properties[key]) issues.push("缺少核心字段 " + key);
      });
      if (schema.properties && schema.properties.next_action && !Array.isArray(schema.properties.next_action.enum)) issues.push("next_action 缺少 enum");
      if (issues.length) {
        result.dataset.state = "error";
        result.textContent = "JSON 语法有效，但核心检查未通过：" + issues.join("；") + "。";
        return false;
      }
      result.dataset.state = "success";
      result.textContent = "核心检查通过：JSON 语法、根对象、必填表、额外字段限制与关键字段均已识别。仍需在真实代码中使用 JSON Schema validator 做完整校验。";
      return true;
    } catch (error) {
      result.dataset.state = "error";
      result.textContent = "JSON 无法解析：" + error.message;
      return false;
    }
  }

  function saveDeliverables() {
    var prompt = document.querySelector('[name="final_prompt"]').value.trim();
    var schema = document.querySelector('[name="final_schema"]').value.trim();
    var retry = document.querySelector('[name="final_retry"]').value.trim();
    var issues = [];
    ["# Role", "# Goal", "# Input", "Decision Rules", "Output Requirements", "Few-shot Examples"].forEach(function (section) {
      if (prompt.indexOf(section) === -1) issues.push("Prompt v1 缺少结构：" + section);
    });
    var promptReport = evaluateAnswer("prompt_draft", prompt);
    if (!promptReport || promptReport.missing.some(function (item) { return item.id === "two_examples" || item.id === "example_contract"; })) {
      issues.push("Prompt v1 的两个示例都需要 Input 与 Expected Output");
    }
    if (prompt.indexOf("ask_follow_up") === -1 || prompt.indexOf("ask_new_question") === -1) issues.push("Prompt v1 需要覆盖追问与换题两个分支");
    if (prompt.indexOf("evidence_quotes") === -1) issues.push("Prompt v1 需要保留原话证据字段");
    if (prompt.indexOf("[请补全") !== -1) issues.push("Prompt v1 仍包含未完成占位提示");
    if (!validateSchema()) issues.push("JSON Schema v1 尚未通过核心检查");
    var retryReport = evaluateAnswer("retry_design", retry);
    [{ id: "parse_validate", label: "解析与 Schema 校验" }, { id: "error_detail", label: "具体错误路径与原因" }, { id: "retry_limit", label: "明确的重试上限" }].forEach(function (requirement) {
      if (!retryReport || retryReport.missing.some(function (item) { return item.id === requirement.id; })) issues.push("有限重试说明缺少：" + requirement.label);
    });
    if (!/再次.*(?:Schema|模式).*校验|重新.*(?:Schema|模式).*校验|每次.*校验/.test(retry)) issues.push("有限重试说明缺少每次重试后的重新校验");
    if (!/降级|人工审核|人工处理|固定错误/.test(retry)) issues.push("有限重试说明缺少超限后的安全降级");
    if (!/成本|延迟|资源|循环|故障放大/.test(retry)) issues.push("有限重试说明缺少禁止无限重试的产品或工程后果");
    if (issues.length) {
      showError("deliverables", "优先修正：" + issues[0] + "。" + (issues.length > 1 ? "其余 " + (issues.length - 1) + " 项会在下一轮继续检查。" : ""));
      return;
    }
    clearError("deliverables");
    state.outputs.final_prompt = prompt;
    state.outputs.final_schema = schema;
    state.outputs.final_retry = retry;
    completeNode("deliverables");
  }

  function buildExport() {
    return {
      export_type: "ai-pm-study-day03",
      export_version: 1,
      project: "AI 产品经理转型学习项目",
      session_id: sessionId,
      source_page: "01_主链路课程体系/A_两周突击线/day-03-few-shot-json-schema.html",
      concept_order: [
        "Few-shot Prompting / 少样本提示",
        "JSON Schema Validation & Retry / 结构化输出校验与重试"
      ],
      progress: {
        current_node: state.current_node,
        completed_nodes: state.completed_nodes.slice(),
        browser_updated_at: state.updated_at
      },
      answers: Object.assign({}, state.answers),
      evaluations: Object.assign({}, state.evaluations),
      deliverables: Object.assign({}, state.outputs),
      sync_note: officialComplete
        ? "Day 03 正式状态已完成。此导出只包含同步后的页面内容或后续本地修改；如需改变正式状态，请重新请求 Codex 审阅与回写。"
        : "浏览器页面自检不等于正式掌握。请按 study-examiner rubric 评分，并保留学习者原话后回写 session、概念索引、错题记录与 study-project.json。",
      exported_at: new Date().toISOString()
    };
  }

  function toMarkdown(data) {
    function block(value) {
      return "```\n" + (value || "（未填写）") + "\n```";
    }
    return [
      "# Day 03 页面学习记录",
      "",
      "- session_id: " + data.session_id,
      "- exported_at: " + data.exported_at,
      "- 当前节点: " + data.progress.current_node,
      "- 已完成节点: " + data.progress.completed_nodes.join(", "),
      "",
      "## Few-shot 范例选择练习",
      "",
      block(data.answers.fewshot_scenario),
      "",
      "## Prompt v1 草稿过程",
      "",
      block(data.answers.prompt_draft),
      "",
      "## 页面作答诊断（非正式评分）",
      "",
      block(JSON.stringify(data.evaluations || {}, null, 2)),
      "",
      "## JSON Schema 字段与约束练习",
      "",
      block(data.answers.schema_design),
      "",
      "## 校验与有限重试练习",
      "",
      block(data.answers.retry_design),
      "",
      "## AI 面试教练 Prompt v1",
      "",
      block(data.deliverables.final_prompt),
      "",
      "## JSON Schema v1",
      "",
      block(data.deliverables.final_schema),
      "",
      "## 校验与有限重试机制说明",
      "",
      block(data.deliverables.final_retry),
      "",
      "> " + data.sync_note,
      ""
    ].join("\n");
  }

  function download(content, filename, type) {
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

  function markExport(kind) {
    state.exported_at = new Date().toISOString();
    saveState();
    document.querySelector("[data-export-note]").textContent = "已生成 " + kind + " 导出 · " + new Date().toLocaleString("zh-CN") + (officialComplete ? "。这是已完成页面的本地版本。" : "。请把文件交给 Codex 回写正式状态。");
  }

  document.querySelectorAll("[data-go-node]").forEach(function (button) {
    button.addEventListener("click", function () { showNode(button.getAttribute("data-go-node")); });
  });

  document.querySelectorAll("[data-complete-node]").forEach(function (button) {
    button.addEventListener("click", function () { completeNode(button.getAttribute("data-complete-node")); });
  });

  document.querySelectorAll("[data-submit-exercise]").forEach(function (button) {
    button.addEventListener("click", function () { submitExercise(button.getAttribute("data-submit-exercise")); });
  });

  document.querySelector("[data-validate-schema]").addEventListener("click", validateSchema);
  document.querySelector("[data-save-deliverables]").addEventListener("click", saveDeliverables);

  var clearDraftButton = document.querySelector("[data-clear-session-draft]");
  if (clearDraftButton) clearDraftButton.addEventListener("click", function () {
    if (!window.confirm("只清除当前标签页的 Day 03 草稿？正式记录和旧 localStorage 缓存不会被删除。")) return;
    window.sessionStorage.removeItem(storageKey);
    window.location.reload();
  });

  document.querySelector("[data-export-json]").addEventListener("click", function () {
    var data = buildExport();
    download(JSON.stringify(data, null, 2), "day03-" + sessionId + "-学习记录.json", "application/json;charset=utf-8");
    markExport("JSON");
  });

  document.querySelector("[data-export-markdown]").addEventListener("click", function () {
    var data = buildExport();
    download(toMarkdown(data), "day03-" + sessionId + "-学习记录.md", "text/markdown;charset=utf-8");
    markExport("Markdown");
  });

  document.querySelector("[data-copy-markdown]").addEventListener("click", function () {
    var markdown = toMarkdown(buildExport());
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(markdown).then(function () {
        markExport("Markdown 剪贴板");
      }).catch(function () {
        announce("浏览器阻止了剪贴板写入，请改用 Markdown 下载。");
      });
    } else {
      announce("当前浏览器不支持安全剪贴板写入，请改用 Markdown 下载。");
    }
  });

  restoreFields();
  if (restoredFromLegacyStorage) document.querySelector("[data-save-status]").textContent = "已从旧浏览器草稿恢复到当前标签页 · 旧缓存未删除";
  document.querySelectorAll("[data-feedback]").forEach(function (feedback) {
    var name = feedback.getAttribute("data-feedback");
    if (state.answers[name] && state.answers[name].trim()) {
      renderEvaluation(name, state.answers[name]);
      feedback.hidden = false;
    }
  });
  if (!isUnlocked(state.current_node)) state.current_node = "welcome";
  showNode(state.current_node, { focus: false });
})();
