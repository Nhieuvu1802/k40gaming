'use strict';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const DB_KEY = 'cam-timer-data';
const DEFAULT_CATALOG_URL = 'https://vvn.freedev.app/api/catalog.php';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const PASTE_LIMITS = { purple: 2 * HOUR, white: 3 * HOUR };
const PASTE_SETUP_LIMITS = { purple: 12 * HOUR, white: 24 * HOUR };
const PROFLOW_LIMIT = 72 * HOUR;
const PASTE_OPEN_LIMIT = 6 * DAY;
const J58633_LIMIT = 18 * HOUR;
const PASTE_LABELS = { purple: 'CHÌ TÍM · PROFLOW TÍM', white: 'CHÌ TRẮNG · PROFLOW ĐEN' };
const FLUX_OPEN_LIMIT = 36 * HOUR;
const FLUX_SUBSTRATE_LIMIT = 3 * HOUR;

const FLUX_CARRIER_POSITIONS = [
  { name: '3-up', total: 3, columns: 3, weigh: [1, 2, 3] },
  { name: '4-up', total: 4, columns: 2, weigh: [1, 2, 3, 4] },
  { name: '6-up', total: 6, columns: 3, weigh: [1, 2, 5, 6] },
  { name: '8-up', total: 8, columns: 4, weigh: [1, 3, 6, 8] },
  { name: '10-up', total: 10, columns: 5, weigh: [1, 3, 8, 10] },
  { name: '12-up', total: 12, columns: 4, weigh: [1, 4, 9, 12] },
  { name: '14-up', total: 14, columns: 7, weigh: [1, 5, 10, 14] },
  { name: '16-up', total: 16, columns: 4, weigh: [1, 5, 12, 16] },
  { name: '21-up · Legacy CS', total: 21, columns: 7, weigh: [1, 7, 10, 12, 15, 21] },
  { name: '21-up · CPU / 1269 onwards CS', total: 21, columns: 7, weigh: [1, 10, 12, 21] },
  { name: '24-up · Legacy CS', total: 24, columns: 6, weigh: [1, 8, 11, 14, 17, 24] },
  { name: '24-up · CPU / 1269 onwards CS', total: 24, columns: 6, weigh: [1, 11, 14, 24] },
  { name: '24-up · Captive carrier fixture', total: 24, columns: 6, weigh: [2, 11, 14, 23] },
  { name: '36-up', total: 36, columns: 6, weigh: [1, 15, 22, 36] }
];

const DIE_CHECKS = [
  'Die lot khớp ATPO trên Workstream',
  'Đủ substrate 599; cân Flux đúng vị trí, đơn vị mg và reset 0',
  'Chuẩn bị cart trước khi kết thúc lot hiện tại',
  'POR substrate = Mother + Child trên WITS',
  'Carrier và MHS loader không SOOP',
  'Đúng FIFO: 1 lot/lần, 1 lot/cart',
  'Die feeder/reel đúng recipe và đã đồng bộ trên SC; trạng thái không Unknown',
  'Tip Grohmann không FM / bi hụt hai',
  'Đã chạy CQG / Auto Compensation nếu cần; Buy-off đủ 3 carrier GSC1 + 3 carrier GSC2',
  'Die-only long link đã BYPASS + PASSTHRU'
];

const PASSDOWN_ITEMS = [
  'An toàn: sự cố, near miss, điều kiện bất thường',
  'Chất lượng: hold, reject, DRB/MRB, excursion',
  'Thiết bị: trạng thái Tool, alarm, công việc ES/MTE',
  'Lot đang chạy: Lot#, tiến độ và vấn đề hiện tại',
  'SC Entities: thời gian setup DEK tiếp theo',
  'Flux: lần phun cuối, lượng còn và thời điểm hết hạn',
  'Paste: lần dispense cuối và TIME_ON_STENCIL',
  'Paste Freezer: thời điểm lấy ra và sit time',
  'Passives: đủ reel, reel sắp hết và feeder position',
  'Lot kế tiếp: sản phẩm và yêu cầu setup mới'
];

const DEFAULT_STATE = {
  paste: [], flux: [], passives: [], die: [], passdown: [], calculationHistory: [],
  quickChecks: Array(10).fill(false),
  dieChecks: Array(10).fill(false),
  passdownChecks: Array(10).fill(false),
  activeProductId: null,
  productOverrides: {},
  remoteCatalog: null,
  catalogRemoteUrl: DEFAULT_CATALOG_URL,
  catalogSyncedAt: null
};

let state = loadState();
let installPrompt = null;
let toastTimer = null;
let catalogTab = 'products';
let catalogSyncBusy = false;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
    return {
      ...DEFAULT_STATE,
      ...saved,
      paste: Array.isArray(saved.paste) ? saved.paste.map(normalizePaste) : [],
      flux: Array.isArray(saved.flux) ? saved.flux.map(normalizeFlux) : [],
      passives: Array.isArray(saved.passives) ? saved.passives.map(normalizePassives) : [],
      die: Array.isArray(saved.die) ? saved.die.map(normalizeDie) : [],
      passdown: Array.isArray(saved.passdown) ? saved.passdown : [],
      calculationHistory: Array.isArray(saved.calculationHistory) ? saved.calculationHistory : [],
      quickChecks: normalizeChecks(saved.quickChecks),
      dieChecks: normalizeChecks(saved.dieChecks),
      passdownChecks: normalizeChecks(saved.passdownChecks),
      activeProductId: saved.activeProductId || null,
      productOverrides: saved.productOverrides && typeof saved.productOverrides === 'object' ? saved.productOverrides : {},
      remoteCatalog: saved.remoteCatalog && Array.isArray(saved.remoteCatalog.products) ? saved.remoteCatalog : null,
      catalogRemoteUrl: saved.catalogRemoteUrl || DEFAULT_CATALOG_URL,
      catalogSyncedAt: saved.catalogSyncedAt || null
    };
  } catch {
    return structuredCloneSafe(DEFAULT_STATE);
  }
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeChecks(checks) {
  return Array.from({ length: 10 }, (_, index) => Boolean(Array.isArray(checks) && checks[index]));
}

function normalizePaste(item) {
  const originalType = item.type || 'white';
  const type = originalType === 'purple' ? 'purple' : 'white';
  return {
    id: item.id || uid(), name: item.name || item.pn || 'Paste', type,
    proflowColor: item.proflowColor || (type === 'purple' ? 'purple' : 'black'),
    proflowMode: item.proflowMode || 'new',
    specialMaterial: item.specialMaterial === 'j58633' || item.specialMaterial === true ? 'j58633' : 'standard',
    tubes: Math.max(1, Number(item.tubes) || 1),
    sliCount: Math.max(1, Number(item.sliCount) || 1),
    freezerAt: item.freezerAt || item.thaw || null,
    proflowAt: item.proflowAt || item.pro || null,
    setupAt: item.setupAt || item.proflowAt || item.pro || null,
    openAt: item.openAt || item.open || null,
    stencilAt: item.stencilAt || null,
    substrateAt: item.substrateAt || null,
    createdAt: item.createdAt || item.created || new Date().toISOString()
  };
}

function normalizeFlux(item) {
  return {
    id: item.id || uid(), type: item.type || 'Flux', operatorName: item.operatorName || item.operator || '', openAt: item.openAt || item.open || null,
    substrateAt: item.substrateAt || item.sub || null, potlifeAt: item.potlifeAt || null,
    amount: Number(item.amount ?? item.amt ?? 1), createdAt: item.createdAt || item.created || new Date().toISOString()
  };
}

function normalizePassives(item) {
  return {
    id: item.id || uid(), pn: item.pn || 'Reel', lot: item.lot || '',
    expiryAt: item.expiryAt || item.exp || null, installedAt: item.installedAt || item.inst || null,
    feeder: item.feeder || item.fed || '', msl: item.msl || 'N/A', createdAt: item.createdAt || item.created || new Date().toISOString()
  };
}

function normalizeDie(item) {
  return {
    id: item.id || uid(), lot: item.lot || '', atpo: item.atpo || '', substrate: item.substrate || item.sub || '',
    pn: item.pn || '', quantity: Number(item.quantity ?? item.qty ?? 0), matched: Boolean(item.matched),
    createdAt: item.createdAt || item.created || new Date().toISOString()
  };
}

