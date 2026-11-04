// Keep this entry name and schema compatible with OpenUsage's existing collector and scanner.
export const ENTRY_TYPE = "openusage.model-routing";
export const MAX_EVIDENCE = 16;

export type Source = "response.model" | "response.headers" | "event.headers" | "http.headers";
export interface ModelEvidence {
    source: Source;
    field: string;
    model: string;
}
export interface RoutingRecord {
    schemaVersion: 1;
    provider: "openai-codex";
    api: "openai-codex-responses";
    requestedModel: string | null;
    responseID: string;
    completedAt: string;
    status: "completed";
    evidence: ModelEvidence[];
    evidenceIncomplete: boolean;
}

export function object(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown> : undefined;
}
export function identifier(value: unknown): string | undefined {
    if (typeof value !== "string" || value.length === 0 || value.length > 256
        || !/^[a-zA-Z0-9]/.test(value) || /[^a-zA-Z0-9._:/+\-]/.test(value)) return;
    return value;
}

export function parseRecord(value: unknown): RoutingRecord | undefined {
    const record = object(value);
    if (!record || record.schemaVersion !== 1 || record.provider !== "openai-codex"
        || record.api !== "openai-codex-responses" || record.status !== "completed"
        || !identifier(record.responseID)
        || (record.requestedModel !== null && !identifier(record.requestedModel))
        || typeof record.completedAt !== "string" || !Number.isFinite(Date.parse(record.completedAt))
        || typeof record.evidenceIncomplete !== "boolean"
        || !Array.isArray(record.evidence) || record.evidence.length > MAX_EVIDENCE) return;
    const evidence: ModelEvidence[] = [];
    for (const raw of record.evidence) {
        const item = object(raw);
        if (!item || typeof item.source !== "string" || typeof item.field !== "string" || !identifier(item.model)) return;
        const body = item.source === "response.model" && item.field === "model";
        const header = ["response.headers", "event.headers", "http.headers"].includes(item.source)
            && ["openai-model", "x-openai-model"].includes(item.field);
        if (!body && !header) return;
        evidence.push({ source: item.source as Source, field: item.field as string, model: item.model as string });
    }
    return {
        schemaVersion: 1, provider: "openai-codex", api: "openai-codex-responses",
        requestedModel: record.requestedModel as string | null,
        responseID: record.responseID as string,
        completedAt: new Date(record.completedAt).toISOString(), status: "completed", evidence,
        evidenceIncomplete: record.evidenceIncomplete,
    };
}

export interface MatchResult {
    status: "match" | "different" | "unknown" | "conflict";
    source: "server" | "body" | "none";
    responseModel: string | null;
    incomplete: boolean;
}

export function classify(record: RoutingRecord): MatchResult {
    const models = [...new Set(record.evidence.map(item => item.model))];
    const source = record.evidence.some(item => item.source !== "response.model") ? "server"
        : models.length ? "body" : "none";
    const incomplete = record.evidenceIncomplete;
    const responseModel = !incomplete && models.length === 1 ? models[0] : null;
    const status = incomplete ? "unknown" : models.length > 1 ? "conflict"
        : !record.requestedModel || !responseModel ? "unknown"
        : record.requestedModel === responseModel ? "match" : "different";
    return { status, source, responseModel, incomplete };
}

export function routingSummary(record: RoutingRecord): string {
    const result = classify(record);
    const evidence = result.incomplete ? "Incomplete Evidence"
        : result.status === "conflict" ? "Conflicting Model Fields"
        : result.source === "server" ? "Server Model Metadata"
        : result.source === "body" ? "Response Model Field Only" : "Unknown";
    return [
        evidence,
        `Comparison: ${result.status}`,
        `Requested: ${record.requestedModel ?? "Unknown"}`,
        ...record.evidence.map(item => `${item.source}${item.source === "response.model" ? "" : `.${item.field}`}: ${item.model}`),
        `Completed: ${record.completedAt}`,
        `Response: ${record.responseID}`,
    ].join("\n");
}
