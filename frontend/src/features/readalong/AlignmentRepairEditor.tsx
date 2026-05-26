import { useMemo, useState } from "react";
import { Button, fieldControlClassName, StatusChip } from "../../design";
import type { VoiceJob } from "../../types";
import {
  addAlignmentRepairOperation,
  alignmentRepairMapStaleness,
  alignmentRepairOperationLabel,
  createAlignmentRepairMap,
  parseAlignmentRepairMap,
  serializeAlignmentRepairMap,
  type AlignmentRepairContext,
  type AlignmentRepairMap,
  type AlignmentRepairOperationKind,
} from "./alignmentRepairModel";

const REPAIR_OPERATION_KINDS: AlignmentRepairOperationKind[] = [
  "adjust-fragment-boundary",
  "split-fragment",
  "merge-fragments",
  "force-phrase-fallback",
  "mark-token-unspoken",
  "mark-inserted-audio",
];

export function AlignmentRepairEditor({
  context,
  job,
  repairMap,
  onRepairMapChange,
}: Readonly<{
  context: AlignmentRepairContext;
  job?: VoiceJob | null;
  repairMap?: AlignmentRepairMap | null;
  onRepairMapChange: (map: AlignmentRepairMap | null) => void;
}>) {
  const [boundary, setBoundary] = useState<"end" | "start">("end");
  const [deltaMs, setDeltaMs] = useState("0");
  const [fragmentIndex, setFragmentIndex] = useState("0");
  const [importText, setImportText] = useState("");
  const [insertedAudioMs, setInsertedAudioMs] = useState("0");
  const [kind, setKind] = useState<AlignmentRepairOperationKind>("adjust-fragment-boundary");
  const [reason, setReason] = useState("Manual alignment repair.");
  const [splitAtMs, setSplitAtMs] = useState("0");
  const [status, setStatus] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [tokenIndex, setTokenIndex] = useState("0");

  const staleness = useMemo(
    () => alignmentRepairMapStaleness(repairMap, context),
    [context, repairMap],
  );
  const operationCount = repairMap?.operations.length ?? 0;
  const exportText = repairMap ? serializeAlignmentRepairMap(repairMap) : "";
  const canAddRepair = Boolean(job?.id);

  const addRepair = () => {
    if (!canAddRepair) {
      setStatus("Create generated audio before saving alignment repairs.");
      return;
    }
    const currentMap =
      repairMap && !staleness.stale ? repairMap : createAlignmentRepairMap(context);
    const nextMap = addAlignmentRepairOperation(currentMap, {
      boundary,
      deltaMs: parseInteger(deltaMs),
      fragmentIndex: parseInteger(fragmentIndex),
      insertedAudioMs: parseInteger(insertedAudioMs),
      kind,
      reason,
      splitAtMs: parseInteger(splitAtMs),
      text,
      tokenIndex: parseInteger(tokenIndex),
    });
    onRepairMapChange(nextMap);
    setStatus(`${alignmentRepairOperationLabel(kind)} saved locally.`);
  };

  const importRepairMap = () => {
    try {
      const parsed = parseAlignmentRepairMap(importText);
      const importedStaleness = alignmentRepairMapStaleness(parsed, context);
      onRepairMapChange(parsed);
      setStatus(
        importedStaleness.stale
          ? `Imported repair map is stale: ${importedStaleness.reason ?? "unknown reason"}`
          : "Imported repair map is ready for this source and audio.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not import repair map.");
    }
  };

  return (
    <div className="grid gap-4 text-sm" data-alignment-repair-editor="">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={staleness.stale ? "warning" : "info"}>
          {staleness.stale ? "Stale repair" : "Project-local repair"}
        </StatusChip>
        <StatusChip tone="neutral">{operationCount.toLocaleString()} operations</StatusChip>
      </div>

      {staleness.stale ? (
        <p className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-900 dark:text-amber-200">
          {staleness.reason}
        </p>
      ) : null}

      <div className="grid gap-3">
        <label className="grid gap-1 text-xs font-semibold">
          <span className="vs-muted">Repair operation</span>
          <select
            className={fieldControlClassName}
            value={kind}
            onChange={(event) => {
              setKind(event.currentTarget.value as AlignmentRepairOperationKind);
            }}
          >
            {REPAIR_OPERATION_KINDS.map((item) => (
              <option key={item} value={item}>
                {alignmentRepairOperationLabel(item)}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Fragment" value={fragmentIndex} onChange={setFragmentIndex} />
          <NumberField label="Token" value={tokenIndex} onChange={setTokenIndex} />
          <NumberField label="Delta ms" value={deltaMs} onChange={setDeltaMs} />
          <NumberField label="Split at ms" value={splitAtMs} onChange={setSplitAtMs} />
          <NumberField
            label="Inserted audio ms"
            value={insertedAudioMs}
            onChange={setInsertedAudioMs}
          />
          <label className="grid gap-1 text-xs font-semibold">
            <span className="vs-muted">Boundary</span>
            <select
              className={fieldControlClassName}
              value={boundary}
              onChange={(event) => {
                setBoundary(event.currentTarget.value as "end" | "start");
              }}
            >
              <option value="start">Start</option>
              <option value="end">End</option>
            </select>
          </label>
        </div>

        <label className="grid gap-1 text-xs font-semibold">
          <span className="vs-muted">Repair note</span>
          <input
            className={fieldControlClassName}
            value={reason}
            onChange={(event) => {
              setReason(event.currentTarget.value);
            }}
          />
        </label>

        <label className="grid gap-1 text-xs font-semibold">
          <span className="vs-muted">Optional replacement fragment text</span>
          <input
            className={fieldControlClassName}
            value={text}
            onChange={(event) => {
              setText(event.currentTarget.value);
            }}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <Button disabled={!canAddRepair} onClick={addRepair} size="sm" variant="secondary">
            Save local repair
          </Button>
          <Button
            disabled={!repairMap}
            onClick={() => {
              onRepairMapChange(null);
              setStatus("Local repair map cleared.");
            }}
            size="sm"
            variant="ghost"
          >
            Clear repairs
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <label className="grid gap-1 text-xs font-semibold">
          <span className="vs-muted">Export repair map</span>
          <textarea
            className={`${fieldControlClassName} min-h-[5rem] font-mono text-[0.7rem]`}
            readOnly
            value={exportText}
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          <span className="vs-muted">Import repair map</span>
          <textarea
            className={`${fieldControlClassName} min-h-[5rem] font-mono text-[0.7rem]`}
            value={importText}
            onChange={(event) => {
              setImportText(event.currentTarget.value);
            }}
          />
        </label>
        <Button
          disabled={importText.trim().length === 0}
          onClick={importRepairMap}
          size="sm"
          variant="secondary"
        >
          Import repair map
        </Button>
      </div>

      <p className="text-xs leading-5 vs-muted">
        Repairs are stored separately from source text, bookmarks, and generated audio. They become
        stale when source, policy, speech plan, or generated audio changes.
      </p>
      {status ? <p className="text-xs font-semibold">{status}</p> : null}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: Readonly<{ label: string; value: string; onChange: (value: string) => void }>) {
  return (
    <label className="grid gap-1 text-xs font-semibold">
      <span className="vs-muted">{label}</span>
      <input
        className={fieldControlClassName}
        inputMode="numeric"
        type="number"
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
      />
    </label>
  );
}

function parseInteger(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
