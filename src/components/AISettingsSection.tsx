import { useState, useCallback, useEffect, type ReactNode } from "react";
import { loadSettings, saveSettings } from "@/db/settings-bridge";
import {
  saveApiKey,
  getApiKey,
  deleteApiKey,
  maskApiKey,
} from "@/db/api-key-bridge";
import type { AppSettings } from "@/models/settings";
import { getBudgetStatus } from "@/services/ai-budget";
import type { BudgetStatus } from "@/services/ai-budget";
import {
  isProviderImplemented,
  providerLabel,
} from "@/services/ai-provider-factory";
import { LoadingState } from "./LoadingState";
import { ErrorState } from "./ErrorState";
import { colors } from "@/styles";

type AIProvider = NonNullable<AppSettings["ai"]["provider"]>;

const PROVIDERS: { id: AIProvider; label: string; implemented: boolean }[] = [
  { id: "openai", label: "OpenAI", implemented: true },
  { id: "mock", label: "Mock (no API key)", implemented: true },
];

// ── Shared styles ──────────────────────────────────────────────────────────

const toggleBase: React.CSSProperties = {
  width: 40,
  height: 22,
  borderRadius: 11,
  position: "relative",
  cursor: "pointer",
  border: "none",
  padding: 0,
  transition: "background 0.2s",
};

function knobLeft(on: boolean): number {
  return on ? 20 : 2;
}

const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  margin: "0 0 4px",
  color: "#1a3a5c",
};

const sectionDesc: React.CSSProperties = {
  fontSize: 12,
  color: "#999",
  margin: "0 0 16px",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 0",
  borderBottom: "1px solid #eee",
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#333",
};

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#999",
  marginTop: 2,
};

const inputStyle: React.CSSProperties = {
  width: 56,
  padding: "4px 8px",
  fontSize: 13,
  border: "1px solid #ccc",
  borderRadius: 4,
  textAlign: "center",
};

const selectStyle: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: 13,
  border: "1px solid #ccc",
  borderRadius: 4,
  background: "#fff",
};

const buttonStyle: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: 12,
  border: "1px solid #ccc",
  borderRadius: 4,
  background: "#f5f5f5",
  cursor: "pointer",
  color: "#333",
};

const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  border: "1px solid #c44",
  color: "#c44",
  background: "#fff5f5",
};

const warningBox: React.CSSProperties = {
  padding: "10px 14px",
  background: "#fff8e6",
  border: "1px solid #e6a817",
  borderRadius: 6,
  marginBottom: 20,
  fontSize: 12,
  color: "#8a6d14",
  lineHeight: 1.5,
};

const infoBox: React.CSSProperties = {
  padding: "8px 12px",
  background: "#f0f7ff",
  border: "1px solid #4a90d9",
  borderRadius: 6,
  marginTop: 12,
  fontSize: 12,
  color: "#2a5885",
  lineHeight: 1.5,
};

const statusBoxBase: React.CSSProperties = {
  marginTop: 16,
  padding: "8px 12px",
  borderRadius: 6,
  fontSize: 12,
};

// ── Component ──────────────────────────────────────────────────────────────

