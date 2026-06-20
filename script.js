import { analyzePixels, rankStyles, buildImprovements, buildActions, isLightColor } from './analysis-engine.js';
import { optimizeLayouts, recommendedFurniture, FURNITURE_CATALOG } from './layout-engine.js';

const RoomieApp = (() => {
  'use strict';

  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

  const styles = {
    airy: {
      name: '라이트 미니멀',
      description: '여백과 낮은 채도로 넓어 보이는 공간',
      palette: ['#F2EFE7', '#D8DCCF', '#9BA89B', '#4C574F'],
      tint: [225, 231, 217],
      light: '#e9e8de',
      main: '#aeb8aa',
      accent: '#6e7b70',
      items: ['가구·수납', '조명', '패브릭'],
      ratios: [55, 25, 20]
    },
    natural: {
      name: '웜 내추럴',
      description: '나무와 패브릭을 중심으로 편안한 공간',
      palette: ['#EFE3D0', '#C6A37D', '#8A6D50', '#586A52'],
      tint: [221, 185, 144],
      light: '#ead8bd',
      main: '#b78c64',
      accent: '#68785e',
      items: ['원목 가구', '패브릭', '식물·소품'],
      ratios: [50, 30, 20]
    },
    modern: {
      name: '소프트 모던',
      description: '단정한 선과 대비로 정리된 도시적 공간',
      palette: ['#E6E3DC', '#A6AAA6', '#59615F', '#252A29'],
      tint: [171, 181, 177],
      light: '#dcded9',
      main: '#858f8b',
      accent: '#3f4846',
      items: ['핵심 가구', '수납', '포인트 조명'],
      ratios: [60, 25, 15]
    },
    cozy: {
      name: '컬러풀 코지',
      description: '따뜻한 색과 부드러운 질감이 있는 공간',
      palette: ['#F5D8C4', '#D9876C', '#8C5B4C', '#66725B'],
      tint: [222, 142, 115],
      light: '#efd2c0',
      main: '#c9755e',
      accent: '#6f785e',
      items: ['소파·침구', '무드 조명', '컬러 소품'],
      ratios: [50, 30, 20]
    }
  };

  const labels = {
    roomType: { living: '거실', bedroom: '침실', studio: '원룸', office: '홈 오피스' },
    roomSize: { small: '6평 이하', medium: '7–12평', large: '13평 이상' },
    budget: { light: '50만원 이하', balanced: '50–150만원', full: '150만원 이상' },
    priority: { storage: '수납 개선', light: '더 밝은 공간', rest: '편안한 휴식', work: '집중과 생산성' }
  };

  const state = {
    file: null,
    image: null,
    objectUrl: '',
    analysis: null,
    selectedStyle: '',
    rankedStyles: [],
    layouts: [],
    selectedLayout: null,
    runId: 0,
    analysisTimer: 0,
    toastTimer: 0
  };

  const dom = {};

  function cacheDom() {
    const ids = [
      'roomForm', 'roomType', 'roomSize', 'budget', 'priority', 'uploadArea', 'fileInput',
      'photoPreview', 'previewImage', 'fileName', 'fileMeta', 'removeButton', 'sampleButton', 'analyzeButton',
      'analysisSection', 'analysisStatus', 'analysisGrid', 'brightnessValue', 'brightnessMeter',
      'brightnessNote', 'colorValue', 'dominantSwatch', 'colorNote', 'priorityValue',
      'improvementList', 'styleSection', 'stylePicker', 'selectedStyleSummary', 'layoutButton',
      'layoutSection', 'layoutForm', 'roomWidth', 'roomDepth', 'doorWall', 'windowWall',
      'furniturePicker', 'optimizeButton', 'layoutStatus', 'layoutResults', 'layoutOptions',
      'selectedLayoutSummary', 'generateButton',
      'resultSection', 'beforeImage', 'conceptLabel', 'conceptCanvas', 'actionList', 'budgetList',
      'palette', 'finalLayoutTitle', 'finalLayoutMetrics', 'finalLayoutPlan',
      'restartButton', 'downloadButton', 'toast'
    ];
    ids.forEach((id) => { dom[id] = document.getElementById(id); });
  }

  function init() {
    cacheDom();
    bindEvents();
    updateStep(1);
  }

  function bindEvents() {
    dom.fileInput.addEventListener('change', (event) => {
      const [file] = event.target.files;
      if (file) setFile(file);
    });

    ['dragenter', 'dragover'].forEach((type) => {
      dom.uploadArea.addEventListener(type, (event) => {
        event.preventDefault();
        dom.uploadArea.classList.add('is-dragging');
      });
    });

    ['dragleave', 'drop'].forEach((type) => {
      dom.uploadArea.addEventListener(type, (event) => {
        event.preventDefault();
        dom.uploadArea.classList.remove('is-dragging');
      });
    });

    dom.uploadArea.addEventListener('drop', (event) => {
      const [file] = event.dataTransfer.files;
      if (file) setFile(file);
    });

    dom.removeButton.addEventListener('click', resetPhoto);
    dom.sampleButton.addEventListener('click', loadSampleRoom);
    dom.roomForm.addEventListener('submit', startAnalysis);
    [dom.roomType, dom.roomSize, dom.budget, dom.priority].forEach((control) => {
      control.addEventListener('change', invalidateAnalysisFromInputs);
    });
    dom.layoutButton.addEventListener('click', openLayoutStep);
    dom.layoutForm.addEventListener('submit', optimizeRoomLayout);
    dom.layoutForm.addEventListener('input', invalidateLayoutFromInputs);
    dom.layoutForm.addEventListener('change', invalidateLayoutFromInputs);
    dom.generateButton.addEventListener('click', generateConcept);
    dom.restartButton.addEventListener('click', restart);
    dom.downloadButton.addEventListener('click', downloadConcept);
  }

  async function setFile(file) {
    if (!ALLOWED_TYPES.has(file.type)) {
      rejectFile('JPG, PNG 또는 WEBP 이미지만 선택할 수 있어요.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      rejectFile('사진 용량은 10MB 이하여야 해요.');
      return;
    }

    cancelAnalysis();
    const objectUrl = URL.createObjectURL(file);

    try {
      const image = await loadImage(objectUrl);
      releaseObjectUrl();
      state.file = file;
      state.image = image;
      state.objectUrl = objectUrl;
      state.analysis = null;
      dom.previewImage.src = objectUrl;
      dom.beforeImage.src = objectUrl;
      dom.fileName.textContent = file.name;
      dom.fileMeta.textContent = `${formatBytes(file.size)} · ${image.naturalWidth} × ${image.naturalHeight}px`;
      dom.uploadArea.hidden = true;
      dom.photoPreview.hidden = false;
      dom.analyzeButton.disabled = false;
      hideDownstream();
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      rejectFile('이미지를 읽을 수 없어요. 다른 사진을 선택해 주세요.');
    }
  }

  function rejectFile(message) {
    resetPhoto();
    showToast(message);
  }

  async function loadSampleRoom() {
    dom.sampleButton.disabled = true;
    try {
      const sampleFile = await createSampleFile();
      await setFile(sampleFile);
    } finally {
      dom.sampleButton.disabled = false;
    }
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
  }

  function resetPhoto() {
    cancelAnalysis();
    releaseObjectUrl();
    state.file = null;
    state.image = null;
    state.analysis = null;
    state.selectedStyle = '';
    state.layouts = [];
    state.selectedLayout = null;
    dom.fileInput.value = '';
    dom.previewImage.removeAttribute('src');
    dom.beforeImage.removeAttribute('src');
    dom.photoPreview.hidden = true;
    dom.uploadArea.hidden = false;
    dom.analyzeButton.disabled = true;
    hideDownstream();
    updateStep(1);
    dom.uploadArea.focus();
  }

  function hideDownstream() {
    dom.analysisSection.hidden = true;
    dom.styleSection.hidden = true;
    dom.layoutSection.hidden = true;
    dom.resultSection.hidden = true;
    dom.analysisGrid.hidden = true;
    dom.analysisStatus.textContent = '';
    dom.analysisStatus.className = 'analysis__status';
  }

  function invalidateAnalysisFromInputs() {
    if (!state.analysis) return;
    cancelAnalysis();
    state.analysis = null;
    state.rankedStyles = [];
    state.selectedStyle = '';
    state.layouts = [];
    state.selectedLayout = null;
    dom.analysisSection.hidden = true;
    dom.styleSection.hidden = true;
    dom.layoutSection.hidden = true;
    dom.resultSection.hidden = true;
    updateStep(1);
    showToast('공간 조건이 변경되었습니다. 사진을 다시 분석해 주세요.');
  }

  function invalidateLayoutFromInputs(event) {
    if (!state.layouts.length || event.target === dom.optimizeButton) return;
    state.layouts = [];
    state.selectedLayout = null;
    dom.layoutResults.hidden = true;
    dom.resultSection.hidden = true;
    dom.layoutStatus.textContent = '배치 조건이 변경되었습니다. 배치안을 다시 계산해 주세요.';
    updateStep(4);
  }

  function startAnalysis(event) {
    event.preventDefault();
    if (!state.image || !state.file) {
      showToast('먼저 공간 사진을 선택해 주세요.');
      return;
    }

    cancelAnalysis();
    const runId = ++state.runId;
    dom.analyzeButton.disabled = true;
    dom.analysisSection.hidden = false;
    dom.analysisGrid.hidden = true;
    dom.styleSection.hidden = true;
    dom.layoutSection.hidden = true;
    dom.resultSection.hidden = true;
    state.layouts = [];
    state.selectedLayout = null;
    dom.analysisStatus.className = 'analysis__status is-loading';
    dom.analysisStatus.textContent = '사진의 빛과 색을 분석하고 있어요…';
    updateStep(2);
    scrollToSection(dom.analysisSection);

    state.analysisTimer = window.setTimeout(() => {
      if (runId !== state.runId || !state.image) return;
      try {
        state.analysis = analyzeImage(state.image);
        state.rankedStyles = rankStyles(state.analysis);
        renderAnalysis(state.analysis);
        renderStyleOptions(state.rankedStyles);
        dom.analysisStatus.className = 'analysis__status';
        dom.analysisStatus.textContent = '분석이 완료되었습니다.';
        dom.analysisGrid.hidden = false;
        dom.styleSection.hidden = false;
        dom.analyzeButton.disabled = false;
        updateStep(3);
      } catch (error) {
        dom.analysisStatus.className = 'analysis__status';
        dom.analysisStatus.textContent = '사진 분석 중 문제가 발생했습니다.';
        dom.analyzeButton.disabled = false;
        showToast('사진을 분석하지 못했어요. 다른 사진으로 다시 시도해 주세요.');
      }
    }, 650);
  }

  function analyzeImage(image) {
    const canvas = document.createElement('canvas');
    const maxSide = 128;
    const scale = Math.min(maxSide / image.naturalWidth, maxSide / image.naturalHeight, 1);
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    return analyzePixels(data, canvas.width, canvas.height, {
      roomType: dom.roomType.value,
      roomSize: dom.roomSize.value,
      budget: dom.budget.value,
      priority: dom.priority.value
    });
  }

  function renderAnalysis(analysis) {
    const brightnessLabel = analysis.brightness < 38 ? '빛이 부족한 편' : analysis.brightness < 66 ? '안정적인 밝기' : '매우 밝은 편';
    const saturationLabel = analysis.saturation < 18 ? '차분한 저채도' : analysis.saturation < 36 ? '균형 잡힌 색감' : '선명한 색감';
    const temperature = analysis.warmth > 12 ? '따뜻한 톤' : analysis.warmth < -8 ? '서늘한 톤' : '중성 톤';

    dom.brightnessValue.textContent = `${analysis.brightness}% · ${brightnessLabel}`;
    dom.brightnessMeter.style.width = `${analysis.brightness}%`;
    dom.brightnessNote.textContent = analysis.brightness < 45
      ? '밝은 벽면과 간접 조명을 사용하면 답답함을 줄일 수 있어요.'
      : '현재 자연광을 살리면서 눈부심을 줄이는 방향이 좋아요.';
    dom.colorValue.textContent = `${temperature} · ${saturationLabel}`;
    dom.dominantSwatch.style.backgroundColor = analysis.dominantHex;
    dom.dominantSwatch.setAttribute('aria-label', `사진 주요 색조 ${analysis.dominantHex}`);
    dom.colorNote.textContent = `주요 색조 ${analysis.dominantHex}, 전체 평균 ${analysis.averageHex} · ${analysis.orientation} 사진`;
    dom.priorityValue.textContent = labels.priority[analysis.priority];

    replaceList(dom.improvementList, buildImprovements(analysis), 'li');
  }

  function renderStyleOptions(rankedStyles) {
    dom.stylePicker.replaceChildren();
    rankedStyles.forEach(({ key, score }, index) => {
      const style = styles[key];
      const wrapper = document.createElement('div');
      wrapper.className = 'style-option';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'interiorStyle';
      input.id = `style-${key}`;
      input.value = key;
      input.checked = index === 0;

      const label = document.createElement('label');
      label.htmlFor = input.id;
      label.style.setProperty('--style-light', style.light);
      label.style.setProperty('--style-main', style.main);
      label.style.setProperty('--style-accent', style.accent);

      const visual = document.createElement('span');
      visual.className = 'style-option__visual';
      visual.setAttribute('aria-hidden', 'true');

      if (index === 0) {
        const rank = document.createElement('span');
        rank.className = 'style-option__rank';
        rank.textContent = 'BEST MATCH';
        visual.append(rank);
      }

      const content = document.createElement('span');
      content.className = 'style-option__content';
      const title = document.createElement('h3');
      title.textContent = style.name;
      const description = document.createElement('p');
      description.textContent = `${style.description} · 적합도 ${score}점`;
      content.append(title, description);

      const check = document.createElement('span');
      check.className = 'style-option__check';
      check.textContent = '✓';
      check.setAttribute('aria-hidden', 'true');

      label.append(visual, content, check);
      wrapper.append(input, label);
      dom.stylePicker.append(wrapper);

      input.addEventListener('change', () => selectStyle(key));
    });

    selectStyle(rankedStyles[0].key);
  }

  function selectStyle(key) {
    state.selectedStyle = key;
    const best = state.rankedStyles[0].key === key ? '분석 결과 1순위' : '직접 선택';
    dom.selectedStyleSummary.textContent = `${styles[key].name} · ${best}`;
    if (!dom.resultSection.hidden) {
      dom.resultSection.hidden = true;
      updateStep(state.selectedLayout ? 4 : 3);
    }
  }

  function openLayoutStep() {
    if (!state.analysis || !state.selectedStyle) {
      showToast('사진 분석과 스타일 선택을 먼저 완료해 주세요.');
      return;
    }
    const dimensions = {
      small: [3, 3.2],
      medium: [4, 4],
      large: [5, 5]
    }[state.analysis.roomSize];
    dom.roomWidth.value = dimensions[0];
    dom.roomDepth.value = dimensions[1];
    renderFurniturePicker(state.analysis.roomType);
    state.layouts = [];
    state.selectedLayout = null;
    dom.layoutResults.hidden = true;
    dom.layoutStatus.textContent = '';
    dom.layoutSection.hidden = false;
    dom.resultSection.hidden = true;
    updateStep(4);
    scrollToSection(dom.layoutSection);
  }

  function renderFurniturePicker(roomType) {
    const recommended = new Set(recommendedFurniture(roomType));
    dom.furniturePicker.replaceChildren();
    Object.entries(FURNITURE_CATALOG).forEach(([id, item]) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'furniture-choice';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'furniture';
      input.id = `furniture-${id}`;
      input.value = id;
      input.checked = recommended.has(id);
      const label = document.createElement('label');
      label.htmlFor = input.id;
      const icon = document.createElement('span');
      icon.className = 'furniture-choice__icon';
      icon.textContent = item.icon;
      icon.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('span');
      copy.className = 'furniture-choice__copy';
      const name = document.createElement('strong');
      name.textContent = item.name;
      const size = document.createElement('small');
      size.textContent = `${item.width} × ${item.depth}m`;
      copy.append(name, size);
      label.append(icon, copy);
      wrapper.append(input, label);
      dom.furniturePicker.append(wrapper);
    });
  }

  function optimizeRoomLayout(event) {
    event.preventDefault();
    const furniture = [...dom.furniturePicker.querySelectorAll('input:checked')].map((input) => input.value);
    try {
      state.layouts = optimizeLayouts({
        width: dom.roomWidth.value,
        depth: dom.roomDepth.value,
        doorWall: dom.doorWall.value,
        windowWall: dom.windowWall.value,
        priority: state.analysis.priority,
        furniture
      });
      renderLayoutOptions(state.layouts);
      selectLayout(state.layouts[0].id);
      dom.layoutResults.hidden = false;
      dom.layoutStatus.textContent = '충돌 검사와 동선 계산을 완료했습니다. 세 가지 배치안을 비교해 보세요.';
      scrollToSection(dom.layoutResults);
    } catch (error) {
      dom.layoutResults.hidden = true;
      dom.layoutStatus.textContent = error.message;
      showToast(error.message);
    }
  }

  function renderLayoutOptions(layouts) {
    dom.layoutOptions.replaceChildren();
    layouts.forEach((layout, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'layout-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'layoutPlan';
      input.id = `layout-${layout.id}`;
      input.value = layout.id;
      input.checked = index === 0;
      const label = document.createElement('label');
      label.htmlFor = input.id;
      const header = document.createElement('div');
      header.className = 'layout-option__header';
      const heading = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = layout.name;
      const description = document.createElement('p');
      description.textContent = layout.description;
      heading.append(title, description);
      const score = document.createElement('strong');
      score.className = 'layout-option__score';
      score.textContent = layout.score;
      score.setAttribute('aria-label', `종합 점수 ${layout.score}점`);
      header.append(heading, score);
      const plan = document.createElement('div');
      renderFloorPlan(plan, layout);
      const metrics = document.createElement('div');
      metrics.className = 'layout-option__metrics';
      metrics.append(createMetric('동선', layout.circulation), createMetric('활용도', layout.utilization));
      label.append(header, plan, metrics);
      if (layout.unplaced.length) {
        const warning = document.createElement('p');
        warning.className = 'layout-option__warning';
        warning.textContent = `공간 부족: ${layout.unplaced.map((id) => FURNITURE_CATALOG[id].name).join(', ')}`;
        label.append(warning);
      }
      wrapper.append(input, label);
      dom.layoutOptions.append(wrapper);
      input.addEventListener('change', () => selectLayout(layout.id));
    });
  }

  function createMetric(label, value) {
    const metric = document.createElement('span');
    metric.className = 'layout-option__metric';
    const strong = document.createElement('strong');
    strong.textContent = `${value}점`;
    metric.append(strong, label);
    return metric;
  }

  function renderFloorPlan(container, layout) {
    container.replaceChildren();
    const plan = document.createElement('div');
    plan.className = 'floor-plan';
    plan.style.setProperty('--room-ratio', `${layout.room.width} / ${layout.room.depth}`);
    layout.items.forEach((item) => {
      const element = document.createElement('span');
      element.className = 'floor-plan__item';
      element.textContent = item.name;
      element.style.left = `${(item.x / layout.room.width) * 100}%`;
      element.style.top = `${(item.y / layout.room.depth) * 100}%`;
      element.style.width = `${(item.w / layout.room.width) * 100}%`;
      element.style.height = `${(item.d / layout.room.depth) * 100}%`;
      element.style.backgroundColor = item.color;
      plan.append(element);
    });
    const door = document.createElement('span');
    door.className = 'floor-plan__door';
    door.style.left = `${(layout.doorZone.x / layout.room.width) * 100}%`;
    door.style.top = `${(layout.doorZone.y / layout.room.depth) * 100}%`;
    door.style.width = `${(layout.doorZone.w / layout.room.width) * 100}%`;
    door.style.height = `${(layout.doorZone.d / layout.room.depth) * 100}%`;
    door.setAttribute('aria-label', '출입문 여유 공간');
    plan.append(door, createWindowMarker(layout));
    container.append(plan);
  }

  function createWindowMarker(layout) {
    const marker = document.createElement('span');
    marker.className = 'floor-plan__window';
    marker.setAttribute('aria-label', '주요 창문');
    const horizontal = layout.room.windowWall === 'top' || layout.room.windowWall === 'bottom';
    marker.style.width = horizontal ? '34%' : '4px';
    marker.style.height = horizontal ? '4px' : '34%';
    marker.style.left = horizontal ? '33%' : layout.room.windowWall === 'left' ? '-2px' : 'calc(100% - 2px)';
    marker.style.top = horizontal ? layout.room.windowWall === 'top' ? '-2px' : 'calc(100% - 2px)' : '33%';
    return marker;
  }

  function selectLayout(id) {
    state.selectedLayout = state.layouts.find((layout) => layout.id === id) || null;
    if (!state.selectedLayout) return;
    const layout = state.selectedLayout;
    dom.selectedLayoutSummary.textContent = `${layout.name} · 종합 ${layout.score}점 · ${layout.items.length}개 가구 배치`;
    if (!dom.resultSection.hidden) {
      dom.resultSection.hidden = true;
      updateStep(4);
    }
  }

  function generateConcept() {
    if (!state.analysis || !state.image || !styles[state.selectedStyle] || !state.selectedLayout) {
      showToast('사진·스타일·가구 배치 선택을 모두 완료해 주세요.');
      return;
    }

    renderConceptCanvas(state.image, styles[state.selectedStyle], state.analysis);
    renderResultDetails();
    dom.conceptLabel.textContent = styles[state.selectedStyle].name;
    dom.finalLayoutTitle.textContent = state.selectedLayout.name;
    dom.finalLayoutMetrics.textContent = `종합 ${state.selectedLayout.score}점 · 동선 ${state.selectedLayout.circulation}점 · 공간 활용 ${state.selectedLayout.utilization}점`;
    renderFloorPlan(dom.finalLayoutPlan, state.selectedLayout);
    dom.resultSection.hidden = false;
    updateStep(5);
    scrollToSection(dom.resultSection);
  }

  function renderConceptCanvas(image, style, analysis) {
    const canvas = dom.conceptCanvas;
    const width = 1000;
    const height = 700;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');

    context.save();
    context.filter = `brightness(${analysis.brightness < 48 ? 1.13 : 1.04}) contrast(1.04) saturate(${state.selectedStyle === 'modern' ? 0.82 : 0.96})`;
    drawImageCover(context, image, width, height);
    context.restore();

    context.fillStyle = `rgba(${style.tint.join(',')}, 0.18)`;
    context.fillRect(0, 0, width, height);

    const light = context.createRadialGradient(width * .78, height * .12, 10, width * .78, height * .12, width * .58);
    light.addColorStop(0, 'rgba(255,248,215,.36)');
    light.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = light;
    context.fillRect(0, 0, width, height);

    const vignette = context.createLinearGradient(0, 0, 0, height);
    vignette.addColorStop(0, 'rgba(20,25,20,0)');
    vignette.addColorStop(1, 'rgba(20,25,20,.16)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);

    context.fillStyle = 'rgba(255,255,255,.90)';
    roundedRect(context, 34, 34, 252, 58, 29);
    context.fill();
    context.fillStyle = '#1d211e';
    context.font = '700 22px system-ui, sans-serif';
    context.fillText(`${style.name} CONCEPT`, 62, 71);

    style.palette.forEach((color, index) => {
      context.beginPath();
      context.fillStyle = color;
      context.arc(62 + index * 38, height - 48, 13, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,.75)';
      context.stroke();
    });
  }

  function renderResultDetails() {
    const analysis = state.analysis;
    const style = styles[state.selectedStyle];
    const actions = buildActions(analysis, style.name);
    replaceList(dom.actionList, actions, 'li');

    dom.budgetList.replaceChildren();
    style.items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'budget-row';
      const name = document.createElement('span');
      name.textContent = item;
      const ratio = document.createElement('strong');
      ratio.textContent = `${style.ratios[index]}%`;
      const bar = document.createElement('div');
      bar.className = 'budget-row__bar';
      const fill = document.createElement('span');
      fill.style.width = `${style.ratios[index]}%`;
      bar.append(fill);
      row.append(name, ratio, bar);
      dom.budgetList.append(row);
    });

    dom.palette.replaceChildren();
    style.palette.forEach((color) => {
      const swatch = document.createElement('div');
      swatch.className = 'palette__color';
      swatch.style.backgroundColor = color;
      swatch.style.color = isLightColor(color) ? '#1d211e' : '#ffffff';
      swatch.style.textShadow = isLightColor(color) ? 'none' : '0 1px 4px rgba(0,0,0,.5)';
      swatch.textContent = color;
      dom.palette.append(swatch);
    });
  }

  function createSampleFile() {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 800;
      const context = canvas.getContext('2d');
      const wall = context.createLinearGradient(0, 0, 0, 560);
      wall.addColorStop(0, '#e9e3d8');
      wall.addColorStop(1, '#d7ddd2');
      context.fillStyle = wall;
      context.fillRect(0, 0, 1200, 560);
      context.fillStyle = '#b99772';
      context.fillRect(0, 560, 1200, 240);
      context.fillStyle = '#f5eedb';
      context.fillRect(755, 75, 315, 330);
      context.fillStyle = '#b9d2cf';
      context.fillRect(775, 95, 275, 290);
      context.fillStyle = '#6d7c70';
      roundedRect(context, 160, 430, 650, 235, 40);
      context.fill();
      context.fillStyle = '#859386';
      roundedRect(context, 195, 465, 275, 145, 24);
      context.fill();
      roundedRect(context, 500, 465, 275, 145, 24);
      context.fill();
      context.fillStyle = '#caa77d';
      context.beginPath();
      context.ellipse(870, 650, 210, 65, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#55705b';
      context.beginPath();
      context.arc(95, 410, 62, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#80664e';
      context.fillRect(75, 455, 42, 155);
      canvas.toBlob((blob) => {
        if (!blob) reject(new Error('샘플 공간을 만들 수 없습니다.'));
        else resolve(new File([blob], 'roomie-sample-room.png', { type: 'image/png' }));
      }, 'image/png');
    });
  }

  function downloadConcept() {
    if (!dom.conceptCanvas.width) return;
    dom.conceptCanvas.toBlob((blob) => {
      if (!blob) {
        showToast('이미지를 저장하지 못했어요.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `roomie-${state.selectedStyle}-concept.png`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  function restart() {
    resetPhoto();
    document.getElementById('projectForm').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  function updateStep(current) {
    document.querySelectorAll('.stepper__item').forEach((item, index) => {
      const step = index + 1;
      item.classList.toggle('is-current', step === current);
      item.classList.toggle('is-complete', step < current);
      if (step === current) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
  }

  function scrollToSection(section) {
    section.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  function drawImageCover(context, image, width, height) {
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    const targetRatio = width / height;
    let sourceWidth = image.naturalWidth;
    let sourceHeight = image.naturalHeight;
    let sourceX = 0;
    let sourceY = 0;

    if (sourceRatio > targetRatio) {
      sourceWidth = image.naturalHeight * targetRatio;
      sourceX = (image.naturalWidth - sourceWidth) / 2;
    } else {
      sourceHeight = image.naturalWidth / targetRatio;
      sourceY = (image.naturalHeight - sourceHeight) / 2;
    }
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
  }

  function roundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }

  function replaceList(container, values, tagName) {
    container.replaceChildren();
    values.forEach((value) => {
      const item = document.createElement(tagName);
      item.textContent = value;
      container.append(item);
    });
  }

  function cancelAnalysis() {
    state.runId += 1;
    if (state.analysisTimer) {
      window.clearTimeout(state.analysisTimer);
      state.analysisTimer = 0;
    }
    if (dom.analyzeButton) dom.analyzeButton.disabled = !state.file;
  }

  function releaseObjectUrl() {
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = '';
    }
  }

  function showToast(message) {
    window.clearTimeout(state.toastTimer);
    dom.toast.textContent = message;
    dom.toast.hidden = false;
    state.toastTimer = window.setTimeout(() => { dom.toast.hidden = true; }, 3600);
  }

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', RoomieApp.init);
