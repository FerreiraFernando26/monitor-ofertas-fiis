'use strict';

const state = { offers: [], scheduleChanges: [], referenceDate: null, generatedAt: null, sort: { field: 'updated_at', direction: -1 }, chart: 'announced', scheduleFilter: 'all' };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 2 });
const moneyFull = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const dayFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const monthFormat = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' });
const controls = ['#search', '#statusFilter', '#fundFilter', '#typeFilter', '#coordinatorFilter', '#distributorFilter', '#riteFilter', '#periodFilter'].map($);
const timelineLabels = {
  start_planned: 'Início previsto', start_actual: 'Início efetivo', reservation_end_planned: 'Fim da reserva',
  closing_planned: 'Encerramento previsto', closing_actual: 'Encerramento efetivo',
  settlement_planned: 'Liquidação prevista', settlement_actual: 'Liquidação efetiva',
};
const scheduleMilestones = [
  { label: 'Início', planned: 'start_planned', actual: 'start_actual' },
  { label: 'Fim da reserva', planned: 'reservation_end_planned', actual: null },
  { label: 'Liquidação', planned: 'settlement_planned', actual: 'settlement_actual' },
  { label: 'Encerramento', planned: 'closing_planned', actual: 'closing_actual' },
];
const scheduleStatusLabels = { completed: 'Concluído', next: 'Próximo', upcoming: 'Previsto', past: 'Prazo passado', missing: 'Sem próxima data' };

function parseDate(value) { return value ? new Date(`${String(value).slice(0, 10)}T12:00:00-03:00`) : null; }
function dateText(value) { const parsed = parseDate(value); return parsed ? dayFormat.format(parsed) : 'n.a.'; }
function text(value) { return value || 'Não informado'; }
function numberValue(value) { return value == null || Number.isNaN(Number(value)) ? null : Number(value); }
function confirmedVolumeLabel(offer) { return offer.distribution_nature === 'Secundária' ? 'Volume distribuído' : 'Captação confirmada'; }
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
function daysFromReference(value) {
  const reference = parseDate(state.referenceDate);
  const target = parseDate(value);
  return reference && target ? Math.round((target.getTime() - reference.getTime()) / 86400000) : null;
}
function scheduleStatus(value, actual = false) {
  if (actual) return 'completed';
  const distance = daysFromReference(value);
  if (distance == null) return 'missing';
  if (distance < 0) return 'past';
  if (distance <= 7) return 'next';
  return 'upcoming';
}
function scheduleBadge(status) { return element('span', `schedule-status ${status}`, scheduleStatusLabels[status] || status); }

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
  setOptions('#distributorFilter', state.offers.flatMap(offer => (offer.distributors || []).map(item => item.name)));
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
    const distributorNames = (offer.distributors || []).map(item => item.name).join(' ');
    const haystack = `${offer.fund} ${offer.cnpj} ${offer.registration} ${offer.ticker} ${distributorNames}`.toLocaleLowerCase('pt-BR');
    if (query && !haystack.includes(query)) return false;
    if (Object.entries(exact).some(([field, value]) => value && offer[field] !== value)) return false;
    const distributor = $('#distributorFilter').value;
    if (distributor && !(offer.distributors || []).some(item => item.name === distributor)) return false;
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

