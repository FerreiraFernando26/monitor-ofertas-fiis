'use strict';

const state = { offers: [], referenceDate: null, generatedAt: null, sort: { field: 'updated_at', direction: -1 }, chart: 'announced' };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 2 });
const moneyFull = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const dayFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const monthFormat = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' });
const controls = ['#search', '#statusFilter', '#fundFilter', '#typeFilter', '#coordinatorFilter', '#riteFilter', '#periodFilter'].map($);
const timelineLabels = {
  start_planned: 'Início previsto', start_actual: 'Início efetivo', reservation_end_planned: 'Fim da reserva',
  closing_planned: 'Encerramento previsto', closing_actual: 'Encerramento efetivo',
  settlement_planned: 'Liquidação prevista', settlement_actual: 'Liquidação efetiva',
};

function parseDate(value) { return value ? new Date(`${String(value).slice(0, 10)}T12:00:00-03:00`) : null; }
function dateText(value) { const parsed = parseDate(value); return parsed ? dayFormat.format(parsed) : 'n.a.'; }
function text(value) { return value || 'Não informado'; }
function numberValue(value) { return value == null || Number.isNaN(Number(value)) ? null : Number(value); }
function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
}
function badge(status, review = false) {
  const node = element('span', `badge ${review ? 'badge-review' : status === 'Oferta Encerrada' ? 'badge-closed' : 'badge-active'}`, review ? 'Revisão necessária' : text(status));
  return node;
}
function relevantDate(offer) {
  return offer.timeline?.start_actual || offer.timeline?.start_planned || offer.identified_at || offer.updated_at;
}

