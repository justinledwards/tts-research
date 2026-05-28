export type BuiltInSpeechPolicyProfileName =
  | "Education"
  | "Accessibility"
  | "TechnicalDocs"
  | "LanguageLearning"
  | "Enterprise";

export type SpeechPolicyMode =
  | "speak"
  | "skip"
  | "summarise"
  | "literal"
  | "spell"
  | "describeShort"
  | "describeLong"
  | "onDemand"
  | "interactive";

export type SpeechPolicyTableMode = "skip" | "summary" | "rowLinear" | "interactive";
export type SpeechPolicyTableHeaderMode = "none" | "column" | "rowAndColumn";
export type SpeechPolicyCodeMode = "skip" | "summary" | "syntaxAware" | "literal";
export type SpeechPolicyMathMode = "skip" | "semantic" | "literalsafe";
export type SpeechPolicyFootnoteMode = "skip" | "inline" | "endnote" | "onDemand";
export type SpeechPolicyImageMode = "skip" | "altFirst" | "describeShort" | "describeLong";
export type SpeechPolicyCaptionMode = "skip" | "speak" | "onDemand";
export type SpeechPolicyCitationMode = "skip" | "inline" | "endnote" | "onDemand";
export type SpeechPolicyListMarkerMode = "omit" | "announce";
export type SpeechPolicyAdmonitionMode = "skip" | "speak" | "summarise";
export type SpeechPolicyQuoteMode = "skip" | "speak" | "summarise";

export interface SpeechPolicySettings {
  mode: SpeechPolicyMode;
  tableMode: SpeechPolicyTableMode;
  tableHeaderMode: SpeechPolicyTableHeaderMode;
  codeMode: SpeechPolicyCodeMode;
  mathMode: SpeechPolicyMathMode;
  footnoteMode: SpeechPolicyFootnoteMode;
  imageMode: SpeechPolicyImageMode;
  captionMode: SpeechPolicyCaptionMode;
  citationMode: SpeechPolicyCitationMode;
  listMarkerMode: SpeechPolicyListMarkerMode;
  admonitionMode: SpeechPolicyAdmonitionMode;
  quoteMode: SpeechPolicyQuoteMode;
}

export interface SpeechPolicyOverrides {
  mode?: SpeechPolicyMode;
  tableMode?: SpeechPolicyTableMode;
  tableHeaderMode?: SpeechPolicyTableHeaderMode;
  codeMode?: SpeechPolicyCodeMode;
  mathMode?: SpeechPolicyMathMode;
  footnoteMode?: SpeechPolicyFootnoteMode;
  imageMode?: SpeechPolicyImageMode;
  captionMode?: SpeechPolicyCaptionMode;
  citationMode?: SpeechPolicyCitationMode;
  listMarkerMode?: SpeechPolicyListMarkerMode;
  admonitionMode?: SpeechPolicyAdmonitionMode;
  quoteMode?: SpeechPolicyQuoteMode;
}

export interface SourceSpeechPolicyUpdateRequest {
  profile?: string;
  overrides?: SpeechPolicyOverrides;
  clear?: boolean;
}

export interface SpeechPolicyProfile {
  name: string;
  label: string;
  description: string;
  settings: SpeechPolicySettings;
}

export interface SpeechPolicyDefinitionOption {
  value: string;
  label: string;
}

export interface SpeechPolicyDefinitionField {
  key: keyof SpeechPolicyOverrides;
  label: string;
  description: string;
  options: SpeechPolicyDefinitionOption[];
}

export interface SpeechPolicyDefinition {
  fields: SpeechPolicyDefinitionField[];
  profiles: SpeechPolicyProfile[];
}

export interface CustomSpeechPolicyProfile {
  id: string;
  name: string;
  baseProfile?: string;
  settings: SpeechPolicySettings;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSpeechPolicy {
  projectId: string;
  profile: string;
  settings: SpeechPolicySettings;
  customProfiles?: CustomSpeechPolicyProfile[];
}

export interface UpsertSpeechPolicyProfileRequest {
  name: string;
  baseProfile?: string;
  settings: SpeechPolicySettings;
}

export interface SpeechPolicyDecision {
  profile: string;
  element?: string;
  elementMode?: string;
  mode: string;
  explanation: string;
}