function renderDistributorChart() {
  const groups = new Map();
  state.offers.forEach(offer => {
    const distributors = new Map((offer.distributors || []).filter(item => item.name).map(item => [item.name, item]));
    distributors.forEach((distributor, name) => {
      const current = groups.get(name) || { offers: 0, associated: 0, captured: 0, confirmed: 0, hasConfirmed: false };
      current.offers += 1;
      current.associated += numberValue(offer.maximum_volume) || 0;
      current.captured += numberValue(offer.captured_volume) || 0;
      const allocated = numberValue(distributor.allocated_volume);
      if (allocated != null) { current.confirmed += allocated; current.hasConfirmed = true; }
      groups.set(name, current);
    });
  });
  const entries = [...groups.entries()].sort((a, b) => b[1].associated - a[1].associated || a[0].localeCompare(b[0], 'pt-BR')).slice(0, 8);
  const maximum = Math.max(...entries.map(([, metrics]) => metrics.associated), 1);
  $('#distributorCount').textContent = `${groups.size} ${groups.size === 1 ? 'instituição' : 'instituições'}`;
  $('#distributorChart').replaceChildren(...entries.map(([name, metrics]) => {
    const row = element('div', 'coordinator-row distributor-row');
    const confirmed = metrics.hasConfirmed ? moneyFull.format(metrics.confirmed) : 'n.a.';
    row.title = `${name}: ${metrics.offers} ${metrics.offers === 1 ? 'oferta' : 'ofertas'}; volume associado ${moneyFull.format(metrics.associated)}; captação das ofertas ${moneyFull.format(metrics.captured)}; rateio confirmado ${confirmed}`;
    const label = element('div', 'distributor-label');
    label.append(
      element('span', 'coordinator-name', name),
      element('small', '', `${metrics.offers} ${metrics.offers === 1 ? 'oferta' : 'ofertas'} · Confirmado nas ofertas: ${metrics.captured ? money.format(metrics.captured) : 'n.a.'} · Rateio: ${confirmed}`),
    );
    const rail = element('div', 'coordinator-rail');
    const fill = element('div', 'coordinator-fill distributor-fill');
    fill.style.width = `${Math.max(1, metrics.associated / maximum * 100)}%`;
    rail.append(fill);
    row.append(label, rail, element('strong', 'coordinator-value', metrics.associated ? money.format(metrics.associated) : 'n.a.'));
    return row;
  }));
  if (!entries.length) $('#distributorChart').append(element('div', 'empty', 'Nenhum distribuidor identificado nos documentos oficiais.'));
}

function documentScheduleEvents(offer) {
  const events = [];
  (offer.documents || []).forEach(document => (document.events || []).forEach(event => {
    if (!event.date) return;
    const actual = String(event.kind || '').toLocaleLowerCase('pt-BR').includes('efetiv');
    events.push({
      offer, date: event.date, name: event.name || 'Evento do cronograma', kind: event.kind || 'Prevista',
      actual, status: scheduleStatus(event.date, actual), source: document.type, sourceUrl: document.official_url,
    });
  }));
  return events;
}

function canonicalScheduleEvents(offer) {
  return scheduleMilestones.flatMap(milestone => {
    const actualDate = milestone.actual ? offer.timeline?.[milestone.actual] : null;
    const plannedDate = offer.timeline?.[milestone.planned];
    const value = actualDate || plannedDate;
    if (!value) return [];
    const actual = Boolean(actualDate);
    return [{ offer, date: value, name: milestone.label, kind: actual ? 'Efetiva' : 'Prevista', actual, status: scheduleStatus(value, actual), source: 'Base consolidada', sourceUrl: offer.official_url }];
  });
}

