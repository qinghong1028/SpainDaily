import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('./')
})

test('cold start asks for a traveler and never auto-enters the last choice', async ({ page }) => {
  await page.getByRole('button', { name: '先用虚构数据看看' }).click()
  await expect(page.getByRole('heading', { name: '今天是谁在看？' })).toBeVisible()
  await page.getByRole('button', { name: /演示旅客 A/ }).click()
  await expect(page.getByRole('button', { name: '切换旅客' })).toContainText('演示旅客 A')
  await page.reload()
  await expect(page.getByRole('heading', { name: '每天只看 现在要做的事' })).toBeVisible()
})

test('completion status is isolated by traveler', async ({ page }) => {
  await page.getByRole('button', { name: '先用虚构数据看看' }).click()
  await page.getByRole('button', { name: /演示旅客 A/ }).click()
  const taskA = page.getByRole('button', { name: /出发前确认门票已下载到手机/ })
  await taskA.click()
  await expect(taskA.locator('..')).toHaveClass(/done/)
  await page.getByRole('button', { name: '切换旅客' }).click()
  await page.getByRole('button', { name: /演示旅客 B/ }).click()
  await expect(page.getByRole('button', { name: /出发前确认门票已下载到手机/ }).locator('..')).not.toHaveClass(/done/)
})

test('production build hides the date simulator and opens source detail', async ({ page }) => {
  await page.getByRole('button', { name: '先用虚构数据看看' }).click()
  await page.getByRole('button', { name: /演示旅客 A/ }).click()
  await expect(page.getByText('开发测试：模拟日期')).toHaveCount(0)
  await page.getByRole('button', { name: /普拉多博物馆/ }).click()
  await expect(page.getByRole('dialog', { name: '普拉多博物馆' })).toContainText('官网核验')
})

test('all four bottom tabs are reachable', async ({ page }) => {
  await page.getByRole('button', { name: '先用虚构数据看看' }).click()
  await page.getByRole('button', { name: /演示旅客 A/ }).click()
  for (const [tab, heading] of [['全部日程', '全部日程'], ['资料攻略', '资料攻略'], ['我的', '我的'], ['今日', /月|日/]] as const) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    if (typeof heading === 'string') await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  }
})

test('personal tasks can be added, edited, ignored, restored and deleted', async ({ page }) => {
  await page.getByRole('button', { name: '先用虚构数据看看' }).click()
  await page.getByRole('button', { name: /演示旅客 A/ }).click()
  page.once('dialog', (dialog) => dialog.accept('买一瓶水'))
  await page.getByRole('button', { name: '＋ 新增' }).click()
  const custom = page.getByRole('button', { name: /买一瓶水/ })
  await expect(custom).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept('买水和水果'))
  await custom.locator('..').getByRole('button', { name: '编辑' }).click()
  await expect(page.getByRole('button', { name: /买水和水果/ })).toBeVisible()
  await page.getByRole('button', { name: /出发前确认门票已下载到手机/ }).locator('..').getByRole('button', { name: '忽略' }).click()
  await expect(page.getByRole('button', { name: /出发前确认门票已下载到手机/ }).locator('..')).toHaveClass(/ignored/)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: /买水和水果/ }).locator('..').getByRole('button', { name: '删除' }).click()
  await expect(page.getByRole('button', { name: /买水和水果/ })).toHaveCount(0)
})

test('suggested event time and event state are personal overrides', async ({ page }) => {
  await page.getByRole('button', { name: '先用虚构数据看看' }).click()
  await page.getByRole('button', { name: /演示旅客 A/ }).click()
  const eventCard = page.locator('.event-card').filter({ hasText: '机场 → 市区' })
  await eventCard.click()
  page.once('dialog', (dialog) => dialog.accept('11:00'))
  await page.getByRole('button', { name: /调整我的建议时间/ }).click()
  await page.getByRole('button', { name: '已完成' }).click()
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(eventCard).toContainText('个人调整')
  await expect(eventCard).toContainText('已完成')
})

test('full calendar and location actions are available without exposing private query data', async ({ page }) => {
  await page.getByRole('button', { name: '先用虚构数据看看' }).click()
  await page.getByRole('button', { name: /演示旅客 A/ }).click()
  await page.getByRole('button', { name: '打开完整日历' }).click()
  const calendar = page.getByRole('dialog', { name: '完整日历' })
  await expect(calendar).toContainText('行前与返程连续显示')
  await calendar.getByRole('button', { name: /Madrid/ }).click()
  await page.getByRole('button', { name: /普拉多博物馆/ }).click()
  await expect(page.getByRole('link', { name: '查看地点' })).toBeVisible()
  await expect(page.getByRole('link', { name: '从当前位置导航' })).toBeVisible()
  await expect(page.getByRole('link', { name: '从上一站看路线' })).toBeVisible()
  await expect(page.getByText('结果未经核验')).toBeVisible()
})

test('guides can be searched across article content and sources', async ({ page }) => {
  await page.getByRole('button', { name: '先用虚构数据看看' }).click()
  await page.getByRole('button', { name: /演示旅客 A/ }).click()
  await page.getByRole('button', { name: '资料攻略', exact: true }).click()
  const search = page.getByRole('searchbox', { name: '搜索攻略' })
  await search.fill('虚构演示数据')
  await expect(page.getByRole('button', { name: /城市步行小提示/ })).toBeVisible()
  await search.fill('完全不存在的词')
  await expect(page.getByText('没有匹配的攻略或来源')).toBeVisible()
})
