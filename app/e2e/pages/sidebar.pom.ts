import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

export interface NavItem {
  label: string;
  href: string;
}

export class SidebarPOM extends BasePage {
  /** All nav items exactly matching sidebar.tsx navItems array */
  readonly navItems: NavItem[] = [
    { label: 'Dashboard', href: '/' },
    { label: 'Proyectos', href: '/projects' },
    { label: 'Agentes', href: '/agents' },
    { label: 'Docs Workers', href: '/workers' },
    { label: 'Skills', href: '/skills' },
    { label: 'Tareas', href: '/tasks' },
    { label: 'Canvas', href: '/canvas' },
    { label: 'Conectores', href: '/connectors' },
    { label: 'Notificaciones', href: '/notifications' },
    { label: 'Configuración', href: '/settings' },
    { label: 'Estado del Sistema', href: '/system' },
  ];

  /** Footer area with service status indicators (border-t section at bottom of sidebar) */
  readonly footer: Locator;

  /** The main <footer> element rendered by Footer component */
  readonly mainFooter: Locator;

  /** CatBot floating button (fixed bottom-right, title="Abrir CatBot") */
  readonly catbotButton: Locator;

  /** Notification bell button (aria-label="Notificaciones") */
  readonly notificationBell: Locator;

  /** Breadcrumb area — used in project detail pages (text-sm text-zinc-400 with ChevronRight) */
  readonly breadcrumb: Locator;

  constructor(page: Page) {
    super(page);
    // Sidebar footer: the div with border-t inside the sidebar nav area showing service status dots
    this.footer = page.locator('nav').locator('..').locator('div.border-t').first();
    // Main footer: the <footer> element from Footer component
    this.mainFooter = page.locator('footer');
    // CatBot: floating button with title="Abrir CatBot"
    this.catbotButton = page.locator('button[title="Abrir CatBot"]');
    // Notification bell: button with aria-label="Notificaciones"
    this.notificationBell = page.locator('button[aria-label="Notificaciones"]');
    // Breadcrumb: the div containing breadcrumb links (Dashboard > Proyectos > ...)
    this.breadcrumb = page.locator('div.flex.items-center.text-sm.text-zinc-400').first();
  }

  /** Return all nav link items with label and href */
  allNavLinks(): NavItem[] {
    return this.navItems;
  }

  /** Click a sidebar nav link by its label */
  async clickNav(label: string): Promise<void> {
    const link = await this.getSidebarLink(label);
    await link.click();
    await this.page.waitForLoadState('networkidle');
  }

  /** Get a specific nav link locator */
  getNavLink(label: string): Locator {
    return this.sidebar.getByRole('link', { name: label });
  }

  /** Verify the service status text in sidebar footer (e.g. "X/4 servicios") */
  get serviceStatusText(): Locator {
    return this.page.locator('text=/\\d+\\/4 servicios/');
  }
}
