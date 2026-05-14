import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const widgetDir = path.join(repoRoot, "gateway-widgets", "simon-pickup-admin");
const port = Number(process.env.PICKUP_WIDGET_PREVIEW_PORT || 4173);

const actorCatalog = {
  children: [
    { actorId: "dori", displayName: "Dori" },
    { actorId: "naomi", displayName: "Naomi" },
  ],
  assignableActors: [
    { actorId: "alon", displayName: "Alon", actorType: "parent", status: "active" },
    { actorId: "shlomit", displayName: "Shlomit", actorType: "parent", status: "dormant" },
    { actorId: "grandma", displayName: "Grandma", actorType: "trusted_adult", status: "active" },
  ],
};

const actorNames = new Map(
  [...actorCatalog.children, ...actorCatalog.assignableActors].map((item) => [item.actorId, item.displayName]),
);

function nextIdFactory(start = 1) {
  let current = start;
  return function nextId() {
    current += 1;
    return current - 1;
  };
}

const nextSlotId = nextIdFactory(100);
const nextWeekOverrideId = nextIdFactory(500);
const nextDayOverrideId = nextIdFactory(800);

const state = {
  timezone: "Asia/Jerusalem",
  morningPlanningTime: "07:10",
  pauseWindows: [],
  weeklySlots: [
    {
      templateSlotId: 101,
      weekday: 0,
      childActorId: "dori",
      childDisplayName: "Dori",
      pickupTime: "13:00",
      location: "School gate",
      notes: "Basketball on Sundays",
      preferredResponsibleActorId: "alon",
      preferredResponsibleDisplayName: "Alon",
      reminderOffsetsMinutes: [45, 15],
      active: true,
    },
    {
      templateSlotId: 102,
      weekday: 0,
      childActorId: "naomi",
      childDisplayName: "Naomi",
      pickupTime: "16:00",
      location: "Music building",
      notes: null,
      preferredResponsibleActorId: "grandma",
      preferredResponsibleDisplayName: "Grandma",
      reminderOffsetsMinutes: [45, 15],
      active: true,
    },
    {
      templateSlotId: 103,
      weekday: 2,
      childActorId: "dori",
      childDisplayName: "Dori",
      pickupTime: "13:00",
      location: "School gate",
      notes: null,
      preferredResponsibleActorId: "alon",
      preferredResponsibleDisplayName: "Alon",
      reminderOffsetsMinutes: [45, 15],
      active: true,
    },
    {
      templateSlotId: 104,
      weekday: 4,
      childActorId: "naomi",
      childDisplayName: "Naomi",
      pickupTime: "16:15",
      location: "Art room",
      notes: "Bring folder",
      preferredResponsibleActorId: "alon",
      preferredResponsibleDisplayName: "Alon",
      reminderOffsetsMinutes: [60, 20],
      active: true,
    },
  ],
  weekOverrides: [
    {
      id: 501,
      startDate: "2026-05-17",
      endDate: "2026-05-23",
      scopeType: "template_slot",
      targetTemplateSlotId: 101,
      childActorId: "dori",
      actionType: "change_time",
      payload: { templateSlotId: 101, pickupTime: "14:00" },
      active: true,
    },
  ],
  dayOverrides: [
    {
      id: 801,
      overrideDate: "2026-05-19",
      actionType: "assign_actor",
      childActorId: "naomi",
      payload: { templateSlotId: 104, responsibleActorId: "grandma" },
      active: true,
    },
  ],
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function localDate(value) {
  return String(value || "").slice(0, 10);
}

function weekdayFromDate(date) {
  const value = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(value.getTime()) ? null : value.getUTCDay();
}

function weekRangeFor(date) {
  const base = new Date(`${date}T12:00:00Z`);
  const day = base.getUTCDay();
  const start = new Date(base);
  start.setUTCDate(base.getUTCDate() - day);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return {
    startDate: localDate(start.toISOString()),
    endDate: localDate(end.toISOString()),
  };
}

function summaryText() {
  const slotCount = state.weeklySlots.length;
  const activeDays = new Set(state.weeklySlots.map((slot) => slot.weekday)).size;
  return [
    `Weekly baseline: ${slotCount} recurring slots across ${activeDays} weekdays.`,
    `Pauses: ${state.pauseWindows.length}.`,
    `This-week changes: ${state.weekOverrides.length}.`,
    `One-day changes: ${state.dayOverrides.length}.`,
  ].join(" ");
}

function groupedSlots() {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    weekdayLabel: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekday],
    slots: state.weeklySlots
      .filter((slot) => slot.active !== false && Number(slot.weekday) === weekday)
      .sort((left, right) => {
        if (left.pickupTime === right.pickupTime) {
          return left.childDisplayName.localeCompare(right.childDisplayName);
        }
        return left.pickupTime.localeCompare(right.pickupTime);
      }),
  }));
}

