(function () {
  const WIDGET_ID = "simon-pickup-admin";
  const DEFAULT_API_BASE_PATH = "/api/pickup";
  const WEEKDAY_LABELS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function todayString() {
    return new Date().toISOString().slice(0, 10);
  }

  function normalizeText(value) {
    const text = String(value ?? "").trim();
    return text ? text : null;
  }

  function parseReminderOffsets(value) {
    if (!String(value || "").trim()) {
      return [45, 15];
    }
    const offsets = String(value)
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item) && item >= 0);
    return offsets.length ? offsets : [45, 15];
  }

  function formatReminders(offsets) {
    const items = Array.isArray(offsets) ? offsets : [];
    if (!items.length) {
      return "Default";
    }
    return items.map((item) => item + "m").join(", ");
  }

  function layoutWidgetConfig() {
    const widgets = window.__IRONCLAW_LAYOUT__ && window.__IRONCLAW_LAYOUT__.widgets;
    const entry = widgets && widgets[WIDGET_ID];
    return (entry && entry.config) || {};
  }

  function buildApiBasePath() {
    const config = layoutWidgetConfig();
    const path = String(config.apiBasePath || DEFAULT_API_BASE_PATH).trim();
    return path.endsWith("/") ? path.slice(0, -1) : path;
  }

  function slotLookup(view) {
    const map = new Map();
    ((view && view.weeklySlotsByWeekday) || []).forEach(function (group) {
      (group.slots || []).forEach(function (slot) {
        map.set(String(slot.templateSlotId), slot);
      });
    });
    return map;
  }

  function actorLabel(actorsById, actorId) {
    return actorId ? actorsById.get(actorId) || actorId : "Unassigned";
  }

  function previewSlotLabel(slot) {
    return [slot.childDisplayName, slot.scheduledTime].filter(Boolean).join(" at ");
  }

  function describeWeekOverride(override, actorsById, slotsById) {
    const payload = override.payload || {};
    const slot = slotsById.get(String(override.targetTemplateSlotId || payload.templateSlotId || ""));
    const scopeTarget = slot
      ? previewSlotLabel({
          childDisplayName: slot.childDisplayName,
          scheduledTime: slot.pickupTime,
        })
      : actorLabel(actorsById, override.childActorId || payload.childActorId);

    switch (override.actionType) {
      case "cancel_slot":
        return "Cancel " + scopeTarget;
      case "change_time":
        return "Move " + scopeTarget + " to " + (payload.pickupTime || "a new time");
      case "assign_actor":
        return (
          "Assign " +
          scopeTarget +
          " to " +
          actorLabel(actorsById, payload.responsibleActorId) +
          (payload.responsibleActorId ? "" : "")
        );
      case "update_notes":
        return "Update notes for " + scopeTarget;
      case "update_location":
        return "Update location for " + scopeTarget;
      case "add_slot":
        return (
          "Add " +
          actorLabel(actorsById, payload.childActorId) +
          " at " +
          (payload.pickupTime || "time pending")
        );
      default:
        return override.actionType;
    }
  }

  function describeDayOverride(override, actorsById, slotsById) {
    const payload = override.payload || {};
    const slot = slotsById.get(String(payload.templateSlotId || ""));
    const scopeTarget = slot
      ? previewSlotLabel({
          childDisplayName: slot.childDisplayName,
          scheduledTime: slot.pickupTime,
        })
      : actorLabel(actorsById, override.childActorId || payload.childActorId);

    switch (override.actionType) {
      case "cancel_slot":
        return "Cancel " + scopeTarget;
      case "change_time":
        return "Move " + scopeTarget + " to " + (payload.pickupTime || "a new time");
      case "assign_actor":
        return "Assign " + scopeTarget + " to " + actorLabel(actorsById, payload.responsibleActorId);
      case "update_notes":
        return "Update notes for " + scopeTarget;
      case "update_location":
        return "Update location for " + scopeTarget;
      case "add_slot":
        return (
          "Add " +
          actorLabel(actorsById, payload.childActorId) +
          " at " +
          (payload.pickupTime || "time pending")
        );
      default:
        return override.actionType;
    }
  }

  function normalizeApiError(payload, fallbackMessage) {
    if (!payload) {
      return fallbackMessage;
    }
    if (typeof payload === "string") {
      return payload;
    }
    if (payload.error && payload.error.message) {
      return payload.error.message;
    }
    if (payload.message) {
      return payload.message;
    }
    return fallbackMessage;
  }

  function widgetConfigState() {
    return {
      apiBasePath: buildApiBasePath(),
    };
  }

  IronClaw.registerWidget({
    id: WIDGET_ID,
    name: "Pickup",
    slot: "tab",
    icon: "calendar",
    init: function (panel, api) {
      panel.dataset.widget = WIDGET_ID;

      const config = widgetConfigState();
      const state = {
        loading: true,
        saving: false,
        banner: null,
        view: null,
        preview: null,
        modal: null,
      };

      function apiPath(path) {
        return config.apiBasePath + path;
      }

      async function requestJson(path, options) {
        const response = await api.fetch(apiPath(path), options || {});
        const raw = await response.text();
        let payload = null;
        if (raw) {
          try {
            payload = JSON.parse(raw);
          } catch (error) {
            throw new Error("Gateway returned an invalid JSON response.");
          }
        }
        if (!response.ok) {
          throw new Error(normalizeApiError(payload, "Pickup request failed."));
        }
        if (payload && payload.ok === false) {
          throw new Error(normalizeApiError(payload, "Pickup request failed."));
        }
        return payload;
      }

      async function loadAdminView(options) {
        const preserveBanner = options && options.preserveBanner;
        const preservePreview = options && options.preservePreview;
        state.loading = true;
        if (!preserveBanner) {
          state.banner = null;
        }
        render();
        try {
          state.view = await requestJson("/admin-view");
          if (!preservePreview) {
            state.preview = null;
          }
        } catch (error) {
          state.banner = {
            kind: "error",
            text: error.message,
          };
        } finally {
          state.loading = false;
          render();
        }
      }

      async function postAction(payload) {
        return requestJson("/action", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      }

      function currentActors() {
        const available = (state.view && state.view.availableActors) || {};
        return {
          children: available.children || [],
          assignableActors: available.assignableActors || [],
        };
      }

      function actorNameMap() {
        const map = new Map();
        const actors = currentActors();
        actors.children.concat(actors.assignableActors).forEach(function (actor) {
          map.set(actor.actorId, actor.displayName);
        });
        return map;
      }

      function findSlot(templateSlotId) {
        const lookup = slotLookup(state.view);
        return lookup.get(String(templateSlotId)) || null;
      }

      function openEditor(kind, scope, slot) {
        const baseScope = scope || "default";
        state.modal = {
          kind: kind,
          scope: baseScope,
          slot: slot || null,
          anchorDate: todayString(),
          overrideDate: todayString(),
          previewDate: todayString(),
        };
        render();
      }

      function closeModal() {
        state.modal = null;
        render();
      }

      async function refreshAfterMutation(message) {
        await loadAdminView({ preserveBanner: true });
        state.banner = {
          kind: "success",
          text: message,
        };
        render();
      }

      function serializeForm(form) {
        const formData = new FormData(form);
        const slot = state.modal && state.modal.slot;
        return {
          scope: String(formData.get("scope") || "default"),
          weekday: Number(formData.get("weekday")),
          childActorId: normalizeText(formData.get("childActorId")),
          pickupTime: normalizeText(formData.get("pickupTime")),
          location: normalizeText(formData.get("location")),
          notes: normalizeText(formData.get("notes")),
          preferredResponsibleActorId: normalizeText(formData.get("preferredResponsibleActorId")),
          reminderOffsetsMinutes: parseReminderOffsets(formData.get("reminderOffsetsMinutes")),
          weekAnchorDate: normalizeText(formData.get("weekAnchorDate")) || todayString(),
          overrideDate: normalizeText(formData.get("overrideDate")),
          previewDate: normalizeText(formData.get("previewDate")),
          templateSlotId: slot ? Number(slot.templateSlotId) : null,
          currentSlot: slot,
        };
      }

      function validateEditorValues(kind, values) {
        if (kind === "preview" && !values.previewDate) {
          throw new Error("Choose a date to preview.");
        }
        if (kind === "delete") {
          if (values.scope === "day" && !values.overrideDate) {
            throw new Error("Choose a one-day override date.");
          }
          return;
        }
        if (kind === "add") {
          if (!Number.isInteger(values.weekday) || !values.childActorId || !values.pickupTime) {
            throw new Error("Weekday, child, and pickup time are required.");
          }
        }
        if (kind === "edit" && values.scope === "default" && !values.templateSlotId) {
          throw new Error("The selected recurring slot is missing its id.");
        }
        if (values.scope === "day" && !values.overrideDate) {
          throw new Error("Choose a one-day override date.");
        }
      }

      function buildDefaultUpdatePayload(values) {
        const slot = values.currentSlot;
        if (!slot) {
          return {
            action: "add_weekly_slot",
            weekday: values.weekday,
            childActorId: values.childActorId,
            pickupTime: values.pickupTime,
            location: values.location,
            notes: values.notes,
            preferredResponsibleActorId: values.preferredResponsibleActorId,
            reminderOffsetsMinutes: values.reminderOffsetsMinutes,
          };
        }

        const payload = {
          action: "update_weekly_slot",
          templateSlotId: values.templateSlotId,
        };
        if (values.weekday !== Number(slot.weekday)) {
          payload.weekday = values.weekday;
        }
        if (values.childActorId !== slot.childActorId) {
          payload.childActorId = values.childActorId;
        }
        if (values.pickupTime !== slot.pickupTime) {
          payload.pickupTime = values.pickupTime;
        }
        if ((values.location || null) !== (slot.location || null)) {
          payload.location = values.location;
        }
        if ((values.notes || null) !== (slot.notes || null)) {
          payload.notes = values.notes;
        }
        if ((values.preferredResponsibleActorId || null) !== (slot.preferredResponsibleActorId || null)) {
          payload.preferredResponsibleActorId = values.preferredResponsibleActorId;
        }
        const reminderString = JSON.stringify(values.reminderOffsetsMinutes || []);
        const currentReminderString = JSON.stringify(slot.reminderOffsetsMinutes || []);
        if (reminderString !== currentReminderString) {
          payload.reminderOffsetsMinutes = values.reminderOffsetsMinutes;
        }
        if (Object.keys(payload).length === 2) {
          throw new Error("No recurring changes were made.");
        }
        return payload;
      }

      function buildTemporaryAddPayload(values, scope) {
        const payload = {
          childActorId: values.childActorId,
          pickupTime: values.pickupTime,
          location: values.location,
          notes: values.notes,
          preferredResponsibleActorId: values.preferredResponsibleActorId,
          reminderOffsetsMinutes: values.reminderOffsetsMinutes,
        };

        if (scope === "week") {
          return {
            action: "apply_week_override",
            actionType: "add_slot",
            scopeType: "child",
            childActorId: values.childActorId,
            date: values.weekAnchorDate,
            payload: payload,
          };
        }

        return {
          action: "apply_day_override",
          actionType: "add_slot",
          childActorId: values.childActorId,
          overrideDate: values.overrideDate,
          payload: payload,
        };
      }

      function buildTemporaryEditPayloads(values, scope) {
        const slot = values.currentSlot;
        const payloads = [];
        if (!slot) {
          return [buildTemporaryAddPayload(values, scope)];
        }

        function wrap(actionType, payload) {
          if (scope === "week") {
            payloads.push({
              action: "apply_week_override",
              actionType: actionType,
              scopeType: "template_slot",
              templateSlotId: values.templateSlotId,
              childActorId: slot.childActorId,
              date: values.weekAnchorDate,
              payload: Object.assign({ templateSlotId: values.templateSlotId }, payload),
            });
            return;
          }
          payloads.push({
            action: "apply_day_override",
            actionType: actionType,
            templateSlotId: values.templateSlotId,
            childActorId: slot.childActorId,
            overrideDate: values.overrideDate,
            payload: Object.assign({ templateSlotId: values.templateSlotId }, payload),
          });
        }

        if (values.pickupTime !== slot.pickupTime) {
          wrap("change_time", {
            pickupTime: values.pickupTime,
          });
        }
        if ((values.preferredResponsibleActorId || null) !== (slot.preferredResponsibleActorId || null)) {
          wrap("assign_actor", {
            responsibleActorId: values.preferredResponsibleActorId,
          });
        }
        if ((values.location || null) !== (slot.location || null)) {
          wrap("update_location", {
            location: values.location,
          });
        }
        if ((values.notes || null) !== (slot.notes || null)) {
          wrap("update_notes", {
            notes: values.notes,
          });
        }

        if (!payloads.length) {
          throw new Error("No temporary changes were made.");
        }
        return payloads;
      }

      async function submitEditor(form) {
        const kind = state.modal && state.modal.kind;
        const values = serializeForm(form);
        validateEditorValues(kind, values);

        state.saving = true;
        render();

        try {
          if (kind === "preview") {
            state.preview = await postAction({
              action: "preview_pickup_day",
              date: values.previewDate,
            });
            state.banner = {
              kind: "success",
              text: "Preview loaded for " + values.previewDate + ".",
            };
            closeModal();
            return;
          }

          if (kind === "delete") {
            if (values.scope === "default") {
              await postAction({
                action: "remove_weekly_slot",
                templateSlotId: values.templateSlotId,
              });
              closeModal();
              await refreshAfterMutation("Recurring slot removed.");
              return;
            }

            const deletePayload =
              values.scope === "week"
                ? {
                    action: "apply_week_override",
                    actionType: "cancel_slot",
                    scopeType: "template_slot",
                    templateSlotId: values.templateSlotId,
                    childActorId: values.currentSlot && values.currentSlot.childActorId,
                    date: values.weekAnchorDate,
                    payload: {
                      templateSlotId: values.templateSlotId,
                    },
                  }
                : {
                    action: "apply_day_override",
                    actionType: "cancel_slot",
                    templateSlotId: values.templateSlotId,
                    childActorId: values.currentSlot && values.currentSlot.childActorId,
                    overrideDate: values.overrideDate,
                    payload: {
                      templateSlotId: values.templateSlotId,
                    },
                  };
            await postAction(deletePayload);
            closeModal();
            await refreshAfterMutation(
              values.scope === "week" ? "This-week cancellation saved." : "One-day cancellation saved."
            );
            return;
          }

          if (values.scope === "default") {
            await postAction(buildDefaultUpdatePayload(values));
            closeModal();
            await refreshAfterMutation(kind === "add" ? "Recurring slot added." : "Recurring slot updated.");
            return;
          }

          const actions =
            kind === "add"
              ? [buildTemporaryAddPayload(values, values.scope)]
              : buildTemporaryEditPayloads(values, values.scope);
          for (let index = 0; index < actions.length; index += 1) {
            await postAction(actions[index]);
          }
          closeModal();
          await refreshAfterMutation(
            values.scope === "week"
              ? "This-week changes saved."
              : "One-day changes saved."
          );
        } catch (error) {
          state.banner = {
            kind: "error",
            text: error.message,
          };
        } finally {
          state.saving = false;
          render();
        }
      }

      async function removeWeekOverride(weekOverrideId) {
        state.saving = true;
        render();
        try {
          await postAction({
            action: "remove_week_override",
            weekOverrideId: Number(weekOverrideId),
          });
          await refreshAfterMutation("This-week change removed.");
        } catch (error) {
          state.banner = {
            kind: "error",
            text: error.message,
          };
        } finally {
          state.saving = false;
          render();
        }
      }

      async function removeDayOverride(overrideId) {
        state.saving = true;
        render();
        try {
          await postAction({
            action: "remove_day_override",
            overrideId: Number(overrideId),
          });
          await refreshAfterMutation("One-day change removed.");
        } catch (error) {
          state.banner = {
            kind: "error",
            text: error.message,
          };
        } finally {
          state.saving = false;
          render();
        }
      }

      function actionButton(label, action, extraAttrs) {
        const attrs = extraAttrs || "";
        return (
          '<button type="button" class="pickup-button pickup-button-secondary" data-action="' +
          escapeHtml(action) +
          '"' +
          attrs +
          ">" +
          escapeHtml(label) +
          "</button>"
        );
      }

      function renderBanner() {
        if (!state.banner) {
          return "";
        }
        return (
          '<div class="pickup-banner pickup-banner-' +
          escapeHtml(state.banner.kind) +
          '">' +
          escapeHtml(state.banner.text) +
          "</div>"
        );
      }

      function renderWeekdayGroup(group) {
        const rows = (group.slots || [])
          .map(function (slot) {
            return (
              "<tr>" +
              '<td><strong>' +
              escapeHtml(slot.childDisplayName) +
              "</strong></td>" +
              "<td>" +
              escapeHtml(slot.pickupTime) +
              "</td>" +
              "<td>" +
              escapeHtml(slot.preferredResponsibleDisplayName || "Unassigned") +
              "</td>" +
              "<td>" +
              escapeHtml(slot.location || "—") +
              "</td>" +
              "<td>" +
              escapeHtml(slot.notes || "—") +
              "</td>" +
              "<td>" +
              escapeHtml(formatReminders(slot.reminderOffsetsMinutes)) +
              "</td>" +
              '<td class="pickup-row-actions">' +
              actionButton("Edit", "edit-slot", ' data-slot-id="' + escapeHtml(slot.templateSlotId) + '"') +
              actionButton("Delete", "delete-slot", ' data-slot-id="' + escapeHtml(slot.templateSlotId) + '"') +
              actionButton("Preview day", "preview-slot", ' data-slot-id="' + escapeHtml(slot.templateSlotId) + '"') +
              "</td>" +
              "</tr>"
            );
          })
          .join("");

        return (
          '<section class="pickup-day-card">' +
          '<div class="pickup-day-card-header">' +
          "<h3>" +
          escapeHtml(group.weekdayLabel || WEEKDAY_LABELS[group.weekday] || "Day") +
          "</h3>" +
          '<span class="pickup-pill">' +
          escapeHtml((group.slots || []).length + " slot" + ((group.slots || []).length === 1 ? "" : "s")) +
          "</span>" +
          "</div>" +
          ((group.slots || []).length
            ? '<div class="pickup-table-wrap"><table class="pickup-table"><thead><tr><th>Child</th><th>Time</th><th>Responsible</th><th>Location</th><th>Notes</th><th>Reminders</th><th>Actions</th></tr></thead><tbody>' +
              rows +
              "</tbody></table></div>"
            : '<div class="pickup-empty">No recurring slots for this weekday.</div>') +
          "</section>"
        );
      }

      function renderPreview() {
        const preview = state.preview;
        if (!preview) {
          return "";
        }
        const slots = (preview.slots || [])
          .map(function (slot) {
            return (
              '<li class="pickup-preview-slot">' +
              "<strong>" +
              escapeHtml(slot.childDisplayName || slot.childActorId) +
              "</strong>" +
              '<span class="pickup-preview-slot-time">' +
              escapeHtml(slot.scheduledTime || "—") +
              "</span>" +
              '<span class="pickup-preview-slot-meta">' +
              escapeHtml(slot.location || "No location") +
              " • " +
              escapeHtml(slot.responsibleLabel || slot.responsibleActorId || "Unassigned") +
              "</span>" +
              (slot.notes ? '<div class="pickup-preview-slot-notes">' + escapeHtml(slot.notes) + "</div>" : "") +
              "</li>"
            );
          })
          .join("");

        return (
          '<section class="pickup-preview-card">' +
          '<div class="pickup-section-header">' +
          "<h3>Preview for " +
          escapeHtml(preview.date) +
          "</h3>" +
          actionButton("Clear", "clear-preview") +
          "</div>" +
          '<div class="pickup-preview-meta">' +
          '<span class="pickup-pill">' +
          escapeHtml(preview.timezone || state.view.timezone || "Timezone") +
          "</span>" +
          '<span class="pickup-pill">' +
          escapeHtml(preview.previewOnly ? "Read-only preview" : "Plan") +
          "</span>" +
          (preview.paused ? '<span class="pickup-pill pickup-pill-warning">Paused</span>' : "") +
          "</div>" +
          (preview.summary ? '<p class="pickup-preview-summary">' + escapeHtml(preview.summary) + "</p>" : "") +
          ((preview.slots || []).length
            ? '<ul class="pickup-preview-list">' + slots + "</ul>"
            : '<div class="pickup-empty">No slots scheduled for this date.</div>') +
          (preview.messageText
            ? '<details class="pickup-preview-message"><summary>Operator message</summary><pre>' +
              escapeHtml(preview.messageText) +
              "</pre></details>"
            : "") +
          "</section>"
        );
      }

      function renderOverrides() {
        const actorsById = actorNameMap();
        const slotsById = slotLookup(state.view);
        const weekItems = (state.view.weekOverrides || [])
          .map(function (item) {
            return (
              '<li class="pickup-override-item">' +
              "<strong>" +
              escapeHtml(item.startDate + " to " + item.endDate) +
              "</strong>" +
              "<span>" +
              escapeHtml(describeWeekOverride(item, actorsById, slotsById)) +
              "</span>" +
              actionButton(
                "Remove",
                "remove-week-override",
                ' data-week-override-id="' + escapeHtml(item.id) + '"'
              ) +
              "</li>"
            );
          })
          .join("");

        const dayItems = (state.view.dayOverrides || [])
          .map(function (item) {
            return (
              '<li class="pickup-override-item">' +
              "<strong>" +
              escapeHtml(item.overrideDate) +
              "</strong>" +
              "<span>" +
              escapeHtml(describeDayOverride(item, actorsById, slotsById)) +
              "</span>" +
              actionButton("Remove", "remove-day-override", ' data-day-override-id="' + escapeHtml(item.id) + '"') +
              "</li>"
            );
          })
          .join("");

        const pauseItems = (state.view.pauseWindows || [])
          .map(function (item) {
            const target = item.scopeType === "child" ? actorLabel(actorsById, item.childActorId) : "Family";
            return (
              '<li class="pickup-override-item">' +
              "<strong>" +
              escapeHtml(item.startDate + " to " + item.endDate) +
              "</strong>" +
              "<span>" +
              escapeHtml(target + (item.reason ? " • " + item.reason : "")) +
              "</span>" +
              "</li>"
            );
          })
          .join("");

        return (
          '<div class="pickup-side-grid">' +
          '<section class="pickup-side-card"><div class="pickup-section-header"><h3>This week changes</h3></div>' +
          (weekItems ? '<ul class="pickup-override-list">' + weekItems + "</ul>" : '<div class="pickup-empty">No active week overrides.</div>') +
          "</section>" +
          '<section class="pickup-side-card"><div class="pickup-section-header"><h3>One day changes</h3></div>' +
          (dayItems ? '<ul class="pickup-override-list">' + dayItems + "</ul>" : '<div class="pickup-empty">No active day overrides.</div>') +
          "</section>" +
          '<section class="pickup-side-card"><div class="pickup-section-header"><h3>Pause windows</h3></div>' +
          (pauseItems ? '<ul class="pickup-override-list">' + pauseItems + "</ul>" : '<div class="pickup-empty">No active pauses.</div>') +
          "</section>" +
          "</div>"
        );
      }

      function childOptions(selectedValue) {
        return currentActors()
          .children.map(function (actor) {
            const selected = actor.actorId === selectedValue ? ' selected="selected"' : "";
            return '<option value="' + escapeHtml(actor.actorId) + '"' + selected + ">" + escapeHtml(actor.displayName) + "</option>";
          })
          .join("");
      }

      function responsibleOptions(selectedValue) {
        return (
          '<option value="">Unassigned</option>' +
          currentActors()
            .assignableActors.map(function (actor) {
              const selected = actor.actorId === selectedValue ? ' selected="selected"' : "";
              return (
                '<option value="' +
                escapeHtml(actor.actorId) +
                '"' +
                selected +
                ">" +
                escapeHtml(actor.displayName) +
                "</option>"
              );
            })
            .join("")
        );
      }

      function renderScopeChooser(scope) {
        const options = [
          ["default", "Default"],
          ["week", "This week"],
          ["day", "One day"],
        ];
        return options
          .map(function (option) {
            const checked = option[0] === scope ? ' checked="checked"' : "";
            return (
              '<label class="pickup-scope-option">' +
              '<input type="radio" name="scope" value="' +
              escapeHtml(option[0]) +
              '"' +
              checked +
              ">" +
              "<span>" +
              escapeHtml(option[1]) +
              "</span>" +
              "</label>"
            );
          })
          .join("");
      }

      function renderEditorModal() {
        const modal = state.modal;
        if (!modal) {
          return "";
        }

        const slot = modal.slot;
        const scope = modal.scope || "default";
        const isAdd = modal.kind === "add";
        const isEdit = modal.kind === "edit";
        const isDelete = modal.kind === "delete";
        const isPreview = modal.kind === "preview";
        const title = isAdd
          ? "Add pickup slot"
          : isDelete
          ? "Remove pickup slot"
          : isPreview
          ? "Preview a day"
          : "Edit pickup slot";

        const defaultWeekday = slot ? Number(slot.weekday) : 0;
        const defaultChildActorId = slot ? slot.childActorId : "";
        const defaultPickupTime = slot ? slot.pickupTime : "";
        const defaultLocation = slot ? slot.location || "" : "";
        const defaultNotes = slot ? slot.notes || "" : "";
        const defaultResponsible = slot ? slot.preferredResponsibleActorId || "" : "";
        const defaultReminders = slot ? formatReminders(slot.reminderOffsetsMinutes) : "45, 15";
        const showScopedEditor = !isPreview;
        const showWeekAnchor = scope === "week";
        const showOneDay = scope === "day" || isPreview;
        const showChildSelect = !slot || scope === "default";
        const showWeekdaySelect = !slot || scope === "default";
        const showReminderField = !slot || scope === "default";
        const disableScopedSlotTarget = !!slot && scope !== "default";
        const submitLabel = isDelete
          ? scope === "default"
            ? "Remove recurring slot"
            : scope === "week"
            ? "Cancel for this week"
            : "Cancel for one day"
          : isPreview
          ? "Preview day"
          : isAdd
          ? scope === "default"
            ? "Add recurring slot"
            : scope === "week"
            ? "Add this-week slot"
            : "Add one-day slot"
          : scope === "default"
          ? "Save recurring changes"
          : scope === "week"
          ? "Save this-week changes"
          : "Save one-day changes";

        return (
          '<div class="pickup-modal-backdrop">' +
          '<div class="pickup-modal" role="dialog" aria-modal="true">' +
          '<div class="pickup-modal-header">' +
          "<h3>" +
          escapeHtml(title) +
          "</h3>" +
          '<button type="button" class="pickup-modal-close" data-action="close-modal">×</button>' +
          "</div>" +
          '<form class="pickup-modal-body" data-form="pickup-editor">' +
          (showScopedEditor
            ? '<div class="pickup-field-group"><span class="pickup-field-label">Scope</span><div class="pickup-scope-grid">' +
              renderScopeChooser(scope) +
              "</div></div>"
            : "") +
          (isDelete && slot
            ? '<div class="pickup-delete-callout">Remove <strong>' +
              escapeHtml(slot.childDisplayName) +
              "</strong> at " +
              escapeHtml(slot.pickupTime) +
              ".</div>"
            : "") +
          (showWeekAnchor
            ? '<label class="pickup-field"><span>Week containing</span><input type="date" name="weekAnchorDate" value="' +
              escapeHtml(modal.anchorDate || todayString()) +
              '"></label>'
            : "") +
          (showOneDay
            ? '<label class="pickup-field"><span>' +
              escapeHtml(isPreview ? "Preview date" : "One-day date") +
              '</span><input type="date" name="' +
              escapeHtml(isPreview ? "previewDate" : "overrideDate") +
              '" value="' +
              escapeHtml((isPreview ? modal.previewDate : modal.overrideDate) || todayString()) +
              '" required="required"></label>'
            : "") +
          (!isDelete && !isPreview
            ? '<div class="pickup-field-grid">' +
              (showWeekdaySelect
                ? '<label class="pickup-field"><span>Weekday</span><select name="weekday">' +
                  WEEKDAY_LABELS.map(function (label, index) {
                    const selected = index === defaultWeekday ? ' selected="selected"' : "";
                    return '<option value="' + index + '"' + selected + ">" + escapeHtml(label) + "</option>";
                  }).join("") +
                  "</select></label>"
                : "") +
              (showChildSelect
                ? '<label class="pickup-field"><span>Child</span><select name="childActorId" required="required">' +
                  childOptions(defaultChildActorId) +
                  "</select></label>"
                : slot
                ? '<label class="pickup-field"><span>Child</span><input type="text" value="' +
                  escapeHtml(slot.childDisplayName) +
                  '" disabled="disabled"></label>'
                : "") +
              '<label class="pickup-field"><span>Pickup time</span><input type="time" name="pickupTime" value="' +
              escapeHtml(defaultPickupTime) +
              '" required="required"></label>' +
              "</div>" +
              '<div class="pickup-field-grid">' +
              '<label class="pickup-field"><span>Responsible adult</span><select name="preferredResponsibleActorId"' +
              (disableScopedSlotTarget ? "" : "") +
              ">" +
              responsibleOptions(defaultResponsible) +
              "</select></label>" +
              '<label class="pickup-field"><span>Location</span><input type="text" name="location" value="' +
              escapeHtml(defaultLocation) +
              '" placeholder="School gate"></label>' +
              "</div>" +
              '<label class="pickup-field"><span>Notes</span><textarea name="notes" rows="3" placeholder="Anything operators should know">' +
              escapeHtml(defaultNotes) +
              "</textarea></label>" +
              (showReminderField
                ? '<label class="pickup-field"><span>Reminder offsets (minutes)</span><input type="text" name="reminderOffsetsMinutes" value="' +
                  escapeHtml(defaultReminders) +
                  '" placeholder="45, 15"></label>'
                : '<div class="pickup-form-hint">Temporary edits keep the recurring reminder offsets unchanged.</div>')
            : "") +
          '<div class="pickup-modal-footer">' +
          '<button type="button" class="pickup-button pickup-button-secondary" data-action="close-modal">Cancel</button>' +
          '<button type="submit" class="pickup-button pickup-button-primary"' +
          (state.saving ? ' disabled="disabled"' : "") +
          ">" +
          escapeHtml(state.saving ? "Saving..." : submitLabel) +
          "</button>" +
          "</div>" +
          "</form>" +
          "</div>" +
          "</div>"
        );
      }

      function renderLoadedView() {
        const view = state.view || {};
        const groups = view.weeklySlotsByWeekday || [];

        return (
          '<div class="pickup-shell">' +
          '<div class="pickup-toolbar">' +
          '<div class="pickup-toolbar-copy">' +
          "<h2>Pickup Admin</h2>" +
          '<p class="pickup-summary-text">' +
          escapeHtml(view.summaryText || "Manage the recurring baseline and temporary pickup changes.") +
          "</p>" +
          "</div>" +
          '<div class="pickup-toolbar-actions">' +
          actionButton("Refresh", "refresh") +
          actionButton("Add slot", "add-default") +
          actionButton("This week changes", "add-week") +
          actionButton("One day changes", "add-day") +
          "</div>" +
          "</div>" +
          renderBanner() +
          '<div class="pickup-meta-row">' +
          '<span class="pickup-pill">Timezone: ' +
          escapeHtml(view.timezone || "Asia/Jerusalem") +
          "</span>" +
          '<span class="pickup-pill">Morning planning: ' +
          escapeHtml(view.morningPlanningTime || "07:10") +
          "</span>" +
          "</div>" +
          renderPreview() +
          '<div class="pickup-main-grid">' +
          '<section class="pickup-baseline-card">' +
          '<div class="pickup-section-header"><h3>Recurring baseline</h3></div>' +
          '<div class="pickup-week-grid">' +
          groups.map(renderWeekdayGroup).join("") +
          "</div>" +
          "</section>" +
          renderOverrides() +
          "</div>" +
          renderEditorModal() +
          "</div>"
        );
      }

      function render() {
        if (state.loading && !state.view) {
          panel.innerHTML =
            '<div class="pickup-shell pickup-loading"><div class="pickup-spinner"></div><p>Loading Pickup admin view...</p></div>';
          return;
        }
        panel.innerHTML = renderLoadedView();
      }

      panel.addEventListener("click", function (event) {
        const target = event.target.closest("[data-action]");
        if (!target) {
          return;
        }
        const action = target.getAttribute("data-action");
        if (action === "refresh") {
          loadAdminView();
          return;
        }
        if (action === "add-default") {
          openEditor("add", "default", null);
          return;
        }
        if (action === "add-week") {
          openEditor("add", "week", null);
          return;
        }
        if (action === "add-day") {
          openEditor("add", "day", null);
          return;
        }
        if (action === "edit-slot") {
          const slot = findSlot(target.getAttribute("data-slot-id"));
          if (slot) {
            openEditor("edit", "default", slot);
          }
          return;
        }
        if (action === "delete-slot") {
          const slot = findSlot(target.getAttribute("data-slot-id"));
          if (slot) {
            openEditor("delete", "default", slot);
          }
          return;
        }
        if (action === "preview-slot") {
          const slot = findSlot(target.getAttribute("data-slot-id"));
          openEditor("preview", "day", slot);
          return;
        }
        if (action === "close-modal") {
          closeModal();
          return;
        }
        if (action === "clear-preview") {
          state.preview = null;
          render();
          return;
        }
        if (action === "remove-week-override") {
          if (window.confirm("Remove this week override?")) {
            removeWeekOverride(target.getAttribute("data-week-override-id"));
          }
          return;
        }
        if (action === "remove-day-override") {
          if (window.confirm("Remove this one-day override?")) {
            removeDayOverride(target.getAttribute("data-day-override-id"));
          }
        }
      });

      panel.addEventListener("change", function (event) {
        const target = event.target;
        if (!target || !state.modal || target.name !== "scope") {
          return;
        }
        state.modal.scope = target.value;
        render();
      });

      panel.addEventListener("submit", function (event) {
        const form = event.target;
        if (!form.matches('[data-form="pickup-editor"]')) {
          return;
        }
        event.preventDefault();
        submitEditor(form);
      });

      render();
      loadAdminView();
    },
  });
})();
