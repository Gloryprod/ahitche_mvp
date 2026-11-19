import { test, expect } from '@playwright/test'

// Le build de production appelle l'API en ligne (contenus, session, mesure d'audience) : tout est bloqué,
// pour ne rien compter ni écrire en production. Le site affiche alors les valeurs du code.
test.beforeEach(async ({ page }) => {
  await page.route('https://api.ahitchebj.com/**', (route) => route.abort())
})

// Test de fumée : la page d'accueil s'affiche avec son titre principal et les 3 formules
test("affiche la page d'accueil", async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toContainText('Vos vivres livrés chez vous')
  await expect(page.locator('#formules')).toContainText('AHI ESSENTIEL')
  await expect(page.locator('#formules')).toContainText('AHI ÉQUILIBRÉ')
  await expect(page.locator('#formules')).toContainText('AHI CONFORT')
})
