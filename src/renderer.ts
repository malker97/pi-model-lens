import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import { classify, parseRecord, routingSummary } from "./record.ts";
import type { RoutingRecord } from "./record.ts";

const titles = { match: "Match", different: "Different", unknown: "Unknown", conflict: "Conflict" };
const symbols = { match: "=", different: "≠", unknown: "?", conflict: "!" };

export function badgeText(record: RoutingRecord, width: number): string {
    if (width <= 0) return "";
    const result = classify(record);
    const title = result.incomplete ? "Incomplete" : titles[result.status];
    const requested = record.requestedModel ?? "?";
    const response = result.status === "conflict" ? "conflict" : result.responseModel ?? "?";
    const source = result.source === "server" ? "Server" : result.source === "body" ? "Body" : "";
    const tag = `[${title}${source && !result.incomplete && result.status !== "conflict" ? ` · ${source}` : ""}]`;
    const full = `Req: ${requested} → Resp: ${response} ${tag}`;
    if (visibleWidth(full) <= width) return full;

    const shortTag = `[${symbols[result.status]}${source && !result.incomplete && result.status !== "conflict" ? ` ${source.toLowerCase()}` : ""}]`;
    const budget = width - visibleWidth(` →  ${shortTag}`);
    if (budget >= 6) {
        const left = truncateToWidth(requested, Math.floor(budget / 2));
        const right = truncateToWidth(response, budget - visibleWidth(left));
        return `${left} → ${right} ${shortTag}`;
    }
    return width < 5 ? symbols[result.status] : truncateToWidth(tag, width);
}

export function renderEntry(
    entry: { data?: unknown }, options: { expanded: boolean }, theme: Pick<Theme, "fg">,
): Component {
    const record = parseRecord(entry.data);
    const result = record ? classify(record) : undefined;
    const tint = !result || result.status === "different" || result.status === "conflict" ? "warning" : "dim";
    let cachedWidth: number | undefined;
    let cachedLines: string[] = [];
    return {
        render(width) {
            const columns = Math.max(0, Math.floor(width));
            if (columns === cachedWidth) return cachedLines;
            cachedWidth = columns;
            if (columns === 0) return cachedLines = [];
            const padding = columns >= 3 ? 1 : 0;
            const inner = columns - padding * 2;
            const label = record ? badgeText(record, inner) : truncateToWidth("Model Lens: Invalid Metadata", inner);
            cachedLines = [" ".repeat(columns - padding - visibleWidth(label)) + theme.fg(tint, label) + " ".repeat(padding)];
            if (options.expanded && record && inner >= 20) {
                cachedLines.push(...wrapTextWithAnsi(routingSummary(record), inner)
                    .map(line => " ".repeat(padding) + theme.fg("dim", line)));
            }
            return cachedLines;
        },
        invalidate() { cachedWidth = undefined; cachedLines = []; },
    };
}
