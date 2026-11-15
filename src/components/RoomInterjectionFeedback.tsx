import { t } from "@/lib/i18n";
import type { RoomInterjectionControls } from "./use-room-interjection";

export function RoomInterjectionFeedback({ controls, pending }: { controls: RoomInterjectionControls; pending: boolean }) {
  if (!pending || !controls.targets.length) return null;
  const labels = controls.targets.map(target => `${target.name}${target.task ? ` · ${target.task}` : ""}`);
  const keys = controls.targets.map(target => `${target.botId}:${target.executionId}`);
  const lengths = keys.map(key => Math.min(4, key.length));
  for (;;) {
    const suffixes = keys.map((key, index) => key.slice(-lengths[index]!));
    const collisions = suffixes.map((suffix, index) => suffixes.some((other, i) => i !== index && other === suffix));
    if (!collisions.some(Boolean)) break;
    if (!collisions.some((collision, index) => collision && lengths[index]! < keys[index]!.length)) break;
    lengths.forEach((length, index) => { if (collisions[index] && length < keys[index]!.length) lengths[index] = length + 1; });
  }
  const suffixes = keys.map((key, index) => key.slice(-lengths[index]!));
  const displayLabels = [...labels];
  for (let pass = 0; pass <= displayLabels.length; pass++) {
    const collisions = displayLabels.map((label, index) => displayLabels.some((other, i) => i !== index && other === label));
    if (!collisions.some(Boolean)) break;
    if (pass === displayLabels.length) {
      displayLabels.forEach((label, index) => { displayLabels[index] = `${index + 1} · ${label}`; });
      break;
    }
    displayLabels.forEach((label, index) => { if (collisions[index]) displayLabels[index] = `${label} · #${suffixes[index]}`; });
  }
  return <section className="mx-3 mb-2 text-[12px] text-ink-secondary" aria-label={t("room.interjection.target")}>
    <label className="flex flex-wrap items-center gap-2">{t("room.interjection.target")}
      <select aria-label={t("room.interjection.target")} value={controls.selectedKey} disabled={controls.steering}
        className="min-w-0 max-w-full rounded-lg border border-hairline bg-raised px-2 py-1 text-ink focus-visible:outline-accent"
        onChange={event => controls.select(event.target.value)}>
        <option value="">{t(controls.targets.length ? "room.interjection.choose" : "room.interjection.noTarget")}</option>
        {controls.targets.map((target, index) => <option key={`${target.botId}:${target.executionId}`} value={`${target.botId}:${target.executionId}`}>
          {displayLabels[index]}
        </option>)}
      </select>
    </label>
  </section>;
}