export function AISettingsSection(): ReactNode {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Settings state
  const [provider, setProvider] = useState<AIProvider | undefined>(undefined);
  const [model, setModel] = useState("");
  const [dailyLimit, setDailyLimit] = useState(10);
  const [maxInputChars, setMaxInputChars] = useState(3000);
  const [cache, setCache] = useState(true);

  // API key state
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [storedKeyMasked, setStoredKeyMasked] = useState<string | null>(null);
  const [keySavedMessage, setKeySavedMessage] = useState<string | null>(null);

  // AI master toggle (from privacy.aiEnabled)
  const [aiEnabled, setAiEnabled] = useState(false);

  // Budget status
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatus | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const settings = await loadSettings();

      setAiEnabled(settings.privacy.aiEnabled);
      setProvider(
        settings.ai.provider && isProviderImplemented(settings.ai.provider)
          ? settings.ai.provider
          : settings.ai.provider === "mock"
            ? "mock"
            : settings.ai.provider === "openai"
              ? "openai"
              : undefined,
      );
      setModel(settings.ai.model ?? "");
      setDailyLimit(settings.ai.dailyRequestLimit);
      setMaxInputChars(settings.ai.maxInputChars);
      setCache(settings.ai.enableCache);

      // Load stored API key for current provider
      if (settings.ai.provider && settings.ai.provider !== "mock") {
        const key = await getApiKey(settings.ai.provider);
        setStoredKeyMasked(key ? maskApiKey(key) : null);
      } else {
        setStoredKeyMasked(null);
      }

      // Load budget status
      try {
        const status = await getBudgetStatus();
        setBudgetStatus(status);
      } catch {
        setBudgetStatus(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Clear key-saved message after a timeout
  useEffect(() => {
    if (!keySavedMessage) return;
    const timer = setTimeout(() => setKeySavedMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [keySavedMessage]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleToggleAi = useCallback(async () => {
    setSaving(true);
    try {
      const settings = await loadSettings();
      settings.privacy.aiEnabled = !settings.privacy.aiEnabled;
      await saveSettings(settings);
      setAiEnabled(settings.privacy.aiEnabled);
    } finally {
      setSaving(false);
    }
  }, []);

  const handleProviderChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newProvider = e.target.value as AIProvider | "";
      if (newProvider === "") return;
      if (!isProviderImplemented(newProvider)) {
        setError(
          `${providerLabel(newProvider)} is not implemented yet. Use OpenAI or Mock for now.`,
        );
        return;
      }

      setSaving(true);
      try {
        const settings = await loadSettings();
        settings.ai.provider = newProvider;
        await saveSettings(settings);
        setProvider(newProvider);

        // Load API key for new provider
        if (newProvider !== "mock") {
          const key = await getApiKey(newProvider);
          setStoredKeyMasked(key ? maskApiKey(key) : null);
          setApiKeyInput("");
          setKeySavedMessage(null);
        } else {
          setStoredKeyMasked(null);
          setApiKeyInput("");
          setKeySavedMessage(null);
        }

        // Clear key input on provider switch
        setApiKeyInput("");
        setKeySavedMessage(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save provider");
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const handleModelChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setModel(value);
      setSaving(true);
      try {
        const settings = await loadSettings();
        settings.ai.model = value.trim() || undefined;
        await saveSettings(settings);
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const handleDailyLimitChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Math.max(1, Math.min(100, Number(e.target.value) || 1));
      setDailyLimit(v);
      setSaving(true);
      try {
        const settings = await loadSettings();
        settings.ai.dailyRequestLimit = v;
        await saveSettings(settings);
        // Refresh budget status after limit change
        const status = await getBudgetStatus();
        setBudgetStatus(status);
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const handleMaxInputCharsChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Math.max(500, Math.min(10000, Number(e.target.value) || 500));
      setMaxInputChars(v);
      setSaving(true);
      try {
        const settings = await loadSettings();
        settings.ai.maxInputChars = v;
        await saveSettings(settings);
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const handleToggleCache = useCallback(async () => {
    setSaving(true);
    try {
      const settings = await loadSettings();
      settings.ai.enableCache = !settings.ai.enableCache;
      await saveSettings(settings);
      setCache(settings.ai.enableCache);
    } finally {
      setSaving(false);
    }
  }, []);

  // ── API key handlers ──────────────────────────────────────────────────

  const handleSaveApiKey = useCallback(async () => {
    if (!provider || provider === "mock") return;
    setSaving(true);
    try {
      await saveApiKey(provider, apiKeyInput);
      const key = await getApiKey(provider);
      setStoredKeyMasked(key ? maskApiKey(key) : null);
      setApiKeyInput("");
      setKeySavedMessage("API key saved. Stored locally on this device only.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save API key");
    } finally {
      setSaving(false);
    }
  }, [provider, apiKeyInput]);

  const handleClearApiKey = useCallback(async () => {
    if (!provider || provider === "mock") return;
    setSaving(true);
    try {
      await deleteApiKey(provider);
      setStoredKeyMasked(null);
      setApiKeyInput("");
      setKeySavedMessage("API key removed from local storage.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove API key");
    } finally {
      setSaving(false);
    }
  }, [provider]);

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) return <LoadingState />;

  if (error) {
    return (
      <ErrorState
        message="Failed to load AI settings"
        details={error}
        onRetry={() => {
          setError(null);
          void load();
        }}
      />
    );
  }

  return (
    <div>
      <h2 style={sectionTitle}>AI Settings</h2>
      <p style={sectionDesc}>
        Configure your AI provider and local API key. All data stays on this
        device. No keys are ever sent to any server except the chosen provider.
      </p>

      {/* ── Warning: local storage notice ─────────────────────────────── */}
      <div style={warningBox}>
        <strong>💡 Local storage only:</strong> Your API key is stored in the
        browser's local storage, not in a cloud vault. Anyone with access to
        this device's browser profile can potentially read it. The extension
        never includes keys in exports or logs.
      </div>

      {/* ── AI master toggle ─────────────────────────────────────────── */}
      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>Enable AI features</div>
          <div style={hintStyle}>Master switch for all AI-powered features</div>
        </div>
        <button
          type="button"
          onClick={handleToggleAi}
          disabled={saving}
          style={{
            ...toggleBase,
            background: aiEnabled ? "#4a90d9" : "#ccc",
            opacity: saving ? 0.6 : 1,
            cursor: saving ? "not-allowed" : "pointer",
          }}
          aria-label={aiEnabled ? "Disable AI" : "Enable AI"}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#fff",
              position: "absolute",
              top: 2,
              left: knobLeft(aiEnabled),
              transition: "left 0.2s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }}
          />
        </button>
      </div>

      {/* ── Provider selection ────────────────────────────────────────── */}
      <div
        style={aiEnabled ? rowStyle : { ...rowStyle, color: colors.textFaint }}
      >
        <div>
          <div style={labelStyle}>AI Provider</div>
          <div style={hintStyle}>
            Select which AI service to use for analysis and cover letters
          </div>
        </div>
        <select
          value={provider ?? ""}
          onChange={handleProviderChange}
          disabled={saving || !aiEnabled}
          style={selectStyle}
          aria-label="AI provider"
        >
          <option value="" disabled>
            Select provider…
          </option>
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.implemented}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ ...hintStyle, marginTop: -6, marginBottom: 12 }}>
        Current build supports <strong>OpenAI</strong> and <strong>Mock</strong>
        . Other providers are not exposed until their integration is implemented.
      </div>

      {/* ── Model ─────────────────────────────────────────────────────── */}
      {provider && provider !== "mock" && (
        <div
          style={
            aiEnabled ? rowStyle : { ...rowStyle, color: colors.textFaint }
          }
        >
          <div>
            <div style={labelStyle}>Model</div>
            <div style={hintStyle}>Model name (for example, gpt-4o)</div>
          </div>
          <input
            type="text"
            value={model}
            onChange={handleModelChange}
            disabled={saving || !aiEnabled}
            placeholder="gpt-4o"
            style={{
              ...inputStyle,
              width: 160,
              textAlign: "left",
            }}
            aria-label="Model name"
          />
        </div>
      )}

      {/* ── API key ───────────────────────────────────────────────────── */}
      {provider && provider !== "mock" && (
        <div
          style={{
            padding: "10px 0",
            borderBottom: "1px solid #eee",
            color: aiEnabled ? undefined : colors.textFaint,
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <div style={labelStyle}>API Key</div>
            <div style={hintStyle}>
              Your key is stored locally and never shared. Leave empty to keep
              the current key.
            </div>
          </div>

          {storedKeyMasked ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontFamily: "monospace",
                  background: "#f0f7e6",
                  padding: "2px 8px",
                  borderRadius: 4,
                  color: "#2a8",
                }}
              >
                Saved: {storedKeyMasked}
              </span>
              <button
                type="button"
                onClick={handleClearApiKey}
                disabled={saving || !aiEnabled}
                style={dangerButtonStyle}
              >
                Remove key
              </button>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "#999", fontStyle: "italic" }}>
              No API key saved for this provider.
            </span>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 8,
            }}
          >
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              disabled={saving || !aiEnabled}
              placeholder={
                storedKeyMasked
                  ? "Enter new key to replace"
                  : "Paste your API key"
              }
              style={{
                flex: 1,
                maxWidth: 340,
                padding: "4px 8px",
                fontSize: 13,
                border: "1px solid #ccc",
                borderRadius: 4,
                fontFamily: "monospace",
              }}
              aria-label="API key input"
            />
            <button
              type="button"
              onClick={handleSaveApiKey}
              disabled={saving || !aiEnabled || apiKeyInput.trim().length === 0}
              style={{
                ...buttonStyle,
                background: apiKeyInput.trim().length > 0 ? "#4a90d9" : "#eee",
                color: apiKeyInput.trim().length > 0 ? "#fff" : "#999",
                borderColor: apiKeyInput.trim().length > 0 ? "#4a90d9" : "#ccc",
                cursor:
                  apiKeyInput.trim().length > 0 ? "pointer" : "not-allowed",
              }}
            >
              Save key
            </button>
          </div>

          {keySavedMessage && <div style={infoBox}>{keySavedMessage}</div>}
        </div>
      )}

      {/* ── Mock provider notice ──────────────────────────────────────── */}
      {provider === "mock" && (
        <div
          style={
            aiEnabled ? rowStyle : { ...rowStyle, color: colors.textFaint }
          }
        >
          <div>
            <div style={labelStyle}>Mock provider</div>
            <div style={hintStyle}>
              Uses deterministic local logic. No API key required, no network
              calls. Use for testing or offline work.
            </div>
          </div>
        </div>
      )}

      {/* ── Daily request limit ───────────────────────────────────────── */}
      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>Daily request limit</div>
          <div style={hintStyle}>
            Maximum AI requests per day to control usage
          </div>
        </div>
        <input
          type="number"
          min={1}
          max={100}
          value={dailyLimit}
          onChange={handleDailyLimitChange}
          disabled={saving}
          style={inputStyle}
          aria-label="Daily request limit"
        />
      </div>

      {/* ── Budget status ─────────────────────────────────────────────── */}
      {aiEnabled && budgetStatus && (
        <div style={rowStyle}>
          <div>
            <div style={labelStyle}>Today's usage</div>
            <div style={hintStyle}>
              {budgetStatus.used} of {budgetStatus.limit} requests used today
            </div>
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: budgetStatus.isExhausted ? "#d33" : "#2a8",
            }}
          >
            {budgetStatus.isExhausted
              ? "Limit reached"
              : `${budgetStatus.remaining} remaining`}
          </div>
        </div>
      )}

      {/* ── Max input chars ───────────────────────────────────────────── */}
      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>Max input characters</div>
          <div style={hintStyle}>
            Truncate vacancy text sent to AI (privacy & cost)
          </div>
        </div>
        <input
          type="number"
          min={500}
          max={10000}
          step={100}
          value={maxInputChars}
          onChange={handleMaxInputCharsChange}
          disabled={saving}
          style={{ ...inputStyle, width: 72 }}
          aria-label="Max input characters"
        />
      </div>

      {/* ── Cache toggle ──────────────────────────────────────────────── */}
      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>Enable response cache</div>
          <div style={hintStyle}>
            Cache AI responses locally to avoid redundant API calls
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggleCache}
          disabled={saving}
          style={{
            ...toggleBase,
            background: cache ? "#4a90d9" : "#ccc",
            opacity: saving ? 0.6 : 1,
            cursor: saving ? "not-allowed" : "pointer",
          }}
          aria-label={cache ? "Disable cache" : "Enable cache"}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#fff",
              position: "absolute",
              top: 2,
              left: knobLeft(cache),
              transition: "left 0.2s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }}
          />
        </button>
      </div>

      {/* ── Status summary ────────────────────────────────────────────── */}
      <div
        style={{
          ...statusBoxBase,
          background: aiEnabled ? "#e6f7e6" : "#f5f5f5",
          color: aiEnabled ? "#2a8" : "#999",
        }}
      >
        AI status:{" "}
        <strong>
          {aiEnabled
            ? provider
              ? `Enabled — using ${PROVIDERS.find((p) => p.id === provider)?.label ?? provider}`
              : "Enabled — no provider selected"
            : "Disabled"}
        </strong>
        {aiEnabled && provider && provider !== "mock" && (
          <span style={{ marginLeft: 8, fontSize: 11, color: "#888" }}>
            Key: {storedKeyMasked ? "configured" : "not set"}
          </span>
        )}
      </div>
    </div>
  );
}
