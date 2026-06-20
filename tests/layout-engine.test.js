import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeLayouts, recommendedFurniture, rectanglesOverlap, FURNITURE_CATALOG } from '../layout-engine.js';

const base = {
  width: 4,
  depth: 4,
  doorWall: 'bottom',
  windowWall: 'top',
  priority: 'storage',
  furniture: recommendedFurniture('living')
};

test('세 가지 결정적 배치안을 생성한다', () => {
  const first = optimizeLayouts(base);
  const second = optimizeLayouts(base);
  assert.equal(first.length, 3);
  assert.deepEqual(first, second);
  assert.deepEqual(new Set(first.map(({ id }) => id)), new Set(['flow', 'balanced', 'compact']));
  assert.ok(first[0].score >= first[1].score && first[1].score >= first[2].score);
  const signatures = first.map((layout) => layout.items.map((item) => `${item.id}:${item.x}:${item.y}:${item.w}:${item.d}`).join('|'));
  assert.equal(new Set(signatures).size, 3);
});

test('모든 가구는 방 안에 있고 서로 겹치지 않는다', () => {
  for (const layout of optimizeLayouts(base)) {
    for (const item of layout.items) {
      assert.ok(item.x >= 0 && item.y >= 0);
      assert.ok(item.x + item.w <= layout.room.width + 0.001);
      assert.ok(item.y + item.d <= layout.room.depth + 0.001);
      assert.equal(rectanglesOverlap(item, layout.doorZone, 0.08), false);
    }
    for (let i = 0; i < layout.items.length; i += 1) {
      for (let j = i + 1; j < layout.items.length; j += 1) {
        assert.equal(rectanglesOverlap(layout.items[i], layout.items[j], 0.12), false);
      }
    }
  }
});

test('공간 유형별 권장 가구가 카탈로그에 존재한다', () => {
  for (const roomType of ['living', 'bedroom', 'studio', 'office']) {
    const furniture = recommendedFurniture(roomType);
    assert.ok(furniture.length >= 4);
    furniture.forEach((id) => assert.ok(FURNITURE_CATALOG[id]));
  }
});

test('작은 방에서도 배치 결과와 미배치 정보를 반환한다', () => {
  const layouts = optimizeLayouts({ ...base, width: 2.2, depth: 2.2, furniture: Object.keys(FURNITURE_CATALOG) });
  layouts.forEach((layout) => {
    assert.ok(layout.items.length > 0);
    assert.ok(layout.unplaced.length > 0);
    assert.ok(layout.score >= 0 && layout.score <= 100);
  });
});

test('극소형 방에서도 서로 다른 세 가지 배치안을 유지한다', () => {
  for (const room of [
    { width: 2, depth: 2, roomType: 'living' },
    { width: 2, depth: 2.5, roomType: 'bedroom' }
  ]) {
    for (const doorWall of ['top', 'right', 'bottom', 'left']) {
      for (const windowWall of ['top', 'right', 'bottom', 'left']) {
        for (const priority of ['storage', 'light', 'rest', 'work']) {
          const layouts = optimizeLayouts({
            ...room,
            doorWall,
            windowWall,
            priority,
            furniture: recommendedFurniture(room.roomType)
          });
          const signatures = layouts.map((layout) => layout.items
            .map((item) => `${item.id}:${item.x}:${item.y}:${item.w}:${item.d}`)
            .join('|'));
          assert.equal(new Set(signatures).size, 3);
        }
      }
    }
  }
});

test('잘못된 치수와 빈 가구 선택을 거부한다', () => {
  assert.throws(() => optimizeLayouts({ ...base, width: 1.5 }), /2m 이상 8m 이하/);
  assert.throws(() => optimizeLayouts({ ...base, furniture: [] }), /하나 이상/);
});

test('256개 구조·목표 조합에서 경계, 문, 가구 충돌 불변식을 지킨다', () => {
  const walls = ['top', 'right', 'bottom', 'left'];
  const priorities = ['storage', 'light', 'rest', 'work'];
  let combinations = 0;
  for (const roomType of ['living', 'bedroom', 'studio', 'office']) {
    for (const doorWall of walls) {
      for (const windowWall of walls) {
        for (const priority of priorities) {
          const layouts = optimizeLayouts({
            width: 4.2,
            depth: 3.8,
            doorWall,
            windowWall,
            priority,
            furniture: recommendedFurniture(roomType)
          });
          const signatures = layouts.map((layout) => layout.items.map((item) => `${item.id}:${item.x}:${item.y}:${item.w}:${item.d}`).join('|'));
          assert.equal(new Set(signatures).size, 3);
          layouts.forEach((layout) => {
            layout.items.forEach((item, index) => {
              assert.ok(item.x >= 0 && item.y >= 0);
              assert.ok(item.x + item.w <= layout.room.width + 0.001);
              assert.ok(item.y + item.d <= layout.room.depth + 0.001);
              assert.equal(rectanglesOverlap(item, layout.doorZone, 0.08), false);
              layout.items.slice(index + 1).forEach((other) => {
                assert.equal(rectanglesOverlap(item, other, 0.12), false);
              });
            });
          });
          combinations += 1;
        }
      }
    }
  }
  assert.equal(combinations, 256);
});
