export const STYLE_KEYS = ['airy', 'natural', 'modern', 'cozy'];

export function analyzePixels(data, width, height, metadata) {
  if (!data || !width || !height) throw new Error('분석할 이미지 데이터가 필요합니다.');

  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;
  let saturationTotal = 0;
  let count = 0;
  const colorBuckets = new Map();

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha < 128) continue;

    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const bucketKey = `${red >> 5}-${green >> 5}-${blue >> 5}`;
    const bucket = colorBuckets.get(bucketKey) || { red: 0, green: 0, blue: 0, count: 0 };

    redTotal += red;
    greenTotal += green;
    blueTotal += blue;
    saturationTotal += max === 0 ? 0 : (max - min) / max;
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    bucket.count += 1;
    colorBuckets.set(bucketKey, bucket);
    count += 1;
  }

  if (!count) throw new Error('불투명한 이미지 픽셀을 찾을 수 없습니다.');

  const red = Math.round(redTotal / count);
  const green = Math.round(greenTotal / count);
  const blue = Math.round(blueTotal / count);
  const dominant = [...colorBuckets.values()].sort((a, b) => b.count - a.count)[0];
  const dominantRed = Math.round(dominant.red / dominant.count);
  const dominantGreen = Math.round(dominant.green / dominant.count);
  const dominantBlue = Math.round(dominant.blue / dominant.count);
  const brightness = Math.round(((red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255) * 100);

  return {
    red,
    green,
    blue,
    brightness,
    saturation: Math.round((saturationTotal / count) * 100),
    warmth: red - blue,
    dominantHex: rgbToHex(dominantRed, dominantGreen, dominantBlue),
    averageHex: rgbToHex(red, green, blue),
    orientation: width >= height ? '가로형' : '세로형',
    ...metadata
  };
}

export function rankStyles(analysis) {
  const scores = {
    airy: 54 + (55 - analysis.brightness) * 0.35 - analysis.saturation * 0.08,
    natural: 55 + analysis.warmth * 0.18 + (analysis.priority === 'rest' ? 18 : 0),
    modern: 58 + Math.abs(analysis.brightness - 55) * 0.08 + (analysis.priority === 'work' ? 20 : 0),
    cozy: 52 + analysis.saturation * 0.2 + (analysis.priority === 'rest' ? 12 : 0)
  };

  if (analysis.priority === 'light') scores.airy += 24;
  if (analysis.priority === 'storage') scores.modern += 18;
  if (analysis.roomSize === 'small') scores.airy += 10;
  if (analysis.budget === 'light') scores.airy += 6;
  if (analysis.warmth < -5) scores.natural += 8;

  return STYLE_KEYS.map((key) => ({ key, score: Math.min(100, Math.max(0, Math.round(scores[key]))) }))
    .sort((a, b) => b.score - a.score || STYLE_KEYS.indexOf(a.key) - STYLE_KEYS.indexOf(b.key));
}

export function buildImprovements(analysis) {
  const first = {
    storage: '세로 수납과 닫힌 수납을 먼저 확보하세요.',
    light: '천장등 하나보다 높이가 다른 조명을 나누어 배치하세요.',
    rest: '시야에 들어오는 색을 세 가지 안으로 줄여보세요.',
    work: '작업면과 이동 동선을 분리해 집중 구역을 만드세요.'
  }[analysis.priority];
  const second = analysis.brightness < 45
    ? '창 주변을 비우고 밝은 면적을 넓히는 것이 효과적이에요.'
    : '빛을 막지 않는 낮은 가구 배치를 유지하세요.';
  const third = analysis.roomSize === 'small'
    ? '바닥이 보이는 다리형 가구로 공간감을 확보하세요.'
    : '큰 가구를 벽에만 붙이지 말고 기능별 영역을 나누세요.';
  return [first, second, third];
}

export function buildActions(analysis, styleName) {
  const roomAction = {
    living: '가장 큰 가구의 위치를 정한 뒤 대화 동선을 80cm 이상 확보하세요.',
    bedroom: '침대 주변 시야를 단순하게 하고 양쪽 조명의 높이를 맞추세요.',
    studio: '수면·작업 영역을 러그나 조명으로 분리하되 가구로 막지 마세요.',
    office: '창이 옆으로 오도록 책상을 두고 화면 반사를 줄이세요.'
  }[analysis.roomType];
  const priorityAction = {
    storage: '자주 쓰는 물건은 열린 수납, 나머지는 같은 색의 닫힌 수납에 모으세요.',
    light: '천장 조명 40%, 작업 조명 35%, 무드 조명 25%로 빛을 나누세요.',
    rest: '촉감이 다른 패브릭 두 종류와 낮은 색온도의 조명을 더하세요.',
    work: '작업면 위 물건을 세 종류 이하로 줄이고 수직 수납을 사용하세요.'
  }[analysis.priority];
  const budgetAction = analysis.budget === 'light'
    ? `${styleName} 팔레트에 맞춰 조명과 패브릭부터 교체하세요.`
    : analysis.budget === 'balanced'
      ? '핵심 가구 하나를 정하고 나머지는 조명·패브릭으로 완성하세요.'
      : '맞춤 수납과 핵심 가구에 우선 투자하고 장식은 마지막에 결정하세요.';
  return [roomAction, priorityAction, budgetAction];
}

export function rgbToHex(red, green, blue) {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function isLightColor(hex) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 > 155;
}
