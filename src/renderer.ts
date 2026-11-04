import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import { classify, parseRecord, routingSummary } from "./record.ts";
import type { RoutingRecord } from "./record.ts";

export function badgeTone(record: RoutingRecord | undefined): "success" | "warning" | "error" | "dim" {
    if (!record) return "dim";
    const result = classify(record);
    if (result.status === "match") return "success";
    if (result.status !== "different") return "dim";
    // Only this explicitly agreed upgrade is yellow; never infer quality from version numbers.
    return record.requestedModel === "gpt-6-astra" && result.responseModel === "gpt-6.2-astra"
        ? "warning" : "error";
}

export function badgeText(record: RoutingRecord | undefined, width: number): string {
    if (width <= 0) return "";
    if (width <= 2) return "●";
    const model = record ? classify(record).responseModel ?? "Unknown" : "Unknown";
    return `${truncateToWidth(model, width - 2, "…")} ●`;
}

export function renderEntry(
    entry: { data?: unknown }, options: { expanded: boolean }, theme: Pick<Theme, "fg">,
): Component {
    const record = parseRecord(entry.data);
    const tone = badgeTone(record);
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
            const label = badgeText(record, inner);
            cachedLines = [" ".repeat(columns - padding - visibleWidth(label))
                + theme.fg("dim", label.slice(0, -1)) + theme.fg(tone, "●") + " ".repeat(padding)];
            if (options.expanded && inner >= 20) {
                const detail = record ? routingSummary(record) : "Model Lens: Invalid Metadata";
                cachedLines.push(...wrapTextWithAnsi(detail, inner)
                    .map(line => " ".repeat(padding) + theme.fg(record ? "dim" : "warning", line)));
            }
            return cachedLines;
        },
        invalidate() { cachedWidth = undefined; cachedLines = []; },
    };
}
