import { useEffect, useState, type ReactNode } from "react";
import { loadSettings, saveSettings } from "@/db/settings-bridge";
import {
  applyToolbarClickBehavior,
  getSidePanelLayoutSide,
  type ToolbarClickBehavior,
  type SidePanelLayoutSide,
} from "@/services/toolbar-behavior";
import {
  sectionHeading,
  sectionDesc,
  card,
  cardHeading,
  listStyle,
  tableStyle,
  thStyle,
  tdStyle,
  grantedBadge,
  colors,
  fontSizes,
} from "@/styles";

interface PermissionInfo {
  permission: string;
  status: "granted" | "optional";
  feature: string;
  reason: string;
}

function buildDeclaredPermissions(): PermissionInfo[] {
  return [
    {
      permission: "storage",
      status: "granted",
      feature: "Local settings and saved data",
      reason:
        "Stores profiles, vacancy history, privacy settings, and local extension state in your browser.",
    },
    {
      permission: "sidePanel",
      status: "granted",
      feature: "Vacancy side panel",
      reason:
        "Opens VacancyPilot in the browser side panel so analysis and tracking stay next to the HH page you are viewing.",
    },
    {
      permission: "activeTab",
      status: "granted",
      feature: "Read current vacancy tab",
      reason:
        "Reads the currently active HH vacancy tab when you use the extension on that page. It does not grant background access to all sites.",
    },
  ];
}

