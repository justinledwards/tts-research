const MERMAID_START_PATTERN =
  /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|stateDiagram-v2|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph)\b/i;

export function looksLikeMermaidDiagram(value: string): boolean {
  return MERMAID_START_PATTERN.test(value);
}
