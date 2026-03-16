import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object Model for the Gmail 4-step wizard dialog.
 * Steps: 1-Cuenta, 2-Credenciales, 3-Test, 4-Confirmacion
 */
export class GmailWizardPOM extends BasePage {
  // Dialog container
  readonly dialog: Locator;

  // Step 1: Account type cards
  readonly personalCard: Locator;
  readonly workspaceCard: Locator;

  // Step 2A/2B: App Password fields
  readonly fromNameInput: Locator;
  readonly emailInput: Locator;
  readonly appPasswordInput: Locator;
  readonly domainInput: Locator;

  // Step 2C: OAuth2 fields
  readonly clientIdInput: Locator;
  readonly clientSecretInput: Locator;
  readonly generateUrlButton: Locator;
  readonly authUrlTextarea: Locator;
  readonly authCodeTextarea: Locator;
  readonly exchangeCodeButton: Locator;
  readonly exchangeSuccessBadge: Locator;

  // OAuth2 toggle links
  readonly toggleToOAuth2Link: Locator;
  readonly toggleToAppPasswordLink: Locator;

  // Step 3: Connection test
  readonly testStatusLines: Locator;
  readonly retryButton: Locator;
  readonly skipTestLink: Locator;

  // Step 4: Confirmation
  readonly summaryCard: Locator;
  readonly readyBadge: Locator;

  // Navigation
  readonly nextButton: Locator;
  readonly backButton: Locator;
  readonly createButton: Locator;

  // Progress indicators
  readonly progressDots: Locator;

  constructor(page: Page) {
    super(page);

    // The wizard is a Dialog (role="dialog") containing the Gmail wizard content
    this.dialog = page.locator('[role="dialog"]');

    // Step 1: Account type cards
    this.personalCard = this.dialog.locator('button').filter({ hasText: 'Gmail Personal' });
    this.workspaceCard = this.dialog.locator('button').filter({ hasText: 'Google Workspace' });

    // Step 2: Form fields by placeholder
    this.fromNameInput = this.dialog.getByPlaceholder('DoCatFlow');
    this.emailInput = this.dialog.locator('input[type="email"]');
    this.appPasswordInput = this.dialog.locator('input[type="password"]').first();
    this.domainInput = this.dialog.getByPlaceholder('empresa.com');

    // Step 2C: OAuth2
    this.clientIdInput = this.dialog.getByPlaceholder('123456.apps.googleusercontent.com');
    this.clientSecretInput = this.dialog.getByPlaceholder('GOCSPX-...');
    this.generateUrlButton = this.dialog.getByRole('button', { name: /Generar URL/i });
    this.authUrlTextarea = this.dialog.locator('textarea[readonly]');
    this.authCodeTextarea = this.dialog.getByPlaceholder('Pega el codigo de autorizacion aqui...');
    this.exchangeCodeButton = this.dialog.getByRole('button', { name: /Intercambiar/i });
    this.exchangeSuccessBadge = this.dialog.locator('text=Tokens obtenidos y cifrados correctamente');

    // Toggle links
    this.toggleToOAuth2Link = this.dialog.locator('button').filter({ hasText: 'Usar OAuth2 en lugar de App Password' });
    this.toggleToAppPasswordLink = this.dialog.locator('button').filter({ hasText: 'Usar App Password en lugar de OAuth2' });

    // Step 3: Test
    this.testStatusLines = this.dialog.locator('.space-y-3 > div').filter({ has: page.locator('svg, .rounded-full') });
    this.retryButton = this.dialog.getByRole('button', { name: 'Reintentar' });
    this.skipTestLink = this.dialog.locator('button').filter({ hasText: 'Omitir test' });

    // Step 4: Confirmation
    this.summaryCard = this.dialog.locator('text=Resumen del conector').locator('..');
    this.readyBadge = this.dialog.locator('text=Listo para usar');

    // Navigation buttons
    this.nextButton = this.dialog.getByRole('button', { name: 'Siguiente' });
    this.backButton = this.dialog.getByRole('button', { name: /Atras/i });
    this.createButton = this.dialog.getByRole('button', { name: 'Crear Conector' });

    // Progress dots (the step indicators at the top)
    this.progressDots = this.dialog.locator('.rounded-full');
  }

  /** Select account type card */
  async selectAccountType(type: 'personal' | 'workspace') {
    if (type === 'personal') {
      await this.personalCard.click();
    } else {
      await this.workspaceCard.click();
    }
  }

  /** Fill App Password form fields */
  async fillAppPasswordForm(data: {
    email: string;
    appPassword: string;
    fromName?: string;
    domain?: string;
  }) {
    if (data.fromName) {
      await this.fromNameInput.fill(data.fromName);
    }
    await this.emailInput.fill(data.email);
    await this.appPasswordInput.fill(data.appPassword);
    if (data.domain) {
      await this.domainInput.fill(data.domain);
    }
  }

  /** Toggle to OAuth2 mode */
  async toggleOAuth2() {
    await this.toggleToOAuth2Link.click();
  }

  /** Fill OAuth2 form fields */
  async fillOAuth2Form(data: {
    email: string;
    fromName?: string;
    clientId: string;
    clientSecret: string;
  }) {
    if (data.fromName) {
      await this.fromNameInput.fill(data.fromName);
    }
    await this.emailInput.fill(data.email);
    await this.clientIdInput.fill(data.clientId);
    await this.clientSecretInput.fill(data.clientSecret);
  }

  /** Click Generate URL button */
  async clickGenerateUrl() {
    await this.generateUrlButton.click();
  }

  /** Fill authorization code */
  async fillAuthCode(code: string) {
    await this.authCodeTextarea.fill(code);
  }

  /** Click Exchange Code button */
  async clickExchangeCode() {
    await this.exchangeCodeButton.click();
  }

  /** Click Siguiente (next step) */
  async nextStep() {
    await this.nextButton.click();
  }

  /** Click Atras (previous step) */
  async prevStep() {
    await this.backButton.click();
  }

  /** Click "Omitir test" link to skip connection test */
  async skipTest() {
    await this.skipTestLink.click();
  }

  /** Click "Crear Conector" button on confirmation step */
  async clickCreate() {
    await this.createButton.click();
  }

  /** Get test status line texts and their visual states */
  async getTestStatusLines(): Promise<Array<{ text: string; status: string }>> {
    const lines: Array<{ text: string; status: string }> = [];
    const container = this.dialog.locator('.bg-zinc-900\\/50 .flex.items-center.gap-3');
    const count = await container.count();
    for (let i = 0; i < count; i++) {
      const line = container.nth(i);
      const text = await line.locator('p').first().textContent() || '';
      // Detect status by icon classes
      const hasCheck = await line.locator('text=Conexion SMTP establecida, text=Autenticacion correcta, text=Email de prueba enviado').count();
      const hasError = await line.locator('.text-red-400').count();
      const hasSpinner = await line.locator('.animate-spin').count();
      let status = 'pending';
      if (hasCheck > 0) status = 'ok';
      else if (hasError > 0) status = 'error';
      else if (hasSpinner > 0) status = 'running';
      lines.push({ text: text.trim(), status });
    }
    return lines;
  }

  /** Get the confirmation summary card text */
  async getConfirmationSummary(): Promise<string> {
    return (await this.summaryCard.textContent()) || '';
  }
}
