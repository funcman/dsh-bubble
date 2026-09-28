/* dsh-bubble — browser half (classic-script bundle, lazy CJS factory). */
window.__ModuleLoader__.load({
  id: "@dsh-extra/dsh-bubble",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");

    /** Cordis plugin name (matches the loader row id). */
    exports.name = "bubble";

    /** Required client services: the slot registry and the sessions domain. */
    exports.inject = ["slots", "sessions"];

    var FALLBACK = "敲！又让我干活了！";
    var HIDE_AFTER_MS = 5000;

    /** Bubble chrome, bottom-right, above every column. */
    var bubbleStyle = {
      position: "fixed",
      right: "24px",
      bottom: "104px",
      zIndex: 9999,
      maxWidth: "340px",
      padding: "10px 16px",
      borderRadius: "16px 16px 4px 16px",
      background: "#1f2937",
      color: "#f9fafb",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.28)",
      fontSize: "14px",
      lineHeight: "1.55",
      pointerEvents: "auto",
      fontFamily: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    };

    /** Tiny tail triangle under the bubble's corner. */
    var tailStyle = {
      position: "absolute",
      right: "12px",
      bottom: "-8px",
      width: "0",
      height: "0",
      borderLeft: "8px solid transparent",
      borderRight: "8px solid transparent",
      borderTop: "8px solid #1f2937",
    };

    /** Observable snapshot the slot inject face binds to `useBubble`. */
    function createController() {
      var value = null;
      var listeners = [];
      return {
        getSnapshot: function () { return value; },
        subscribe: function (fn) {
          listeners.push(fn);
          return function () {
            var index = listeners.indexOf(fn);
            if (index >= 0) listeners.splice(index, 1);
          };
        },
        publish: function (next) {
          value = next;
          for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](); } catch (error) {
              console.error("[bubble] subscriber threw:", error);
            }
          }
        },
      };
    }

    /** The floating bubble: renders nothing while no grumble is showing. */
    function BubbleOverlay(props) {
      var bubble = props.useBubble(function (s) { return s; });
      if (bubble == null || typeof bubble.text !== "string" || bubble.text.length === 0) return null;
      return React.createElement(
        "div",
        { style: bubbleStyle },
        React.createElement("div", { style: tailStyle }),
        bubble.text
      );
    }

    /**
     * Find the largest transcript submission requestId in the inbox. Used as a
     * monotonic counter that advances on every new user prompt. Submissions of
     * other placements (`context`, etc.) are excluded — only the user's own
     * transcript entry should pop the bubble.
     */
    function latestTranscriptId(pending) {
      if (!Array.isArray(pending)) return "";
      var latest = "";
      for (var i = 0; i < pending.length; i++) {
        var item = pending[i];
        if (item && item.placement === "transcript" && typeof item.requestId === "string") {
          if (item.requestId > latest) latest = item.requestId;
        }
      }
      return latest;
    }

    /**
     * Watch every listed session for a newly landed user message and fire
     * the trigger. The first scan after the window opens establishes the
     * baseline (current latest transcript requestId) so pre-existing inbox
     * entries never pop one. Newer dsh ConversationSnapshot versions no
     * longer carry `chat.nodes`; we read `pendingSubmissions` directly.
     */
    function watchSessions(ctx, trigger) {
      var watchers = new Map();

      function watchOne(sessionId, session) {
        var lastId = "";
        var baseline = true;
        function scan() {
          var snapshot;
          try { snapshot = session.getSnapshot(); } catch (_e) { return; }
          if (snapshot == null) return;
          // Only treat an opened window as authoritative: the inbox is empty
          // for cold sessions, and pre-existing entries must not fire.
          if (snapshot.openState === "cold") return;
          var currentId = latestTranscriptId(snapshot.pendingSubmissions);
          if (baseline) {
            baseline = false;
            lastId = currentId;
            return;
          }
          if (currentId && currentId > lastId) {
            lastId = currentId;
            trigger(sessionId);
          }
        }
        var unsubscribe = session.subscribe(scan);
        scan();
        return function () { unsubscribe(); };
      }

      function reconcile() {
        var state;
        try { state = ctx.sessions.list.getSnapshot(); } catch (_e) { return; }
        var ids = state ? state.ids : [];
        var present = new Set(ids);
        for (var entry of watchers) {
          if (!present.has(entry[0])) {
            try { entry[1](); } catch (_e) { /* teardown is best-effort */ }
            watchers.delete(entry[0]);
          }
        }
        for (var i = 0; i < ids.length; i++) {
          var id = ids[i];
          if (watchers.has(id)) continue;
          var binding = ctx.sessions.binding(id);
          if (!binding || !binding.session) continue;
          watchers.set(id, watchOne(id, binding.session));
        }
      }

      var unsubscribeList = ctx.sessions.list.subscribe(reconcile);
      reconcile();
      return function () {
        unsubscribeList();
        for (var entry of watchers) {
          try { entry[1](); } catch (_e) { /* best-effort */ }
        }
        watchers.clear();
      };
    }

    /** Fetch one grumble from the host route and surface it for 5 seconds. */
    function createTrigger(controller) {
      var busy = false;
      var hideTimer = null;
      function show(text, sessionId) {
        controller.publish({ text: text, sessionId: sessionId, at: Date.now() });
        if (hideTimer !== null) clearTimeout(hideTimer);
        hideTimer = setTimeout(function () { controller.publish(null); }, HIDE_AFTER_MS);
      }
      return function (sessionId) {
        if (busy) return;
        busy = true;
        fetch("/dsh-bubble/insult", { cache: "no-store" })
          .then(function (res) { return res.json().catch(function () { return {}; }); })
          .then(function (data) {
            busy = false;
            var text = data && data.ok && typeof data.text === "string" && data.text.trim().length > 0
              ? data.text.trim()
              : FALLBACK;
            show(text, sessionId);
          })
          .catch(function () {
            busy = false;
            show(FALLBACK, sessionId);
          });
      };
    }

    /**
     * Plugin body: keep one bubble controller, watch sessions for new user
     * messages, and register the floating bubble into the frame-wide
     * `shell.overlay` seat (declared by ui-layout).
     */
    exports.apply = function apply(ctx) {
      var controller = createController();
      var stopWatchers = watchSessions(ctx, createTrigger(controller));
      var disposeInject = ctx.slots.inject("shell.overlay", function () {
        return ctx.slots.register({
          name: "shell.overlay",
          id: "bubble",
          order: 1000,
          inject: function () {
            return { hooks: { bubble: controller } };
          },
        }, BubbleOverlay);
      });
      ctx.effect(function () {
        return function () {
          stopWatchers();
          disposeInject();
        };
      }, "bubble: cleanup");
    };

    return module.exports;
  }
});