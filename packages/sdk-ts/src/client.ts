import type {
  ContentIRDocument,
  ContentIRSchemaVersion,
  FragmentTimingArtifact,
  HighlightMap,
  SpeechPlanDocument,
  TokenTimingArtifact,
} from "@tts-research/schema";

export interface VoiceStudioClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface ImportPreparedSourceRequest {
  kind?: "text" | "file" | "url";
  text?: string;
  url?: string;
  sourceName?: string;
  sourceContentType?: string;
  sourceBytes?: number;
  markdownParseMode?: string;
}

export interface ImportBookSourceOptions {
  importProfile?: string;
  pdfTableMode?: string;
}

export interface ImportBookSourceFileOptions extends ImportBookSourceOptions {
  file: Blob;
  filename: string;
}

export interface ProjectBundleExport {
  contentType: string;
  data: Uint8Array;
  filename?: string;
}

export class VoiceStudioClient {
  readonly baseUrl: string;

  readonly fetch: typeof fetch;

  constructor(options: VoiceStudioClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? "http://127.0.0.1:8080");
    this.fetch = options.fetch ?? globalThis.fetch;
    if (!this.fetch) {
      throw new Error("VoiceStudioClient requires a fetch implementation.");
    }
  }

  async getContentIR(
    id: string,
    options: { schemaVersion?: ContentIRSchemaVersion } = {},
  ): Promise<ContentIRDocument> {
    const params = new URLSearchParams();
    if (options.schemaVersion) {
      params.set("schemaVersion", options.schemaVersion);
    }
    const query = params.size > 0 ? `?${params.toString()}` : "";
    return this.requestJson<ContentIRDocument>(`/api/content-ir/${encodeURIComponent(id)}${query}`);
  }

  async getSourceSpeechPlan(id: string): Promise<SpeechPlanDocument> {
    return this.requestJson<SpeechPlanDocument>(
      `/api/content-ir/${encodeURIComponent(id)}/speech-plan`,
    );
  }

  async getJobSpeechPlan(id: string): Promise<SpeechPlanDocument> {
    return this.requestJson<SpeechPlanDocument>(
      `/api/voice-jobs/${encodeURIComponent(id)}/speech-plan`,
    );
  }

  async getHighlightMap(id: string): Promise<HighlightMap> {
    return this.requestJson<HighlightMap>(
      `/api/voice-jobs/${encodeURIComponent(id)}/highlight-map`,
    );
  }

  async getFragmentTiming(id: string): Promise<FragmentTimingArtifact> {
    return this.requestJson<FragmentTimingArtifact>(
      `/api/voice-jobs/${encodeURIComponent(id)}/timing/fragments`,
    );
  }

  async getTokenTiming(id: string): Promise<TokenTimingArtifact> {
    return this.requestJson<TokenTimingArtifact>(
      `/api/voice-jobs/${encodeURIComponent(id)}/timing/tokens`,
    );
  }

  async importPreparedSource<T = unknown>(
    projectId: string,
    request: ImportPreparedSourceRequest,
  ): Promise<T> {
    return this.requestJson<T>(`/api/projects/${encodeURIComponent(projectId)}/source-preps`, {
      body: JSON.stringify(request),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  }

  async importBookSourceFromUrl<T = unknown>(
    projectId: string,
    url: string,
    options: ImportBookSourceOptions = {},
  ): Promise<T> {
    return this.requestJson<T>(`/api/projects/${encodeURIComponent(projectId)}/book-sources`, {
      body: JSON.stringify({ ...options, url }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  }

  async importBookSourceFile<T = unknown>(
    projectId: string,
    options: ImportBookSourceFileOptions,
  ): Promise<T> {
    const form = new FormData();
    form.append("file", options.file, options.filename);
    if (options.importProfile) {
      form.append("importProfile", options.importProfile);
    }
    if (options.pdfTableMode) {
      form.append("pdfTableMode", options.pdfTableMode);
    }
    return this.requestJson<T>(`/api/projects/${encodeURIComponent(projectId)}/book-sources`, {
      body: form,
      method: "POST",
    });
  }

  async exportProjectBundle(projectId: string): Promise<ProjectBundleExport> {
    const response = await this.fetch(
      this.url(`/api/projects/${encodeURIComponent(projectId)}/bundle`),
    );
    await assertOk(response);
    const data = new Uint8Array(await response.arrayBuffer());
    return {
      contentType: response.headers.get("content-type") ?? "application/zip",
      data,
      filename: filenameFromContentDisposition(response.headers.get("content-disposition")),
    };
  }

  private async requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetch(this.url(path), init);
    await assertOk(response);
    return response.json() as Promise<T>;
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  let message = `${response.status.toString()} ${response.statusText}`;
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload.error) {
      message = payload.error;
    }
  } catch {
    const text = await response.text().catch(() => "");
    if (text.trim()) {
      message = text.trim();
    }
  }
  throw new Error(message);
}

function normalizeBaseUrl(baseUrl: string): string {
  const clean = baseUrl.trim();
  return clean.endsWith("/") ? clean.slice(0, -1) : clean;
}

function filenameFromContentDisposition(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const match = /filename="?(?<filename>[^";]+)"?/i.exec(value);
  return match?.groups?.filename;
}
