import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { observeProvider } from "./capture.ts";
import { ENTRY_TYPE, parseRecord, routingSummary } from "./record.ts";
import type { RoutingRecord } from "./record.ts";
import { renderEntry } from "./renderer.ts";

export default function modelLens(pi: ExtensionAPI): void {
    const completed = new Map<string, { timestamp: number; record: RoutingRecord }>();
    let active = false;

    pi.registerEntryRenderer(ENTRY_TYPE, renderEntry);
    pi.on("session_start", (_event, ctx) => {
        completed.clear();
        active = false;
        const commands = pi.getCommands().filter(command => command.source === "extension")
            .map(command => command.name.replace(/:\d+$/, ""));
        if (["model-lens", "openusage-routing"].some(name => commands.filter(command => command === name).length > 1)) {
            ctx.ui.notify("Multiple model-routing collectors are loaded. Disable the old openusage-routing.ts or duplicate package and reload. Model Lens capture is paused.", "warning");
            return;
        }
        const provider = ctx.modelRegistry.getProvider("openai-codex");
        if (!provider) {
            ctx.ui.notify("Pi Model Lens: OpenAI Codex provider is unavailable.", "warning");
            return;
        }
        active = true;
        pi.registerProvider(observeProvider(provider,
            (message, record) => {
                if (!active) return;
                completed.set(record.responseID, { timestamp: message.timestamp, record });
                // Internal calls have no message_end; bound their unconsumed records.
                if (completed.size > 64) completed.delete(completed.keys().next().value!);
            },
            () => {
                console.error("[pi-model-lens] Could not capture model routing metadata.");
                if (active) ctx.ui.notify("Model Lens could not capture routing metadata; inference is unchanged.", "error");
            }));
    });
    pi.on("message_end", (event) => {
        const message = event.message;
        if (message.role !== "assistant" || !message.responseId) return;
        const saved = completed.get(message.responseId);
        completed.delete(message.responseId);
        // Warmups and internal calls never become assistant message_end events.
        if (saved && saved.timestamp === message.timestamp && message.provider === "openai-codex"
            && message.api === "openai-codex-responses" && (message.stopReason === "stop" || message.stopReason === "toolUse")) {
            pi.appendEntry(ENTRY_TYPE, saved.record);
        }
    });
    pi.on("session_shutdown", () => { active = false; completed.clear(); });

    async function showLatest(_args: string, ctx: ExtensionCommandContext): Promise<void> {
        const entry = ctx.sessionManager.getEntries()
            .filter(entry => entry.type === "custom" && entry.customType === ENTRY_TYPE).at(-1);
        if (!entry || entry.type !== "custom") {
            ctx.ui.notify("No completed OpenAI response captured yet. Use Codex normally after /reload.", "info");
            return;
        }
        const record = parseRecord(entry.data);
        ctx.ui.notify(record ? routingSummary(record) : "Model Lens record is invalid or uses an unsupported schema.", record ? "info" : "error");
    }
    for (const name of ["model-lens", "openusage-routing"]) {
        pi.registerCommand(name, {
            description: "Show the last request/response model comparison; no probe is sent",
            handler: showLatest,
        });
    }
}
