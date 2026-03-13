import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class SettingsPOM extends BasePage {
  // Page header
  readonly pageHeading: Locator;
  readonly pageDescription: Locator;

  // Section: API Keys de LLMs
  readonly apiKeysSection: Locator;
  readonly apiKeysSectionHeading: Locator;
  readonly providerCards: Locator;

  // Section: Procesamiento
  readonly processingSection: Locator;
  readonly processingSectionHeading: Locator;
  readonly maxTokensInput: Locator;

  // Section: Costes de modelos
  readonly modelPricingSection: Locator;
  readonly modelPricingSectionHeading: Locator;

  // Section: CatBot -- Asistente IA
  readonly catbotSection: Locator;
  readonly catbotSectionHeading: Locator;
  readonly catbotModelInput: Locator;

  // Section: CatBot -- Seguridad Sudo
  readonly catbotSecuritySection: Locator;
  readonly catbotSecurityHeading: Locator;

  // Section: Modelos de Embeddings
  readonly embeddingsSection: Locator;
  readonly embeddingsSectionHeading: Locator;

  // Section: Conexiones
  readonly connectionsSection: Locator;
  readonly connectionsSectionHeading: Locator;

  // Section: Preferencias
  readonly preferencesSection: Locator;
  readonly preferencesSectionHeading: Locator;

  constructor(page: Page) {
    super(page);

    // Page header
    this.pageHeading = page.getByRole('heading', { name: 'Configuracion', exact: false });
    this.pageDescription = page.getByText('Gestiona las API keys, modelos y conexiones');

    // API Keys section
    this.apiKeysSection = page.locator('section').filter({ hasText: 'API Keys de LLMs' });
    this.apiKeysSectionHeading = page.getByRole('heading', { name: 'API Keys de LLMs' });
    this.providerCards = this.apiKeysSection.locator('.bg-zinc-900');

    // Processing section
    this.processingSection = page.locator('section').filter({ hasText: 'Procesamiento' }).first();
    this.processingSectionHeading = page.getByRole('heading', { name: 'Procesamiento' });
    this.maxTokensInput = this.processingSection.locator('input[type="number"]').first();

    // Model pricing section
    this.modelPricingSection = page.locator('section').filter({ hasText: 'Costes de modelos' });
    this.modelPricingSectionHeading = page.getByRole('heading', { name: 'Costes de modelos' });

    // CatBot section
    this.catbotSection = page.locator('section').filter({ hasText: 'CatBot — Asistente IA' });
    this.catbotSectionHeading = page.getByRole('heading', { name: /CatBot.*Asistente IA/ });
    this.catbotModelInput = this.catbotSection.locator('input').first();

    // CatBot Security section
    this.catbotSecuritySection = page.locator('section').filter({ hasText: 'CatBot — Seguridad Sudo' });
    this.catbotSecurityHeading = page.getByRole('heading', { name: /CatBot.*Seguridad Sudo/ });

    // Embeddings section
    this.embeddingsSection = page.locator('section').filter({ hasText: 'Modelos de Embeddings' });
    this.embeddingsSectionHeading = page.getByRole('heading', { name: 'Modelos de Embeddings' });

    // Connections section
    this.connectionsSection = page.locator('section').filter({ hasText: 'Conexiones' });
    this.connectionsSectionHeading = page.getByRole('heading', { name: 'Conexiones' });

    // Preferences section
    this.preferencesSection = page.locator('section').filter({ hasText: 'Preferencias' });
    this.preferencesSectionHeading = page.getByRole('heading', { name: 'Preferencias' });
  }

  async goto() {
    await this.navigateTo('/settings');
  }

  getApiKeyFields(): Locator {
    return this.apiKeysSection.locator('input[type="password"]');
  }

  getSaveButtons(): Locator {
    return this.page.getByRole('button', { name: /Guardar/i });
  }
}
