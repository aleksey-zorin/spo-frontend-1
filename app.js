// ============================================================
// КОНФИГ
// ============================================================
const USE_MOCK = true;
const API = 'https://localhost:7001';   // потом подставишь порт

const URLS = {
  register:   '/Auth/register',
  login:      '/Auth/login',
  cells:      '/StorageCell',
  warehouses: '/WareHouse',
  rentals:    '/api/Rentalagreement'
};

// ============================================================
// УТИЛИТЫ
// ============================================================
const $  = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const token = {
  get:   () => localStorage.getItem('token'),
  set:   (t) => localStorage.setItem('token', t),
  clear: () => localStorage.removeItem('token')
};

function decodeJwt(t) {
  try { return JSON.parse(atob(t.split('.')[1])); }
  catch { return null; }
}

// Текущий пользователь (заполняется при showApp)
let currentUser = null;
function isAdmin() { return currentUser?.role === 'Administrator'; }

// ============================================================
// ЕДИНЫЙ ЗАПРОС
// ============================================================
async function api(path, { method = 'GET', body, auth = true } = {}) {
  if (USE_MOCK) {
    try {
      return await mockFetch(path, { method, body });
    } catch (e) {
      if (e?.status === 401) logout();
      throw new Error(e?.message || 'Ошибка');
    }
  }

  const headers = { 'Content-Type': 'application/json' };
  if (auth && token.get()) headers['Authorization'] = 'Bearer ' + token.get();

  const res = await fetch(API + path, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (res.status === 401) { logout(); throw new Error('Сессия истекла'); }
  if (!res.ok) throw new Error('Ошибка ' + res.status);
  if (res.status === 204) return null;

  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

// ============================================================
// АВТОРИЗАЦИЯ
// ============================================================
let authMode = 'login';

$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    authMode = tab.dataset.tab;
    $$('.tab').forEach(t => t.classList.toggle('active', t === tab));

    const fn = $('#auth-fullname');
    fn.classList.toggle('hidden', authMode !== 'register');
    fn.required = authMode === 'register';

    $('#auth-submit').textContent =
      authMode === 'login' ? 'Войти' : 'Зарегистрироваться';
    $('#auth-error').textContent = '';
  });
});

$('#form-auth').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email    = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const fullName = $('#auth-fullname').value.trim();

  try {
    const path = authMode === 'login' ? URLS.login : URLS.register;
    const body = authMode === 'login'
      ? { email, password }
      : { email, password, fullName };

    const data = await api(path, { method: 'POST', body, auth: false });
    if (!data?.token) throw new Error('Сервер не вернул токен');

    token.set(data.token);
    showApp();
  } catch (err) {
    $('#auth-error').textContent = err.message;
  }
});

function logout() {
  token.clear();
  currentUser = null;
  $('#screen-app').classList.remove('active');
  $('#screen-auth').classList.add('active');
  $('#form-auth').reset();
}

$('#btn-logout').addEventListener('click', logout);

function showApp() {
  currentUser = decodeJwt(token.get()) || {};
  $('#user-name').textContent = currentUser.email || currentUser.name || '';

  $('#screen-auth').classList.remove('active');
  $('#screen-app').classList.add('active');

  loadCells();
}

// ============================================================
// НАВИГАЦИЯ
// ============================================================
$$('.tab-main').forEach(tab => {
  tab.addEventListener('click', () => {
    const view = tab.dataset.view;

    $$('.tab-main').forEach(t => t.classList.toggle('active', t === tab));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));

    if (view === 'cells')      loadCells();
    if (view === 'warehouses') loadWarehouses();
    if (view === 'rentals')    loadRentals();
  });
});