function adminViewPayload() {
  return {
    ok: true,
    action: "get_pickup_admin_view",
    timezone: state.timezone,
    morningPlanningTime: state.morningPlanningTime,
    weeklySlotsByWeekday: groupedSlots(),
    pauseWindows: state.pauseWindows,
    weekOverrides: state.weekOverrides,
    dayOverrides: state.dayOverrides,
    availableActors: actorCatalog,
    summaryText: summaryText(),
  };
}

function findSlot(templateSlotId) {
  return state.weeklySlots.find((slot) => Number(slot.templateSlotId) === Number(templateSlotId)) || null;
}

function applySlotMutation(target, payload) {
  if (payload.pickupTime) {
    target.scheduledTime = payload.pickupTime;
  }
  if (payload.location !== undefined) {
    target.location = payload.location || null;
  }
  if (payload.notes !== undefined) {
    target.notes = payload.notes || null;
  }
  if (payload.responsibleActorId !== undefined) {
    target.responsibleActorId = payload.responsibleActorId || null;
    target.responsibleLabel = payload.responsibleActorId ? actorNames.get(payload.responsibleActorId) || payload.responsibleActorId : null;
  }
}

function previewPayload(date) {
  const weekday = weekdayFromDate(date);
  if (weekday === null) {
    return {
      ok: false,
      error: {
        code: "INVALID_DATE",
        message: "date is required for preview_pickup_day in YYYY-MM-DD format.",
      },
    };
  }

  let slots = state.weeklySlots
    .filter((slot) => slot.active !== false && Number(slot.weekday) === weekday)
    .map((slot) => ({
      templateSlotId: slot.templateSlotId,
      childActorId: slot.childActorId,
      childDisplayName: slot.childDisplayName,
      scheduledTime: slot.pickupTime,
      location: slot.location,
      notes: slot.notes,
      responsibleActorId: slot.preferredResponsibleActorId || null,
      responsibleLabel: slot.preferredResponsibleDisplayName || null,
    }));

  for (const override of state.weekOverrides.filter((item) => item.startDate <= date && item.endDate >= date)) {
    const payload = override.payload || {};
    if (override.actionType === "cancel_slot") {
      slots = slots.filter((slot) => Number(slot.templateSlotId) !== Number(override.targetTemplateSlotId || payload.templateSlotId));
      continue;
    }
    if (override.actionType === "add_slot" && payload.childActorId && payload.pickupTime) {
      slots.push({
        templateSlotId: null,
        childActorId: payload.childActorId,
        childDisplayName: actorNames.get(payload.childActorId) || payload.childActorId,
        scheduledTime: payload.pickupTime,
        location: payload.location || null,
        notes: payload.notes || null,
        responsibleActorId: payload.preferredResponsibleActorId || null,
        responsibleLabel: payload.preferredResponsibleActorId ? actorNames.get(payload.preferredResponsibleActorId) || payload.preferredResponsibleActorId : null,
      });
      continue;
    }
    const target = slots.find((slot) => Number(slot.templateSlotId) === Number(override.targetTemplateSlotId || payload.templateSlotId));
    if (target) {
      applySlotMutation(target, payload);
    }
  }

  for (const override of state.dayOverrides.filter((item) => item.overrideDate === date)) {
    const payload = override.payload || {};
    if (override.actionType === "cancel_slot") {
      slots = slots.filter((slot) => Number(slot.templateSlotId) !== Number(payload.templateSlotId));
      continue;
    }
    if (override.actionType === "add_slot" && payload.childActorId && payload.pickupTime) {
      slots.push({
        templateSlotId: null,
        childActorId: payload.childActorId,
        childDisplayName: actorNames.get(payload.childActorId) || payload.childActorId,
        scheduledTime: payload.pickupTime,
        location: payload.location || null,
        notes: payload.notes || null,
        responsibleActorId: payload.preferredResponsibleActorId || null,
        responsibleLabel: payload.preferredResponsibleActorId ? actorNames.get(payload.preferredResponsibleActorId) || payload.preferredResponsibleActorId : null,
      });
      continue;
    }
    const target = slots.find((slot) => Number(slot.templateSlotId) === Number(payload.templateSlotId));
    if (target) {
      applySlotMutation(target, payload);
    }
  }

  return {
    ok: true,
    action: "preview_pickup_day",
    date,
    timezone: state.timezone,
    previewOnly: true,
    summary: `${slots.length} preview slots for ${date}.`,
    messageText: `Preview for ${date}: ${slots.length} slot(s).`,
    slots,
  };
}