function setOptions(selector, values) {
  const select = $(selector);
  const current = select.value;
  [...select.options].slice(1).forEach(option => option.remove());
  [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(value => {
    const option = element('option', '', value);
    option.value = value;
    select.append(option);
  });
  if ([...select.options].some(option => option.value === current)) select.value = current;
}

function populateFilters() {
  setOptions('#statusFilter', state.offers.map(offer => offer.status));
  setOptions('#fundFilter', state.offers.map(offer => offer.fund));
  setOptions('#typeFilter', state.offers.map(offer => offer.type));
  setOptions('#coordinatorFilter', state.offers.map(offer => offer.lead_coordinator));
  setOptions('#riteFilter', state.offers.map(offer => offer.rite));
}

function filteredOffers() {
  const query = $('#search').value.trim().toLocaleLowerCase('pt-BR');
  const exact = {
    status: $('#statusFilter').value, fund: $('#fundFilter').value, type: $('#typeFilter').value,
    lead_coordinator: $('#coordinatorFilter').value, rite: $('#riteFilter').value,
  };
  const periodDays = Number($('#periodFilter').value || 0);
  const reference = parseDate(state.referenceDate);
  const cutoff = periodDays && reference ? new Date(reference.getTime() - periodDays * 86400000) : null;
  const rows = state.offers.filter(offer => {
    const haystack = `${offer.fund} ${offer.cnpj} ${offer.registration} ${offer.ticker}`.toLocaleLowerCase('pt-BR');
    if (query && !haystack.includes(query)) return false;
    if (Object.entries(exact).some(([field, value]) => value && offer[field] !== value)) return false;
    const offerDate = parseDate(relevantDate(offer));
    return !cutoff || (offerDate && offerDate >= cutoff);
  });
  const { field, direction } = state.sort;
  return rows.sort((a, b) => {
    const av = a[field] ?? '';
    const bv = b[field] ?? '';
    if (typeof av === 'number' || typeof bv === 'number') return (Number(av || 0) - Number(bv || 0)) * direction;
    return String(av).localeCompare(String(bv), 'pt-BR') * direction;
  });
}

function renderTable() {
  const rows = filteredOffers();
  const tbody = $('#offerRows');
  tbody.replaceChildren(...rows.map(offer => {
    const row = element('tr');
    row.tabIndex = 0;
    row.dataset.id = offer.id;
    row.setAttribute('aria-label', `Abrir detalhes de ${offer.fund}`);
    const fund = element('td', 'fund', offer.fund);
    fund.append(element('span', 'subcell', offer.ticker || offer.cnpj));
    row.append(fund, element('td', '', offer.registration), element('td', '', offer.type));
    const statusCell = element('td');
    statusCell.append(badge(offer.status, offer.review_required));
    row.append(statusCell);
    row.append(element('td', 'numeric', offer.maximum_volume == null ? 'n.a.' : money.format(offer.maximum_volume)));
    row.append(element('td', 'numeric', offer.captured_volume == null ? 'n.a.' : money.format(offer.captured_volume)));
    row.append(element('td', '', dateText(offer.updated_at)));
    return row;
  }));
  $('#resultCount').textContent = `${rows.length} ${rows.length === 1 ? 'oferta exibida' : 'ofertas exibidas'}`;
  $('#empty').hidden = rows.length > 0;
  $('#loadError').hidden = true;
}

function renderKpis() {
  const active = state.offers.filter(offer => offer.status !== 'Oferta Encerrada').length;
  const maximum = state.offers.reduce((sum, offer) => sum + (numberValue(offer.maximum_volume) || 0), 0);
  const confirmed = state.offers.filter(offer => numberValue(offer.captured_volume) != null);
  const captured = confirmed.reduce((sum, offer) => sum + numberValue(offer.captured_volume), 0);
  const confirmedMaximum = confirmed.reduce((sum, offer) => sum + (numberValue(offer.maximum_volume) || 0), 0);
  const review = state.offers.filter(offer => offer.review_required).length;
  const reference = parseDate(state.referenceDate);
  const weekLimit = reference ? new Date(reference.getTime() + 7 * 86400000) : null;
  const closingThisWeek = state.offers.filter(offer => {
    if (offer.status === 'Oferta Encerrada') return false;
    const closing = parseDate(offer.timeline?.closing_planned);
    return reference && weekLimit && closing && closing >= reference && closing <= weekLimit;
  });
  $('#kpiOffers').textContent = state.offers.length;
  $('#kpiActive').textContent = `${active} em acompanhamento`;
  $('#kpiMaximum').textContent = money.format(maximum);
  $('#kpiCaptured').textContent = confirmed.length ? money.format(captured) : 'n.a.';
  $('#kpiCaptureNote').textContent = confirmed.length ? `${confirmed.length} ofertas com confirmação` : 'Sem confirmação oficial';
  $('#kpiRate').textContent = confirmedMaximum ? percent.format(captured / confirmedMaximum) : 'n.a.';
  $('#kpiClosingWeek').textContent = closingThisWeek.length;
  $('#kpiClosingNote').textContent = closingThisWeek.length === 1 ? dateText(closingThisWeek[0].timeline.closing_planned) : 'Conforme cronograma previsto';
  $('#kpiReview').textContent = review;
}

function renderStatus() {
  const counts = new Map();
  state.offers.forEach(offer => counts.set(offer.review_required ? 'Revisão necessária' : offer.status, (counts.get(offer.review_required ? 'Revisão necessária' : offer.status) || 0) + 1));
  const colors = ['var(--blue)', 'var(--green)', 'var(--gold)', '#7892a6'];
  let offset = 0;
  const segments = [...counts.entries()].map(([label, count], index) => {
    const start = offset;
    offset += state.offers.length ? count / state.offers.length * 100 : 0;
    return { label, count, color: colors[index % colors.length], start, end: offset };
  });
  $('#statusDonut').style.background = `conic-gradient(${segments.map(item => `${item.color} ${item.start}% ${item.end}%`).join(',') || 'var(--line) 0 100%'})`;
  $('#statusDonutTotal').textContent = state.offers.length;
  $('#statusTotal').textContent = `${state.offers.length} ofertas`;
  $('#statusLegend').replaceChildren(...segments.map(item => {
    const row = element('div', 'legend-row');
    const marker = element('i'); marker.style.background = item.color;
    row.append(marker, element('span', '', item.label), element('b', '', item.count));
    return row;
  }));
  $('#mixIpo').textContent = state.offers.filter(offer => offer.type === 'IPO / 1ª emissão').length;
  $('#mixFollowOn').textContent = state.offers.filter(offer => offer.type !== 'IPO / 1ª emissão').length;
}

function monthKey(value) { return value ? String(value).slice(0, 7) : null; }
function renderChart() {
  const groups = new Map();
  state.offers.forEach(offer => {
    const dateValue = state.chart === 'captured' ? offer.timeline?.closing_actual : relevantDate(offer);
    const key = monthKey(dateValue);
    const amount = state.chart === 'captured' ? numberValue(offer.captured_volume) : numberValue(offer.maximum_volume);
    if (key && amount != null) groups.set(key, (groups.get(key) || 0) + amount);
  });
  const entries = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-8);
  const maximum = Math.max(...entries.map(([, value]) => value), 1);
  $('#volumeChart').replaceChildren(...entries.map(([key, value]) => {
    const column = element('div', 'bar-column');
    column.title = `${key}: ${moneyFull.format(value)}`;
    const bar = element('div', `bar ${state.chart === 'captured' ? 'captured' : ''}`);
    bar.style.height = `${Math.max(3, value / maximum * 145)}px`;
    const labelDate = parseDate(`${key}-01`);
    column.append(element('span', 'bar-value', money.format(value)), bar, element('span', 'bar-label', monthFormat.format(labelDate)));
    return column;
  }));
  if (!entries.length) $('#volumeChart').append(element('div', 'empty', 'Nenhum valor confirmado para esta métrica.'));
}

