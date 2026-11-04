import type { AssistantMessage, Provider, SimpleStreamOptions } from "@earendil-works/pi-ai";
import { identifier, MAX_EVIDENCE, object } from "./record.ts";
import type { ModelEvidence, RoutingRecord, Source } from "./record.ts";

const MAX_RESPONSES = 32;
interface ResponseState {
    id: string;
    requestedModel: string | null;
    status: string;
    evidence: ModelEvidence[];
    incomplete: boolean;
}

function headerEvidence(value: unknown, source: Source): ModelEvidence[] {
    const headers = object(value);
    if (!headers) return [];
    return Object.entries(headers).flatMap(([key, value]) => {
        const field = key.toLowerCase();
        if (field !== "openai-model" && field !== "x-openai-model") return [];
        const model = identifier(value);
        return model ? [{ source, field, model }] : [];
    });
}

// Separate state per call prevents concurrent cache warming from overwriting a real turn's evidence.
export class RoutingCapture {
    private requestedModel: string | null = null;
    private responses = new Map<string, ResponseState>();
    private activeID: string | undefined;
    private pendingMetadata: ModelEvidence[] = [];
    private httpEvidence: ModelEvidence[] = [];
    private incomplete = false;
    private now: () => Date;

    constructor(now: () => Date = () => new Date()) {
        this.now = now;
    }

    options(options: SimpleStreamOptions = {}): SimpleStreamOptions {
        return {
            ...options,
            onPayload: async (payload, model) => {
                const replacement = await options.onPayload?.(payload, model);
                const outgoing = replacement === undefined ? payload : replacement;
                // Observe AFTER existing transformers, not the model picker or config file.
                this.requestedModel = identifier(object(outgoing)?.model) ?? null;
                return replacement;
            },
            onResponse: async (response, model) => {
                this.httpEvidence = response.status >= 200 && response.status < 300
                    ? headerEvidence(response.headers, "http.headers") : [];
                await options.onResponse?.(response, model);
            },
            onProviderStreamEvent: async (data, model) => {
                this.event(data);
                await options.onProviderStreamEvent?.(data, model);
            },
        };
    }

    event(data: unknown): void {
        const event = object(data);
        if (!event || typeof event.type !== "string" || !event.type.startsWith("response.")) return;
        const response = object(event.response);
        const id = identifier(response?.id) ?? identifier(event.response_id);
        const evidence = [
            ...headerEvidence(response?.headers, "response.headers"),
            ...headerEvidence(event.headers, "event.headers"),
        ];
        const responseModel = identifier(response?.model);
        if (responseModel) evidence.push({ source: "response.model", field: "model", model: responseModel });
        if (!id) {
            if (event.type === "response.metadata") {
                const active = this.activeID ? this.responses.get(this.activeID) : undefined;
                if (active?.status === "in_progress") this.add(active, evidence);
                else if (this.responses.size === 0) {
                    for (const item of evidence) {
                        if (this.pendingMetadata.some(old => old.source === item.source && old.field === item.field && old.model === item.model)) continue;
                        if (this.pendingMetadata.length >= MAX_EVIDENCE) { this.incomplete = true; break; }
                        this.pendingMetadata.push(item);
                    }
                } else if (evidence.length > 0) {
                    this.incomplete = true; // A retry's ID-less metadata cannot be attributed safely.
                }
            }
            return;
        }
        if (response?.id && event.response_id && response.id !== event.response_id) {
            this.incomplete = true;
            return;
        }
        let state = this.responses.get(id);
        if (!state) {
            if (this.responses.size >= MAX_RESPONSES) { this.incomplete = true; return; }
            state = { id, requestedModel: this.requestedModel, status: "in_progress", evidence: [], incomplete: false };
            this.responses.set(id, state);
            this.add(state, [...this.httpEvidence, ...this.pendingMetadata]);
            this.pendingMetadata = [];
        }
        this.activeID = id;
        this.add(state, evidence);
        if (event.type === "response.completed" || event.type === "response.done") {
            state.status = typeof response?.status === "string" ? response.status : "unknown";
        } else if (event.type === "response.failed" || event.type === "response.incomplete") {
            state.status = event.type.slice("response.".length);
        }
    }

    private add(state: ResponseState, evidence: ModelEvidence[]): void {
        for (const item of evidence) {
            if (state.evidence.some(old => old.source === item.source && old.field === item.field && old.model === item.model)) continue;
            if (state.evidence.length >= MAX_EVIDENCE) { state.incomplete = true; continue; }
            state.evidence.push(item);
        }
    }

    finish(message: AssistantMessage): RoutingRecord | undefined {
        if (message.provider !== "openai-codex" || message.api !== "openai-codex-responses"
            || (message.stopReason !== "stop" && message.stopReason !== "toolUse")) return;
        const id = identifier(message.responseId);
        const response = id ? this.responses.get(id) : undefined;
        if (!response || response.status !== "completed") return;
        return {
            schemaVersion: 1, provider: "openai-codex", api: "openai-codex-responses",
            requestedModel: response.requestedModel, responseID: response.id,
            completedAt: this.now().toISOString(), status: "completed",
            evidence: response.evidence.map(item => ({ ...item })),
            evidenceIncomplete: this.incomplete || response.incomplete,
        };
    }
}

export function observeProvider(
    provider: Provider,
    remember: (message: AssistantMessage, record: RoutingRecord) => void,
    reportError: () => void,
): Provider {
    return {
        ...provider,
        streamSimple(model, context, options) {
            if (model.api !== "openai-codex-responses") return provider.streamSimple(model, context, options);
            const capture = new RoutingCapture();
            const stream = provider.streamSimple(model, context, capture.options(options));
            // Preserve the original transport, stream, credentials, callbacks, and usage.
            void stream.result().then(message => {
                const record = capture.finish(message);
                if (record) remember(message, record);
            }).catch(reportError);
            return stream;
        },
    };
}
