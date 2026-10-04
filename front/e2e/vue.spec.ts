import { test, expect } from '@playwright/test'

// Test de fumée : la page d'accueil s'affiche avec son titre principal et les 3 formules
test("affiche la page d'accueil", async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toContainText('Votre alimentation')
  await expect(page.locator('#formules')).toContainText('AHI ESSENTIEL')
  await expect(page.locator('#formules')).toContainText('AHI ÉQUILIBRÉ')
  await expect(page.locator('#formules')).toContainText('AHI CONFORT')
})
