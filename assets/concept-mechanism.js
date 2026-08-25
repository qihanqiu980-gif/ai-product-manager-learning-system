(function () {
  "use strict";

  document.querySelectorAll("[data-concept-mechanism]").forEach(function (board, boardIndex) {
    var buttons = Array.from(board.querySelectorAll("[data-mechanism-step]"));
    var title = board.querySelector("[data-mechanism-title-output]");
    var question = board.querySelector("[data-mechanism-question-output]");
    var role = board.querySelector("[data-mechanism-role-output]");
    var check = board.querySelector("[data-mechanism-check-output]");
    var panel = board.querySelector("[data-mechanism-panel]");
    if (!buttons.length || !panel) return;

    panel.id = panel.id || "mechanism-panel-" + (boardIndex + 1);

    function activate(index, moveFocus) {
      var normalized = (index + buttons.length) % buttons.length;
      var button = buttons[normalized];
      buttons.forEach(function (item, itemIndex) {
        var active = itemIndex === normalized;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", String(active));
        item.tabIndex = active ? 0 : -1;
      });
      if (title) title.textContent = button.dataset.mechanismTitle || button.textContent.trim();
      if (question) question.textContent = button.dataset.mechanismQuestion || "";
      if (role) role.textContent = button.dataset.mechanismRole || "";
      if (check) check.textContent = button.dataset.mechanismCheck || "";
      if (moveFocus) button.focus();
    }

    buttons.forEach(function (button, index) {
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", panel.id);
      button.addEventListener("click", function () { activate(index, false); });
      button.addEventListener("keydown", function (event) {
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          activate(index + 1, true);
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          activate(index - 1, true);
        }
        if (event.key === "Home") {
          event.preventDefault();
          activate(0, true);
        }
        if (event.key === "End") {
          event.preventDefault();
          activate(buttons.length - 1, true);
        }
      });
    });

    panel.setAttribute("role", "tabpanel");
    activate(Math.max(buttons.findIndex(function (button) { return button.hasAttribute("data-active"); }), 0), false);
  });
})();
