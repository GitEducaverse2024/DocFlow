'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Mail,
  Building2,
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
  AlertTriangle,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

/* ─── Types ─── */

interface GmailWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

type AccountType = 'personal' | 'workspace';
type AuthMode = 'app_password' | 'oauth2';
type TestLineStatus = 'pending' | 'running' | 'ok' | 'error';

interface TestLine {
  label: string;
  status: TestLineStatus;
  message?: string;
}

const STEP_LABELS = ['Cuenta', 'Credenciales', 'Test', 'Listo'];

/* ─── Component ─── */

export function GmailWizard({ open, onClose, onCreated }: GmailWizardProps) {
  // Step management
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Account type
  const [accountType, setAccountType] = useState<AccountType | null>(null);

  // Step 2: Auth mode + form fields
  const [authMode, setAuthMode] = useState<AuthMode>('app_password');
  const [fromName, setFromName] = useState('');
  const [email, setEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [domain, setDomain] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  // OAuth2 state
  const [authUrl, setAuthUrl] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [exchangeResult, setExchangeResult] = useState<{
    refresh_token_encrypted: string;
    client_secret_encrypted: string;
    client_id_encrypted: string;
  } | null>(null);
  const [generatingUrl, setGeneratingUrl] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [oauthError, setOauthError] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);

  // Step 3: Connection test
  const [testLines, setTestLines] = useState<TestLine[]>([]);
  const [testRunning, setTestRunning] = useState(false);
  const [testSkipped, setTestSkipped] = useState(false);

  // Step 4: Saving
  const [saving, setSaving] = useState(false);

  // Help modal
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTab, setHelpTab] = useState<'personal' | 'workspace'>('personal');

  /* ─── Reset on close ─── */

  useEffect(() => {
    if (!open) {
      setStep(1);
      setAccountType(null);
      setAuthMode('app_password');
      setFromName('');
      setEmail('');
      setAppPassword('');
      setDomain('');
      setClientId('');
      setClientSecret('');
      setAuthUrl('');
      setAuthCode('');
      setExchangeResult(null);
      setGeneratingUrl(false);
      setExchanging(false);
      setOauthError('');
      setShowInstructions(false);
      setTestLines([]);
      setTestRunning(false);
      setTestSkipped(false);
      setSaving(false);
      setHelpOpen(false);
      setHelpTab('personal');
    }
  }, [open]);

  /* ─── Step 2 validation ─── */

  const isStep2Valid = (): boolean => {
    if (authMode === 'oauth2') {
      return !!(email && clientId && clientSecret && exchangeResult);
    }
    // app_password
    return !!(email && appPassword);
  };

  /* ─── OAuth2: Generate auth URL ─── */

  const handleGenerateAuthUrl = async () => {
    if (!clientId || !clientSecret) {
      toast.error('Client ID y Client Secret son obligatorios');
      return;
    }
    setGeneratingUrl(true);
    setOauthError('');
    setAuthUrl('');
    try {
      const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
      const res = await fetch(`/api/connectors/gmail/oauth2/auth-url?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al generar URL');
      setAuthUrl(data.url);
    } catch (e) {
      setOauthError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setGeneratingUrl(false);
    }
  };

  /* ─── OAuth2: Exchange code ─── */

  const handleExchangeCode = async () => {
    if (!authCode.trim()) {
      toast.error('Pega el codigo de autorizacion');
      return;
    }
    setExchanging(true);
    setOauthError('');
    try {
      const res = await fetch('/api/connectors/gmail/oauth2/exchange-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: authCode.trim(), client_id: clientId, client_secret: clientSecret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al intercambiar codigo');
      setExchangeResult({
        refresh_token_encrypted: data.refresh_token_encrypted,
        client_secret_encrypted: data.client_secret_encrypted,
        client_id_encrypted: data.client_id_encrypted,
      });
      toast.success('Tokens obtenidos correctamente');
    } catch (e) {
      setOauthError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setExchanging(false);
    }
  };

  /* ─── Step 3: Connection test ─── */

  const runConnectionTest = useCallback(async () => {
    const isOAuth2 = authMode === 'oauth2';
    const lines: TestLine[] = [
      { label: 'Conectando al servidor SMTP...', status: 'pending' },
      { label: 'Verificando autenticacion...', status: 'pending' },
      ...(isOAuth2 ? [] : [{ label: 'Enviando email de prueba...', status: 'pending' as TestLineStatus }]),
    ];
    setTestLines([...lines]);
    setTestRunning(true);
    setTestSkipped(false);

    const updateLine = (idx: number, update: Partial<TestLine>) => {
      lines[idx] = { ...lines[idx], ...update };
      setTestLines([...lines]);
    };

    try {
      // Phase 1: SMTP connection
      updateLine(0, { status: 'running' });
      await new Promise((r) => setTimeout(r, 800));

      const testBody: Record<string, string> = {
        user: email,
        account_type: accountType || 'personal',
        auth_mode: authMode,
      };
      if (authMode === 'app_password') {
        testBody.app_password = appPassword;
      } else {
        testBody.client_id = clientId;
        testBody.client_secret = clientSecret;
        if (exchangeResult) {
          testBody.refresh_token_encrypted = exchangeResult.refresh_token_encrypted;
        }
      }

      const testRes = await fetch('/api/connectors/gmail/test-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testBody),
      });
      const testData = await testRes.json();

      if (!testRes.ok || !testData.ok) {
        updateLine(0, { status: 'error', message: testData.error || 'Error de conexion SMTP' });
        setTestRunning(false);
        return;
      }

      updateLine(0, { status: 'ok', label: 'Conexion SMTP establecida' });

      // Phase 2: Authentication
      updateLine(1, { status: 'running' });
      await new Promise((r) => setTimeout(r, 800));
      updateLine(1, { status: 'ok', label: 'Autenticacion correcta' });

      // Phase 3: Send test email (app_password only)
      if (!isOAuth2) {
        updateLine(2, { status: 'running' });
        await new Promise((r) => setTimeout(r, 800));

        const sendRes = await fetch('/api/connectors/gmail/send-test-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: email,
            app_password: appPassword,
            account_type: accountType || 'personal',
            auth_mode: 'app_password',
            from_name: fromName || undefined,
          }),
        });
        const sendData = await sendRes.json();

        if (!sendRes.ok || !sendData.ok) {
          updateLine(2, { status: 'error', message: sendData.error || 'Error al enviar email de prueba' });
          setTestRunning(false);
          return;
        }
        updateLine(2, { status: 'ok', label: 'Email de prueba enviado' });
      }
    } catch (e) {
      // Mark current running line as error
      const runningIdx = lines.findIndex((l) => l.status === 'running');
      if (runningIdx >= 0) {
        updateLine(runningIdx, { status: 'error', message: e instanceof Error ? e.message : 'Error de red' });
      }
    } finally {
      setTestRunning(false);
    }
  }, [authMode, email, appPassword, accountType, clientId, clientSecret, exchangeResult, fromName]);

  // Auto-run test when entering step 3
  useEffect(() => {
    if (step === 3 && !testSkipped) {
      runConnectionTest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const allTestsPassed = testLines.length > 0 && testLines.every((l) => l.status === 'ok');

  /* ─── Step 4: Save connector ─── */

  const handleSaveConnector = async () => {
    setSaving(true);
    try {
      const gmailSubtype =
        accountType === 'personal'
          ? 'gmail_personal'
          : authMode === 'oauth2'
            ? 'gmail_workspace_oauth2'
            : 'gmail_workspace';

      const config: Record<string, string | undefined> = {
        user: email,
        account_type: accountType || 'personal',
        auth_mode: authMode,
        from_name: fromName || undefined,
      };

      if (authMode === 'app_password') {
        config.app_password = appPassword;
      } else if (exchangeResult) {
        config.client_id = clientId;
        config.client_id_encrypted = exchangeResult.client_id_encrypted;
        config.client_secret_encrypted = exchangeResult.client_secret_encrypted;
        config.refresh_token_encrypted = exchangeResult.refresh_token_encrypted;
      }

      if (accountType === 'workspace' && domain) {
        config.domain = domain;
      }

      // API destructures user, account_type, app_password, etc. from body top-level
      const body = {
        name: fromName || email,
        type: 'gmail',
        emoji: '\u{1F4E8}',
        gmail_subtype: gmailSubtype,
        ...config,
        is_active: 1,
        // If wizard test passed, mark connector as tested
        ...(allTestsPassed ? { test_status: 'ok' } : {}),
      };

      const res = await fetch('/api/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Error al crear conector');
      }

      toast.success('Conector Gmail creado correctamente');
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear conector');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Step navigation helpers ─── */

  const getSubtypeLabel = () => {
    if (accountType === 'personal') return 'Gmail Personal';
    if (authMode === 'oauth2') return 'Google Workspace (OAuth2)';
    return 'Google Workspace (App Password)';
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
                  ? 'bg-emerald-500 text-white'
                  : isComplete
                    ? 'bg-emerald-500/20 text-emerald-400'
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
                isActive ? 'text-emerald-400' : isComplete ? 'text-emerald-400/60' : 'text-zinc-500'
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );

  /* ─── Render: Step 1 — Account Type ─── */

  const renderStep1 = () => (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">Selecciona el tipo de cuenta Gmail que deseas configurar.</p>
      <div className="grid grid-cols-2 gap-3">
        {/* Personal */}
        <button
          onClick={() => setAccountType('personal')}
          className={`text-left p-4 rounded-lg border transition-all ${
            accountType === 'personal'
              ? 'border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/30'
              : 'border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-2 rounded-lg ${accountType === 'personal' ? 'bg-emerald-500/20' : 'bg-zinc-800'}`}>
              <Mail className={`w-5 h-5 ${accountType === 'personal' ? 'text-emerald-400' : 'text-zinc-400'}`} />
            </div>
          </div>
          <p className={`font-medium text-sm mb-1 ${accountType === 'personal' ? 'text-emerald-300' : 'text-zinc-200'}`}>
            Gmail Personal
          </p>
          <p className="text-xs text-zinc-500">
            Usa App Password con tu cuenta personal @gmail.com
          </p>
        </button>

        {/* Workspace */}
        <button
          onClick={() => setAccountType('workspace')}
          className={`text-left p-4 rounded-lg border transition-all ${
            accountType === 'workspace'
              ? 'border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/30'
              : 'border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-2 rounded-lg ${accountType === 'workspace' ? 'bg-emerald-500/20' : 'bg-zinc-800'}`}>
              <Building2 className={`w-5 h-5 ${accountType === 'workspace' ? 'text-emerald-400' : 'text-zinc-400'}`} />
            </div>
          </div>
          <p className={`font-medium text-sm mb-1 ${accountType === 'workspace' ? 'text-emerald-300' : 'text-zinc-200'}`}>
            Google Workspace
          </p>
          <p className="text-xs text-zinc-500">
            Cuenta corporativa con dominio propio. App Password o OAuth2.
          </p>
        </button>
      </div>
    </div>
  );

  /* ─── Render: Step 2A — App Password Personal ─── */

  const renderStep2APersonal = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-zinc-400 mb-1 block">Nombre remitente</Label>
        <Input
          value={fromName}
          onChange={(e) => setFromName(e.target.value)}
          placeholder="DoCatFlow"
          className="bg-zinc-900 border-zinc-800 text-zinc-50"
        />
      </div>
      <div>
        <Label className="text-xs text-zinc-400 mb-1 block">
          Email Gmail <span className="text-red-400">*</span>
        </Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@gmail.com"
          className="bg-zinc-900 border-zinc-800 text-zinc-50"
        />
      </div>
      <div>
        <Label className="text-xs text-zinc-400 mb-1 block">
          App Password <span className="text-red-400">*</span>
        </Label>
        <Input
          type="password"
          value={appPassword}
          onChange={(e) => setAppPassword(e.target.value)}
          placeholder="xxxx xxxx xxxx xxxx"
          className="bg-zinc-900 border-zinc-800 text-zinc-50 font-mono"
        />
      </div>
      <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
        <p className="text-xs text-zinc-400">
          Necesitas una App Password de Google.{' '}
          <a
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 inline-flex items-center gap-1"
          >
            Como obtenerla <ExternalLink className="w-3 h-3" />
          </a>
        </p>
      </div>
    </div>
  );

  /* ─── Render: Step 2B — App Password Workspace ─── */

  const renderStep2BWorkspace = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-zinc-400 mb-1 block">Nombre remitente</Label>
        <Input
          value={fromName}
          onChange={(e) => setFromName(e.target.value)}
          placeholder="DoCatFlow"
          className="bg-zinc-900 border-zinc-800 text-zinc-50"
        />
      </div>
      <div>
        <Label className="text-xs text-zinc-400 mb-1 block">
          Email Gmail <span className="text-red-400">*</span>
        </Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="usuario@empresa.com"
          className="bg-zinc-900 border-zinc-800 text-zinc-50"
        />
      </div>
      <div>
        <Label className="text-xs text-zinc-400 mb-1 block">Dominio</Label>
        <Input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="empresa.com"
          className="bg-zinc-900 border-zinc-800 text-zinc-50"
        />
      </div>
      <div>
        <Label className="text-xs text-zinc-400 mb-1 block">
          App Password <span className="text-red-400">*</span>
        </Label>
        <Input
          type="password"
          value={appPassword}
          onChange={(e) => setAppPassword(e.target.value)}
          placeholder="xxxx xxxx xxxx xxxx"
          className="bg-zinc-900 border-zinc-800 text-zinc-50 font-mono"
        />
      </div>
      <div className="p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg">
        <p className="text-xs text-zinc-400">
          Workspace usa <span className="text-zinc-200 font-mono">smtp-relay.gmail.com</span> para envios desde el dominio.
        </p>
      </div>
      <button
        onClick={() => { setAuthMode('oauth2'); setAppPassword(''); }}
        className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
      >
        Usar OAuth2 en lugar de App Password
      </button>
    </div>
  );

  /* ─── Render: Step 2C — OAuth2 Workspace ─── */

  const renderStep2COAuth2 = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-zinc-400 mb-1 block">Nombre remitente</Label>
        <Input
          value={fromName}
          onChange={(e) => setFromName(e.target.value)}
          placeholder="DoCatFlow"
          className="bg-zinc-900 border-zinc-800 text-zinc-50"
        />
      </div>
      <div>
        <Label className="text-xs text-zinc-400 mb-1 block">
          Email <span className="text-red-400">*</span>
        </Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="usuario@empresa.com"
          className="bg-zinc-900 border-zinc-800 text-zinc-50"
        />
      </div>
      <div>
        <Label className="text-xs text-zinc-400 mb-1 block">
          Client ID <span className="text-red-400">*</span>
        </Label>
        <Input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="123456.apps.googleusercontent.com"
          className="bg-zinc-900 border-zinc-800 text-zinc-50 font-mono text-xs"
        />
      </div>
      <div>
        <Label className="text-xs text-zinc-400 mb-1 block">
          Client Secret <span className="text-red-400">*</span>
        </Label>
        <Input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder="GOCSPX-..."
          className="bg-zinc-900 border-zinc-800 text-zinc-50 font-mono text-xs"
        />
      </div>

      {/* Generate Auth URL */}
      <Button
        onClick={handleGenerateAuthUrl}
        disabled={generatingUrl || !clientId || !clientSecret}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
      >
        {generatingUrl && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Generar URL de Autorizacion
      </Button>

      {/* Auth URL display */}
      {authUrl && (
        <div className="space-y-2">
          <Label className="text-xs text-zinc-400 block">URL de Autorizacion</Label>
          <div className="relative">
            <Textarea
              value={authUrl}
              readOnly
              className="bg-zinc-900 border-zinc-800 text-zinc-300 h-20 resize-none text-xs font-mono pr-10"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { navigator.clipboard.writeText(authUrl); toast.success('URL copiada'); }}
              className="absolute top-1 right-1 h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200"
              title="Copiar"
            >
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg space-y-1">
            <p className="text-xs text-zinc-300 font-medium">Pasos:</p>
            <ol className="text-xs text-zinc-400 space-y-0.5 list-decimal list-inside">
              <li>Abre la URL en tu navegador</li>
              <li>Autoriza la aplicacion</li>
              <li>Copia el codigo que aparece y pegalo aqui</li>
            </ol>
          </div>
        </div>
      )}

      {/* Authorization code input */}
      {authUrl && (
        <div className="space-y-2">
          <Label className="text-xs text-zinc-400 block">Codigo de Autorizacion</Label>
          <Textarea
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value)}
            placeholder="Pega el codigo de autorizacion aqui..."
            className="bg-zinc-900 border-zinc-800 text-zinc-50 h-16 resize-none text-xs font-mono"
          />
          <Button
            onClick={handleExchangeCode}
            disabled={exchanging || !authCode.trim()}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {exchanging && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Intercambiar Codigo
          </Button>
        </div>
      )}

      {/* Exchange result */}
      {exchangeResult && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-xs text-emerald-400">Tokens obtenidos y cifrados correctamente</p>
        </div>
      )}

      {/* OAuth error */}
      {oauthError && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-400">{oauthError}</p>
        </div>
      )}

      {/* Collapsible instructions */}
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowInstructions(!showInstructions)}
          className="w-full flex items-center justify-between p-3 text-left hover:bg-zinc-800/50 transition-colors"
        >
          <span className="text-xs text-zinc-400 font-medium">Como configurar Google Cloud Console</span>
          {showInstructions ? (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          )}
        </button>
        {showInstructions && (
          <div className="px-3 pb-3 space-y-1.5">
            <ol className="text-xs text-zinc-400 space-y-1.5 list-decimal list-inside">
              <li>Crear proyecto en <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">Google Cloud Console</a></li>
              <li>Habilitar la <span className="text-zinc-300">Gmail API</span> en APIs y servicios</li>
              <li>Crear credencial <span className="text-zinc-300">OAuth 2.0 Client ID</span> (tipo: Desktop App)</li>
              <li>Configurar <span className="text-zinc-300">pantalla de consentimiento</span> (Internal para Workspace)</li>
              <li>Agregar redirect URI: <code className="text-emerald-400 bg-zinc-900 px-1 rounded">urn:ietf:wg:oauth:2.0:oob</code></li>
            </ol>
          </div>
        )}
      </div>

      <button
        onClick={() => { setAuthMode('app_password'); setClientId(''); setClientSecret(''); setAuthUrl(''); setAuthCode(''); setExchangeResult(null); setOauthError(''); }}
        className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
      >
        Usar App Password en lugar de OAuth2
      </button>
    </div>
  );

  /* ─── Render: Step 2 dispatcher ─── */

  const renderStep2 = () => {
    if (accountType === 'personal') return renderStep2APersonal();
    if (accountType === 'workspace' && authMode === 'oauth2') return renderStep2COAuth2();
    return renderStep2BWorkspace();
  };

  /* ─── Render: Step 3 — Connection Test ─── */

  const renderStep3 = () => (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">Probando la conexion con Gmail...</p>

      <div className="space-y-3 bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
        {testLines.map((line, i) => (
          <div key={i} className="flex items-center gap-3">
            {line.status === 'pending' && (
              <div className="w-5 h-5 rounded-full bg-zinc-800 shrink-0" />
            )}
            {line.status === 'running' && (
              <Loader2 className="w-5 h-5 text-emerald-400 animate-spin shrink-0" />
            )}
            {line.status === 'ok' && (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            )}
            {line.status === 'error' && (
              <XCircle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <div className="min-w-0">
              <p className={`text-sm ${
                line.status === 'ok' ? 'text-emerald-400' :
                line.status === 'error' ? 'text-red-400' :
                line.status === 'running' ? 'text-zinc-200' :
                'text-zinc-500'
              }`}>
                {line.label}
              </p>
              {line.message && line.status === 'error' && (
                <p className="text-xs text-red-400/70 mt-0.5">{line.message}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Retry button on error */}
      {!testRunning && testLines.some((l) => l.status === 'error') && (
        <Button
          onClick={runConnectionTest}
          variant="outline"
          className="w-full bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          Reintentar
        </Button>
      )}

      {/* Skip test link */}
      {!allTestsPassed && (
        <button
          onClick={() => { setTestSkipped(true); setStep(4); }}
          className="text-xs text-zinc-500 hover:text-zinc-400 underline underline-offset-2 block mx-auto"
        >
          Omitir test
        </button>
      )}
    </div>
  );

  /* ─── Render: Step 4 — Confirmation ─── */

  const renderStep4 = () => (
    <div className="space-y-5">
      {/* Summary card */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-200">Resumen del conector</h3>
          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Listo para usar
          </Badge>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">Tipo</span>
            <span className="text-zinc-200">{getSubtypeLabel()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Email</span>
            <span className="text-zinc-200">{email}</span>
          </div>
          {fromName && (
            <div className="flex justify-between">
              <span className="text-zinc-500">Remitente</span>
              <span className="text-zinc-200">{fromName}</span>
            </div>
          )}
          {domain && accountType === 'workspace' && (
            <div className="flex justify-between">
              <span className="text-zinc-500">Dominio</span>
              <span className="text-zinc-200">{domain}</span>
            </div>
          )}
        </div>
      </div>

      {/* Usage snippets */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Como usar este conector</h3>
        <div className="space-y-2">
          <div className="flex items-start gap-2 p-3 bg-zinc-900/30 rounded-lg border border-zinc-800/50">
            <Sparkles className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-zinc-300">Canvas</p>
              <p className="text-xs text-zinc-500">Agrega un nodo Conector Gmail al final de tu flujo</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-zinc-900/30 rounded-lg border border-zinc-800/50">
            <Sparkles className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-zinc-300">Tareas</p>
              <p className="text-xs text-zinc-500">Selecciona este conector en un paso de tarea</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-zinc-900/30 rounded-lg border border-zinc-800/50">
            <Sparkles className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-zinc-300">CatBot</p>
              <p className="text-xs text-zinc-500">Pide a CatBot: &ldquo;Envia un email usando {fromName || email}&rdquo;</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  /* ─── Render: Navigation footer ─── */

  const renderFooter = () => {
    const canGoNext = (): boolean => {
      if (step === 1) return !!accountType;
      if (step === 2) return isStep2Valid();
      if (step === 3) return allTestsPassed || testSkipped;
      return true;
    };

    return (
      <div className="flex items-center justify-between pt-4 mt-4 border-t border-zinc-800">
        {step > 1 ? (
          <Button
            variant="ghost"
            onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
            className="text-zinc-400 hover:text-zinc-200"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Atras
          </Button>
        ) : (
          <div />
        )}

        {step < 4 ? (
          <Button
            onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
            disabled={!canGoNext()}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            Siguiente
          </Button>
        ) : (
          <Button
            onClick={handleSaveConnector}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Crear Conector
          </Button>
        )}
      </div>
    );
  };

  /* ─── Render: Help modal ─── */

  const renderHelpModal = () => {
    if (!helpOpen) return null;

    const personalSteps = [
      { text: 'Activa la verificacion en 2 pasos en tu cuenta Google', link: 'https://myaccount.google.com/signinoptions/two-step-verification', linkText: 'myaccount.google.com → Seguridad → Verificacion en 2 pasos' },
      { text: 'Ve a la pagina de App Passwords', link: 'https://myaccount.google.com/apppasswords', linkText: 'myaccount.google.com/apppasswords' },
      { text: <>En el campo nombre escribe <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-violet-300 font-mono text-xs">DoCatFlow</code> y pulsa <strong className="text-zinc-200">Crear</strong></> },
      { text: 'Copia la contrasena de 16 caracteres generada (solo se muestra una vez)' },
      { text: 'Pega esa contrasena en el campo App Password del wizard' },
    ];

    const workspaceSteps = [
      { text: 'Activa la verificacion en 2 pasos en la cuenta de empresa' },
      { text: 'Ve a App Passwords con la cuenta de empresa', link: 'https://myaccount.google.com/apppasswords', linkText: 'myaccount.google.com/apppasswords' },
      { text: <>Crea App Password con nombre <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-violet-300 font-mono text-xs">DoCatFlow</code> → copia los 16 caracteres</> },
      { text: 'Entra como administrador en Google Admin', link: 'https://admin.google.com', linkText: 'admin.google.com' },
      { text: <>Ve a <strong className="text-zinc-200">Aplicaciones → Google Workspace → Gmail → Enrutamiento → Servicio de relay SMTP → Configurar</strong></> },
      { text: <>Anade la IP publica del servidor <span className="text-zinc-400">(aparece en los logs de error del test como <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono text-xs">Mail relay denied [IP]</code>)</span></> },
      { text: <>Marca: <strong className="text-zinc-200">Solo aceptar correo de las IPs especificadas</strong> + <strong className="text-zinc-200">Requerir autenticacion SMTP</strong> + <strong className="text-zinc-200">Requerir cifrado TLS</strong> → Guardar</> },
      { text: 'Espera 2-3 minutos para que se propague y vuelve a hacer el test' },
    ];

    const warnings = [
      'La App Password solo se muestra una vez al generarla — copiala antes de cerrar',
      'No uses la contrasena principal de Gmail, solo funciona la App Password',
      'Para Workspace: la IP del servidor debe ser la IP publica, no la IP local (192.168.x.x no funciona)',
      'Los cambios en el relay SMTP de Workspace tardan hasta 5 minutos en aplicarse',
    ];

    const steps = helpTab === 'personal' ? personalSteps : workspaceSteps;

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setHelpOpen(false)} />

        {/* Card */}
        <div className="relative z-10 w-[90vw] max-w-[560px] bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-zinc-800">
            <h2 className="text-base font-semibold text-zinc-50 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-violet-400" />
              Como configurar Gmail
            </h2>
            <button
              onClick={() => setHelpOpen(false)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-5 pt-4">
            <button
              onClick={() => setHelpTab('personal')}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                helpTab === 'personal'
                  ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30'
                  : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800 border border-transparent'
              }`}
            >
              <Mail className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              Gmail Personal
            </button>
            <button
              onClick={() => setHelpTab('workspace')}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                helpTab === 'workspace'
                  ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30'
                  : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800 border border-transparent'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              Google Workspace
            </button>
          </div>

          {/* Steps content */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <ol className="space-y-3">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-500/15 text-violet-400 text-xs font-semibold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <div className="text-sm text-zinc-300 leading-relaxed">
                    {s.text}
                    {s.link && (
                      <a
                        href={s.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mt-1 px-2.5 py-1.5 bg-zinc-800 border border-zinc-700/50 rounded font-mono text-xs text-violet-300 hover:text-violet-200 hover:border-violet-500/30 transition-colors w-fit"
                      >
                        {s.linkText} <ExternalLink className="w-3 h-3 inline ml-1 -mt-0.5" />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            {/* Warnings */}
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-medium text-amber-400 uppercase tracking-wider">Importante</span>
              </div>
              {warnings.map((w, i) => (
                <div key={i} className="flex gap-2 pl-1">
                  <span className="text-amber-400/60 text-xs mt-0.5">-</span>
                  <p className="text-xs text-zinc-400 leading-relaxed">{w}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="p-5 border-t border-zinc-800">
            <Button
              onClick={() => setHelpOpen(false)}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Entendido
            </Button>
          </div>
        </div>
      </div>
    );
  };

  /* ─── Main render ─── */

  const stepTitles: Record<number, string> = {
    1: 'Tipo de cuenta',
    2: 'Credenciales',
    3: 'Test de conexion',
    4: 'Confirmacion',
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-2xl w-[90vw] bg-zinc-950 border-zinc-800 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg text-zinc-50 flex items-center gap-2">
            <span className="text-xl">{'\u{1F4E8}'}</span>
            {stepTitles[step]}
            {step === 2 && (
              <button
                onClick={() => setHelpOpen(true)}
                className="ml-1 p-1 rounded-full text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
                title="Como configurar"
              >
                <HelpCircle className="w-4.5 h-4.5" />
              </button>
            )}
          </DialogTitle>
        </DialogHeader>

        {renderHelpModal()}

        {renderProgressBar()}

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}

        {renderFooter()}
      </DialogContent>
    </Dialog>
  );
}
