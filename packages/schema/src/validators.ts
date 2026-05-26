import { Ajv2020, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import {
  contentIrV1Schema,
  fragmentTimingV1Schema,
  highlightMapV1Schema,
  highlightMapV2Schema,
  locatorEnvelopeV1Schema,
  schemaByKind,
  speechPlanV1Schema,
  tokenTimingV1Schema,
} from "./generated/schemas.js";

export type SchemaKind =
  | "content-ir.v1"
  | "locator-envelope.v1"
  | "speech-plan.v1"
  | "highlight-map.v1"
  | "highlight-map.v2"
  | "fragment-timing.v1"
  | "token-timing.v1";

export interface ValidationResult<T> {
  data?: T;
  errors: ErrorObject[];
  valid: boolean;
}

const schemaIdByKind: Record<SchemaKind, string> = {
  "content-ir.v1": "content-ir.v1.schema.json",
  "fragment-timing.v1": "fragment-timing.v1.schema.json",
  "highlight-map.v1": "highlight-map.v1.schema.json",
  "highlight-map.v2": "highlight-map.v2.schema.json",
  "locator-envelope.v1": "locator-envelope.v1.schema.json",
  "speech-plan.v1": "speech-plan.v1.schema.json",
  "token-timing.v1": "token-timing.v1.schema.json",
};

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
  if (!isRecord(payload)) {
    return undefined;
  }
  switch (payload.schemaVersion) {
    case "content-ir.v1":
      return "content-ir.v1";
    case "locator-envelope.v1":
      return "locator-envelope.v1";
    case "speech-plan.v1":
      return "speech-plan.v1";
    case "highlight-map.v1":
      return "highlight-map.v1";
    case "highlight-map.v2":
      return "highlight-map.v2";
    case "timing.v1":
      if (Array.isArray(payload.fragments)) {
        return "fragment-timing.v1";
      }
      if (Array.isArray(payload.tokens)) {
        return "token-timing.v1";
      }
      return undefined;
    default:
      return undefined;
  }
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
  switch (kind) {
    case "content-ir.v1":
      return contentIrV1Schema;
    case "locator-envelope.v1":
      return locatorEnvelopeV1Schema;
    case "speech-plan.v1":
      return speechPlanV1Schema;
    case "highlight-map.v1":
      return highlightMapV1Schema;
    case "highlight-map.v2":
      return highlightMapV2Schema;
    case "fragment-timing.v1":
      return fragmentTimingV1Schema;
    case "token-timing.v1":
      return tokenTimingV1Schema;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
