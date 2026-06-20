import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, css, script, buildScript] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../style.css', import.meta.url), 'utf8'),
  readFile(new URL('../script.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.js', import.meta.url), 'utf8')
]);

test('HTML id는 중복되지 않고 JavaScript 캐시 id가 모두 존재한다', () => {
  const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(htmlIds).size, htmlIds.length);
  const cacheBlock = script.match(/const ids = \[([\s\S]*?)\];/);
  assert.ok(cacheBlock);
  const cachedIds = [...cacheBlock[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  cachedIds.forEach((id) => assert.ok(htmlIds.includes(id), `누락된 HTML id: ${id}`));
});

test('5단계 흐름과 접근성·보안 기본 계약을 유지한다', () => {
  assert.equal((html.match(/class="stepper__item/g) || []).length, 5);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /aria-live=/);
  assert.match(html, /rel="icon"/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
});

test('앱 로직은 무작위 점수·외부 전송·innerHTML을 사용하지 않는다', () => {
  assert.doesNotMatch(script, /Math\.random/);
  assert.doesNotMatch(script, /\bfetch\s*\(/);
  assert.doesNotMatch(script, /XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(script, /innerHTML/);
});

test('배포 산출물 목록에 필요한 공개 파일만 명시한다', () => {
  for (const file of ['index.html', 'style.css', 'script.js', 'analysis-engine.js', 'layout-engine.js', 'favicon.svg']) {
    assert.match(buildScript, new RegExp(file.replace('.', '\\.')));
  }
  assert.doesNotMatch(buildScript, /ouroboros|openspec/);
});