function renderCoordinatorChart() {
  const groups = new Map();
  state.offers.forEach(offer => {
    const amount = numberValue(offer.captured_volume);
    const coordinator = offer.lead_coordinator || 'Não informado';
    if (amount != null) groups.set(coordinator, (groups.get(coordinator) || 0) + amount);
  });
  const entries = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maximum = Math.max(...entries.map(([, value]) => value), 1);
  $('#coordinatorCount').textContent = `${entries.length} ${entries.length === 1 ? 'coordenador' : 'coordenadores'}`;
  $('#coordinatorChart').replaceChildren(...entries.map(([name, value]) => {
    const row = element('div', 'coordinator-row');
    row.title = `${name}: ${moneyFull.format(value)}`;
    const rail = element('div', 'coordinator-rail');
    const fill = element('div', 'coordinator-fill');
    fill.style.width = `${Math.max(1, value / maximum * 100)}%`;
    rail.append(fill);
    row.append(element('span', 'coordinator-name', name), rail, element('strong', 'coordinator-value', money.format(value)));
    return row;
  }));
  if (!entries.length) $('#coordinatorChart').append(element('div', 'empty', 'Nenhuma captação confirmada por coordenador.'));
}

function eventItems() {
  const reference = parseDate(state.referenceDate);
  if (!reference) return [];
  const limit = new Date(reference.getTime() + 45 * 86400000);
  const items = [];
  state.offers.forEach(offer => Object.entries(offer.timeline || {}).forEach(([field, value]) => {
    const eventDate = parseDate(value);
    if (eventDate && eventDate >= reference && eventDate <= limit) items.push({ offer, field, date: value });
  }));
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

function renderAgenda() {
  const items = eventItems().slice(0, 9);
  $('#agendaCount').textContent = `${items.length} eventos`;
  $('#agendaList').replaceChildren(...items.map(item => {
    const wrapper = element('article', 'agenda-item');
    const parsed = parseDate(item.date);
    const dateBox = element('div', 'agenda-date');
    dateBox.append(element('strong', '', String(parsed.getDate()).padStart(2, '0')), element('span', '', monthFormat.format(parsed)));
    const content = element('div');
    content.append(element('h3', '', item.offer.fund), element('p', '', timelineLabels[item.field] || item.field));
    wrapper.append(dateBox, content);
    return wrapper;
  }));
  if (!items.length) $('#agendaList').append(element('div', 'empty', 'Nenhum evento previsto para os próximos 45 dias.'));
}

function allDocuments() {
  return state.offers.flatMap(offer => (offer.documents || []).map(document => ({ ...document, fund: offer.fund, offerId: offer.id })));
}
function renderDocuments() {
  const documents = allDocuments().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  $('#documentCount').textContent = `${documents.length} documentos`;
  $('#documentList').replaceChildren(...documents.slice(0, 9).map(document => {
    const card = element('article', 'document-card');
    const link = element('a', '', document.type || 'Documento oficial');
    link.href = document.official_url;
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    card.append(link, element('p', '', `${document.fund} · ${dateText(document.date)} · ${document.availability}`));
    return card;
  }));
  if (!documents.length) $('#documentList').append(element('div', 'empty', 'Nenhum documento oficial vinculado.'));
}

function detailStat(label, value) {
  const item = element('div', 'detail-stat');
  item.append(element('small', '', label), element('strong', '', value));
  return item;
}
function openDetails(offerId) {
  const offer = state.offers.find(item => item.id === offerId);
  if (!offer) return;
  $('#detailName').textContent = offer.fund;
  $('#detailMeta').textContent = [offer.cnpj, offer.registration, offer.issue && `${offer.issue} emissão`].filter(Boolean).join(' · ');
  const badgeWrap = $('#detailBadges');
  badgeWrap.replaceChildren(badge(offer.status, offer.review_required), element('span', 'badge badge-active', offer.type), element('span', 'badge badge-active', offer.rite || 'Rito não informado'));
  $('#detailVolumes').replaceChildren(
    detailStat('Volume inicial', offer.initial_volume == null ? 'n.a.' : moneyFull.format(offer.initial_volume)),
    detailStat('Volume máximo', offer.maximum_volume == null ? 'n.a.' : moneyFull.format(offer.maximum_volume)),
    detailStat('Captação confirmada', offer.captured_volume == null ? 'n.a.' : moneyFull.format(offer.captured_volume)),
    detailStat('Taxa de colocação', offer.capture_rate == null ? 'n.a.' : percent.format(offer.capture_rate)),
    detailStat('Coordenador líder', text(offer.lead_coordinator)),
    detailStat('Última atualização', dateText(offer.updated_at)),
  );
  const timeline = Object.entries(timelineLabels).map(([field, label]) => {
    const item = element('div', `timeline-item ${field.endsWith('actual') ? 'actual' : ''}`);
    item.append(element('small', '', label), element('strong', '', dateText(offer.timeline?.[field])));
    return item;
  });
  $('#detailTimeline').replaceChildren(...timeline);
  const documents = (offer.documents || []).map(document => {
    const item = element('div', 'detail-document');
    const copy = element('div');
    copy.append(element('strong', '', document.type), element('span', '', `${dateText(document.date)} · ${document.availability}${document.page ? ` · pág. ${document.page}` : ''}`));
    const link = element('a', '', 'Abrir fonte'); link.href = document.official_url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    item.append(copy, link);
    return item;
  });
  $('#detailDocuments').replaceChildren(...documents);
  if (!documents.length) $('#detailDocuments').append(element('div', 'empty', 'Nenhum documento oficial vinculado.'));
  $('#details').showModal();
}

function renderFreshness() {
  const generated = state.generatedAt ? new Date(state.generatedAt) : null;
  $('#freshnessText').textContent = generated && !Number.isNaN(generated.getTime()) ? `Base atualizada em ${dateTimeFormat.format(generated)}` : `Base de referência: ${dateText(state.referenceDate)}`;
  const reference = generated && !Number.isNaN(generated.getTime()) ? generated : parseDate(state.referenceDate);
  const age = reference ? (Date.now() - reference.getTime()) / 86400000 : 0;
  const stale = age > 2;
  $('#freshness').classList.toggle('stale', stale);
  $('#staleAlert').hidden = !stale;
}

function renderAll() {
  populateFilters();
  renderFreshness();
  renderKpis();
  renderStatus();
  renderChart();
  renderCoordinatorChart();
  renderAgenda();
  renderDocuments();
  renderTable();
}

function exportCsv() {
  const headers = ['Fundo', 'CNPJ', 'Registro', 'Tipo', 'Status', 'Volume máximo', 'Volume captado', 'Atualização'];
  const lines = [headers, ...filteredOffers().map(offer => [offer.fund, offer.cnpj, offer.registration, offer.type, offer.status, offer.maximum_volume ?? '', offer.captured_volume ?? '', offer.updated_at])];
  const csv = lines.map(line => line.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
  link.download = 'ofertas-fii-filtradas.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

async function load() {
  $('#loadError').hidden = true;
  try {
    const response = await fetch('./data/offers.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.schema_version !== 2 || !Array.isArray(payload.offers)) throw new Error('Schema público incompatível');
    state.offers = payload.offers;
    state.referenceDate = payload.reference_date;
    state.generatedAt = payload.generated_at;
    renderAll();
  } catch (error) {
    console.error(error);
    state.offers = [];
    $('#freshnessText').textContent = 'Falha ao carregar a base pública';
    $('#offerRows').replaceChildren();
    $('#resultCount').textContent = '0 ofertas exibidas';
    $('#empty').hidden = true;
    $('#loadError').hidden = false;
  }
}

controls.forEach(control => control.addEventListener('input', renderTable));
$$('[data-sort]').forEach(button => button.addEventListener('click', () => {
  const field = button.dataset.sort;
  state.sort.direction = state.sort.field === field ? state.sort.direction * -1 : 1;
  state.sort.field = field;
  renderTable();
}));
$$('[data-chart]').forEach(button => button.addEventListener('click', () => {
  $$('[data-chart]').forEach(item => item.setAttribute('aria-pressed', 'false'));
  button.setAttribute('aria-pressed', 'true');
  state.chart = button.dataset.chart;
  renderChart();
}));
$('#offerRows').addEventListener('click', event => { const row = event.target.closest('tr'); if (row) openDetails(row.dataset.id); });
$('#offerRows').addEventListener('keydown', event => { const row = event.target.closest('tr'); if (row && ['Enter', ' '].includes(event.key)) { event.preventDefault(); openDetails(row.dataset.id); } });
$('.close').addEventListener('click', () => $('#details').close());
$('#details').addEventListener('click', event => { if (event.target === $('#details')) $('#details').close(); });
$('#export').addEventListener('click', exportCsv);
$('#retry').addEventListener('click', load);

load();
