const SLOT_ORDER = ["default", "smol", "fast", "slow"];
const AGENTIC_HINTS = /\b(plan|planning|architecture|design|analy[sz]e|debug|investigate|step[- ]by[- ]step|long[- ]horizon|multi[- ]step|agentic|trade[- ]off|compare|refactor|migration)\b/i;
const QUICK_HINTS = /\b(quick|brief|summari[sz]e| classify|extract|yes or no|simple|short answer)\b/i;

function collectText(value, depth = 0) {
  if (depth > 6 || value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => collectText(item, depth + 1)).join(" ");
  if (typeof value === "object") return Object.values(value).map((item) => collectText(item, depth + 1)).join(" ");
  return "";
}

function hasVision(body) {
  const messages = body?.messages || body?.input || body?.contents || [];
  return JSON.stringify(messages).includes("image_url") || JSON.stringify(messages).includes("inline_data") || JSON.stringify(messages).includes("input_image");
}

function hasTools(body) {
  return Array.isArray(body?.tools) && body.tools.length > 0;
}

/** Classify a request without an inference call. Deterministic by design: routing must be cheap and fail-safe. */
export function classifySmartRequest(body = {}, options = {}) {
  const text = collectText(body);
  const messageCount = Array.isArray(body.messages) ? body.messages.length : 0;
  const smolMaxChars = Math.max(1, Number(options.smolMaxChars) || 350);
  const fastMaxChars = Math.max(smolMaxChars, Number(options.fastMaxChars) || 900);
  const slowContextChars = Math.max(fastMaxChars, Number(options.slowContextChars) || 12000);
  const slowMessageCount = Math.max(1, Number(options.slowMessageCount) || 24);
  const defaultSlot = options.defaultSlot || "default";
  const visionSlot = options.routeVisionTo || defaultSlot;
  const longContext = text.length > slowContextChars || messageCount > slowMessageCount;
  const complex = longContext || hasTools(body) || AGENTIC_HINTS.test(text) || body.reasoning_effort === "high" || body.reasoning_effort === "xhigh";
  const quick = !complex && (text.length < fastMaxChars || QUICK_HINTS.test(text));

  if (complex) return { slot: "slow", reason: "long context, tools, or planning language detected" };
  if (hasVision(body)) return { slot: visionSlot, reason: "multimodal request uses the configured vision slot" };
  if (quick && text.length < smolMaxChars) return { slot: "smol", reason: "short, low-complexity request" };
  if (quick) return { slot: "fast", reason: "short interactive request" };
  return { slot: defaultSlot, reason: "balanced request complexity" };
}

export function getSmartComboModels(config, body, options = {}) {
  const slots = config?.models || {};
  const decision = classifySmartRequest(body, options);
  const orderedSlots = [decision.slot, ...SLOT_ORDER.filter((slot) => slot !== decision.slot)];
  const models = [];
  for (const slot of orderedSlots) {
    const model = typeof slots[slot] === "string" ? slots[slot].trim() : "";
    if (model && !models.includes(model)) models.push(model);
  }
  return { models, selectedSlot: decision.slot, reason: decision.reason };
}

export function isSmartCombo(combo) {
  return combo?.config?.type === "smart" && combo?.config?.models && typeof combo.config.models === "object";
}
