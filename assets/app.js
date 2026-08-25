(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setupTrackSwitches() {
    document.querySelectorAll("[data-track-switcher]").forEach(function (switcher) {
      var buttons = Array.from(switcher.querySelectorAll("[data-track-target]"));
      var scope = switcher.closest("section") || document;
      var panels = Array.from(scope.querySelectorAll("[data-track-panel]"));

      buttons.forEach(function (button) {
        button.addEventListener("click", function () {
          var target = button.getAttribute("data-track-target");
          buttons.forEach(function (item) {
            item.setAttribute("aria-selected", String(item === button));
          });
          panels.forEach(function (panel) {
            panel.hidden = panel.getAttribute("data-track-panel") !== target;
          });
        });
      });
    });
  }

  function setupDensityControls() {
    document.querySelectorAll("[data-density-control]").forEach(function (button) {
      button.addEventListener("click", function () {
        var value = button.getAttribute("data-density-control");
        document.body.setAttribute("data-density", value);
        document.querySelectorAll("[data-density-control]").forEach(function (item) {
          item.setAttribute("aria-pressed", String(item === button));
        });
      });
    });
  }

  function setupPrintButtons() {
    document.querySelectorAll("[data-print]").forEach(function (button) {
      button.addEventListener("click", function () {
        window.print();
      });
    });
  }

  function focusHashTarget() {
    if (!window.location.hash) return;
    var id;
    try { id = decodeURIComponent(window.location.hash.slice(1)); } catch (error) { id = window.location.hash.slice(1); }
    var target = id && document.getElementById(id);
    if (!target) return;
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        target.scrollIntoView({ block: "start", behavior: "auto" });
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      });
    });
  }

  function setupMotion() {
    if (reduceMotion || !window.gsap) return;

    var gsap = window.gsap;
    if (window.ScrollTrigger) {
      gsap.registerPlugin(window.ScrollTrigger);
    }

    var hero = document.querySelector(".hero, .page-hero");
    if (hero) {
      var timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
      var primaryHeroItems = hero.querySelectorAll(".eyebrow, h1, .hero__lead, .page-hero__meta");
      var secondaryHeroItems = hero.querySelectorAll(".hero__actions, .hero-visual");
      var snapshotItems = hero.querySelectorAll(".snapshot__item");
      if (primaryHeroItems.length) {
        timeline.from(primaryHeroItems, {
          y: 22,
          duration: 0.72,
          stagger: 0.08
        });
      }
      if (secondaryHeroItems.length) {
        timeline.from(secondaryHeroItems, {
          y: 18,
          duration: 0.65,
          stagger: 0.1
        }, "-=0.38");
      }
      if (snapshotItems.length) {
        timeline.from(snapshotItems, {
          y: 12,
          duration: 0.42,
          stagger: 0.07
        }, "-=0.32");
      }
    }

    document.querySelectorAll(".route-stroke").forEach(function (stroke) {
      var length = typeof stroke.getTotalLength === "function" ? stroke.getTotalLength() : 700;
      gsap.fromTo(stroke,
        { strokeDasharray: length, strokeDashoffset: length },
        {
          strokeDashoffset: 0,
          duration: 1.55,
          ease: "power2.inOut",
          scrollTrigger: window.ScrollTrigger ? { trigger: stroke, start: "top 82%", once: true } : undefined
        }
      );
    });

    if (window.ScrollTrigger) {
      gsap.utils.toArray("[data-reveal]").forEach(function (element) {
        gsap.from(element, {
          y: 24,
          duration: 0.7,
          ease: "power2.out",
          scrollTrigger: { trigger: element, start: "top 88%", once: true }
        });
      });
    }
  }

  setupTrackSwitches();
  setupDensityControls();
  setupPrintButtons();
  setupMotion();
  focusHashTarget();
  window.addEventListener("hashchange", focusHashTarget);
})();