function saveState() {
  localStorage.setItem(DB_KEY, JSON.stringify(state));
}

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function toLocalInput(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function remainingText(milliseconds) {
  if (milliseconds <= 0) return 'HẾT HẠN';
  const total = Math.floor(milliseconds / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days) return `${days}d ${hours}h ${minutes}m`;
  if (hours) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function timerStatus(remaining, total) {
  if (remaining <= 0) return 'expired';
  const warningAt = Math.min(6 * HOUR, Math.max(30 * 60_000, total * .2));
  return remaining <= warningAt ? 'warning' : 'safe';
}

function worstStatus(statuses) {
  if (statuses.includes('expired')) return 'expired';
  if (statuses.includes('warning')) return 'warning';
  return 'safe';
}

function showToast(message, type = '') {
  clearTimeout(toastTimer);
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`.trim();
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 2600);
}

function setMenu(open) {
  $('#sidebar').classList.toggle('open', open);
  $('#overlay').classList.toggle('show', open);
}

function showPage(name) {
  const page = $(`#page-${name}`);
  if (!page) return;
  $$('.page').forEach((node) => node.classList.toggle('active', node === page));
  $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.page === name));
  $$('.bottom-item[data-page]').forEach((button) => button.classList.toggle('active', button.dataset.page === name));
  $('#page-title').textContent = page.dataset.title;
  setMenu(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderAll();
}

function showRule(name) {
  $$('.rule-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.rule === name));
  $$('.rule-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `rule-${name}`));
}

function showGuide(name) {
  $$('.guide-tabs button[data-guide]').forEach((button) => button.classList.toggle('active', button.dataset.guide === name));
  $$('.guide-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `guide-${name}`));
}

function updateClock() {
  $('#clock').textContent = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function updateNetwork() {
  const online = navigator.onLine;
  $('#network-state').textContent = online ? 'Online' : 'Offline';
  $('#network-state').classList.toggle('offline', !online);
}

function timerCell(label, start, limit) {
  if (!start) return `<div class="timer-cell"><small>${label}</small><b>—</b></div>`;
  const remaining = new Date(start).getTime() + limit - Date.now();
  const status = timerStatus(remaining, limit);
  return `<div class="timer-cell ${status}"><small>${label}</small><b>${remainingText(remaining)}</b></div>`;
}

function readinessCell(label, start, wait) {
  if (!start) return `<div class="timer-cell"><small>${label}</small><b>—</b></div>`;
  const remaining = new Date(start).getTime() + wait - Date.now();
  if (remaining <= 0) return `<div class="timer-cell safe"><small>${label}</small><b>ĐỦ SIT TIME</b></div>`;
  return `<div class="timer-cell warning"><small>${label}</small><b>${remainingText(remaining)}</b></div>`;
}

function pasteSetupLimit(item) {
  return PASTE_SETUP_LIMITS[item.type] || PASTE_SETUP_LIMITS.white;
}

function pasteWarmupLimit(item) {
  return PASTE_LIMITS[item.type] || PASTE_LIMITS.white;
}

function pasteMaterialLimit(item) {
  return item.specialMaterial === 'j58633' ? J58633_LIMIT : null;
}

function applyPastePnFromCatalog() {
  const pn = $('#paste-name').value.trim();
  const spec = catalogApi()?.pasteByPn(pn);
  if (!spec) return;
  $('#paste-type').value = spec.color;
  $('#paste-proflow-color').value = spec.proflowColor;
  $('#paste-special-material').value = spec.special || 'standard';
  if (!spec.fill) $('#paste-proflow-mode').value = 'new';
  syncPastePair();
  showToast(`Đã nạp hạn ${spec.pn} từ catalog.`);
}


function catalogApi() {
  const base = window.CAM_PRODUCT_DB;
  if (!base) return null;
  const remote = state.remoteCatalog;
  const sourceProducts = remote?.products || base.products;
  const products = sourceProducts.map((item) => ({ ...item, ...(state.productOverrides[item.id] || {}) }));
  const materials = remote?.materials || base.materials;
  const searchableText = (item) => Object.values(item || {}).flatMap((value) => Array.isArray(value) ? value : [value]).filter((value) => ['string', 'number'].includes(typeof value)).join(' ').toLowerCase();
  return {
    all: () => ({ ...base, ...(remote || {}), products, materials }),
    products: () => products,
    productById: (id) => products.find((item) => item.id === id) || null,
    pasteByPn: (pn) => materials.paste.find((item) => item.pn === pn) || null,
    fluxByPn: (pn) => materials.flux.find((item) => item.pn === pn) || null,
    search(query) {
      const q = String(query || '').trim().toLowerCase();
      const hit = (item) => !q || searchableText(item).includes(q);
      return {
        products: products.filter(hit), paste: materials.paste.filter(hit), flux: materials.flux.filter(hit),
        passives: materials.passives.filter(hit), die: materials.die.filter(hit), stencil: materials.stencil.filter(hit)
      };
    }
  };
}

function searchKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd');
}

function openGlobalSearch(query = '') {
  const dialog = $('#global-search');
  dialog.hidden = false;
  document.body.classList.add('modal-open');
  $('#global-search-input').value = query;
  setTimeout(() => $('#global-search-input').focus(), 0);
  if (query) runGlobalSearch(query);
}

function closeGlobalSearch() {
  $('#global-search').hidden = true;
  document.body.classList.remove('modal-open');
}

function globalGuideIndex() {
  const entries = [];
  $$('.page').forEach((page) => {
    const pageName = page.dataset.title || page.id.replace('page-', '');
    $$('h2, h3', page).forEach((heading) => {
      const container = heading.closest('article, section, details, .panel') || heading.parentElement;
      const text = (container?.innerText || heading.innerText).replace(/\s+/g, ' ').trim();
      if (text.length >= 12) entries.push({ type: 'HƯỚNG DẪN', title: heading.innerText.trim(), text, page: page.id.replace('page-', '') });
    });
  });
  return entries;
}

function productSearchText(item) {
  return Object.values(item || {}).flatMap((value) => Array.isArray(value) ? value : [value]).filter((value) => ['string', 'number'].includes(typeof value)).join(' ');
}

function runGlobalSearch(rawQuery) {
  const query = String(rawQuery || '').trim();
  const key = searchKey(query);
  const results = [];
  if (key.length >= 2) {
    (catalogApi()?.products() || []).forEach((item) => {
      const text = productSearchText(item);
      const haystack = searchKey(text);
      if (haystack.includes(key)) results.push({ type: 'SẢN PHẨM', title: `${item.name} · ${item.family}`, text: [item.flow ? `Flow ${(item.flow).toUpperCase()}` : '', item.carrierUp ? `${item.carrierUp}-up` : '', item.testPlan, item.fluxCenter, item.setupProcess, item.commonIssues, item.operatorTips].filter(Boolean).join(' · '), page: 'products', productId: item.id, score: searchKey(item.name + ' ' + item.family).includes(key) ? 0 : 1 });
    });
    globalGuideIndex().forEach((entry) => { if (searchKey(entry.text).includes(key)) results.push({ ...entry, score: searchKey(entry.title).includes(key) ? 1 : 2 }); });
  }
  results.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title, 'vi'));
  const unique = results.filter((item, index, list) => list.findIndex((other) => other.type === item.type && other.title === item.title && other.page === item.page) === index).slice(0, 40);
  $('#global-search-summary').textContent = key.length < 2 ? 'Nhập ít nhất 2 ký tự.' : `Tìm thấy ${unique.length} kết quả cho “${query}”.`;
  $('#global-search-results').innerHTML = unique.length ? unique.map((item) => `<button class="search-result" type="button" data-search-page="${escapeHTML(item.page)}"${item.productId ? ` data-search-product="${escapeHTML(item.productId)}"` : ''}><small>${escapeHTML(item.type)}</small><b>${escapeHTML(item.title)}</b><span>${escapeHTML(item.text || 'Mở để xem chi tiết.')}</span></button>`).join('') : '<div class="empty-message">Không tìm thấy. Thử tên product, Test Plan, PN, loss code hoặc tình huống xử lý.</div>';
}

function pasteCatalog(item) {
  const api = catalogApi();
  if (!api) return null;
  return api.pasteByPn(item.name) || api.pasteByPn(item.pn) || null;
}

function pasteStencilLimit(item) {
  return (pasteCatalog(item)?.stencilHours || 12) * HOUR;
}

function pasteSubstrateLimit(item) {
  return (pasteCatalog(item)?.substrateHours || 1) * HOUR;
}

function pasteShelfLimit() {
  return 7 * DAY;
}

function proflowDecision(item) {
  if (!item.proflowAt) return { status: 'warning', text: 'CHƯA NHẬP GIỜ ON TOOL — CHƯA THỂ TÍNH FILL' };
  const remaining = new Date(item.proflowAt).getTime() + PROFLOW_LIMIT - Date.now();
  if (remaining <= 0) return { status: 'expired', text: 'QUÁ 72H — BƠM PROFLOW MỚI, KHÔNG DÙNG PROFLOW CŨ' };
  if (item.type === 'purple' || item.proflowColor === 'purple') {
    return { status: 'safe', text: 'PROFLOW TÍM — DÙNG HẾT; KHÔNG FILL, HẾT PHẢI BƠM MỚI' };
  }
  if (item.tubes > 4 || item.sliCount > 2) {
    return { status: 'expired', text: 'VƯỢT 4 ỐNG / 2 SLI — KHÔNG ĐƯỢC FILL TIẾP' };
  }
  return { status: 'safe', text: 'CÒN TRONG 72H — PROFLOW ĐEN ĐƯỢC FILL DÙNG TIẾP' };
}

function syncPastePair() {
  const type = $('#paste-type').value;
  const color = $('#paste-proflow-color');
  const mode = $('#paste-proflow-mode');
  const note = $('#paste-pair-note');
  color.value = type === 'purple' ? 'purple' : 'black';
  if (type === 'purple') mode.value = 'new';
  mode.disabled = type === 'purple';
  note.textContent = type === 'purple'
    ? 'Chì tím + Proflow tím: setup lại sau 12 giờ; dùng hết thì bơm mới, không fill.'
    : 'Chì trắng + Proflow đen: setup lại sau 24 giờ; chỉ được fill khi còn trong 72 giờ, tối đa 4 ống / 2 SLI.';
  updatePasteSetupPreview();
}

function updatePasteSetupPreview() {
  const type = $('#paste-type').value;
  const setupValue = $('#paste-setup').value || $('#paste-proflow').value;
  const onToolValue = $('#paste-proflow').value;
  const specialMaterial = $('#paste-special-material').value;
  const preview = $('#paste-setup-due');
  const specialPreview = $('#paste-special-due');
  if (!setupValue) {
    preview.innerHTML = '<small>NGÀY SETUP LẠI</small><b>Nhập thời điểm setup gần nhất</b>';
  } else {
    const limit = PASTE_SETUP_LIMITS[type] || PASTE_SETUP_LIMITS.white;
    const due = new Date(new Date(setupValue).getTime() + limit);
    preview.innerHTML = `<small>NGÀY SETUP LẠI · SAU ${limit / HOUR} GIỜ</small><b>${formatDate(due)}</b>`;
  }
  if (specialMaterial !== 'j58633') {
    specialPreview.innerHTML = '<small>HẠN CHÌ ĐẶC BIỆT</small><b>Không áp dụng</b>';
  } else if (!onToolValue) {
    specialPreview.innerHTML = '<small>HẠN CHÌ J58633-001 · 18 GIỜ</small><b>Nhập ngày giờ ON TOOL</b>';
  } else {
    const due = new Date(new Date(onToolValue).getTime() + J58633_LIMIT);
    specialPreview.innerHTML = `<small>HẠN CHÌ J58633-001 · SAU 18 GIỜ</small><b>${formatDate(due)}</b>`;
  }
}

function updateFluxPotlifePreview() {
  const value = $('#flux-potlife').value;
  const preview = $('#flux-potlife-preview');
  preview.className = 'date-preview';
  if (!value) {
    preview.innerHTML = '<small>POT LIFE CÒN</small><b>Chọn số giờ hoặc nhập ngày hết hạn</b>';
    return;
  }
  const remaining = new Date(value).getTime() - Date.now();
  const status = remaining <= 0 ? 'expired' : remaining < 12 * HOUR ? 'warning' : 'safe';
  preview.className = `date-preview ${status}`;
  preview.innerHTML = `<small>POT LIFE CÒN · HẾT ${formatDate(value)}</small><b>${remainingText(remaining)}</b>`;
}

function applyFluxPotlifePreset() {
  const hours = Number($('#flux-potlife-preset').value);
  if (hours > 0) {
    $('#flux-potlife-hours').value = '';
    $('#flux-potlife').value = toLocalInput(new Date(Date.now() + hours * HOUR));
  }
  updateFluxPotlifePreview();
}

function applyFluxPotlifeHours() {
  const hours = Number($('#flux-potlife-hours').value);
  $('#flux-potlife-preset').value = '';
  if (hours > 0) $('#flux-potlife').value = toLocalInput(new Date(Date.now() + hours * HOUR));
  updateFluxPotlifePreview();
}

function addPaste(event) {
  event.preventDefault();
  const name = $('#paste-name').value.trim();
  const type = $('#paste-type').value;
  const proflowColor = $('#paste-proflow-color').value;
  const proflowMode = $('#paste-proflow-mode').value;
  const specialMaterial = $('#paste-special-material').value;
  const tubes = Number($('#paste-tubes').value);
  const sliCount = Number($('#paste-sli-count').value);
  const freezerAt = $('#paste-freezer').value || null;
  const proflowAt = $('#paste-proflow').value || null;
  const setupAt = $('#paste-setup').value || proflowAt;
  const openAt = $('#paste-open').value || null;
  const stencilAt = $('#paste-stencil').value || null;
  const substrateAt = $('#paste-substrate').value || null;
  const validPair = (type === 'white' && proflowColor === 'black') || (type === 'purple' && proflowColor === 'purple');
  if (!validPair) return showToast('Chỉ dùng chì trắng/Proflow đen hoặc chì tím/Proflow tím.', 'error');
  if (type === 'purple' && proflowMode === 'refill') return showToast('Proflow tím không được fill; hết phải bơm mới.', 'error');
  if (tubes > 4 || sliCount > 2) return showToast('Tối đa 4 ống và 2 SLI.', 'error');
  if (!freezerAt && !proflowAt && !setupAt && !openAt && !stencilAt && !substrateAt) return showToast('Nhập ít nhất một thời điểm.', 'error');
  if (specialMaterial === 'j58633' && !proflowAt) return showToast('J58633-001 cần nhập ngày giờ ON TOOL để tính hạn 18 giờ.', 'error');
  state.paste.push({ id: uid(), name, type, proflowColor, proflowMode, specialMaterial, tubes, sliCount, freezerAt, proflowAt, setupAt, openAt, stencilAt, substrateAt, createdAt: new Date().toISOString() });
  saveState();
  event.target.reset();
  syncPastePair();
  renderAll();
  showToast('Đã thêm Paste.');
}

function pasteAssessment(item) {
  const statuses = [];
  if (item.freezerAt && new Date(item.freezerAt).getTime() + pasteWarmupLimit(item) > Date.now()) statuses.push('warning');
  if (item.proflowAt) statuses.push(timerStatus(new Date(item.proflowAt).getTime() + PROFLOW_LIMIT - Date.now(), PROFLOW_LIMIT));
  if (item.setupAt) statuses.push(timerStatus(new Date(item.setupAt).getTime() + pasteSetupLimit(item) - Date.now(), pasteSetupLimit(item)));
  if (item.openAt) statuses.push(timerStatus(new Date(item.openAt).getTime() + PASTE_OPEN_LIMIT - Date.now(), PASTE_OPEN_LIMIT));
  if (item.freezerAt) statuses.push(timerStatus(new Date(item.freezerAt).getTime() + pasteShelfLimit() - Date.now(), pasteShelfLimit()));
  if (item.stencilAt) statuses.push(timerStatus(new Date(item.stencilAt).getTime() + pasteStencilLimit(item) - Date.now(), pasteStencilLimit(item)));
  if (item.substrateAt) statuses.push(timerStatus(new Date(item.substrateAt).getTime() + pasteSubstrateLimit(item) - Date.now(), pasteSubstrateLimit(item)));
  const materialLimit = pasteMaterialLimit(item);
  if (materialLimit && item.proflowAt) statuses.push(timerStatus(new Date(item.proflowAt).getTime() + materialLimit - Date.now(), materialLimit));
  statuses.push(proflowDecision(item).status);
  return worstStatus(statuses);
}

function renderPaste() {
  const list = $('#paste-list');
  if (!state.paste.length) return list.innerHTML = '<div class="empty-message">Chưa có Paste nào.</div>';
  list.innerHTML = state.paste.map((item) => {
    const decision = proflowDecision(item);
    return `<article class="tracker-card ${pasteAssessment(item)}">
      <div class="tracker-head"><div><small>${escapeHTML(PASTE_LABELS[item.type] || PASTE_LABELS.white)}</small><h3>${escapeHTML(item.name)}</h3></div><button class="delete-button" type="button" data-delete="paste" data-id="${item.id}" aria-label="Xóa">×</button></div>
      <div class="timer-grid">${readinessCell('Freezer → đủ sit time', item.freezerAt, pasteWarmupLimit(item))}${timerCell('Kệ sau thaw 7 ngày', item.freezerAt, pasteShelfLimit())}${timerCell('Setup lại', item.setupAt, pasteSetupLimit(item))}${timerCell('Hạn Proflow từ ON TOOL', item.proflowAt, PROFLOW_LIMIT)}${pasteMaterialLimit(item) ? timerCell('Hạn chì J58633-001', item.proflowAt, J58633_LIMIT) : ''}${timerCell('Paste sau mở nắp', item.openAt, PASTE_OPEN_LIMIT)}${timerCell('TIME_ON_STENCIL', item.stencilAt, pasteStencilLimit(item))}${timerCell('Sit substrate', item.substrateAt, pasteSubstrateLimit(item))}</div>
      <span class="status-badge ${decision.status}">${decision.text}</span>
      <div class="tracker-meta">${item.type === 'purple' ? 'Bơm mới · Proflow tím không fill' : `${item.proflowMode === 'refill' ? 'Fill dùng tiếp' : 'Bơm mới'} · ${item.tubes}/4 ống · ${item.sliCount}/2 SLI`}<br>ON TOOL: ${formatDate(item.proflowAt)} · Setup gần nhất: ${formatDate(item.setupAt)}<br><b>Phải setup lại: ${item.setupAt ? formatDate(new Date(new Date(item.setupAt).getTime() + pasteSetupLimit(item))) : 'Chưa nhập'}</b>${pasteMaterialLimit(item) ? `<br><b>Hết hạn chì J58633-001: ${formatDate(new Date(new Date(item.proflowAt).getTime() + J58633_LIMIT))}</b>` : ''}</div>
    </article>`;
  }).join('');
}

function addFlux(event) {
  event.preventDefault();
  const openAt = $('#flux-open').value || null;
  const substrateAt = $('#flux-substrate').value || null;
  const potlifeAt = $('#flux-potlife').value || null;
  if (!openAt && !substrateAt && !potlifeAt) return showToast('Nhập ít nhất một thời điểm.', 'error');
  state.flux.push({ id: uid(), type: $('#flux-type').value, operatorName: $('#flux-operator').value.trim(), openAt, substrateAt, potlifeAt, amount: Number($('#flux-amount').value), createdAt: new Date().toISOString() });
  saveState();
  event.target.reset();
  updateFluxPotlifePreview();
  renderAll();
  showToast('Đã thêm Flux.');
}

function fluxAssessment(item) {
  const statuses = [];
  if (item.openAt) statuses.push(timerStatus(new Date(item.openAt).getTime() + FLUX_OPEN_LIMIT - Date.now(), FLUX_OPEN_LIMIT));
  if (item.substrateAt) statuses.push(timerStatus(new Date(item.substrateAt).getTime() + FLUX_SUBSTRATE_LIMIT - Date.now(), FLUX_SUBSTRATE_LIMIT));
  if (item.potlifeAt) {
    const potRemaining = new Date(item.potlifeAt).getTime() - Date.now();
    statuses.push(potRemaining <= 0 ? 'expired' : potRemaining < 12 * HOUR ? 'warning' : 'safe');
  } else statuses.push('warning');
  return worstStatus(statuses);
}

function promptedState(item) {
  const potRemaining = item.potlifeAt ? new Date(item.potlifeAt).getTime() - Date.now() : 0;
  const eligible = item.amount >= .67 && potRemaining >= 12 * HOUR;
  return { eligible, potRemaining };
}

function renderFlux() {
  const list = $('#flux-list');
  if (!state.flux.length) return list.innerHTML = '<div class="empty-message">Chưa có Flux nào.</div>';
  list.innerHTML = state.flux.map((item) => {
    const prompted = promptedState(item);
    const potStatus = !item.potlifeAt ? 'warning' : prompted.potRemaining <= 0 ? 'expired' : prompted.potRemaining < 12 * HOUR ? 'warning' : 'safe';
    const potText = item.potlifeAt ? remainingText(prompted.potRemaining) : 'Chưa nhập';
    return `<article class="tracker-card ${fluxAssessment(item)}">
      <div class="tracker-head"><div><small>FLUX</small><h3>${escapeHTML(item.type)}</h3></div><button class="delete-button" type="button" data-delete="flux" data-id="${item.id}" aria-label="Xóa">×</button></div>
      <div class="timer-grid">${timerCell('Mở nắp', item.openAt, FLUX_OPEN_LIMIT)}${timerCell('Substrate', item.substrateAt, FLUX_SUBSTRATE_LIMIT)}<div class="timer-cell ${potStatus}"><small>Pot life còn</small><b>${potText}</b></div></div>
      <span class="status-badge ${prompted.eligible ? '' : 'warning'}">${prompted.eligible ? 'ĐỦ ĐIỀU KIỆN PROMPTED' : 'PHẢI SETUP MỚI'}</span>
      <div class="tracker-meta">Tên ghi trên ống: ${escapeHTML(item.operatorName || 'Chưa ghi')}<br>Pot life hết: <b>${formatDate(item.potlifeAt)}</b><br>Còn ${(item.amount * 100).toFixed(0)}% ống · Tạo: ${formatDate(item.createdAt)}</div>
    </article>`;
  }).join('');
}

function addPassives(event) {
  event.preventDefault();
  state.passives.push({
    id: uid(), pn: $('#passives-pn').value.trim(), lot: $('#passives-lot').value.trim(),
    expiryAt: $('#passives-expiry').value, installedAt: $('#passives-installed').value || null,
    feeder: $('#passives-feeder').value.trim(), msl: $('#passives-msl').value, createdAt: new Date().toISOString()
  });
  saveState();
  event.target.reset();
  $('#passives-installed').value = toLocalInput();
  renderAll();
  showToast('Đã thêm Reel Passives.');
}

function passivesStatus(item) {
  const remaining = new Date(item.expiryAt).getTime() - Date.now();
  if (remaining <= 0) return 'expired';
  return remaining <= 7 * DAY ? 'warning' : 'safe';
}

function renderPassives() {
  const list = $('#passives-list');
  if (!state.passives.length) return list.innerHTML = '<div class="empty-message">Chưa có Reel nào.</div>';
  list.innerHTML = state.passives.map((item) => {
    const remaining = new Date(item.expiryAt).getTime() - Date.now();
    const status = passivesStatus(item);
    return `<article class="tracker-card ${status}">
      <div class="tracker-head"><div><small>FEEDER ${escapeHTML(item.feeder)} · MSL ${escapeHTML(item.msl)}</small><h3>${escapeHTML(item.pn)} / ${escapeHTML(item.lot)}</h3></div><button class="delete-button" type="button" data-delete="passives" data-id="${item.id}" aria-label="Xóa">×</button></div>
      <div class="timer-grid"><div class="timer-cell ${status}"><small>Hạn NSX còn</small><b>${remainingText(remaining)}</b></div></div>
      <div class="tracker-meta">Hết hạn: ${formatDate(item.expiryAt)}<br>Install: ${formatDate(item.installedAt)}</div>
    </article>`;
  }).join('');
}

function addDie(event) {
  event.preventDefault();
  const matched = $('#die-match').checked;
  state.die.push({
    id: uid(), lot: $('#die-lot').value.trim(), atpo: $('#die-atpo').value.trim(),
    substrate: $('#die-substrate').value.trim(), pn: $('#die-pn').value.trim(),
    quantity: Number($('#die-quantity').value), matched, createdAt: new Date().toISOString()
  });
  saveState();
  event.target.reset();
  renderAll();
  showToast(matched ? 'Đã thêm Die Lot.' : 'Đã thêm — chưa xác minh khớp ATPO.', matched ? '' : 'warning');
}

function calculateMotherLot(event) {
  event.preventDefault();
  const lotId = $('#mother-lot-id').value.trim();
  const raw = $('#mother-reels').value.trim();
  const fullSize = Number($('#mother-full-size').value);
  const parts = raw.split(/[,+;\s]+/).filter(Boolean);
  const quantities = parts.map(Number);
  if (!parts.length || quantities.some((value) => !Number.isInteger(value) || value < 0)) {
    return showToast('Nhập số lượng từng cuộn bằng số nguyên, cách nhau bởi dấu + hoặc dấu phẩy.', 'error');
  }
  if (!Number.isInteger(fullSize) || fullSize <= 0) return showToast('Số lượng Lot Full phải lớn hơn 0.', 'error');
  const total = quantities.reduce((sum, value) => sum + value, 0);
  const fullLots = Math.floor(total / fullSize);
  const motherQuantity = total % fullSize;
  const motherText = motherQuantity > 0 ? `1 Mother Lot ${motherQuantity.toLocaleString('vi-VN')}` : 'Không có Mother Lot dư';
  $('#mother-result').innerHTML = `<small>KẾT QUẢ · ${quantities.length} FEEDER</small><b>${fullLots} Lot Full + ${motherText}</b><span>Tổng ${total.toLocaleString('vi-VN')} − (${fullLots} × ${fullSize.toLocaleString('vi-VN')}) = ${motherQuantity.toLocaleString('vi-VN')}</span>`;
  $('#mother-result').classList.add('ready');
  saveCalculation({ kind: 'mother', lotId, feederCount: quantities.length, total, fullSize, fullLots, motherQuantity });
}

function calculateDieKill(event) {
  event.preventDefault();
  const lotId = $('#die-kill-lot-id').value.trim();
  const full = Number($('#die-full-atpo').value);
  const killRawValues = $$('.die-kill-feeder').map((input) => input.value.trim()).filter((value) => value !== '');
  const killValues = killRawValues.map(Number);
  const liveRaw = $('#die-live-atpo').value;
  const hasKill = killValues.length > 0;
  const hasLive = liveRaw !== '';
  const kill = hasKill ? killValues.reduce((sum, value) => sum + value, 0) : null;
  const live = hasLive ? Number(liveRaw) : null;
  if (!Number.isInteger(full) || full < 0) return showToast('Số Die Full phải là số nguyên từ 0 trở lên.', 'error');
  if (!hasKill && !hasLive) return showToast('Nhập số Die Kill hoặc số Die sống trên ATPO.', 'error');
  if (killValues.some((value) => !Number.isInteger(value) || value < 0)) return showToast('Die Kill của từng feeder phải là số nguyên từ 0 trở lên.', 'error');
  if ((hasKill && kill > full) || (hasLive && (!Number.isInteger(live) || live < 0 || live > full))) {
    return showToast('Die Kill/Die sống phải là số nguyên và không lớn hơn Die Full.', 'error');
  }
  const results = [];
  if (hasKill) {
    const liveForSubstrate = full - kill;
    const feederFormula = killValues.map((value) => value.toLocaleString('vi-VN')).join(' + ');
    results.push(`<section><small>DIE SỐNG CẦN CẮM TRÊN SUBSTRATE</small><b>${liveForSubstrate.toLocaleString('vi-VN')}</b><span>Kill: ${feederFormula} = ${kill.toLocaleString('vi-VN')}<br>${full.toLocaleString('vi-VN')} Full − ${kill.toLocaleString('vi-VN')} tổng Kill = ${liveForSubstrate.toLocaleString('vi-VN')} Die sống</span></section>`);
  }
  if (hasLive) {
    const killAndDrop = full - live;
    results.push(`<section><small>DIE KILL + DROP</small><b>${killAndDrop.toLocaleString('vi-VN')}</b><span>${full.toLocaleString('vi-VN')} Full − ${live.toLocaleString('vi-VN')} Die sống = ${killAndDrop.toLocaleString('vi-VN')}</span></section>`);
  }
  $('#die-kill-result').innerHTML = results.join('');
  $('#die-kill-result').classList.add('ready');
  saveCalculation({
    kind: 'die-kill', lotId, full,
    kill: hasKill ? kill : null,
    killValues: hasKill ? killValues : [],
    live: hasLive ? live : null,
    liveForSubstrate: hasKill ? full - kill : null,
    killAndDrop: hasLive ? full - live : null
  });
}

function calculateCoupon(event) {
  event.preventDefault();
  const lotId = $('#coupon-lot-id').value.trim();
  const carriers = Number($('#coupon-carriers').value);
  const substratesPerCarrier = Number($('#coupon-substrates-per-carrier').value);
  const actualOnSC = Number($('#coupon-actual-sc').value);
  const values = [carriers, substratesPerCarrier, actualOnSC];
  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    return showToast('Carrier và substrate phải là số nguyên từ 0 trở lên.', 'error');
  }
  const totalSubstrates = carriers * substratesPerCarrier;
  if (actualOnSC > totalSubstrates) return showToast('Số substrate thực tế trên SC không được lớn hơn tổng substrate.', 'error');
  const coupons = totalSubstrates - actualOnSC;
  $('#coupon-result').innerHTML = `<small>KẾT QUẢ COUPON</small><b>${coupons.toLocaleString('vi-VN')} Coupon trên Magazine</b><span>${carriers.toLocaleString('vi-VN')} carrier × ${substratesPerCarrier.toLocaleString('vi-VN')} substrate = ${totalSubstrates.toLocaleString('vi-VN')} tổng<br>${totalSubstrates.toLocaleString('vi-VN')} − ${actualOnSC.toLocaleString('vi-VN')} thực tế trên SC = ${coupons.toLocaleString('vi-VN')} Coupon</span>`;
  $('#coupon-result').classList.add('ready');
  saveCalculation({ kind: 'coupon', lotId, carriers, substratesPerCarrier, totalSubstrates, actualOnSC, coupons });
}

function saveCalculation(calculation) {
  state.calculationHistory.unshift({ id: uid(), ...calculation, createdAt: new Date().toISOString() });
  state.calculationHistory = state.calculationHistory.slice(0, 100);
  saveState();
  renderCalculationHistory();
  showToast(calculation.lotId ? `Đã tính và lưu lịch sử Lot ${calculation.lotId}.` : 'Đã tính và lưu vào lịch sử.');
}

function showDieCalculator(name) {
  $$('[data-die-calc]').forEach((button) => {
    const active = button.dataset.dieCalc === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('[data-die-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.diePanel === name));
}

function setDieBalanceMode(mode) {
  $$('[data-die-mode]').forEach((button) => button.classList.toggle('active', button.dataset.dieMode === mode));
  const killField = $('[data-die-mode-field="kill"]');
  const liveField = $('[data-die-mode-field="live"]');
  const showKill = mode === 'kill' || mode === 'both';
  const showLive = mode === 'live' || mode === 'both';
  $('.die-balance-fields').dataset.mode = mode;
  killField.hidden = !showKill;
  liveField.hidden = !showLive;
  $('#die-live-atpo').required = showLive;
  if (!showKill) $$('.die-kill-feeder').forEach((input) => { input.value = ''; });
  if (!showLive) $('#die-live-atpo').value = '';
  updateDieKillSum();
}

function updateDieKillSum() {
  const rawValues = $$('.die-kill-feeder').map((input) => input.value.trim()).filter((value) => value !== '');
  const values = rawValues.map(Number);
  const invalid = values.some((value) => !Number.isInteger(value) || value < 0);
  const sum = invalid ? 0 : values.reduce((total, value) => total + value, 0);
  $('#die-kill-sum').classList.toggle('invalid', invalid);
  $('#die-kill-sum').querySelector('b').textContent = invalid ? '!' : sum.toLocaleString('vi-VN');
  $('#die-kill-sum').querySelector('span').textContent = invalid ? 'Kiểm tra số đã nhập' : values.length ? `${values.length} feeder: ${values.join(' + ')}` : 'Chưa nhập feeder';
}

function resetDieCalculator(name) {
  const settings = {
    mother: { form: '#mother-form', result: '#mother-result', text: '<small>KẾT QUẢ</small><b>—</b><span>Nhập số lượng các cuộn để tính.</span>' },
    balance: { form: '#die-kill-form', result: '#die-kill-result', text: '<small>KẾT QUẢ</small><b>—</b><span>Chọn dữ liệu đã biết ở phía trên.</span>' },
    coupon: { form: '#coupon-form', result: '#coupon-result', text: '<small>KẾT QUẢ</small><b>—</b><span>Nhập ba số để tính Coupon còn trên Magazine.</span>' }
  };
  const setting = settings[name];
  if (!setting) return;
  $(setting.form).reset();
  $(setting.result).innerHTML = setting.text;
  $(setting.result).classList.remove('ready');
  if (name === 'balance') setDieBalanceMode('kill');
  showToast('Đã xóa các ô nhập.');
}

function renderCalculationHistory() {
  const list = $('#calculation-history');
  if (!state.calculationHistory.length) return list.innerHTML = '<div class="empty-message">Chưa có lịch sử tính Lot.</div>';
  list.innerHTML = state.calculationHistory.map((item) => {
    if (item.kind === 'mother') {
      const motherText = Number(item.motherQuantity) > 0 ? `1 Mother Lot ${Number(item.motherQuantity).toLocaleString('vi-VN')}` : 'không có Mother Lot dư';
      return `<article class="tracker-card safe"><div class="tracker-head"><div><small>MOTHER LOT · ${Number(item.feederCount) || 0} FEEDER</small><h3>${escapeHTML(item.lotId || 'Chưa có ID')}</h3></div><button class="delete-button" type="button" data-delete="calculationHistory" data-id="${item.id}" aria-label="Xóa">×</button></div><span class="status-badge">${Number(item.fullLots) || 0} LOT FULL + ${motherText.toUpperCase()}</span><div class="tracker-meta">Tổng ${Number(item.total).toLocaleString('vi-VN')} − (${Number(item.fullLots)} × ${Number(item.fullSize).toLocaleString('vi-VN')}) = ${Number(item.motherQuantity).toLocaleString('vi-VN')}<br>Tính lúc: ${formatDate(item.createdAt)}</div></article>`;
    }
    if (item.kind === 'coupon') {
      return `<article class="tracker-card safe"><div class="tracker-head"><div><small>COUPON TRÊN MAGAZINE</small><h3>${escapeHTML(item.lotId || 'Chưa có ID')}</h3></div><button class="delete-button" type="button" data-delete="calculationHistory" data-id="${item.id}" aria-label="Xóa">×</button></div><span class="status-badge">${Number(item.coupons).toLocaleString('vi-VN')} COUPON</span><div class="tracker-meta">${Number(item.carriers).toLocaleString('vi-VN')} carrier × ${Number(item.substratesPerCarrier).toLocaleString('vi-VN')} substrate = ${Number(item.totalSubstrates).toLocaleString('vi-VN')} tổng<br>${Number(item.totalSubstrates).toLocaleString('vi-VN')} − ${Number(item.actualOnSC).toLocaleString('vi-VN')} thực tế trên SC = ${Number(item.coupons).toLocaleString('vi-VN')} Coupon<br>Tính lúc: ${formatDate(item.createdAt)}</div></article>`;
    }
    const lines = [];
    if (item.liveForSubstrate !== null && item.liveForSubstrate !== undefined) lines.push(`Die sống cắm substrate: <b>${Number(item.liveForSubstrate).toLocaleString('vi-VN')}</b>`);
    if (item.killAndDrop !== null && item.killAndDrop !== undefined) lines.push(`Die Kill + Drop: <b>${Number(item.killAndDrop).toLocaleString('vi-VN')}</b>`);
    const feederKillText = Array.isArray(item.killValues) && item.killValues.length ? `<br>Kill theo feeder: ${item.killValues.map((value) => Number(value).toLocaleString('vi-VN')).join(' + ')}` : '';
    return `<article class="tracker-card safe"><div class="tracker-head"><div><small>DIE KILL / DIE SỐNG</small><h3>${escapeHTML(item.lotId || 'Chưa có ID')}</h3></div><button class="delete-button" type="button" data-delete="calculationHistory" data-id="${item.id}" aria-label="Xóa">×</button></div><div class="history-result">${lines.join('<br>')}</div><div class="tracker-meta">Die Full ATPO: ${Number(item.full).toLocaleString('vi-VN')}${item.kill !== null && item.kill !== undefined ? ` · Tổng Kill: ${Number(item.kill).toLocaleString('vi-VN')}` : ''}${item.live !== null && item.live !== undefined ? ` · Die sống ATPO: ${Number(item.live).toLocaleString('vi-VN')}` : ''}${feederKillText}<br>Tính lúc: ${formatDate(item.createdAt)}</div></article>`;
  }).join('');
}

function dieStatus(item) {
  return item.matched && item.substrate && item.quantity > 0 ? item.quantity < 100 ? 'warning' : 'safe' : 'expired';
}

function renderDie() {
  const list = $('#die-list');
  if (!state.die.length) return list.innerHTML = '<div class="empty-message">Chưa có Die Lot nào.</div>';
  list.innerHTML = state.die.map((item) => {
    const status = dieStatus(item);
    const message = !item.matched ? 'CHƯA KHỚP ATPO — CẤM INTRODUCE' : !item.substrate ? 'THIẾU SUBSTRATE 599' : item.quantity <= 0 ? 'HẾT DIE' : item.quantity < 100 ? 'SẮP HẾT DIE' : 'ĐỦ ĐIỀU KIỆN ĐÃ NHẬP';
    return `<article class="tracker-card ${status}">
      <div class="tracker-head"><div><small>ATPO ${escapeHTML(item.atpo)}</small><h3>Die Lot ${escapeHTML(item.lot)}</h3></div><button class="delete-button" type="button" data-delete="die" data-id="${item.id}" aria-label="Xóa">×</button></div>
      <span class="status-badge ${status}">${message}</span>
      <div class="tracker-meta">Substrate 599: ${escapeHTML(item.substrate || 'Chưa có')}<br>Reel PN: ${escapeHTML(item.pn || '—')} · Còn: ${item.quantity}</div>
    </article>`;
  }).join('');
}

function renderChecklist(containerSelector, key, items) {
  const container = $(containerSelector);
  container.innerHTML = items.map((item, index) => `<button class="check-item ${state[key][index] ? 'done' : ''}" type="button" data-checklist="${key}" data-index="${index}"><span>${state[key][index] ? '✓' : index + 1}</span>${escapeHTML(item)}</button>`).join('');
}

function renderFluxPositionDiagrams() {
  const container = $('#flux-position-diagrams');
  container.innerHTML = FLUX_CARRIER_POSITIONS.map((carrier) => {
    const rows = Math.ceil(carrier.total / carrier.columns);
    const displayPositions = [];
    for (let row = rows - 1; row >= 0; row -= 1) {
      const first = row * carrier.columns + 1;
      const last = Math.min(first + carrier.columns - 1, carrier.total);
      for (let position = first; position <= last; position += 1) displayPositions.push(position);
    }
    const cells = displayPositions.map((position) => {
      const classes = ['carrier-position'];
      if (carrier.weigh.includes(position)) classes.push('weigh-position');
      if (position === 1) classes.push('start-position');
      return `<span class="${classes.join(' ')}" title="Vị trí ${position}${carrier.weigh.includes(position) ? ' — phải cân' : ''}">${position}</span>`;
    }).join('');
    return `<article class="carrier-diagram"><div class="carrier-diagram-head"><b>${escapeHTML(carrier.name)}</b><small>Cân: ${carrier.weigh.join(', ')}</small></div><div class="carrier-direction">Hàng dưới bắt đầu từ 1 → đếm trái sang phải</div><div class="carrier-grid" style="--carrier-columns:${carrier.columns}">${cells}</div></article>`;
  }).join('');
}

function toggleChecklist(key, index) {
  if (!Array.isArray(state[key]) || index < 0 || index >= state[key].length) return;
  state[key][index] = !state[key][index];
  if (key === 'quickChecks') state.passdownChecks[index] = state[key][index];
  if (key === 'passdownChecks') state.quickChecks[index] = state[key][index];
  saveState();
  renderChecklists();
}

function renderChecklists() {
  renderChecklist('#d-passdown', 'quickChecks', PASSDOWN_ITEMS);
  renderChecklist('#die-checklist', 'dieChecks', DIE_CHECKS);
  renderChecklist('#passdown-checklist', 'passdownChecks', PASSDOWN_ITEMS);
}

function savePassdown(event) {
  event.preventDefault();
  state.passdown.unshift({
    id: uid(), shift: $('#passdown-shift').value, date: $('#passdown-date').value,
    from: $('#passdown-from').value.trim(), to: $('#passdown-to').value.trim(),
    checks: [...state.passdownChecks], createdAt: new Date().toISOString()
  });
  state.passdown = state.passdown.slice(0, 100);
  state.passdownChecks = Array(10).fill(false);
  state.quickChecks = Array(10).fill(false);
  saveState();
  event.target.reset();
  $('#passdown-date').value = new Date().toISOString().slice(0, 10);
  renderAll();
  showToast('Đã lưu Passdown.');
}

function renderPassdownHistory() {
  const list = $('#passdown-history');
  if (!state.passdown.length) return list.innerHTML = '<div class="empty-message">Chưa có lịch sử Passdown.</div>';
  list.innerHTML = state.passdown.map((item) => {
    const done = Array.isArray(item.checks) ? item.checks.filter(Boolean).length : 0;
    const status = done === 10 ? 'safe' : 'warning';
    return `<article class="tracker-card ${status}"><div class="tracker-head"><div><small>${escapeHTML(item.shift)}</small><h3>${escapeHTML(item.from || '?')} → ${escapeHTML(item.to || '?')}</h3></div><button class="delete-button" type="button" data-delete="passdown" data-id="${item.id}" aria-label="Xóa">×</button></div><span class="status-badge ${status}">${done}/10 MỤC HOÀN TẤT</span><div class="tracker-meta">Ngày ca: ${escapeHTML(item.date)} · Lưu: ${formatDate(item.createdAt || item.ts)}</div></article>`;
  }).join('');
}

function collectActiveTimers() {
  const timers = [];
  const add = (label, detail, start, limit, page) => {
    if (!start) return;
    const remaining = new Date(start).getTime() + limit - Date.now();
    timers.push({ label, detail, remaining, status: timerStatus(remaining, limit), page });
  };
  state.paste.forEach((item) => {
    if (item.freezerAt) {
      const wait = pasteWarmupLimit(item);
      const remaining = new Date(item.freezerAt).getTime() + wait - Date.now();
      if (remaining > 0) timers.push({ label: item.name, detail: 'Paste · Chờ đủ sit time', remaining, status: 'warning', page: 'paste' });
    }
    add(item.name, `Paste · Setup lại ${pasteSetupLimit(item) / HOUR}h`, item.setupAt, pasteSetupLimit(item), 'paste');
    add(item.name, 'Paste · Proflow 72h từ ON TOOL', item.proflowAt, PROFLOW_LIMIT, 'paste');
    if (pasteMaterialLimit(item)) add(item.name, 'Paste J58633-001 · Hạn 18h từ ON TOOL', item.proflowAt, J58633_LIMIT, 'paste');
    add(item.name, 'Paste · Sau mở nắp 6 ngày', item.openAt, PASTE_OPEN_LIMIT, 'paste');
    add(item.name, 'Paste · Kệ sau thaw 7 ngày', item.freezerAt, pasteShelfLimit(), 'paste');
    add(item.name, 'Paste · TIME_ON_STENCIL', item.stencilAt, pasteStencilLimit(item), 'paste');
    add(item.name, 'Paste · Sit substrate', item.substrateAt, pasteSubstrateLimit(item), 'paste');
  });
  state.flux.forEach((item) => {
    add(item.type, 'Flux · Mở nắp', item.openAt, FLUX_OPEN_LIMIT, 'flux');
    add(item.type, 'Flux · Substrate', item.substrateAt, FLUX_SUBSTRATE_LIMIT, 'flux');
  });
  state.passives.forEach((item) => {
    if (!item.expiryAt) return;
    const remaining = new Date(item.expiryAt).getTime() - Date.now();
    timers.push({ label: item.pn, detail: `Passives · Feeder ${item.feeder}`, remaining, status: passivesStatus(item), page: 'passives' });
  });
  const rank = { expired: 0, warning: 1, safe: 2 };
  return timers.sort((a, b) => rank[a.status] - rank[b.status] || a.remaining - b.remaining);
}

function renderDashboard() {
  const pasteExpired = state.paste.filter((item) => pasteAssessment(item) === 'expired').length;
  const fluxExpired = state.flux.filter((item) => fluxAssessment(item) === 'expired').length;
  const passivesExpired = state.passives.filter((item) => passivesStatus(item) === 'expired').length;
  const dieBlocked = state.die.filter((item) => dieStatus(item) === 'expired').length;
  $('#d-paste').textContent = state.paste.length ? `${state.paste.length} mục${pasteExpired ? ` · ${pasteExpired} hết hạn` : ''}` : 'Chưa theo dõi';
  $('#d-flux').textContent = state.flux.length ? `${state.flux.length} ống${fluxExpired ? ` · ${fluxExpired} hết hạn` : ''}` : 'Chưa theo dõi';
  $('#d-passives').textContent = state.passives.length ? `${state.passives.length} reel${passivesExpired ? ` · ${passivesExpired} hết hạn` : ''}` : 'Chưa theo dõi';
  $('#d-die').textContent = state.die.length ? `${state.die.length} lot${dieBlocked ? ` · ${dieBlocked} bị chặn` : ''}` : 'Chưa theo dõi';
  const sku = catalogApi()?.productById(state.activeProductId);
  if ($('#d-products')) $('#d-products').textContent = sku ? sku.name : `${catalogApi()?.products().length || 0} SKU catalog`;

  const timers = collectActiveTimers();
  $('#active-count').textContent = String(timers.length);
  $('#d-active').innerHTML = timers.length ? timers.slice(0, 12).map((timer) => `<button class="timer-row ${timer.status}" type="button" data-go="${timer.page}"><span class="status-dot"></span><div><b>${escapeHTML(timer.label)}</b><small>${escapeHTML(timer.detail)}</small></div><time>${remainingText(timer.remaining)}</time></button>`).join('') : '<div class="empty-message">Chưa có timer đang chạy.</div>';
}

function removeItem(collection, id) {
  const labels = { paste: 'Paste', flux: 'Flux', passives: 'Reel', die: 'Die Lot', passdown: 'Passdown', calculationHistory: 'kết quả tính Lot' };
  if (!confirm(`Xóa ${labels[collection]} này?`)) return;
  state[collection] = state[collection].filter((item) => String(item.id) !== String(id));
  saveState();
  renderAll();
  showToast('Đã xóa.');
}
function guideNameForFlow(flow) {
  return ({ die: 'die', passives: 'passives', split: 'passives', both: 'both', combine: 'both' })[flow] || 'both';
}

function selectProduct(id) {
  const api = catalogApi();
  const item = api?.productById(id);
  if (!item) return;
  state.activeProductId = id;
  saveState();
  if (item.pastePn && $('#paste-name')) $('#paste-name').value = item.pastePn;
  if (item.fluxPn && $('#flux-type')) $('#flux-type').value = item.fluxPn;
  if (item.dieFullSize && $('#mother-full-size')) $('#mother-full-size').value = item.dieFullSize;
  if (item.dieFullSize && $('#die-full-atpo')) $('#die-full-atpo').value = item.dieFullSize;
  if (item.substratesPerCarrier && $('#coupon-substrates-per-carrier')) $('#coupon-substrates-per-carrier').value = item.substratesPerCarrier;
  showGuide(guideNameForFlow(item.flow));
  renderAll();
  showToast(`Đã chọn sản phẩm ${item.name}.`, 'safe');
}

function initCatalogPickers() {
  const api = catalogApi();
  if (!api) return;
  const pasteList = $('#paste-pn-list');
  if (pasteList) {
    pasteList.innerHTML = api.all().materials.paste.map((p) => `<option value="${escapeHTML(p.pn)}">${escapeHTML(p.name)} (${p.color === 'purple' ? 'tím' : 'trắng'})</option>`).join('');
  }
  const fluxSelect = $('#flux-type');
  if (fluxSelect && !fluxSelect.children.length) {
    fluxSelect.innerHTML = api.all().materials.flux.map((f) => `<option value="${escapeHTML(f.pn)}">${escapeHTML(f.name)}</option>`).join('') + '<option value="Khác">Khác</option>';
  }
}

const PRODUCT_EDIT_FIELDS = {
  name: 'edit-product-name', family: 'edit-product-family', testPlan: 'edit-test-plan', engineeringTestPlan: 'edit-eng-test-plan',
  dpmsTestPlan: 'edit-dpms-plan', fluxPartNumber: 'edit-flux-pn', pastePartNumber: 'edit-paste-pn', proflowPartNumber: 'edit-proflow-pn',
  stencilPartNumber: 'edit-stencil-pn', capacitorInfo: 'edit-capacitor-info', fluxCenter: 'edit-flux-center', setupProcess: 'edit-setup-process',
  commonIssues: 'edit-common-issues', operatorTips: 'edit-operator-tips'
};

function fillProductEditor(item) {
  Object.entries(PRODUCT_EDIT_FIELDS).forEach(([field, id]) => { const input = $(`#${id}`); if (input) input.value = item?.[field] || ''; });
  const editor = $('#product-editor');
  if (editor) editor.classList.toggle('disabled-panel', !item);
}

async function saveProductEdit(event) {
  event.preventDefault();
  const current = catalogApi()?.productById(state.activeProductId);
  if (!current) return showToast('Hãy chọn sản phẩm trước khi sửa.', 'warning');
  const update = {};
  Object.entries(PRODUCT_EDIT_FIELDS).forEach(([field, id]) => { update[field] = $(`#${id}`).value.trim(); });
  update.updatedAt = new Date().toISOString();
  update.updatedSource = 'manual';
  state.productOverrides[current.id] = { ...(state.productOverrides[current.id] || {}), ...update };
  saveState(); renderAll(); fillProductEditor(catalogApi().productById(current.id));
  showToast(navigator.onLine ? 'Đang lưu và đồng bộ mọi thiết bị…' : 'Đã lưu offline; sẽ tự đồng bộ khi có mạng.', navigator.onLine ? 'safe' : 'warning');
  if (navigator.onLine) await pushProductEdit(current.id, update);
}

async function pushProductEdit(id, fields) {
  const url=state.catalogRemoteUrl||DEFAULT_CATALOG_URL;
  try {
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'update_product',id,fields}),cache:'no-store'});
    const result=await response.json(); if(!response.ok || !result.success) throw new Error(result.error||`HTTP ${response.status}`);
    state.remoteCatalog=result.catalog; state.catalogSyncedAt=new Date().toISOString(); delete state.productOverrides[id]; saveState(); renderAll();
    showToast('Đã đồng bộ thay đổi trên tất cả thiết bị.', 'safe');
  } catch(error) { showToast(`Đã giữ bản offline; chưa gửi lên máy chủ: ${error.message}`, 'warning'); }
}

