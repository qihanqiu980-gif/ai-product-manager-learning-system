(function () {
  "use strict";

  var configElement = document.getElementById("lesson-config");
  if (!configElement) return;

  var config;
  try {
    config = JSON.parse(configElement.textContent);
  } catch (error) {
    console.error("学习页配置无法解析", error);
    return;
  }

  var nodes = config.nodes.map(function (node) { return node.id; });
  var labels = config.nodes.reduce(function (result, node) {
    result[node.id] = node.label;
    return result;
  }, {});
  var storageKey = config.storage_key;
  var restoredFromLegacyStorage = false;
  var saveTimer;

  function createState() {
    return {
      version: config.state_version || 1,
      page_id: config.page_id,
      current_node: nodes[0],
      completed_nodes: [],
      submitted_answers: [],
      answers: {},
      outputs: {},
      exported_at: null,
      updated_at: null
    };
  }

  function normalizeState(candidate) {
    var normalized = Object.assign(createState(), candidate || {});
    var prefix = [];
    nodes.forEach(function (name, index) {
      if (normalized.completed_nodes.indexOf(name) !== -1 && (index === 0 || prefix.indexOf(nodes[index - 1]) !== -1)) {
        prefix.push(name);
      }
    });
    normalized.completed_nodes = prefix;
    normalized.submitted_answers = Array.isArray(normalized.submitted_answers) ? normalized.submitted_answers : [];
    normalized.answers = normalized.answers && typeof normalized.answers === "object" ? normalized.answers : {};
    normalized.outputs = normalized.outputs && typeof normalized.outputs === "object" ? normalized.outputs : {};
    if (nodes.indexOf(normalized.current_node) === -1 || !isUnlocked(normalized.current_node, normalized)) {
      normalized.current_node = nodes.find(function (name) { return isUnlocked(name, normalized) && normalized.completed_nodes.indexOf(name) === -1; }) || nodes[nodes.length - 1];
    }
    return normalized;
  }

  function loadState() {
    try {
      var raw = window.sessionStorage.getItem(storageKey);
      if (!raw) {
        raw = window.localStorage.getItem(storageKey);
        restoredFromLegacyStorage = Boolean(raw);
      }
      return normalizeState(raw ? JSON.parse(raw) : null);
    } catch (error) {
      return createState();
    }
  }

  var state = loadState();

  function announce(message) {
    var live = document.querySelector("[data-live-message]");
    if (!live) return;
    live.textContent = message;
    window.setTimeout(function () {
      if (live.textContent === message) live.textContent = "";
    }, 4200);
  }

  function saveState(message) {
    state.updated_at = new Date().toISOString();
    var status = document.querySelector("[data-save-status]");
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(state));
      if (status) status.textContent = "已保存到当前标签页 · " + new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    } catch (error) {
      if (status) status.textContent = "当前标签页保存不可用，请及时导出";
    }
    if (message) announce(message);
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () { saveState(); }, 320);
  }

  function nodeIndex(name) {
    return nodes.indexOf(name);
  }

  function isUnlocked(name, sourceState) {
    var currentState = sourceState || state;
    var index = nodeIndex(name);
    if (index <= 0) return index === 0;
    return currentState.completed_nodes.indexOf(nodes[index - 1]) !== -1;
  }

  function updateUI() {
    var completedCount = state.completed_nodes.length;
    var progress = Math.round((completedCount / Math.max(nodes.length - 1, 1)) * 100);
    if (state.current_node === nodes[nodes.length - 1]) progress = 100;

    var progressText = document.querySelector("[data-progress-text]");
    var progressBar = document.querySelector("[data-progress-bar]");
    var currentLabel = document.querySelector("[data-current-label]");
    if (progressText) progressText.textContent = progress + "%";
    if (progressBar) progressBar.style.width = progress + "%";
    if (currentLabel) currentLabel.textContent = labels[state.current_node];

    document.querySelectorAll("[data-go-node]").forEach(function (button) {
      var target = button.getAttribute("data-go-node");
      button.disabled = !isUnlocked(target);
      button.setAttribute("aria-current", target === state.current_node ? "step" : "false");
      button.setAttribute("data-completed", String(state.completed_nodes.indexOf(target) !== -1));
    });
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
      active.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start"
      });
    }
  }

  function completeNode(name) {
    if (state.completed_nodes.indexOf(name) === -1) state.completed_nodes.push(name);
    var next = nodes[nodeIndex(name) + 1];
    saveState(labels[name] + "已完成，下一节点已解锁。");
    if (next) showNode(next);
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

  function containsToken(value, token) {
    return value.toLocaleLowerCase("zh-CN").indexOf(String(token).toLocaleLowerCase("zh-CN")) !== -1;
  }

  function validateStructure(name, value) {
    var rules = config.validation_rules && config.validation_rules[name];
    var issues = [];
    if (!value.trim()) return ["请先填写内容"];
    if (!rules) return issues;
    (rules.groups || []).forEach(function (group) {
      var valid = true;
      if (Array.isArray(group.all)) valid = group.all.every(function (token) { return containsToken(value, token); });
      if (Array.isArray(group.any)) valid = group.any.some(function (token) { return containsToken(value, token); });
      if (!valid) issues.push(group.label);
    });
    return issues;
  }

  function restoreFields() {
    document.querySelectorAll("[data-persist]").forEach(function (field) {
      var collection = field.hasAttribute("data-output") ? state.outputs : state.answers;
      if (typeof collection[field.name] === "string") {
        field.value = collection[field.name];
      } else if (field.hasAttribute("data-output")) {
        state.outputs[field.name] = field.value;
      }

      field.addEventListener("input", function () {
        var targetCollection = field.hasAttribute("data-output") ? state.outputs : state.answers;
        targetCollection[field.name] = field.value;
        scheduleSave();
      });
    });

    document.querySelectorAll("[data-feedback]").forEach(function (feedback) {
      feedback.hidden = state.submitted_answers.indexOf(feedback.getAttribute("data-feedback")) === -1;
    });
  }

  function submitExercise(name) {
    var field = document.querySelector('[name="' + name + '"]');
    if (!field) return;
    var answer = field.value.trim();
    var issues = validateStructure(name, answer);
    if (issues.length) {
      showError(name, "优先补充：" + issues[0] + "。" + (issues.length > 1 ? "其余 " + (issues.length - 1) + " 项会在补完后继续检查。" : ""));
      field.focus();
      return;
    }
    clearError(name);
    state.answers[name] = answer;
    if (state.submitted_answers.indexOf(name) === -1) state.submitted_answers.push(name);
    var feedback = document.querySelector('[data-feedback="' + name + '"]');
    if (feedback) {
      feedback.hidden = false;
      feedback.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start"
      });
    }
    saveState("已保存你的原始作答，并揭示对照标准。页面自检不会修改正式学习状态。");
  }

  function saveDeliverables() {
    var issues = [];
    document.querySelectorAll("[data-output]").forEach(function (field) {
      var value = field.value.trim();
      var label = field.getAttribute("data-output-label") || field.name;
      var placeholder = field.getAttribute("data-placeholder-token");
      validateStructure(field.name, value).forEach(function (issue) { issues.push(label + "：" + issue); });
      if (placeholder && value.indexOf(placeholder) !== -1) issues.push(label + "仍包含待补全项");
      state.outputs[field.name] = value;
    });

    if (issues.length) {
      showError("deliverables", "优先修正：" + issues[0] + "。" + (issues.length > 1 ? "其余 " + (issues.length - 1) + " 项已保留，完成后继续检查。" : ""));
      return;
    }
    clearError("deliverables");
    completeNode("deliverables");
  }

  function buildExport() {
    var projectState = window.__STUDY_PROJECT_STATE__ || window.__STUDY_PROJECT_SNAPSHOT__ || {};
    var formalState = projectState.formal_state || {};
    var track = projectState.tracks && projectState.tracks[formalState.track_id];
    var pageDay = track && track.days.find(function (day) { return day.id === config.day_id; });
    return {
      export_type: config.export_type,
      export_version: 1,
      project: "AI 产品经理转型学习项目",
      page_id: config.page_id,
      formal_learning_state: {
        source: projectState.state_source && projectState.state_source.path,
        source_updated_at: projectState.updated_at,
        active: Object.assign({}, formalState),
        page_day: pageDay ? {
          id: pageDay.id,
          formal_status: pageDay.formal_status,
          concept_status: pageDay.concept_status
        } : null
      },
      source_page: config.source_page,
      concept_order: config.concept_order.slice(),
      progress: {
        current_node: state.current_node,
        completed_nodes: state.completed_nodes.slice(),
        browser_updated_at: state.updated_at
      },
      answers: Object.assign({}, state.answers),
      deliverables: Object.assign({}, state.outputs),
      sync_note: config.sync_note,
      exported_at: new Date().toISOString()
    };
  }

  function markdownBlock(value) {
    return "```text\n" + (value || "（未填写）") + "\n```";
  }

  function toMarkdown(data) {
    var lines = [
      "# " + config.markdown_title,
      "",
      "- page_id: " + data.page_id,
      "- formal_learning_state: " + JSON.stringify(data.formal_learning_state),
      "- exported_at: " + data.exported_at,
      "- 当前节点: " + data.progress.current_node,
      "- 已完成节点: " + data.progress.completed_nodes.join(", "),
      ""
    ];

    config.markdown_sections.forEach(function (section) {
      var source = section.source === "deliverables" ? data.deliverables : data.answers;
      lines.push("## " + section.title, "", markdownBlock(source[section.key]), "");
    });
    lines.push("> " + data.sync_note, "");
    return lines.join("\n");
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
    var note = document.querySelector("[data-export-note]");
    if (note) note.textContent = "已生成 " + kind + " 导出 · " + new Date().toLocaleString("zh-CN") + "。导出只用于后续评分与同步，不会自动改写正式状态。";
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

  var saveDeliverablesButton = document.querySelector("[data-save-deliverables]");
  if (saveDeliverablesButton) saveDeliverablesButton.addEventListener("click", saveDeliverables);

  var clearDraftButton = document.querySelector("[data-clear-session-draft]");
  if (clearDraftButton) clearDraftButton.addEventListener("click", function () {
    if (!window.confirm("只清除当前标签页的学习草稿？正式记录和旧 localStorage 缓存不会被删除。")) return;
    window.sessionStorage.removeItem(storageKey);
    window.location.reload();
  });

  document.querySelector("[data-export-json]").addEventListener("click", function () {
    var data = buildExport();
    download(JSON.stringify(data, null, 2), config.file_prefix + "-学习记录.json", "application/json;charset=utf-8");
    markExport("JSON");
  });

  document.querySelector("[data-export-markdown]").addEventListener("click", function () {
    var data = buildExport();
    download(toMarkdown(data), config.file_prefix + "-学习记录.md", "text/markdown;charset=utf-8");
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
  if (restoredFromLegacyStorage) {
    var restoredStatus = document.querySelector("[data-save-status]");
    if (restoredStatus) restoredStatus.textContent = "已从旧浏览器草稿恢复到当前标签页 · 旧缓存未删除";
  }
  showNode(state.current_node, { focus: false });
})();
