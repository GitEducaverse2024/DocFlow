'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Key,
  Globe,
  Upload,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Sparkles,
  HelpCircle,
  Eye,
  EyeOff,
  FileJson2,
} from 'lucide-react';
import { toast } from 'sonner';
import { DriveFolderPicker } from './drive-folder-picker';
import type { WizardCredentials } from './drive-folder-picker';

/* ─── Types ─── */

interface GoogleDriveWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

type AuthMode = 'service_account' | 'oauth2';
type TestLineStatus = 'pending' | 'running' | 'ok' | 'error';

interface TestLine {
  label: string;
  status: TestLineStatus;
  message?: string;
}

/* ─── Component ─── */

export function GoogleDriveWizard({ open, onClose, onCreated }: GoogleDriveWizardProps) {
  const t = useTranslations('connectors');

  const STEP_LABELS = t.raw('drive.steps') as string[];

  // Step management
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Auth mode
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  // Step 2 SA: Service Account
  const [saConnectorName, setSaConnectorName] = useState('');
  const [saJsonParsed, setSaJsonParsed] = useState<Record<string, unknown> | null>(null);
  const [saEmail, setSaEmail] = useState('');
  const [saJsonRaw, setSaJsonRaw] = useState('');
  const [saFolderId, setSaFolderId] = useState('');
  const [saFolderName, setSaFolderName] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Step 2 OAuth2
  const [oauthConnectorName, setOauthConnectorName] = useState('');
  const [oauthEmail, setOauthEmail] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [generatingUrl, setGeneratingUrl] = useState(false);
  const [authUrl, setAuthUrl] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [exchanging, setExchanging] = useState(false);
  const [oauthResult, setOauthResult] = useState<{
    refresh_token_encrypted: string;
    client_secret_encrypted: string;
    client_id: string;
    email: string;
  } | null>(null);
  const [oauthVerifyLines, setOauthVerifyLines] = useState<TestLine[]>([]);
  const [oauthError, setOauthError] = useState('');
  const [oauthFolderId, setOauthFolderId] = useState('');
  const [oauthFolderName, setOauthFolderName] = useState('');

  // Step 3: Connection test
  const [testLines, setTestLines] = useState<TestLine[]>([]);
  const [testRunning, setTestRunning] = useState(false);
  const [draftConnectorId, setDraftConnectorId] = useState<string | null>(null);
  const [testFilesCount, setTestFilesCount] = useState<number | null>(null);

  // Step 4: Saving
  const [saving, setSaving] = useState(false);

  /* ─── Reset on close ─── */

  useEffect(() => {
    if (!open) {
      setStep(1);
      setAuthMode(null);
      setSaConnectorName('');
      setSaJsonParsed(null);
      setSaEmail('');
      setSaJsonRaw('');
      setSaFolderId('');
      setSaFolderName('');
      setHelpOpen(false);
      setDragOver(false);
      setOauthConnectorName('');
      setOauthEmail('');
      setClientId('');
      setClientSecret('');
      setShowPassword(false);
      setShowInstructions(false);
      setGeneratingUrl(false);
      setAuthUrl('');
      setAuthCode('');
      setExchanging(false);
      setOauthResult(null);
      setOauthVerifyLines([]);
      setOauthError('');
      setOauthFolderId('');
      setOauthFolderName('');
      setTestLines([]);
      setTestRunning(false);
      setTestFilesCount(null);
      setSaving(false);
      // Clean up draft connector if it exists
      if (draftConnectorId) {
        fetch(`/api/connectors/${draftConnectorId}`, { method: 'DELETE' }).catch(() => {});
      }
      setDraftConnectorId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ─── SA: Parse JSON file ─── */

  const handleSaJsonFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed.client_email || !parsed.private_key) {
          toast.error(t('drive.toasts.jsonInvalid'));
          return;
        }
        setSaJsonParsed(parsed);
        setSaEmail(parsed.client_email);
        setSaJsonRaw(text);
        toast.success(t('drive.step2sa.jsonUploaded'));
      } catch {
        toast.error(t('drive.toasts.jsonInvalid'));
      }
    };
    reader.readAsText(file);
  }, [t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.json')) {
      handleSaJsonFile(file);
    } else {
      toast.error(t('drive.toasts.jsonInvalid'));
    }
  }, [handleSaJsonFile, t]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleSaJsonFile(file);
  }, [handleSaJsonFile]);

  /* ─── OAuth2: Generate auth URL ─── */

  const handleGenerateAuthUrl = useCallback(async () => {
    if (!clientId.trim()) {
      toast.error(t('drive.step2oauth.clientIdRequired'));
      return;
    }
    if (!clientSecret.trim()) {
      toast.error(t('drive.step2oauth.clientSecretRequired'));
      return;
    }

    setGeneratingUrl(true);
    setOauthError('');

    try {
      const params = new URLSearchParams({
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
      });
      const res = await fetch(`/api/connectors/google-drive/oauth2/auth-url?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('drive.step2oauth.urlGenerateError'));
      setAuthUrl(data.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('drive.step2oauth.urlGenerateError'));
    } finally {
      setGeneratingUrl(false);
    }
  }, [clientId, clientSecret, t]);

  /* ─── OAuth2: Exchange code for tokens ─── */

  const handleExchangeCode = useCallback(async () => {
    if (!authCode.trim()) return;

    setExchanging(true);
    setOauthError('');
    setOauthVerifyLines([]);

    const lines: TestLine[] = [
      { label: t('drive.step2oauth.codeVerified'), status: 'running' },
      { label: t('drive.step2oauth.tokensObtained'), status: 'pending' },
      { label: t('drive.step2oauth.driveAccessConfirmed'), status: 'pending' },
    ];
    setOauthVerifyLines([...lines]);

    try {
      const res = await fetch('/api/connectors/google-drive/oauth2/exchange-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: authCode.trim(),
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('drive.step2oauth.authError'));

      lines[0] = { ...lines[0], status: 'ok' };
      setOauthVerifyLines([...lines]);
      await new Promise((r) => setTimeout(r, 500));

      lines[1] = { ...lines[1], status: 'running' };
      setOauthVerifyLines([...lines]);
      await new Promise((r) => setTimeout(r, 500));
      lines[1] = { ...lines[1], status: 'ok' };
      setOauthVerifyLines([...lines]);
      await new Promise((r) => setTimeout(r, 500));

      lines[2] = { ...lines[2], status: 'running' };
      setOauthVerifyLines([...lines]);
      await new Promise((r) => setTimeout(r, 500));
      lines[2] = { ...lines[2], status: 'ok' };
      setOauthVerifyLines([...lines]);

      setOauthResult({
        refresh_token_encrypted: data.refresh_token_encrypted,
        client_secret_encrypted: data.client_secret_encrypted,
        client_id: data.client_id || clientId,
        email: data.email || oauthEmail,
      });

      if (data.email) {
        setOauthEmail(data.email);
      }

      toast.success(t('drive.toasts.authSuccess'));
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : t('drive.step2oauth.authError');
      setOauthError(errMsg);
      const runningIdx = lines.findIndex((l) => l.status === 'running');
      if (runningIdx >= 0) {
        lines[runningIdx] = { ...lines[runningIdx], status: 'error' };
        setOauthVerifyLines([...lines]);
      }
    } finally {
      setExchanging(false);
    }
  }, [authCode, clientId, clientSecret, oauthEmail, t]);

  /* ─── Step 3: Create draft connector + run test ─── */

  const createDraftAndTest = useCallback(async () => {
    setTestRunning(true);
    setTestFilesCount(null);

    const lines: TestLine[] = [
      { label: t('drive.step3.authenticating'), status: 'pending' },
      { label: t('drive.step3.listingFiles'), status: 'pending' },
      { label: t('drive.step3.verifyingPermissions'), status: 'pending' },
    ];
    setTestLines([...lines]);

    const updateLine = (idx: number, update: Partial<TestLine>) => {
      lines[idx] = { ...lines[idx], ...update };
      setTestLines([...lines]);
    };

    try {
      // Phase 1: Authenticating
      updateLine(0, { status: 'running' });

      // Create draft connector if not existing
      let connId = draftConnectorId;
      if (!connId) {
        const body: Record<string, unknown> = {
          name: authMode === 'service_account'
            ? (saConnectorName || saEmail || 'Google Drive SA')
            : (oauthConnectorName || oauthEmail || 'Google Drive'),
          type: 'google_drive',
          emoji: '\uD83D\uDCC1',
          auth_mode: authMode,
          is_active: 0,
        };

        if (authMode === 'service_account') {
          body.sa_credentials = saJsonRaw;
          body.sa_email = saEmail;
          if (saFolderId) {
            body.root_folder_id = saFolderId;
            body.root_folder_name = saFolderName;
          }
        } else if (oauthResult) {
          body.client_id = oauthResult.client_id;
          body.client_secret_encrypted = oauthResult.client_secret_encrypted;
          body.refresh_token_encrypted = oauthResult.refresh_token_encrypted;
          body.oauth2_email = oauthResult.email || oauthEmail;
          if (oauthFolderId) {
            body.root_folder_id = oauthFolderId;
            body.root_folder_name = oauthFolderName;
          }
        }

        const createRes = await fetch('/api/connectors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const createData = await createRes.json();
        if (!createRes.ok) throw new Error(createData.error || 'Error creating draft');
        connId = createData.id;
        setDraftConnectorId(connId);
      }

      await new Promise((r) => setTimeout(r, 1000));
      updateLine(0, { status: 'ok', label: t('drive.step3.authenticated') });

      // Phase 2: Listing files
      updateLine(1, { status: 'running' });
      await new Promise((r) => setTimeout(r, 800));

      // Run the test
      const testRes = await fetch(`/api/connectors/${connId}/test`, {
        method: 'POST',
      });
      const testData = await testRes.json();

      if (!testRes.ok || testData.test_status === 'failed') {
        updateLine(1, { status: 'error', message: testData.message || t('drive.step3.testFailed') });
        setTestRunning(false);
        return;
      }

      updateLine(1, { status: 'ok', label: t('drive.step3.filesListed') });

      // Phase 3: Verifying permissions
      updateLine(2, { status: 'running' });
      await new Promise((r) => setTimeout(r, 800));
      updateLine(2, { status: 'ok', label: t('drive.step3.permissionsVerified') });

      // Extract files count if available from test response
      if (testData.files_count !== undefined) {
        setTestFilesCount(testData.files_count);
      }
    } catch (e) {
      const runningIdx = lines.findIndex((l) => l.status === 'running');
      if (runningIdx >= 0) {
        updateLine(runningIdx, {
          status: 'error',
          message: e instanceof Error ? e.message : t('drive.step3.testFailed'),
        });
      }
    } finally {
      setTestRunning(false);
    }
  }, [
    authMode, draftConnectorId, saConnectorName, saEmail, saJsonRaw,
    saFolderId, saFolderName, oauthConnectorName, oauthEmail, oauthResult,
    oauthFolderId, oauthFolderName, t,
  ]);

  // Auto-run test when entering step 3
  useEffect(() => {
    if (step === 3) {
      createDraftAndTest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const allTestsPassed = testLines.length > 0 && testLines.every((l) => l.status === 'ok');

  /* ─── Step 4: Activate connector ─── */

  const handleActivateConnector = useCallback(async () => {
    if (!draftConnectorId) return;

    setSaving(true);
    try {
      const name = authMode === 'service_account'
        ? (saConnectorName || saEmail || 'Google Drive SA')
        : (oauthConnectorName || oauthResult?.email || oauthEmail || 'Google Drive');

      const fId = authMode === 'service_account' ? saFolderId : oauthFolderId;
      const fName = authMode === 'service_account' ? saFolderName : oauthFolderName;

      const config: Record<string, unknown> = {};
      if (fId) {
        config.root_folder_id = fId;
        config.root_folder_name = fName;
      }

      const body: Record<string, unknown> = {
        name,
        is_active: 1,
        ...(Object.keys(config).length > 0 ? { config } : {}),
      };

      const res = await fetch(`/api/connectors/${draftConnectorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || t('drive.toasts.createError'));
      }

      // Clear draft so cleanup on close doesn't delete it
      setDraftConnectorId(null);
      toast.success(t('drive.toasts.created'));
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('drive.toasts.createError'));
    } finally {
      setSaving(false);
    }
  }, [
    authMode, draftConnectorId, saConnectorName, saEmail,
    oauthConnectorName, oauthResult, oauthEmail,
    saFolderId, saFolderName, oauthFolderId, oauthFolderName,
    t, onCreated, onClose,
  ]);

  /* ─── Cleanup draft on cancel ─── */

  const handleCancel = useCallback(() => {
    if (draftConnectorId) {
      fetch(`/api/connectors/${draftConnectorId}`, { method: 'DELETE' }).catch(() => {});
      setDraftConnectorId(null);
    }
    onClose();
  }, [draftConnectorId, onClose]);

  /* ─── Credentials for folder picker (OAuth2 only) ─── */

  const wizardCredentials: WizardCredentials | undefined = oauthResult
    ? {
        client_id: oauthResult.client_id,
        client_secret_encrypted: oauthResult.client_secret_encrypted,
        refresh_token_encrypted: oauthResult.refresh_token_encrypted,
      }
    : undefined;

  /* ─── Step validation ─── */

  const canGoNext = (): boolean => {
    if (step === 1) return !!authMode;
    if (step === 2) {
      if (authMode === 'service_account') {
        return !!saJsonParsed;
      }
      // OAuth2: must have completed code exchange
      return !!oauthResult;
    }
    if (step === 3) return allTestsPassed;
    return true;
  };

  /* ─── Render: Progress bar ─── */

  const renderProgressBar = () => (
    <div className="flex items-center justify-between px-2 mb-6">
      {STEP_LABELS.map((label, i) => {
        const stepNum = i + 1;
        const isActive = step === stepNum;
        const isComplete = step > stepNum;
        return (
          <div key={label} className="flex flex-col items-center gap-1.5 flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-sky-500 text-white'
                  : isComplete
                    ? 'bg-sky-500/20 text-sky-400'
                    : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              {isComplete ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                stepNum
              )}
            </div>
            <span
              className={`text-[10px] font-medium ${
                isActive ? 'text-sky-400' : isComplete ? 'text-sky-400/60' : 'text-zinc-500'
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );

  /* ─── Render: Step 1 — Auth type selection ─── */

  const renderStep1 = () => (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">{t('drive.step1.instruction')}</p>
      <div className="grid grid-cols-2 gap-3">
        {/* Service Account */}
        <button
          onClick={() => setAuthMode('service_account')}
          className={`text-left p-4 rounded-lg border transition-all ${
            authMode === 'service_account'
              ? 'border-sky-500/50 bg-sky-500/10 ring-1 ring-sky-500/30'
              : 'border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-2 rounded-lg ${authMode === 'service_account' ? 'bg-sky-500/20' : 'bg-zinc-800'}`}>
              <Key className={`w-5 h-5 ${authMode === 'service_account' ? 'text-sky-400' : 'text-zinc-400'}`} />
            </div>
            <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
              {t('drive.step1.saRecommended')}
            </Badge>
          </div>
          <p className={`font-medium text-sm mb-1 ${authMode === 'service_account' ? 'text-sky-300' : 'text-zinc-200'}`}>
            {t('drive.step1.saTitle')}
          </p>
          <p className="text-xs text-zinc-500">
            {t('drive.step1.saDescription')}
          </p>
        </button>

        {/* OAuth2 */}
        <button
          onClick={() => setAuthMode('oauth2')}
          className={`text-left p-4 rounded-lg border transition-all ${
            authMode === 'oauth2'
              ? 'border-sky-500/50 bg-sky-500/10 ring-1 ring-sky-500/30'
              : 'border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-2 rounded-lg ${authMode === 'oauth2' ? 'bg-sky-500/20' : 'bg-zinc-800'}`}>
              <Globe className={`w-5 h-5 ${authMode === 'oauth2' ? 'text-sky-400' : 'text-zinc-400'}`} />
            </div>
          </div>
          <p className={`font-medium text-sm mb-1 ${authMode === 'oauth2' ? 'text-sky-300' : 'text-zinc-200'}`}>
            {t('drive.step1.oauthTitle')}
          </p>
          <p className="text-xs text-zinc-500">
            {t('drive.step1.oauthDescription')}
          </p>
        </button>
      </div>
    </div>
  );

  /* ─── Render: Step 2 SA — Service Account credentials ─── */

  const renderStep2SA = () => {
    const helpSteps = t.raw('drive.step2sa.helpSteps') as string[];

    return (
      <div className="space-y-4">
        {/* Connector name */}
        <div>
          <Label className="text-xs text-zinc-400 mb-1 block">
            {t('drive.step2sa.connectorName')}
          </Label>
          <Input
            value={saConnectorName}
            onChange={(e) => setSaConnectorName(e.target.value)}
            placeholder={t('drive.step2sa.connectorNamePlaceholder')}
            className="bg-zinc-900 border-zinc-800 text-zinc-50"
          />
        </div>

        {/* Drag-drop zone */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs text-zinc-400">
              {t('drive.step2sa.dropZoneLabel')}
            </Label>
            <button
              type="button"
              onClick={() => setHelpOpen(!helpOpen)}
              className="p-1 text-zinc-500 hover:text-sky-400 transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>

          {!saJsonParsed ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                dragOver
                  ? 'border-sky-500 bg-sky-500/10'
                  : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-800/50'
              }`}
            >
              <Upload className={`w-8 h-8 mx-auto mb-2 ${dragOver ? 'text-sky-400' : 'text-zinc-500'}`} />
              <p className="text-sm text-zinc-400">{t('drive.step2sa.dropZoneLabel')}</p>
              <p className="text-xs text-zinc-600 mt-1">{t('drive.step2sa.dropZoneHint')}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
              <FileJson2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-emerald-400 font-medium">{t('drive.step2sa.jsonUploaded')}</p>
                <p className="text-xs text-zinc-400 truncate">{saEmail}</p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            </div>
          )}
        </div>

        {/* SA email (read-only) */}
        {saJsonParsed && (
          <div>
            <Label className="text-xs text-zinc-400 mb-1 block">
              {t('drive.step2sa.saEmailLabel')}
            </Label>
            <Input
              value={saEmail}
              readOnly
              className="bg-zinc-900/50 border-zinc-800 text-zinc-300 font-mono text-xs"
            />
          </div>
        )}

        {/* Root folder (no picker for SA until draft connector exists -- will be in step 4) */}
        {/* SA folder picker requires a created connector, so we skip it here */}

        {/* Help modal */}
        {helpOpen && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-200">{t('drive.step2sa.helpTitle')}</h3>
              <button onClick={() => setHelpOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <ol className="text-xs text-zinc-400 space-y-1.5 list-decimal list-inside">
              {helpSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
    );
  };

  /* ─── Render: Step 2 OAuth2 — OAuth2 credentials ─── */

  const renderStep2OAuth = () => {
    const instructions = t.raw('drive.step2oauth.instructions') as string[];
    const authInstructions = t.raw('drive.step2oauth.authInstructions') as string[];
    const allVerified = oauthVerifyLines.length > 0 && oauthVerifyLines.every((l) => l.status === 'ok');

    return (
      <div className="space-y-4">
        {/* Connector name */}
        <div>
          <Label className="text-xs text-zinc-400 mb-1 block">
            {t('drive.step2oauth.connectorName')}
          </Label>
          <Input
            value={oauthConnectorName}
            onChange={(e) => setOauthConnectorName(e.target.value)}
            placeholder={t('drive.step2oauth.connectorNamePlaceholder')}
            className="bg-zinc-900 border-zinc-800 text-zinc-50"
          />
        </div>

        {/* Email */}
        <div>
          <Label className="text-xs text-zinc-400 mb-1 block">
            {t('drive.step2oauth.email')}
          </Label>
          <Input
            type="email"
            value={oauthEmail}
            onChange={(e) => setOauthEmail(e.target.value)}
            placeholder={t('drive.step2oauth.emailPlaceholder')}
            className="bg-zinc-900 border-zinc-800 text-zinc-50"
          />
        </div>

        {/* Client ID */}
        <div>
          <Label className="text-xs text-zinc-400 mb-1 block">
            {t('drive.step2oauth.clientId')} <span className="text-red-400">*</span>
          </Label>
          <Input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={t('drive.step2oauth.clientIdPlaceholder')}
            className="bg-zinc-900 border-zinc-800 text-zinc-50 font-mono text-xs"
            disabled={!!oauthResult}
          />
        </div>

        {/* Client Secret */}
        <div>
          <Label className="text-xs text-zinc-400 mb-1 block">
            {t('drive.step2oauth.clientSecret')} <span className="text-red-400">*</span>
          </Label>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={t('drive.step2oauth.clientSecretPlaceholder')}
              className="bg-zinc-900 border-zinc-800 text-zinc-50 font-mono text-xs pr-10"
              disabled={!!oauthResult}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Reuse note */}
        <div className="p-3 bg-sky-500/5 border border-sky-500/20 rounded-lg">
          <p className="text-xs text-zinc-400">
            {t('drive.step2oauth.reuseNote')}
          </p>
        </div>

        {/* Generate URL + Auth flow */}
        {!authUrl && !oauthResult && (
          <Button
            onClick={handleGenerateAuthUrl}
            disabled={generatingUrl || !clientId.trim() || !clientSecret.trim()}
            className="w-full bg-sky-600 hover:bg-sky-500 text-white"
          >
            {generatingUrl && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {generatingUrl ? t('drive.step2oauth.generatingUrl') : t('drive.step2oauth.generateAuthUrl')}
            {!generatingUrl && <ExternalLink className="w-4 h-4 ml-2" />}
          </Button>
        )}

        {/* Auth URL generated: show open browser + code input */}
        {authUrl && !oauthResult && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                onClick={() => window.open(authUrl, '_blank')}
                className="flex-1 bg-sky-600 hover:bg-sky-500 text-white"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                {t('drive.step2oauth.openBrowser')}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(authUrl);
                  toast.success(t('drive.step2oauth.urlCopied'));
                }}
                className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg">
              <ol className="text-xs text-zinc-400 space-y-1.5 list-decimal list-inside">
                {authInstructions.map((instr, i) => (
                  <li key={i}>{instr}</li>
                ))}
              </ol>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-zinc-400 block">{t('drive.step2oauth.codeLabel')}</Label>
              <Input
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                placeholder="4/0AY0e-g7..."
                className="bg-zinc-900 border-zinc-800 text-zinc-50 font-mono text-xs"
              />
              <Button
                onClick={handleExchangeCode}
                disabled={exchanging || !authCode.trim()}
                className="w-full bg-sky-600 hover:bg-sky-500 text-white"
              >
                {exchanging && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('drive.step2oauth.verifyAndConnect')}
              </Button>
            </div>
          </div>
        )}

        {/* OAuth verify lines */}
        {oauthVerifyLines.length > 0 && (
          <div className="space-y-3 bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
            {oauthVerifyLines.map((line, i) => (
              <div key={i} className="flex items-center gap-3">
                {line.status === 'pending' && (
                  <div className="w-5 h-5 rounded-full bg-zinc-800 shrink-0" />
                )}
                {line.status === 'running' && (
                  <Loader2 className="w-5 h-5 text-sky-400 animate-spin shrink-0" />
                )}
                {line.status === 'ok' && (
                  <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0" />
                )}
                {line.status === 'error' && (
                  <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                )}
                <p className={`text-sm ${
                  line.status === 'ok' ? 'text-sky-400' :
                  line.status === 'error' ? 'text-red-400' :
                  line.status === 'running' ? 'text-zinc-200' :
                  'text-zinc-500'
                }`}>
                  {line.label}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* OAuth error */}
        {oauthError && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-400">{oauthError}</p>
          </div>
        )}

        {/* Root folder picker (only after auth) */}
        {oauthResult && (
          <div className="space-y-2">
            <Label className="text-xs text-zinc-400 block">{t('drive.step2oauth.rootFolder')}</Label>
            <p className="text-xs text-zinc-500">{t('drive.step2oauth.rootFolderHint')}</p>
            {wizardCredentials ? (
              <DriveFolderPicker
                credentials={wizardCredentials}
                value={oauthFolderId}
                valueName={oauthFolderName}
                onChange={(id, name) => {
                  setOauthFolderId(id);
                  setOauthFolderName(name);
                }}
              />
            ) : null}
          </div>
        )}

        {/* Collapsible instructions */}
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="w-full flex items-center justify-between p-3 text-left hover:bg-zinc-800/50 transition-colors"
          >
            <span className="text-xs text-zinc-400 font-medium">{t('drive.step2oauth.instructionsTitle')}</span>
            {showInstructions ? (
              <ChevronUp className="w-4 h-4 text-zinc-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-500" />
            )}
          </button>
          {showInstructions && (
            <div className="px-3 pb-3 space-y-1.5">
              <ol className="text-xs text-zinc-400 space-y-1.5 list-decimal list-inside">
                {instructions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ─── Render: Step 3 — Animated connection test ─── */

  const renderStep3 = () => (
    <div className="space-y-4">
      {/* Test lines */}
      <div className="space-y-3 bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
        {testLines.map((line, i) => (
          <div key={i} className="flex items-center gap-3">
            {line.status === 'pending' && (
              <div className="w-5 h-5 rounded-full bg-zinc-800 shrink-0" />
            )}
            {line.status === 'running' && (
              <Loader2 className="w-5 h-5 text-sky-400 animate-spin shrink-0" />
            )}
            {line.status === 'ok' && (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            )}
            {line.status === 'error' && (
              <XCircle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${
                line.status === 'ok' ? 'text-emerald-400' :
                line.status === 'error' ? 'text-red-400' :
                line.status === 'running' ? 'text-zinc-200' :
                'text-zinc-500'
              }`}>
                {line.label}
              </p>
              {line.message && (
                <p className="text-xs text-red-400/80 mt-0.5">{line.message}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Success message */}
      {allTestsPassed && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-400">{t('drive.step3.success')}</p>
        </div>
      )}

      {/* Error + retry */}
      {!testRunning && testLines.some((l) => l.status === 'error') && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{t('drive.step3.error')}</p>
          </div>
          <Button
            onClick={() => {
              setTestLines([]);
              setTestRunning(false);
              createDraftAndTest();
            }}
            variant="outline"
            className="w-full bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            {t('drive.step3.retry')}
          </Button>
        </div>
      )}
    </div>
  );

  /* ─── Render: Step 4 — Confirmation ─── */

  const renderStep4 = () => {
    const displayEmail = authMode === 'service_account'
      ? saEmail
      : (oauthResult?.email || oauthEmail);
    const displayName = authMode === 'service_account'
      ? (saConnectorName || saEmail)
      : (oauthConnectorName || displayEmail);
    const displayFolder = authMode === 'service_account' ? saFolderName : oauthFolderName;

    return (
      <div className="space-y-5">
        {/* Emerald badge */}
        <div className="flex justify-center">
          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-4 py-1.5 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            {t('drive.step4.ready')}
          </Badge>
        </div>

        {/* Summary card */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-medium text-zinc-200">{t('drive.step4.summaryTitle')}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">{t('drive.step4.nameLabel')}</span>
              <span className="text-zinc-200">{displayName || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">{t('drive.step4.authModeLabel')}</span>
              <span className="text-zinc-200">
                {authMode === 'service_account'
                  ? t('drive.step4.saLabel')
                  : t('drive.step4.oauthLabel')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">{t('drive.step4.emailLabel')}</span>
              <span className="text-zinc-200 truncate ml-4">{displayEmail || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">{t('drive.step4.folderLabel')}</span>
              <span className="text-zinc-200">{displayFolder || t('drive.step4.fullDrive')}</span>
            </div>
            {testFilesCount !== null && (
              <div className="flex justify-between">
                <span className="text-zinc-500">{t('drive.step4.filesFound', { count: testFilesCount })}</span>
              </div>
            )}
          </div>
        </div>

        {/* Usage snippets */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{t('drive.step4.usageTitle')}</h3>
          <div className="space-y-2">
            <div className="flex items-start gap-2 p-3 bg-zinc-900/30 rounded-lg border border-zinc-800/50">
              <Sparkles className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-zinc-300">Canvas</p>
                <p className="text-xs text-zinc-500">{t('drive.step4.usageCanvas')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 bg-zinc-900/30 rounded-lg border border-zinc-800/50">
              <Sparkles className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-zinc-300">CatPaw</p>
                <p className="text-xs text-zinc-500">{t('drive.step4.usageCatPaw')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 bg-zinc-900/30 rounded-lg border border-zinc-800/50">
              <Sparkles className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-zinc-300">CatBrain</p>
                <p className="text-xs text-zinc-500">{t('drive.step4.usageCatBrain')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ─── Render: Navigation footer ─── */

  const renderFooter = () => (
    <div className="flex items-center justify-between pt-4 mt-4 border-t border-zinc-800">
      {step > 1 && step < 3 ? (
        <Button
          variant="ghost"
          onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
          className="text-zinc-400 hover:text-zinc-200"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          {t('drive.nav.back')}
        </Button>
      ) : step === 1 ? (
        <Button
          variant="ghost"
          onClick={handleCancel}
          className="text-zinc-400 hover:text-zinc-200"
        >
          {t('drive.nav.cancel')}
        </Button>
      ) : (
        <div />
      )}

      {step < 3 ? (
        <Button
          onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
          disabled={!canGoNext()}
          className="bg-sky-600 hover:bg-sky-500 text-white"
        >
          {t('drive.nav.next')}
        </Button>
      ) : step === 3 ? (
        <Button
          onClick={() => setStep(4)}
          disabled={!allTestsPassed}
          className="bg-sky-600 hover:bg-sky-500 text-white"
        >
          {t('drive.nav.next')}
        </Button>
      ) : (
        <Button
          onClick={handleActivateConnector}
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {t('drive.nav.create')}
        </Button>
      )}
    </div>
  );

  /* ─── Main render ─── */

  const stepTitles: Record<number, string> = {
    1: t('drive.stepTitles.1'),
    2: t('drive.stepTitles.2'),
    3: t('drive.stepTitles.3'),
    4: t('drive.stepTitles.4'),
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCancel(); }}>
      <DialogContent className="max-w-2xl w-[90vw] bg-zinc-950 border-zinc-800 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg text-zinc-50 flex items-center gap-2">
            <span className="text-xl">{'\uD83D\uDCC1'}</span>
            {stepTitles[step]}
          </DialogTitle>
        </DialogHeader>

        {renderProgressBar()}

        {step === 1 && renderStep1()}
        {step === 2 && authMode === 'service_account' && renderStep2SA()}
        {step === 2 && authMode === 'oauth2' && renderStep2OAuth()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}

        {renderFooter()}
      </DialogContent>
    </Dialog>
  );
}
