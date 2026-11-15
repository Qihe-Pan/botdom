import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { SettingRow } from "./SettingsPrimitives";

export function DataFolderRow() {
  const bridge = window.ogb?.remoteClient?.active ? undefined : window.ogb?.dataFolder;
  const [folder, setFolder] = useState("");
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    if (!bridge) return;
    let alive = true;
    void bridge().then(result => { if (alive) setFolder(result.folder); }).catch(cause => { if (alive) setError(String(cause)); });
    return () => { alive = false; };
  }, [bridge]);
  const open = async () => {
    if (!bridge || opening) return;
    setOpening(true);
    setError("");
    try {
      const result = await bridge(true);
      setFolder(result.folder);
      if (!result.opened) setError(result.error || t("p0.data.openFailed"));
    } catch (cause) { setError(String(cause)); }
    finally { setOpening(false); }
  };
  return <div data-settings-block="data-folder">
    <SettingRow title={t("p0.data.folder")} subtitle={folder || t("p0.data.remote")}>
      {bridge && <button type="button" className="ui-button" disabled={opening || !folder} onClick={() => void open()}>{t("p0.data.open")}</button>}
    </SettingRow>
    {error && <p role="alert" className="px-4 py-2 text-[13px] text-danger">{error}</p>}
  </div>;
}
