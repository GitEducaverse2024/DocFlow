import { test as base, expect } from '@playwright/test';
import { BasePage } from '../pages/base.page';
import { SidebarPOM } from '../pages/sidebar.pom';
import { DashboardPOM } from '../pages/dashboard.pom';
import { ProjectsPOM } from '../pages/projects.pom';
import { SourcesPOM } from '../pages/sources.pom';
import { ProcessingPOM } from '../pages/processing.pom';
import { RagPOM } from '../pages/rag.pom';
import { ChatPOM } from '../pages/chat.pom';
import { AgentsPOM } from '../pages/agents.pom';
import { WorkersPOM } from '../pages/workers.pom';
import { SkillsPOM } from '../pages/skills.pom';
import { TasksPOM } from '../pages/tasks.pom';
import { CanvasPOM } from '../pages/canvas.pom';
import { ConnectorsPOM } from '../pages/connectors.pom';
import { CatBotPOM } from '../pages/catbot.pom';
import { SettingsPOM } from '../pages/settings.pom';

type Fixtures = {
  basePage: BasePage;
  sidebarPOM: SidebarPOM;
  dashboardPOM: DashboardPOM;
  projectsPOM: ProjectsPOM;
  sourcesPOM: SourcesPOM;
  processingPOM: ProcessingPOM;
  ragPOM: RagPOM;
  chatPOM: ChatPOM;
  agentsPOM: AgentsPOM;
  workersPOM: WorkersPOM;
  skillsPOM: SkillsPOM;
  tasksPOM: TasksPOM;
  canvasPOM: CanvasPOM;
  connectorsPOM: ConnectorsPOM;
  catBotPOM: CatBotPOM;
  settingsPOM: SettingsPOM;
};

export const test = base.extend<Fixtures>({
  basePage: async ({ page }, use) => { await use(new BasePage(page)); },
  sidebarPOM: async ({ page }, use) => { await use(new SidebarPOM(page)); },
  dashboardPOM: async ({ page }, use) => { await use(new DashboardPOM(page)); },
  projectsPOM: async ({ page }, use) => { await use(new ProjectsPOM(page)); },
  sourcesPOM: async ({ page }, use) => { await use(new SourcesPOM(page)); },
  processingPOM: async ({ page }, use) => { await use(new ProcessingPOM(page)); },
  ragPOM: async ({ page }, use) => { await use(new RagPOM(page)); },
  chatPOM: async ({ page }, use) => { await use(new ChatPOM(page)); },
  agentsPOM: async ({ page }, use) => { await use(new AgentsPOM(page)); },
  workersPOM: async ({ page }, use) => { await use(new WorkersPOM(page)); },
  skillsPOM: async ({ page }, use) => { await use(new SkillsPOM(page)); },
  tasksPOM: async ({ page }, use) => { await use(new TasksPOM(page)); },
  canvasPOM: async ({ page }, use) => { await use(new CanvasPOM(page)); },
  connectorsPOM: async ({ page }, use) => { await use(new ConnectorsPOM(page)); },
  catBotPOM: async ({ page }, use) => { await use(new CatBotPOM(page)); },
  settingsPOM: async ({ page }, use) => { await use(new SettingsPOM(page)); },
});

export { expect };