async function flushProductOverrides() {
  if(!navigator.onLine || catalogSyncBusy) return;
  const pending=Object.entries(state.productOverrides||{}); if(!pending.length) return;
  for(const [id,fields] of pending) { if(!state.productOverrides[id]) continue; await pushProductEdit(id,fields); }
}

function resetProductEdit() {
  if (!state.activeProductId || !state.productOverrides[state.activeProductId]) return showToast('Product này chưa có chỉnh sửa cục bộ.');
  if (!confirm('Khôi phục dữ liệu gốc của product đang chọn?')) return;
  delete state.productOverrides[state.activeProductId]; saveState(); renderAll(); fillProductEditor(catalogApi().productById(state.activeProductId));
  showToast('Đã khôi phục dữ liệu gốc.');
}

function catalogExportPayload() {
  const api = catalogApi();
  return { version: 2, module: 'CAM', spec: api.all().spec, updatedAt: new Date().toISOString(), products: api.products(), materials: api.all().materials };
}

function downloadCatalog() {
  const blob = new Blob([JSON.stringify(catalogExportPayload(), null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `cam-products-${new Date().toISOString().slice(0, 10)}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function validateCatalog(data) {
  if (!data || !Array.isArray(data.products) || !data.products.length || !data.products.every((item) => item.id && item.name)) throw new Error('Database phải có products[] với id và name.');
  return data;
}

async function importCatalogFile(file) {
  try {
    const data = validateCatalog(JSON.parse(await file.text()));
    state.remoteCatalog = data; state.catalogSyncedAt = new Date().toISOString(); saveState(); initCatalogPickers(); renderAll();
    showToast(`Đã nhập ${data.products.length} product.`, 'safe');
  } catch (error) { showToast(`Không thể nhập: ${error.message}`, 'error'); }
}

async function syncCatalogOnline(silent = false) {
  const url = $('#catalog-remote-url').value.trim();
  if (!url) return showToast('Nhập URL file JSON trước.', 'warning');
  state.catalogRemoteUrl = url; saveState();
  if(catalogSyncBusy) return; catalogSyncBusy=true;
  const button = $('#sync-catalog'); button.disabled = true; button.textContent = 'Đang đồng bộ…';
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = validateCatalog(await response.json());
    state.remoteCatalog = data; state.catalogSyncedAt = new Date().toISOString(); saveState(); initCatalogPickers(); renderAll();
    if (!silent) showToast(`Đồng bộ thành công ${data.products.length} product.`, 'safe');
  } catch (error) { if (!silent) showToast(`Đồng bộ lỗi; vẫn dùng bản offline: ${error.message}`, 'error'); }
  finally { catalogSyncBusy=false; button.disabled = false; button.textContent = 'Đồng bộ ngay'; renderCatalogSyncStatus(); }
}

function renderCatalogSyncStatus() {
  const status = $('#catalog-sync-status'); if (!status) return;
  status.textContent = state.catalogSyncedAt ? `Bản offline cập nhật: ${formatDate(state.catalogSyncedAt)}${state.catalogRemoteUrl ? ` · ${state.catalogRemoteUrl}` : ''}` : 'Chưa cấu hình đồng bộ online.';
}

function productKnowledge(item) {
  const row = (label, value) => value ? `<span><em>${label}</em><b>${escapeHTML(value)}</b></span>` : '';
  return `<div class="knowledge-grid">
    ${row('Test Plan', item.testPlan)}${row('Engineering Test Plan', item.engineeringTestPlan)}${row('DPMS Finish', item.dpmsTestPlan)}
    ${row('Flux PN', item.fluxPartNumber || item.fluxPn)}${row('Paste PN', item.pastePartNumber || item.pastePn)}${row('Proflow PN', item.proflowPartNumber)}${row('Stencil PN', item.stencilPartNumber)}
    ${row('Tụ / feeder / nozzle', item.capacitorInfo || item.passivesInfo)}${row('Flux Center / cân Flux', item.fluxCenter || item.weighMap)}
    ${row('Quy trình setup', item.setupProcess)}${row('Lỗi thường gặp', item.commonIssues)}${row('Mẹo xử lý', item.operatorTips)}
  </div>`;
}

function productMaterialRef(item) {
  const api = catalogApi();
  if (!api) return '';
  const rows = [];
  if (item.pastePn) {
    const paste = api.pasteByPn(item.pastePn);
    if (paste) {
      const colorDot = paste.color === 'purple' ? 'var(--purple)' : '#fff';
      rows.push(`<div class="material-ref-row"><span class="material-dot" style="background:${colorDot}"></span><div><b>PASTE · ${escapeHTML(paste.name)}</b><small>${paste.color === 'purple' ? 'Chì tím' : 'Chì trắng'} · Rã đông ${paste.thawHours}h · Sit ${paste.stencilHours || 12}h · Setup lại ${paste.setupHours}h · Hạn nắp ${paste.openHours || 6} ngày · Proflow ${paste.proflowHours || 72}h${paste.fill ? ' · Fill' : ''}</small></div></div>`);
    }
  }
  if (item.fluxPn) {
    const flux = api.fluxByPn(item.fluxPn);
    if (flux) {
      rows.push(`<div class="material-ref-row"><span class="material-dot flux-dot"></span><div><b>FLUX · ${escapeHTML(flux.name)}</b><small>Mở nắp ${flux.openHours || 36}h · Substrate ${flux.substrateHours || 3}h · Prompted: potlife ≥ ${flux.promptedHours || 12}h & amount ≥ ${(flux.promptedAmount || 0.67).toFixed(2)}g</small></div></div>`);
    }
  }
  if (item.stencilInfo) {
    rows.push(`<div class="material-ref-row"><span class="material-dot stencil-dot"></span><div><b>STENCIL</b><small>${escapeHTML(item.stencilInfo)}</small></div></div>`);
  }
  return rows.length ? `<div class="product-section-head"><em>VẬT TƯ & HẠN SỬ DỤNG</em></div><div class="product-material-refs">${rows.join('')}</div>` : '';
}

function productDieRef(item) {
  if (!item.dieFullSize) return '';
  const carrier = item.carrierUp || 24;
  const subs = item.substratesPerCarrier || carrier;
  return `<div class="product-section-head"><em>THAM SỐ TÍNH TOÁN</em></div><div class="product-die-ref">
    <div class="die-ref-row"><span class="die-ref-label">Mother Lot</span><span class="die-ref-value">${item.dieFullSize} die/sub · ${carrier} carrier/lot</span></div>
    <div class="die-ref-row"><span class="die-ref-label">Coupon</span><span class="die-ref-value">${subs} substrate × ${carrier} carrier = ${subs * carrier} substrate/lot</span></div>
    <div class="die-ref-row"><span class="die-ref-label">RLT / Buy-off</span><span class="die-ref-value">${escapeHTML(item.rlt || '—')} / ${escapeHTML(item.buyoff || '—')}</span></div>
  </div>`;
}

const SETUP_GUIDE_STEPS = {
  passives: [
    { title: 'Setup DEK (DEX/DGX)', desc: 'Stencil + Paste + Proflow. Chỉ 2 cặp: trắng+đen hoặc tím+tím. Ghi mốc ON TOOL.' },
    { title: 'Dán nhãn Reel', desc: 'Kiểm tra hạn NSX. MBB kín. Nhãn trắng từ WITS ticket, ghi MM/DD/YYYY HH:MM.' },
    { title: 'Install Feeder trên SC', desc: 'SC → Materials → chipshooter (AX) → chọn feeder → Install. Feeder hết hạn → Uninstall từng cái.' },
    { title: 'Cài MSL', desc: 'Cài MSL cho từng lot có component MSL. Chưa cài thì không chạy.' },
    { title: 'Chuẩn bị tụ tại AX5', desc: 'Đúng feeder, đúng pocket, pick-up căn giữa. Index feeder bằng loading tool.' },
    { title: 'Introduce Lot', desc: 'Chạy NMS00016. Chỉ khi reel, vị trí, PN, hạn, MSL đều đạt.' },
    { title: 'Introduce Lot kế tiếp', desc: 'Substrate qua hết AX5 + NMS/MNS thứ nhất. Carrier đã vào BTU/OXI.' },
    { title: 'RLT & Buy-off', desc: 'RLT: 2 carrier sau DEK + 6 carrier sau AX5. Buy-off: 6 carrier.' }
  ],
  die: [
    { title: 'Kiểm tra Die Lot & ATPO', desc: 'Xác minh reel die khớp ATPO Workstream, đủ substrate (công đoạn 599), không SOOP.' },
    { title: 'Batching / Cart', desc: 'Cộng số die, chia theo lot full. FIFO: 1 lot/lần, 1 lot/cart, 1 ATPO/cart, max 6 magazines.' },
    { title: 'Setup Flux tại ASF', desc: 'Ghi tên lên ống trước OnTool. Kiểm tra loại Flux, hạn, điều kiện Prompted.' },
    { title: 'Cân Flux (Pre-Weights)', desc: 'Cân substrate đúng vị trí theo loại carrier. Flux 340i: chờ ≥6 phút sau phun. Đơn vị mg, reset 0.' },
    { title: 'Setup Grohmann (GSC)', desc: 'Die feeder/reel đúng recipe. Trình tự: End Cycle → Homing → lau kính → Auto Come.' },
    { title: 'Slip Lot & RLT', desc: 'Carrier qua hết AX5 trước. Slip Lot xong mới được RLT vào Grohmann.' },
    { title: 'RLT & Buy-off', desc: 'RLT: 4 carrier/lot. Buy-off: 6 carrier (3 GSC1 + 3 GSC2).' },
    { title: 'Introduce Lot', desc: 'Toàn bộ carrier lot trước vào GSC đủ. Feeder SC không Unknown.' }
  ],
  both: [
    { title: 'Setup DEK (DEX/DGX)', desc: 'Stencil + Paste + Proflow. Ghi mốc ON TOOL.' },
    { title: 'Dán nhãn Reel Tụ', desc: 'MBB kín. Nhãn WITS ticket. Feeder hết hạn → Uninstall.' },
    { title: 'Setup Die Lot & ATPO', desc: 'Xác minh reel die khớp ATPO, đủ substrate 599, không SOOP.' },
    { title: 'Batching / Cart Die', desc: 'FIFO: 1 lot/lần, 1 lot/cart, max 6 magazines.' },
    { title: 'Cân Flux', desc: 'Cân đúng vị trí theo carrier. Flux 340i: chờ ≥6 phút. Đơn vị mg.' },
    { title: 'Setup ASF + GSC', desc: 'Flux OnTool → Die feeder đúng recipe → End Cycle → Homing → Auto Come.' },
    { title: 'Introduce Lot', desc: 'Reel, vị trí, PN, hạn, MSL đạt. Carrier qua hết AX5 + NMS trước khi Introduce kế tiếp.' },
    { title: 'RLT & Buy-off', desc: 'RLT: 2 carrier sau DEK + 6 carrier sau AX5. Buy-off: 6 carrier (3 GSC1 + 3 GSC2).' }
  ]
};

function productSetupGuide(item) {
  const flow = item.flow || 'both';
  const guideFlow = guideNameForFlow(flow);
  const steps = SETUP_GUIDE_STEPS[guideFlow] || SETUP_GUIDE_STEPS.both;
  const flowLabel = { passives: 'SETUP TỤ / PASSIVES', die: 'SETUP DIE', both: 'SETUP TỤ + DIE' }[guideFlow] || 'SETUP TỤ + DIE';
  const flowSub = { passives: 'DEK (DEX/DGX) → AX5 (AXX)', die: 'ASF (ASYMTEK) → GSC (GROHMANN)', both: 'DEK → AX5 → ASF → GSC' }[guideFlow] || 'DEK → AX5 → ASF → GSC';
  const heroColor = { passives: 'blue', die: 'amber', both: 'purple' }[guideFlow] || 'purple';
  const heroIcon = { passives: 'T', die: 'D', both: 'T+D' }[guideFlow] || 'T+D';

  const keyWarnings = [];
  if (item.passivesInfo) keyWarnings.push(item.passivesInfo);
  if (item.stencilInfo) keyWarnings.push(item.stencilInfo);
  if (item.proflowInfo) keyWarnings.push(item.proflowInfo);
  if (item.otherInfo) keyWarnings.push(item.otherInfo);

  return `<div class="product-section-head"><em>HƯỚNG DẪN SETUP</em></div>
    <details class="inline-guide" open>
      <summary class="inline-guide-toggle"><span class="inline-guide-icon ${heroColor}">${heroIcon}</span><div><small>${escapeHTML(flowSub)}</small><b>${flowLabel}</b></div></summary>
      <div class="inline-guide-steps">${steps.map((s, i) => `<div class="inline-guide-step"><span class="igs-num">${String(i + 1).padStart(2, '0')}</span><div><b>${escapeHTML(s.title)}</b><p>${escapeHTML(s.desc)}</p></div></div>`).join('')}</div>
      ${keyWarnings.length ? `<div class="inline-guide-product-notes"><div class="product-section-head"><em>GHI CHÚ SẢN PHẨM NÀY</em></div>${keyWarnings.map((w) => `<p class="inline-note">${escapeHTML(w)}</p>`).join('')}</div>` : ''}
      <div class="inline-guide-footer"><button class="button button-ghost" type="button" data-open-guide="${escapeHTML(item.id)}">Xem hướng dẫn đầy đủ ›</button></div>
    </details>`;
}

function productLossCodeRef(item) {
  const flow = item.flow || 'both';
  const codes = [];
  const seen = new Set();
  const add = (code, desc, severity) => { if (!seen.has(code)) { seen.add(code); codes.push({ code, desc, severity }); } };
  if (flow === 'passives' || flow === 'both' || flow === 'split' || flow === 'combine') {
    add('CJ20', 'Thiếu chì', 'high'); add('CJ21', 'Nối chì', 'normal'); add('CJ24', 'Dư chì', 'normal');
    add('CJ26', 'Lệch tụ', 'normal'); add('CJ27', 'Mất tụ', 'normal');
  }
  if (flow === 'die' || flow === 'both' || flow === 'split' || flow === 'combine') {
    add('CJ34', 'Nhống tụ', 'high'); add('CJ13', 'Die miss', 'normal');
    add('CJ15', 'Bẻ Die', 'normal'); add('CJ18', 'Drop Die', 'normal');
  }
  add('CJ01', 'Substrate tốt', 'normal');
  if (!codes.length) return '';
  return `<div class="product-section-head"><em>MÃ LỖI LIÊN QUAN</em></div><div class="product-loss-refs">${codes.map((c) => `<span class="loss-tag ${c.severity === 'high' ? 'loss-high' : ''}">${c.code} · ${c.desc}</span>`).join('')}</div>`;
}

function renderCatalog() {
  initCatalogPickers();
  const api = catalogApi();
  const activeContainer = $('#product-active');
  const listContainer = $('#product-list');
  if (!api || !listContainer) return;

  const activeSku = api.productById(state.activeProductId);
  fillProductEditor(activeSku);
  renderCatalogSyncStatus();
  if (activeContainer) {
    if (!activeSku) {
      activeContainer.className = 'product-active empty-message';
      activeContainer.innerHTML = 'Chưa chọn SKU. Chọn 1 sản phẩm ở dưới để tự điền Paste/Flux/Die.';
    } else {
      activeContainer.className = 'product-active';
      activeContainer.innerHTML = `<small>PRODUCT ĐANG CHỌN</small><b>${escapeHTML(activeSku.name)}</b><p>${escapeHTML(activeSku.note || '')}</p>${productSetupGuide(activeSku)}${productKnowledge(activeSku)}<div class="chip-row"><span>${escapeHTML(activeSku.family)}</span><span>Flow ${escapeHTML((activeSku.flow || 'both').toUpperCase())}</span><span>Carrier ${activeSku.carrierUp || '—'}-up</span><span>RLT: ${escapeHTML(activeSku.rlt || '—')}</span><span>Buy-off: ${escapeHTML(activeSku.buyoff || '—')}</span></div>`;
    }
  }

  const query = $('#product-search')?.value.trim() || '';
  const searchResults = api.search(query);

  if (catalogTab === 'setup') {
    const items=activeSku?[activeSku]:searchResults.products;
    if(!items.length) return listContainer.innerHTML='<div class="empty-message">Không tìm thấy sản phẩm. Hãy nhập SKU, Test Plan hoặc PN.</div>';
    listContainer.innerHTML=items.map((item)=>`<article class="tracker-card safe"><div class="tracker-head"><div><small>SETUP SẢN PHẨM · ${escapeHTML(item.family)}</small><h3>${escapeHTML(item.name)}</h3></div><span class="sku-chip">${item.carrierUp||'—'}-up</span></div>${productSetupGuide(item)}${productKnowledge(item)}${productMaterialRef(item)}${productDieRef(item)}${productLossCodeRef(item)}<div class="chip-row"><span>Flow ${escapeHTML((item.flow||'both').toUpperCase())}</span><span>Carrier ${item.carrierUp||'—'}-up</span><span>RLT: ${escapeHTML(item.rlt||'—')}</span><span>Buy-off: ${escapeHTML(item.buyoff||'—')}</span></div><div class="sku-actions"><button class="button button-primary" type="button" data-open-guide="${item.id}">Xem hướng dẫn đầy đủ</button><button class="button button-ghost" type="button" data-go="paste">Timer Paste</button><button class="button button-ghost" type="button" data-go="flux">Timer Flux</button><button class="button button-ghost" type="button" data-go="die">Tính Die</button></div></article>`).join('');
    return;
  }

  if (catalogTab === 'products') {
    const items = searchResults.products;
    if (!items.length) return listContainer.innerHTML = '<div class="empty-message">Không tìm thấy sản phẩm.</div>';
    listContainer.innerHTML = items.map((item) => `<article class="tracker-card ${item.id === state.activeProductId ? 'safe' : ''}">
      <div class="tracker-head"><div><small>${escapeHTML(item.family)} · Flow: ${escapeHTML(item.flow.toUpperCase())}</small><h3>${escapeHTML(item.name)}</h3></div><span class="sku-chip">${item.carrierUp}-up</span></div>
      ${productKnowledge(item)}
      <div class="sku-actions"><button class="button ${item.id === state.activeProductId ? 'button-primary' : 'button-ghost'}" type="button" data-select-product="${item.id}">${item.id === state.activeProductId ? 'Đang chọn' : 'Chọn SKU này'}</button><button class="button button-ghost" type="button" data-open-guide="${item.id}">Xem hướng dẫn</button></div>
    </article>`).join('');
    return;
  }

  const rawItems = catalogTab === 'other'
    ? [...searchResults.passives, ...searchResults.die, ...searchResults.stencil]
    : (searchResults[catalogTab] || []);
  if (!rawItems.length) return listContainer.innerHTML = '<div class="empty-message">Không có dữ liệu catalog.</div>';
  listContainer.innerHTML = rawItems.map((item) => `<article class="tracker-card safe">
    <div class="tracker-head"><div><small>${catalogTab.toUpperCase()}</small><h3>${escapeHTML(item.name || item.pn)}</h3></div><span class="sku-chip">${escapeHTML(item.pn)}</span></div>
    <div class="sku-meta"><span>Ghi chú: <b>${escapeHTML(item.note || '—')}</b></span>${item.thawHours ? `<span>Rã đông min: <b>${item.thawHours}h</b> · Setup lại: <b>${item.setupHours}h</b> · Sit substrate: <b>${item.substrateHours}h</b></span>` : ''}${item.openHours ? `<span>Mở nắp max: <b>${item.openHours}h</b></span>` : ''}</div>
  </article>`).join('');
}

function renderAll() {
  renderPaste();
  renderFlux();
  renderPassives();
  renderDie();
  renderChecklists();
  renderFluxPositionDiagrams();
  renderPassdownHistory();
  renderCalculationHistory();
  renderCatalog();
  renderDashboard();
}

function bindAllEvents() {
  $('#menu-button').addEventListener('click', () => setMenu(true));
  $('#global-search-button').addEventListener('click', () => openGlobalSearch());
  $('#close-global-search').addEventListener('click', closeGlobalSearch);
  $('#global-search-form').addEventListener('submit', (event) => { event.preventDefault(); runGlobalSearch($('#global-search-input').value); });
  $$('[data-search-query]').forEach((button) => button.addEventListener('click', () => { openGlobalSearch(button.dataset.searchQuery); }));
  $$('[data-open-search]').forEach((button) => button.addEventListener('click', () => openGlobalSearch(button.dataset.openSearch === 'product' ? '' : button.dataset.openSearch)));
  $('#global-search-results').addEventListener('click', (event) => {
    const result = event.target.closest('[data-search-page]'); if (!result) return;
    closeGlobalSearch();
    if (result.dataset.searchProduct) {
      selectProduct(result.dataset.searchProduct);
      if ($('#product-search')) $('#product-search').value = '';
      catalogTab = 'setup';
      $$('.product-tabs button').forEach((btn) => btn.classList.toggle('active', btn.dataset.catalog === 'setup'));
      showPage('products');
      return;
    }
    showPage(result.dataset.searchPage);
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#global-search').hidden) closeGlobalSearch(); });
  $('#close-menu').addEventListener('click', () => setMenu(false));
  $('#overlay').addEventListener('click', () => setMenu(false));
  $('#bottom-menu').addEventListener('click', () => setMenu(true));
  $$('.nav-item, .bottom-item[data-page]').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.page)));
  document.addEventListener('click', (event) => {
    const goButton = event.target.closest('[data-go]');
    const jumpButton = event.target.closest('[data-jump]');
    const checkButton = event.target.closest('[data-checklist]');
    const deleteButton = event.target.closest('[data-delete]');
    if (goButton) showPage(goButton.dataset.go);
    if (jumpButton) {
      const target = document.getElementById(jumpButton.dataset.jump);
      if (target) {
        target.open = true;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    if (checkButton) toggleChecklist(checkButton.dataset.checklist, Number(checkButton.dataset.index));
    if (deleteButton) removeItem(deleteButton.dataset.delete, deleteButton.dataset.id);
    const selectProductBtn = event.target.closest('[data-select-product]');
    if (selectProductBtn) selectProduct(selectProductBtn.dataset.selectProduct);
    const openGuideBtn = event.target.closest('[data-open-guide]');
    if (openGuideBtn) {
      selectProduct(openGuideBtn.dataset.openGuide);
      showPage('guides');
    }
    const catalogTabBtn = event.target.closest('[data-catalog]');
    if (catalogTabBtn) {
      catalogTab = catalogTabBtn.dataset.catalog;
      $$('.product-tabs button').forEach((btn) => btn.classList.toggle('active', btn === catalogTabBtn));
      renderCatalog();
    }
  });
  $$('.rule-tabs button').forEach((button) => button.addEventListener('click', () => showRule(button.dataset.rule)));
  $$('.guide-tabs button').forEach((button) => {
    if (button.dataset.guide) button.addEventListener('click', () => showGuide(button.dataset.guide));
  });
  $$('[data-die-calc]').forEach((button) => button.addEventListener('click', () => showDieCalculator(button.dataset.dieCalc)));
  $$('[data-die-mode]').forEach((button) => button.addEventListener('click', () => setDieBalanceMode(button.dataset.dieMode)));
  $$('.die-kill-feeder').forEach((input) => input.addEventListener('input', updateDieKillSum));
  $$('[data-reset-calculator]').forEach((button) => button.addEventListener('click', () => resetDieCalculator(button.dataset.resetCalculator)));
  $('#paste-type').addEventListener('change', syncPastePair);
  $('#paste-name').addEventListener('change', applyPastePnFromCatalog);
  $('#paste-special-material').addEventListener('change', updatePasteSetupPreview);
  $('#paste-setup').addEventListener('input', updatePasteSetupPreview);
  $('#paste-proflow').addEventListener('input', updatePasteSetupPreview);
  $('#flux-potlife-preset').addEventListener('change', applyFluxPotlifePreset);
  $('#flux-potlife-hours').addEventListener('input', applyFluxPotlifeHours);
  $('#flux-potlife').addEventListener('input', () => {
    $('#flux-potlife-preset').value = '';
    $('#flux-potlife-hours').value = '';
    updateFluxPotlifePreview();
  });
  $('#paste-form').addEventListener('submit', addPaste);
  $('#flux-form').addEventListener('submit', addFlux);
  $('#passives-form').addEventListener('submit', addPassives);
  $('#die-form').addEventListener('submit', addDie);
  $('#mother-form').addEventListener('submit', calculateMotherLot);
  $('#die-kill-form').addEventListener('submit', calculateDieKill);
  $('#coupon-form').addEventListener('submit', calculateCoupon);
  $('#passdown-form').addEventListener('submit', savePassdown);
  $('#product-search').addEventListener('input', () => renderCatalog());
  $('#product-search-form').addEventListener('submit', (event) => { event.preventDefault(); const first=catalogApi()?.search($('#product-search').value.trim()).products[0]; if(first) selectProduct(first.id); catalogTab='setup'; $$('.product-tabs button').forEach((btn)=>btn.classList.toggle('active',btn.dataset.catalog==='setup')); renderCatalog(); });
  $('#product-editor-form').addEventListener('submit', saveProductEdit);
  $('#reset-product-edit').addEventListener('click', resetProductEdit);
  $('#catalog-remote-url').addEventListener('change', (event) => { state.catalogRemoteUrl = event.target.value.trim(); saveState(); renderCatalogSyncStatus(); });
  $('#sync-catalog').addEventListener('click', () => syncCatalogOnline(false));
  $('#export-catalog').addEventListener('click', downloadCatalog);
  $('#import-catalog').addEventListener('click', () => $('#catalog-file-input').click());
  $('#catalog-file-input').addEventListener('change', (event) => { const [file] = event.target.files; if (file) importCatalogFile(file); event.target.value = ''; });
  $('#reset-die-checks').addEventListener('click', () => {
    if (!confirm('Đặt lại toàn bộ checklist Die?')) return;
    state.dieChecks = Array(10).fill(false); saveState(); renderChecklists();
  });
  $('#clear-passdown').addEventListener('click', () => {
    if (!state.passdown.length || !confirm('Xóa toàn bộ lịch sử Passdown?')) return;
    state.passdown = []; saveState(); renderPassdownHistory();
  });
  $('#clear-calculation-history').addEventListener('click', () => {
    if (!state.calculationHistory.length || !confirm('Xóa toàn bộ lịch sử tính ATPO/Mother Lot/Die Kill/Coupon?')) return;
    state.calculationHistory = []; saveState(); renderCalculationHistory(); showToast('Đã xóa lịch sử tính Lot.');
  });
  $('#install-button').addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    $('#install-button').hidden = true;
  });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); installPrompt = event; $('#install-button').hidden = false;
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; $('#install-button').hidden = true; showToast('Đã cài CAM Setup Timer.'); });
  window.addEventListener('online', () => { updateNetwork(); flushProductOverrides(); syncCatalogOnline(true); });
  window.addEventListener('offline', updateNetwork);
  window.addEventListener('storage', (event) => { if(event.key===DB_KEY){ state=loadState(); renderAll(); } });
  document.addEventListener('visibilitychange', () => { if(!document.hidden && navigator.onLine){ flushProductOverrides(); syncCatalogOnline(true); } });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js?v=35', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch(() => showToast('Không thể bật chế độ offline.', 'warning'));
  }
}

function initialize() {
  $('#passives-installed').value = toLocalInput();
  $('#passdown-date').value = new Date().toISOString().slice(0, 10);
  $('#catalog-remote-url').value = state.catalogRemoteUrl || '';
  syncPastePair();
  setDieBalanceMode('kill');
  updateFluxPotlifePreview();
  bindAllEvents();
  updateClock();
  updateNetwork();
  renderAll();
  const lastSync = state.catalogSyncedAt ? new Date(state.catalogSyncedAt).getTime() : 0;
  if (navigator.onLine && Date.now() - lastSync > 6 * HOUR) syncCatalogOnline(true);
  if (navigator.onLine) flushProductOverrides();
  const initialPage = location.hash.slice(1);
  if (initialPage && $(`#page-${initialPage}`)) showPage(initialPage);
  registerServiceWorker();
  setInterval(() => {
    updateClock();
    updateFluxPotlifePreview();
    renderPaste(); renderFlux(); renderPassives(); renderDashboard();
  }, 1000);
  setInterval(() => { if(navigator.onLine && !document.hidden) syncCatalogOnline(true); }, 30_000);
}

initialize();
