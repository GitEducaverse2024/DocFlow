import { test, expect } from '@playwright/test';
import { ChatPOM } from '../pages/chat.pom';
import { testName } from '../helpers/test-data';

const PROJECT_NAME = testName('Chat E2E');

let projectId: string;

test.describe.serial('Chat RAG', () => {
  test.beforeAll(async ({ request }) => {
    // Create a test project via API
    const res = await request.post('/api/projects', {
      data: { name: PROJECT_NAME, description: 'Proyecto de prueba E2E para chat' },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    projectId = data.id;

    // Add a note source so there is at least one source
    await request.post(`/api/projects/${projectId}/sources`, {
      data: {
        type: 'note',
        name: 'Nota de prueba',
        content: 'Este es contenido de prueba para el chat E2E.',
      },
    });

    // Enable RAG (create collection + index)
    await request.post(`/api/projects/${projectId}/rag/create`);
  });

  test.afterAll(async ({ request }) => {
    // Clean up test project
    if (projectId) {
      await request.delete(`/api/projects/${projectId}`);
    }
  });

  test('chat panel shows message input', async ({ page }) => {
    const chat = new ChatPOM(page);
    await chat.navigateToProjectChat(projectId);

    await expect(chat.messageInput).toBeVisible();
    await expect(chat.sendButton).toBeVisible();
  });

  test('example questions are displayed', async ({ page }) => {
    const chat = new ChatPOM(page);
    await chat.navigateToProjectChat(projectId);

    await expect(chat.welcomeHeading).toBeVisible();
    await expect(chat.exampleQuestionsLabel).toBeVisible();
    await expect(chat.exampleQuestions.first()).toBeVisible();
  });

  test('send message shows response area', async ({ page }) => {
    const chat = new ChatPOM(page);
    await chat.navigateToProjectChat(projectId);

    // Send a test message
    await chat.sendMessage('Que contiene este proyecto?');

    // Verify user message appears
    await expect(chat.userMessages.first()).toBeVisible({ timeout: 5000 });

    // Verify response area appears (streaming indicator or bot message)
    // We do NOT wait for full LLM response, just that the UI shows something
    await expect(
      chat.streamingIndicator.or(chat.botMessages.first())
    ).toBeVisible({ timeout: 15000 });
  });
});
