import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePixels, rankStyles, buildImprovements, buildActions, STYLE_KEYS } from '../analysis-engine.js';

function pixels(colors) {
  return new Uint8ClampedArray(colors.flat());
}

const metadata = {
  roomType: 'living',
  roomSize: 'medium',
  budget: 'balanced',
  priority: 'storage'
};

test('불투명 픽셀의 밝기와 색을 계산한다', () => {
  const result = analyzePixels(pixels([[200, 150, 100, 255]]), 1, 1, metadata);
  assert.equal(result.averageHex, '#C89664');
  assert.equal(result.dominantHex, '#C89664');
  assert.equal(result.warmth, 100);
  assert.equal(result.orientation, '가로형');
});

test('투명 픽셀은 분석에서 제외한다', () => {
  const result = analyzePixels(pixels([
    [0, 0, 0, 0],
    [240, 240, 240, 255]
  ]), 2, 1, metadata);
  assert.equal(result.averageHex, '#F0F0F0');
  assert.ok(result.brightness > 90);
});

test('가장 빈도가 높은 색상 군집을 주요 색조로 선택한다', () => {
  const result = analyzePixels(pixels([
    [210, 80, 60, 255],
    [214, 84, 62, 255],
    [45, 90, 200, 255]
  ]), 3, 1, metadata);
  assert.equal(result.dominantHex, '#D4523D');
  assert.notEqual(result.dominantHex, result.averageHex);
});

test('완전히 투명한 이미지는 명확한 오류를 반환한다', () => {
  assert.throws(
    () => analyzePixels(pixels([[0, 0, 0, 0]]), 1, 1, metadata),
    /불투명한 이미지 픽셀/
  );
});

test('모든 조건 조합에서 추천은 결정적이고 중복이 없다', () => {
  const roomTypes = ['living', 'bedroom', 'studio', 'office'];
  const roomSizes = ['small', 'medium', 'large'];
  const budgets = ['light', 'balanced', 'full'];
  const priorities = ['storage', 'light', 'rest', 'work'];
  let combinations = 0;

  for (const roomType of roomTypes) {
    for (const roomSize of roomSizes) {
      for (const budget of budgets) {
        for (const priority of priorities) {
          const analysis = { brightness: 48, saturation: 32, warmth: 9, roomType, roomSize, budget, priority };
          const first = rankStyles(analysis);
          const second = rankStyles(analysis);
          assert.deepEqual(first, second);
          assert.equal(first.length, STYLE_KEYS.length);
          assert.equal(new Set(first.map(({ key }) => key)).size, STYLE_KEYS.length);
          assert.equal(buildImprovements(analysis).length, 3);
          assert.equal(buildActions(analysis, '테스트 스타일').length, 3);
          combinations += 1;
        }
      }
    }
  }

  assert.equal(combinations, 144);
});

test('극단적인 이미지에서도 스타일 적합도는 0~100점 범위다', () => {
  for (const analysis of [
    { brightness: 0, saturation: 100, warmth: -255, roomSize: 'small', budget: 'light', priority: 'light' },
    { brightness: 100, saturation: 100, warmth: 255, roomSize: 'large', budget: 'full', priority: 'rest' }
  ]) {
    rankStyles(analysis).forEach(({ score }) => assert.ok(score >= 0 && score <= 100));
  }
});
