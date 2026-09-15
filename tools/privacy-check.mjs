import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const dist = existsSync(resolve(root, 'dist'))
  ? execFileSync('find', ['dist', '-type', 'f'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  : []
const forbiddenFile = resolve(root, '.private/privacy-forbidden.txt')
const forbidden = existsSync(forbiddenFile)
  ? readFileSync(forbiddenFile, 'utf8').split('\n').map((value) => value.trim()).filter(Boolean)
  : []
const binary = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.woff', '.woff2', '.pdf', '.docx'])
const problems = []
for (const relative of [...tracked, ...dist]) {
  if (relative.startsWith('.private/') || relative.startsWith('private/') || relative.startsWith('reports/private/')) problems.push(`${relative}: private path is tracked or built`)
  const absolute = resolve(root, relative)
  if (!existsSync(absolute) || statSync(absolute).isDirectory() || binary.has(extname(relative).toLowerCase())) continue
  const content = readFileSync(absolute, 'utf8')
  for (const marker of forbidden) if (content.includes(marker)) problems.push(`${relative}: contains a private marker`)
  if (/\b(?:passport|护照号|证件号)\s*[:：]\s*[A-Z0-9]{6,}/i.test(content)) problems.push(`${relative}: resembles an identity-document field`)
}
if (problems.length) {
  console.error(`Privacy check failed:\n${problems.join('\n')}`)
  process.exit(1)
}
console.log(`Privacy check passed (${tracked.length} tracked files, ${dist.length} built files, ${forbidden.length} private markers).`)
