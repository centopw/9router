import { NextResponse } from "next/server";
import { classifySmartRequest } from "open-sse/services/smartCombo.js";

export const dynamic = "force-dynamic";

const CONFIDENCE_BY_SLOT = { smol: 92, fast: 84, slow: 90, default: 72 };

export async function POST(request) {
  try {
    const body = await request.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const models = body.models && typeof body.models === "object" ? body.models : {};
    if (!text) return NextResponse.json({ error: "Tryout text is required" }, { status: 400 });

    const settings = body.settings && typeof body.settings === "object" ? body.settings : {};
    const decision = classifySmartRequest({ messages: [{ role: "user", content: text }] }, settings);
    const model = typeof models[decision.slot] === "string" ? models[decision.slot].trim() : "";
    const configuredFallback = model || Object.values(models).find((value) => typeof value === "string" && value.trim()) || null;

    return NextResponse.json({
      slot: decision.slot,
      model: configuredFallback,
      configuredSlot: !!model,
      confidence: CONFIDENCE_BY_SLOT[decision.slot] || 70,
      reason: decision.reason,
      note: "Heuristic preview; the live request may fall back if the selected provider is unavailable.",
    });
  } catch (error) {
    console.log("Error previewing smart routing:", error);
    return NextResponse.json({ error: "Failed to preview smart routing" }, { status: 500 });
  }
}
