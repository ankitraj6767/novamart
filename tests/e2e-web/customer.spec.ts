import { expect, test } from '@playwright/test';

test('customer storefront renders a useful home page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A sharper way to shop' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shop by category' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Search products' })).toBeVisible();
});

test('customer storefront exposes auth and navigation', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByRole('link', { name: /NovaMart/ }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:3000\/$/);
});