function jsonBody(request) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    request.on("data", (chunk) => {
      buffer += chunk;
    });
    request.on("end", () => {
      if (!buffer) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(buffer));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function invalidAction(message) {
  return {
    ok: false,
    error: {
      code: "INVALID_PICKUP_ACTION",
      message,
    },
  };
}

function handleAction(body) {
  switch (body.action) {
    case "get_pickup_admin_view":
      return adminViewPayload();
    case "add_weekly_slot": {
      const actorId = body.childActorId;
      const actorName = actorNames.get(actorId) || actorId;
      const preferredResponsibleActorId = body.preferredResponsibleActorId || null;
      state.weeklySlots.push({
        templateSlotId: nextSlotId(),
        weekday: Number(body.weekday),
        childActorId: actorId,
        childDisplayName: actorName,
        pickupTime: body.pickupTime,
        location: body.location || null,
        notes: body.notes || null,
        preferredResponsibleActorId,
        preferredResponsibleDisplayName: preferredResponsibleActorId ? actorNames.get(preferredResponsibleActorId) || preferredResponsibleActorId : null,
        reminderOffsetsMinutes: Array.isArray(body.reminderOffsetsMinutes) ? body.reminderOffsetsMinutes : [45, 15],
        active: body.active !== false,
      });
      return adminViewPayload();
    }
    case "update_weekly_slot": {
      const slot = findSlot(body.templateSlotId);
      if (!slot) {
        return invalidAction("templateSlotId does not match an existing slot.");
      }
      if (body.weekday !== undefined) {
        slot.weekday = Number(body.weekday);
      }
      if (body.childActorId !== undefined) {
        slot.childActorId = body.childActorId;
        slot.childDisplayName = actorNames.get(body.childActorId) || body.childActorId;
      }
      if (body.pickupTime !== undefined) {
        slot.pickupTime = body.pickupTime;
      }
      if (body.location !== undefined) {
        slot.location = body.location || null;
      }
      if (body.notes !== undefined) {
        slot.notes = body.notes || null;
      }
      if (body.preferredResponsibleActorId !== undefined) {
        slot.preferredResponsibleActorId = body.preferredResponsibleActorId || null;
        slot.preferredResponsibleDisplayName = body.preferredResponsibleActorId ? actorNames.get(body.preferredResponsibleActorId) || body.preferredResponsibleActorId : null;
      }
      if (body.reminderOffsetsMinutes !== undefined) {
        slot.reminderOffsetsMinutes = body.reminderOffsetsMinutes;
      }
      return adminViewPayload();
    }
    case "remove_weekly_slot":
      state.weeklySlots = state.weeklySlots.filter((slot) => Number(slot.templateSlotId) !== Number(body.templateSlotId));
      return adminViewPayload();
    case "apply_week_override": {
      const range = body.weekStartDate && body.weekEndDate ? { startDate: body.weekStartDate, endDate: body.weekEndDate } : weekRangeFor(body.date || new Date().toISOString().slice(0, 10));
      state.weekOverrides.push({
        id: nextWeekOverrideId(),
        startDate: range.startDate,
        endDate: range.endDate,
        scopeType: body.scopeType || "template_slot",
        targetTemplateSlotId: body.templateSlotId || body.payload?.templateSlotId || null,
        childActorId: body.childActorId || body.payload?.childActorId || null,
        actionType: body.actionType,
        payload: body.payload || {},
        active: true,
      });
      return {
        ok: true,
        action: "apply_week_override",
        weekOverrideId: state.weekOverrides[state.weekOverrides.length - 1].id,
      };
    }
    case "remove_week_override":
      state.weekOverrides = state.weekOverrides.filter((item) => Number(item.id) !== Number(body.weekOverrideId));
      return { ok: true, action: "remove_week_override", removed: true };
    case "apply_day_override":
      state.dayOverrides.push({
        id: nextDayOverrideId(),
        overrideDate: body.overrideDate,
        actionType: body.actionType,
        childActorId: body.childActorId || body.payload?.childActorId || null,
        payload: body.payload || {},
        active: true,
      });
      return {
        ok: true,
        action: "apply_day_override",
        overrideId: state.dayOverrides[state.dayOverrides.length - 1].id,
      };
    case "remove_day_override":
      state.dayOverrides = state.dayOverrides.filter((item) => Number(item.id) !== Number(body.overrideId));
      return { ok: true, action: "remove_day_override", removed: true };
    case "preview_pickup_day":
      return previewPayload(body.date);
    default:
      return invalidAction("Pickup admin action is not supported in the preview harness.");
  }
}

async function serveRoot(response) {
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pickup Widget Preview</title>
    <style>
      :root {
        --bg-primary: #f4f7fb;
        --bg-secondary: #ffffff;
        --text-primary: #1b2431;
        --text-secondary: #637086;
        --border: #d7dfeb;
        --color-primary: #275df2;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "DM Sans", system-ui, sans-serif;
        background:
          linear-gradient(180deg, rgba(39, 93, 242, 0.08), transparent 20%),
          linear-gradient(180deg, #f4f7fb, #eef3fb);
        color: var(--text-primary);
      }
      .shell {
        max-width: 1520px;
        margin: 0 auto;
        padding: 22px;
      }
      .preview-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        margin-bottom: 14px;
      }
      .preview-title h1,
      .preview-title p { margin: 0; }
      .preview-title p { color: var(--text-secondary); margin-top: 6px; }
      .tab-bar {
        display: flex;
        gap: 10px;
        align-items: center;
        padding: 12px;
        border-radius: 18px;
        background: rgba(255,255,255,0.78);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(215, 223, 235, 0.9);
        margin-bottom: 16px;
      }
      .tab-bar button {
        border: 0;
        background: transparent;
        color: var(--text-secondary);
        font: inherit;
        font-weight: 700;
        padding: 10px 14px;
        border-radius: 999px;
      }
      .tab-bar button.active {
        background: rgba(39, 93, 242, 0.12);
        color: var(--color-primary);
      }
      .tab-panel { display: none; }
      .tab-panel.active { display: block; }
      .preview-pill {
        display: inline-flex;
        align-items: center;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(39, 93, 242, 0.1);
        color: var(--color-primary);
        font-weight: 700;
      }
      .preview-note {
        font-size: 14px;
        color: var(--text-secondary);
      }
    </style>
    <link rel="stylesheet" href="/widget.css" />
  </head>
  <body>
    <div class="shell">
      <div class="preview-header">
        <div class="preview-title">
          <h1>Simon Pickup Admin</h1>
          <p>Local widget preview harness using the real Gateway widget code and a local in-memory pickup API.</p>
        </div>
        <span class="preview-pill">Preview harness</span>
      </div>
      <div class="tab-bar">
        <button class="active" data-tab="pickup">Pickup</button>
        <span class="preview-note">This is a local UI preview, not a Railway deploy.</span>
      </div>
      <div id="tab-pickup" class="tab-panel active" data-widget="simon-pickup-admin"></div>
    </div>
    <script>
      window.__IRONCLAW_LAYOUT__ = {
        widgets: {
          "simon-pickup-admin": {
            enabled: true,
            config: { apiBasePath: "/api/pickup" }
          }
        }
      };
      window.IronClaw = {
        api: {
          fetch: function(pathname, options) {
            return fetch(pathname, options || {});
          }
        },
        registerWidget: function(def) {
          const panel = document.getElementById("tab-pickup");
          def.init(panel, window.IronClaw.api);
        }
      };
    </script>
    <script src="/widget.js"></script>
  </body>
</html>`;
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/") {
      await serveRoot(response);
      return;
    }

    if (request.method === "GET" && request.url === "/widget.js") {
      const source = await readFile(path.join(widgetDir, "index.js"), "utf8");
      response.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      response.end(source);
      return;
    }

    if (request.method === "GET" && request.url === "/widget.css") {
      const source = await readFile(path.join(widgetDir, "style.css"), "utf8");
      response.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
      response.end(source);
      return;
    }

    if (request.method === "GET" && request.url === "/api/pickup/admin-view") {
      sendJson(response, 200, adminViewPayload());
      return;
    }

    if (request.method === "POST" && request.url === "/api/pickup/action") {
      const body = await jsonBody(request);
      const payload = handleAction(body);
      sendJson(response, payload.ok === false ? 400 : 200, payload);
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      ok: false,
      error: {
        code: "PREVIEW_SERVER_ERROR",
        message: error.message,
      },
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Pickup widget preview server listening on http://127.0.0.1:${port}`);
});