function scheduleEventsForOffer(offer) {
  const detailed = documentScheduleEvents(offer);
  const events = [...detailed];
  canonicalScheduleEvents(offer).forEach(candidate => {
    const duplicate = detailed.some(item => item.date === candidate.date && (item.name.toLocaleLowerCase('pt-BR').includes(candidate.name.toLocaleLowerCase('pt-BR')) || candidate.name.toLocaleLowerCase('pt-BR').includes(item.name.toLocaleLowerCase('pt-BR'))));
    if (!duplicate) events.push(candidate);
  });
  const unique = new Map();
  events.forEach(item => unique.set(`${item.date}|${item.name}|${item.kind}`, item));
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function allScheduleEvents() { return state.offers.flatMap(scheduleEventsForOffer).sort((a, b) => a.date.localeCompare(b.date)); }

function pendingMilestones(offer) {
  return scheduleMilestones.filter(milestone => {
    if (milestone.actual && offer.timeline?.[milestone.actual]) return false;
    const planned = offer.timeline?.[milestone.planned];
    return planned && scheduleStatus(planned) === 'past';
  });
}

function offerScheduleSummary(offer) {
  const events = scheduleEventsForOffer(offer);
  const closed = offer.status === 'Oferta Encerrada';
  const next = closed ? null : events.find(item => !item.actual && daysFromReference(item.date) >= 0) || null;
  const pending = pendingMilestones(offer);
  let status = closed ? 'completed' : pending.length ? 'past' : next && daysFromReference(next.date) <= 7 ? 'next' : next ? 'upcoming' : 'missing';
  return { offer, events, next, pending, status };
}

function selectedScheduleSummaries() {
  const windowValue = $('#scheduleWindow').value;
  const days = windowValue === 'all' ? null : Number(windowValue);
  return state.offers.map(offerScheduleSummary).filter(summary => {
    if (state.scheduleFilter !== 'all' && summary.status !== state.scheduleFilter) return false;
    if (!days || !summary.next || ['past', 'missing', 'completed'].includes(summary.status)) return true;
    return daysFromReference(summary.next.date) <= days;
  }).sort((a, b) => {
    if (!a.next && !b.next) return a.offer.fund.localeCompare(b.offer.fund, 'pt-BR');
    if (!a.next) return 1;
    if (!b.next) return -1;
    return a.next.date.localeCompare(b.next.date);
  });
}

function scheduleCell(value, actual = false) {
  const wrapper = element('div', 'schedule-date-cell');
  wrapper.append(element('strong', '', dateText(value)), value ? scheduleBadge(scheduleStatus(value, actual)) : element('span', 'schedule-na', 'Não informado'));
  return wrapper;
}

function renderScheduleTable() {
  const summaries = selectedScheduleSummaries();
  $('#scheduleRows').replaceChildren(...summaries.map(summary => {
    const offer = summary.offer;
    const row = element('tr'); row.tabIndex = 0; row.dataset.id = offer.id; row.setAttribute('aria-label', `Abrir cronograma de ${offer.fund}`);
    const fund = element('td', 'fund', offer.fund); fund.append(element('span', 'subcell', offer.registration || offer.cnpj));
    const nextCell = element('td');
    if (summary.next) nextCell.append(element('strong', 'schedule-event-name', summary.next.name), element('span', 'subcell', dateText(summary.next.date)));
    else nextCell.append(element('span', 'schedule-na', 'n.a.'));
    const settlement = offer.timeline?.settlement_actual || offer.timeline?.settlement_planned;
    const closing = offer.timeline?.closing_actual || offer.timeline?.closing_planned;
    const statusCell = element('td'); statusCell.append(scheduleBadge(summary.status));
    row.append(fund, nextCell, (() => { const cell = element('td'); cell.append(scheduleCell(offer.timeline?.reservation_end_planned)); return cell; })(), (() => { const cell = element('td'); cell.append(scheduleCell(settlement, Boolean(offer.timeline?.settlement_actual))); return cell; })(), (() => { const cell = element('td'); cell.append(scheduleCell(closing, Boolean(offer.timeline?.closing_actual))); return cell; })(), statusCell);
    return row;
  }));
  $('#scheduleCount').textContent = `${summaries.length} ${summaries.length === 1 ? 'oferta' : 'ofertas'}`;
  $('#scheduleEmpty').hidden = summaries.length > 0;
}

function renderUpcomingEvents() {
  const windowValue = $('#scheduleWindow').value;
  const days = windowValue === 'all' ? Number.POSITIVE_INFINITY : Number(windowValue);
  const items = allScheduleEvents().filter(item => item.offer.status !== 'Oferta Encerrada' && !item.actual && daysFromReference(item.date) >= 0 && daysFromReference(item.date) <= days).slice(0, 10);
  $('#upcomingCount').textContent = `${items.length} exibidos`;
  $('#upcomingList').replaceChildren(...items.map(item => {
    const wrapper = element('button', 'agenda-item'); wrapper.type = 'button'; wrapper.dataset.id = item.offer.id;
    const parsed = parseDate(item.date);
    const dateBox = element('div', 'agenda-date'); dateBox.append(element('strong', '', String(parsed.getDate()).padStart(2, '0')), element('span', '', monthFormat.format(parsed)));
    const content = element('div'); content.append(element('h3', '', item.offer.fund), element('p', '', item.name), scheduleBadge(item.status));
    wrapper.append(dateBox, content);
    return wrapper;
  }));
  if (!items.length) $('#upcomingList').append(element('div', 'empty', 'Nenhum evento previsto nesta janela.'));
}

function renderScheduleChanges() {
  const changes = [...state.scheduleChanges].sort((a, b) => String(b.detected_at || '').localeCompare(String(a.detected_at || ''))).slice(0, 6);
  $('#changeCount').textContent = `${changes.length} ${changes.length === 1 ? 'alteração' : 'alterações'}`;
  $('#changeList').replaceChildren(...changes.map(change => {
    const item = element('article', 'change-item');
    const copy = element('div'); copy.append(element('strong', '', change.fund || change.offer_id), element('span', '', `${change.field}: ${dateText(change.previous_date)} → ${dateText(change.current_date)}`));
    item.append(copy, element('time', '', dateText(change.detected_at)));
    return item;
  }));
  if (!changes.length) $('#changeList').append(element('div', 'schedule-ok', 'Nenhuma mudança de cronograma confirmada no histórico disponível.'));
}

function renderSchedule() {
  const events = allScheduleEvents();
  const summaries = state.offers.map(offerScheduleSummary);
  $('#scheduleTotal').textContent = events.length;
  $('#scheduleNextWeek').textContent = events.filter(item => item.offer.status !== 'Oferta Encerrada' && !item.actual && daysFromReference(item.date) >= 0 && daysFromReference(item.date) <= 7).length;
  $('#schedulePast').textContent = summaries.filter(item => item.status === 'past').length;
  $('#scheduleMissing').textContent = summaries.filter(item => item.status === 'missing').length;
  const labels = { all: 'Todas as ofertas', next: 'Próximos 7 dias', past: 'Prazos passados', missing: 'Sem próxima data' };
  $('#scheduleFilterLabel').textContent = labels[state.scheduleFilter] || 'Todas as ofertas';
  renderScheduleTable(); renderUpcomingEvents(); renderScheduleChanges();
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
    detailStat(confirmedVolumeLabel(offer), offer.captured_volume == null ? 'n.a.' : moneyFull.format(offer.captured_volume)),
    detailStat('Taxa de colocação', offer.capture_rate == null ? 'n.a.' : percent.format(offer.capture_rate)),
    detailStat('Coordenador líder', text(offer.lead_coordinator)),
    detailStat('Distribuidores identificados', String((offer.distributors || []).length || 'n.a.')),
    detailStat('Última atualização', dateText(offer.updated_at)),
  );
  const distributors = (offer.distributors || []).map(distributor => {
    const item = element('div', 'detail-distributor');
    const copy = element('div');
    copy.append(element('strong', '', distributor.name), element('span', '', distributor.role || 'Participante da distribuição'));
    const associated = offer.maximum_volume == null ? 'n.a.' : moneyFull.format(offer.maximum_volume);
    const allocated = distributor.allocated_volume == null ? 'n.a.' : moneyFull.format(distributor.allocated_volume);
    item.append(copy, element('b', '', `Associado: ${associated} · Rateio: ${allocated}`));
    return item;
  });
  $('#detailDistributors').replaceChildren(...distributors);
  if (!distributors.length) $('#detailDistributors').append(element('div', 'empty', 'Nenhum distribuidor identificado nos documentos disponíveis.'));
  const timeline = Object.entries(timelineLabels).map(([field, label]) => {
    const value = offer.timeline?.[field];
    const actual = field.endsWith('actual') && Boolean(value);
    const status = value ? scheduleStatus(value, actual) : 'missing';
    const item = element('div', `timeline-item ${status}`);
    item.append(element('small', '', label), element('strong', '', dateText(value)), scheduleBadge(status));
    return item;
  });
  $('#detailTimeline').replaceChildren(...timeline);
  const detailedEvents = scheduleEventsForOffer(offer);
  $('#detailEvents').replaceChildren(...detailedEvents.map(event => {
    const item = element('div', 'detail-event');
    const date = element('time', '', dateText(event.date));
    const copy = element('div'); copy.append(element('strong', '', event.name), element('span', '', `${event.kind} · ${event.source}`));
    item.append(date, copy, scheduleBadge(event.status));
    return item;
  }));
  if (!detailedEvents.length) $('#detailEvents').append(element('div', 'empty', 'Nenhum evento datado foi confirmado nos documentos disponíveis.'));
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

function syncNavigation() {
  const current = window.location.hash || '#visao-geral';
  $$('.nav a').forEach(link => link.classList.toggle('active', link.getAttribute('href') === current));
}

function renderAll() {
  populateFilters();
  renderFreshness();
  renderKpis();
  renderStatus();
  renderChart();
  renderCoordinatorChart();
  renderDistributorChart();
  renderSchedule();
  renderDocuments();
  renderTable();
}

function exportCsv() {
  const headers = ['Fundo', 'CNPJ', 'Registro', 'Tipo', 'Natureza da distribuição', 'Status', 'Coordenador líder', 'Distribuidores', 'Volume máximo', 'Volume confirmado', 'Atualização'];
  const lines = [headers, ...filteredOffers().map(offer => [offer.fund, offer.cnpj, offer.registration, offer.type, offer.distribution_nature || '', offer.status, offer.lead_coordinator, (offer.distributors || []).map(item => item.name).join(' | '), offer.maximum_volume ?? '', offer.captured_volume ?? '', offer.updated_at])];
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
    let payload = null;
    let lastError = null;
    for (const delay of [0, 800, 2500]) {
      if (delay) {
        $('#freshnessText').textContent = 'Reconectando à base pública…';
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      try {
        const dataUrl = new URL('./data/offers.json', window.location.href);
        dataUrl.searchParams.set('v', String(Date.now()));
        const response = await fetch(dataUrl, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        payload = await response.json();
        break;
      } catch (error) { lastError = error; }
    }
    if (!payload) throw lastError || new Error('Base pública indisponível');
    if (payload.schema_version !== 2 || !Array.isArray(payload.offers)) throw new Error('Schema público incompatível');
    state.offers = payload.offers;
    state.scheduleChanges = Array.isArray(payload.schedule_changes) ? payload.schedule_changes : [];
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
$('#scheduleRows').addEventListener('click', event => { const row = event.target.closest('tr'); if (row) openDetails(row.dataset.id); });
$('#scheduleRows').addEventListener('keydown', event => { const row = event.target.closest('tr'); if (row && ['Enter', ' '].includes(event.key)) { event.preventDefault(); openDetails(row.dataset.id); } });
$('#upcomingList').addEventListener('click', event => { const item = event.target.closest('[data-id]'); if (item) openDetails(item.dataset.id); });
$$('[data-schedule-filter]').forEach(button => button.addEventListener('click', () => {
  state.scheduleFilter = button.dataset.scheduleFilter;
  $$('[data-schedule-filter]').forEach(item => item.classList.toggle('active', item === button));
  renderSchedule();
}));
$('#scheduleWindow').addEventListener('change', renderSchedule);
$('.close').addEventListener('click', () => $('#details').close());
$('#details').addEventListener('click', event => { if (event.target === $('#details')) $('#details').close(); });
$('#export').addEventListener('click', exportCsv);
$('#retry').addEventListener('click', load);
window.addEventListener('hashchange', syncNavigation);

syncNavigation();
load();