// ============================================================
// ЯЧЕЙКИ
// ============================================================
async function loadCells() {
  const c = $('#view-cells');
  c.innerHTML = '<div class="loading">Загрузка…</div>';

  try {
    const cells = await api(URLS.cells);
    const arr = Array.isArray(cells) ? cells : [];

    if (arr.length === 0) {
      c.innerHTML = '<div class="empty">Ячеек пока нет</div>';
      return;
    }
    c.innerHTML = `<div class="grid">${arr.map(renderCell).join('')}</div>`;
  } catch (e) {
    c.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

function renderCell(cell) {
  const id       = cell.id;
  const number   = cell.numberStorageCalls ?? cell.number ?? '—';
  const price    = cell.price ?? '—';
  const floor    = cell.floor ?? '—';
  const reserved = cell.isReserved ?? false;

  // Кнопка «Забронировать» — только для свободных
  const reserveBtn = reserved
    ? ''
    : `<button class="btn-primary" onclick="reserveCell('${id}')">Забронировать</button>`;

  // Кнопка «Удалить» — только админу
  const deleteBtn = isAdmin()
    ? `<button class="btn-danger" onclick="deleteCell('${id}')">Удалить</button>`
    : '';

  return `
    <div class="item-card">
      <h3>Ячейка ${number}</h3>
      <p>Этаж: ${floor}</p>
      <p>Цена: ${price}</p>
      <p>Статус: ${
        reserved
          ? '<span style="color:#e35">занята</span>'
          : '<span style="color:#2a8">свободна</span>'
      }</p>
      <div class="actions">${reserveBtn}${deleteBtn}</div>
    </div>`;
}

async function reserveCell(id) {
  try {
    await api(`${URLS.cells}/${id}/reserve`, { method: 'POST' });
    loadCells();
  } catch (e) { alert(e.message); }
}

async function deleteCell(id) {
  if (!confirm('Удалить ячейку?')) return;
  try {
    await api(`${URLS.cells}/${id}`, { method: 'DELETE' });
    loadCells();
  } catch (e) { alert(e.message); }
}

// ============================================================
// СКЛАДЫ (только просмотр)
// ============================================================
async function loadWarehouses() {
  const c = $('#view-warehouses');
  c.innerHTML = '<div class="loading">Загрузка…</div>';

  try {
    const list = await api(URLS.warehouses);
    const arr = Array.isArray(list) ? list : [];

    if (arr.length === 0) {
      c.innerHTML = '<div class="empty">Складов пока нет</div>';
      return;
    }
    c.innerHTML = `<div class="grid">${arr.map(renderWarehouse).join('')}</div>`;
  } catch (e) {
    c.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

function renderWarehouse(w) {
  return `
    <div class="item-card">
      <h3>${w.name ?? 'Склад'}</h3>
      <p>Адрес: ${w.address ?? '—'}</p>
      <p>Этажей: ${w.floor ?? '—'}</p>
    </div>`;
}

// ============================================================
// АРЕНДЫ
// ============================================================
async function loadRentals() {
  const c = $('#view-rentals');
  c.innerHTML = '<div class="loading">Загрузка…</div>';

  try {
    const list = await api(URLS.rentals);
    const arr = Array.isArray(list) ? list : [];

    if (arr.length === 0) {
      c.innerHTML = '<div class="empty">У вас пока нет аренд</div>';
      return;
    }
    c.innerHTML = `<div class="grid">${arr.map(renderRental).join('')}</div>`;
  } catch (e) {
    c.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

function renderRental(r) {
  const shortId = r.id ? String(r.id).slice(0, 8) : '—';
  const start   = r.startDate ? new Date(r.startDate).toLocaleDateString('ru') : '—';
  const end     = r.endDate   ? new Date(r.endDate).toLocaleDateString('ru')   : '—';

  return `
    <div class="item-card">
      <h3>Аренда #${shortId}</h3>
      <p>Ячейка: ${r.storageId ?? '—'}</p>
      <p>С: ${start}</p>
      <p>По: ${end}</p>
      <p>Сумма: ${r.totalPrice ?? '—'}</p>
      <div class="actions">
        <button class="btn-danger" onclick="cancelRental('${r.id}')">Отменить</button>
      </div>
    </div>`;
}

async function cancelRental(id) {
  if (!confirm('Отменить аренду?')) return;
  try {
    await api(`${URLS.rentals}/${id}`, { method: 'DELETE' });
    loadRentals();
  } catch (e) { alert(e.message); }
}

// ============================================================
// СТАРТ
// ============================================================
if (token.get()) showApp();