export function PermissionsSection(): ReactNode {
  const [permissions, setPermissions] = useState<PermissionInfo[]>(
    buildDeclaredPermissions(),
  );
  const [optionalOriginGranted, setOptionalOriginGranted] = useState(false);
  const [toolbarClickBehavior, setToolbarClickBehavior] =
    useState<ToolbarClickBehavior>("popup");
  const [closePopupAfterOpeningSidePanel, setClosePopupAfterOpeningSidePanel] =
    useState(true);
  const [sidePanelLayoutSide, setSidePanelLayoutSide] =
    useState<SidePanelLayoutSide | null>(null);
  const [toolbarStatus, setToolbarStatus] = useState<string | null>(null);
  const [toolbarError, setToolbarError] = useState<string | null>(null);
  const [savingToolbarBehavior, setSavingToolbarBehavior] = useState(false);

  useEffect(() => {
    try {
      const manifest = chrome.runtime.getManifest();
      const declared = manifest.permissions ?? [];
      const known = buildDeclaredPermissions();
      const visible = known.filter((permission) =>
        declared.includes(permission.permission),
      );

      if (visible.length > 0) {
        setPermissions(visible);
      }

      const permissionsApi = chrome.permissions;
      if (permissionsApi?.contains) {
        void permissionsApi
          .contains({ origins: ["https://api.openai.com/*"] })
          .then(setOptionalOriginGranted)
          .catch(() => setOptionalOriginGranted(false));
      }

      void loadSettings()
        .then((settings) => {
          setToolbarClickBehavior(settings.general.toolbarClickBehavior);
          setClosePopupAfterOpeningSidePanel(
            settings.general.closePopupAfterOpeningSidePanel,
          );
        })
        .catch(() => undefined);

      void getSidePanelLayoutSide()
        .then(setSidePanelLayoutSide)
        .catch(() => setSidePanelLayoutSide(null));
    } catch {
      setPermissions(buildDeclaredPermissions());
    }
  }, []);

  async function persistToolbarBehavior(
    nextBehavior: ToolbarClickBehavior,
  ): Promise<void> {
    setSavingToolbarBehavior(true);
    setToolbarError(null);
    setToolbarStatus(null);

    try {
      const settings = await loadSettings();
      settings.general.toolbarClickBehavior = nextBehavior;
      await saveSettings(settings);
      await applyToolbarClickBehavior(nextBehavior);
      setToolbarClickBehavior(nextBehavior);
      setToolbarStatus(
        nextBehavior === "sidePanel"
          ? "Toolbar click now opens VacancyPilot in Chrome's side panel."
          : "Toolbar click now opens the compact VacancyPilot popup.",
      );
    } catch (error) {
      setToolbarError(
        error instanceof Error
          ? error.message
          : "Could not update toolbar click behavior.",
      );
    } finally {
      setSavingToolbarBehavior(false);
    }
  }

  async function persistClosePopupAfterOpen(nextValue: boolean): Promise<void> {
    setToolbarError(null);
    setToolbarStatus(null);

    try {
      const settings = await loadSettings();
      settings.general.closePopupAfterOpeningSidePanel = nextValue;
      await saveSettings(settings);
      setClosePopupAfterOpeningSidePanel(nextValue);
      setToolbarStatus(
        nextValue
          ? "Popup will close after Side Panel opens successfully."
          : "Popup will stay visible after Side Panel opens.",
      );
    } catch (error) {
      setToolbarError(
        error instanceof Error
          ? error.message
          : "Could not update popup close behavior.",
      );
    }
  }

  return (
    <div style={{ maxWidth: 620 }}>
      <h2 style={sectionHeading}>Permissions &amp; Data Access</h2>
      <p style={sectionDesc}>
        VacancyPilot keeps the permission surface narrow. The current manifest
        requests only the permissions listed below.
      </p>

      <div style={card}>
        <h3 style={cardHeading}>Declared Manifest Permissions</h3>
        <p
          style={{
            fontSize: fontSizes.sm,
            color: colors.textFaint,
            margin: "0 0 4px",
          }}
        >
          These permissions are part of the installed extension package. There
          are no declared host permissions in the current build.
        </p>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Permission</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Used for</th>
              <th style={thStyle}>Why</th>
            </tr>
          </thead>
          <tbody>
            {permissions.map((permission) => (
              <tr key={permission.permission}>
                <td style={tdStyle}>
                  <code style={{ fontSize: fontSizes.sm }}>
                    {permission.permission}
                  </code>
                </td>
                <td style={tdStyle}>
                  <span style={grantedBadge}>Granted</span>
                </td>
                <td style={tdStyle}>{permission.feature}</td>
                <td style={{ ...tdStyle, color: colors.textSecondary }}>
                  {permission.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={card}>
        <h3 style={cardHeading}>Optional Runtime Host Access</h3>
        <p
          style={{
            fontSize: fontSizes.sm,
            color: colors.textFaint,
            margin: "0 0 8px",
          }}
        >
          OpenAI access is declared as an optional host permission and is
          requested only when you confirm an AI action that needs it.
        </p>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Origin</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Used for</th>
              <th style={thStyle}>Why</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}>
                <code style={{ fontSize: fontSizes.sm }}>
                  https://api.openai.com/*
                </code>
              </td>
              <td style={tdStyle}>
                <span style={grantedBadge}>
                  {optionalOriginGranted ? "Granted" : "Not granted"}
                </span>
              </td>
              <td style={tdStyle}>OpenAI requests by explicit user action</td>
              <td style={{ ...tdStyle, color: colors.textSecondary }}>
                Needed only when you confirm an AI draft or analysis request.
                VacancyPilot does not request this access at install time.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={card}>
        <h3 style={cardHeading}>Toolbar Icon Behavior</h3>
        <p
          style={{
            fontSize: fontSizes.sm,
            color: colors.textFaint,
            margin: "0 0 8px",
          }}
        >
          Popup: clicking the extension icon opens the compact popup.
          Side Panel: clicking the extension icon opens VacancyPilot in
          Chrome&apos;s side panel when supported.
        </p>
        <p
          style={{
            fontSize: fontSizes.sm,
            color: colors.textSecondary,
            margin: "0 0 12px",
          }}
        >
          Chrome controls the position of extension popups. VacancyPilot cannot
          make the popup draggable.
        </p>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="radio"
              name="toolbar-click-behavior"
              checked={toolbarClickBehavior === "popup"}
              onChange={() => void persistToolbarBehavior("popup")}
              disabled={savingToolbarBehavior}
            />
            <span>Popup</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="radio"
              name="toolbar-click-behavior"
              checked={toolbarClickBehavior === "sidePanel"}
              onChange={() => void persistToolbarBehavior("sidePanel")}
              disabled={savingToolbarBehavior}
            />
            <span>Side Panel</span>
          </label>
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <input
            type="checkbox"
            checked={closePopupAfterOpeningSidePanel}
            onChange={(event) =>
              void persistClosePopupAfterOpen(event.target.checked)
            }
          />
          <span>Close popup after opening side panel</span>
        </label>
        <div
          style={{
            fontSize: fontSizes.sm,
            color: colors.textSecondary,
            marginBottom: 8,
          }}
        >
          Chrome side panel side:{" "}
          <strong>{sidePanelLayoutSide ?? "not reported by this Chrome"}</strong>
        </div>
        {sidePanelLayoutSide === "right" && (
          <p
            style={{
              fontSize: fontSizes.sm,
              color: colors.textFaint,
              margin: "0 0 8px",
            }}
          >
            Chrome controls the side panel position. If your browser supports
            it, change side panel position in Chrome settings or the side panel
            UI.
          </p>
        )}
        {toolbarStatus && (
          <p
            style={{
              fontSize: fontSizes.sm,
              color: colors.textSecondary,
              margin: 0,
            }}
          >
            {toolbarStatus}
          </p>
        )}
        {toolbarError && (
          <p
            style={{
              fontSize: fontSizes.sm,
              color: colors.red,
              margin: "8px 0 0",
            }}
          >
            {toolbarError}
          </p>
        )}
      </div>

      <div style={card}>
        <h3 style={cardHeading}>What Is Not Requested</h3>
        <ul style={listStyle}>
          <li>No install-time host permissions such as `https://hh.ru/*`.</li>
          <li>No optional permissions such as `clipboardWrite` or `alarms`.</li>
          <li>
            No install-time API host permissions for OpenAI or deferred
            integrations.
          </li>
        </ul>
        <p
          style={{
            fontSize: fontSizes.sm,
            color: colors.textFaint,
            margin: "8px 0 0",
          }}
        >
          AI remains opt-in. Today only OpenAI is wired through an optional
          runtime host request; deferred integrations stay inactive.
        </p>
      </div>

      <div style={card}>
        <h3 style={cardHeading}>How to Revoke Access</h3>
        <ol style={listStyle}>
          <li>
            Open <code>chrome://extensions/</code> in your browser.
          </li>
          <li>
            Find <strong>VacancyPilot</strong>.
          </li>
          <li>
            Open <strong>Details</strong> to inspect the installed manifest.
          </li>
          <li>
            Disable or remove the extension to revoke all granted permissions.
          </li>
        </ol>
      </div>
    </div>
  );
}
