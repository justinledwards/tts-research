import { Ajv2020, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { schemaByKind } from "./generated/schemas.js";

export const SCHEMA_KINDS = [
  "content-ir.v1",
  "locator-envelope.v1",
  "speech-plan.v1",
  "highlight-map.v1",
  "highlight-map.v2",
  "fragment-timing.v1",
  "token-timing.v1",
  "source-envelope.v1",
  "source-revision.v1",
  "extraction-revision.v1",
  "reading-unit-manifest.v1",
  "readalong-manifest.v1",
  "audio-artifact.v1",
  "artifact-compatibility.v1",
  "repair-overlay.v1",
  "revision-map.v1",
  "promotion-crosswalk.v1",
  "source-manifest-event.v1",
  "durable-progress.v1",
  "resume-resolution.v1",
  "sync-fidelity-decision.v1",
] as const;

export type SchemaKind = (typeof SCHEMA_KINDS)[number];

export interface ValidationResult<T> {
  data?: T;
  errors: ErrorObject[];
  valid: boolean;
}

const schemaKindSet = new Set<string>(SCHEMA_KINDS);
const schemaIdByKind: Record<SchemaKind, string> = Object.fromEntries(
  SCHEMA_KINDS.map((kind) => [kind, `${kind}.schema.json`]),
) as Record<SchemaKind, string>;

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addFormat("date-time", {
  type: "string",
  validate: (value: string) => !Number.isNaN(Date.parse(value)),
});
for (const [kind, schema] of Object.entries(schemaByKind)) {
  ajv.addSchema(schema, schemaIdByKind[kind as SchemaKind]);
}

const validators = new Map<SchemaKind, ValidateFunction>();

export function detectSchemaKind(payload: unknown): SchemaKind | undefined {
  if (!isRecord(payload) || typeof payload.schemaVersion !== "string") {
    return undefined;
  }
  if (payload.schemaVersion === "timing.v1") {
    if (Array.isArray(payload.fragments)) {
      return "fragment-timing.v1";
    }
    if (Array.isArray(payload.tokens)) {
      return "token-timing.v1";
    }
    return undefined;
  }
  return schemaKindSet.has(payload.schemaVersion)
    ? (payload.schemaVersion as SchemaKind)
    : undefined;
}

export function validateSchema<T>(kind: SchemaKind, payload: unknown): ValidationResult<T> {
  const validate = validatorForKind(kind);
  const valid = validate(payload);
  const errors = validate.errors ? [...validate.errors] : [];
  return {
    data: valid ? (payload as T) : undefined,
    errors,
    valid,
  };
}

export function validateDetectedSchema<T>(payload: unknown): ValidationResult<T> & {
  kind?: SchemaKind;
} {
  const kind = detectSchemaKind(payload);
  if (!kind) {
    return {
      errors: [
        {
          instancePath: "",
          keyword: "schemaVersion",
          message: "unsupported or missing schemaVersion",
          params: {},
          schemaPath: "",
        },
      ],
      valid: false,
    };
  }
  return { ...validateSchema<T>(kind, payload), kind };
}

export function validateContentIR<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("content-ir.v1", payload);
}

export function validateLocatorEnvelope<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("locator-envelope.v1", payload);
}

export function validateSpeechPlan<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("speech-plan.v1", payload);
}

export function validateHighlightMap<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("highlight-map.v1", payload);
}

export function validateHighlightMapV2<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("highlight-map.v2", payload);
}

export function validateFragmentTiming<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("fragment-timing.v1", payload);
}

export function validateTokenTiming<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("token-timing.v1", payload);
}

export function validateSourceEnvelope<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("source-envelope.v1", payload);
}

export function validateSourceRevision<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("source-revision.v1", payload);
}

export function validateExtractionRevision<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("extraction-revision.v1", payload);
}

export function validateReadingUnitManifest<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("reading-unit-manifest.v1", payload);
}

export function validateReadalongManifest<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("readalong-manifest.v1", payload);
}

export function validateAudioArtifact<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("audio-artifact.v1", payload);
}

export function validateArtifactCompatibility<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("artifact-compatibility.v1", payload);
}

export function validateRepairOverlay<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("repair-overlay.v1", payload);
}

export function validateRevisionMap<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("revision-map.v1", payload);
}

export function validatePromotionCrosswalk<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("promotion-crosswalk.v1", payload);
}

export function validateSourceManifestEvent<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("source-manifest-event.v1", payload);
}

export function validateDurableProgress<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("durable-progress.v1", payload);
}

export function validateResumeResolution<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("resume-resolution.v1", payload);
}

export function validateSyncFidelityDecision<T>(payload: unknown): ValidationResult<T> {
  return validateSchema<T>("sync-fidelity-decision.v1", payload);
}

export function validationErrorsText(errors: ErrorObject[]): string {
  return errors.map((error) => `${error.instancePath || "/"} ${error.message ?? ""}`).join("; ");
}

function validatorForKind(kind: SchemaKind): ValidateFunction {
  const cached = validators.get(kind);
  if (cached) {
    return cached;
  }
  const schema = schemaForKind(kind) as AnySchema;
  const validate = ajv.compile(schema);
  validators.set(kind, validate);
  return validate;
}

function schemaForKind(kind: SchemaKind): unknown {
  return schemaByKind[kind];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
