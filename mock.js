// ============================================================
// MOCK-БЭКЕНД — работает в localStorage
// ============================================================
const MockDB = {
  _read(key)    { return JSON.parse(localStorage.getItem('mock:' + key) || 'null'); },
  _write(key,v) { localStorage.setItem('mock:' + key, JSON.stringify(v)); },

  _seed() {
    if (this._read('seeded')) return;

    this._write('warehouses', [
      { id: 'w1', name: 'Склад «Северный»',
        address: 'г. Москва, ул. Складская, 1', floor: 3 },
      { id: 'w2', name: 'Склад «Южный»',
        address: 'г. Москва, ул. Южная, 25', floor: 2 }
    ]);

    this._write('cells', [
      { id: 'a1', numberStorageCalls: 'A-01', price: 1500, floor: 1, isReserved: false },
      { id: 'a2', numberStorageCalls: 'A-02', price: 2000, floor: 1, isReserved: true  },
      { id: 'a3', numberStorageCalls: 'B-07', price: 3000, floor: 2, isReserved: false }
    ]);

    this._write('users', []);
    this._write('rentals', []);
    this._write('seeded', true);
  },

  _uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  // --- AUTH ---
  register({ email, password, fullName }) {
    const users = this._read('users') || [];
    if (users.find(u => u.email === email))
      throw { status: 400, message: 'Пользователь уже существует' };

    // Первый зарегистрированный = админ, остальные = клиенты
    const role = users.length === 0 ? 'Administrator' : 'Client';
    const user = { id: this._uuid(), email, password, fullName, role };

    users.push(user);
    this._write('users', users);
    return { token: this._fakeJwt(user) };
  },

  login({ email, password }) {
    const users = this._read('users') || [];
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) throw { status: 401, message: 'Неверный email или пароль' };
    return { token: this._fakeJwt(user) };
  },

  _fakeJwt(user) {
    const header  = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({
      sub:   user.id,
      email: user.email,
      name:  user.fullName,
      role:  user.role
    }));
    return `${header}.${payload}.mock`;
  },

  // --- CELLS ---
  getCells()      { return this._read('cells') || []; },
  getWarehouses() { return this._read('warehouses') || []; },
  getRentals()    { return this._read('rentals') || []; },

  reserveCell(id) {
    const cells = this.getCells();
    const c = cells.find(x => x.id === id);
    if (!c) throw { status: 404, message: 'Ячейка не найдена' };
    if (c.isReserved) throw { status: 400, message: 'Уже занята' };
    c.isReserved = true;
    this._write('cells', cells);
    return null;
  },

  deleteCell(id) {
    this._write('cells', this.getCells().filter(c => c.id !== id));
    return null;
  },

  deleteRental(id) {
    this._write('rentals', this.getRentals().filter(r => r.id !== id));
    return null;
  }
};

MockDB._seed();

// ============================================================
// Диспетчер — имитация fetch
// ============================================================
async function mockFetch(path, { method = 'GET', body } = {}) {
  await new Promise(r => setTimeout(r, 150));

  // AUTH
  if (path === '/Auth/register' && method === 'POST') return MockDB.register(body);
  if (path === '/Auth/login'    && method === 'POST') return MockDB.login(body);

  // CELLS
  if (path === '/StorageCell' && method === 'GET') return MockDB.getCells();
  if (/^\/StorageCell\/[^/]+\/reserve$/.test(path) && method === 'POST') {
    return MockDB.reserveCell(path.split('/')[2]);
  }
  if (/^\/StorageCell\/[^/]+$/.test(path) && method === 'DELETE') {
    return MockDB.deleteCell(path.split('/')[2]);
  }

  // WAREHOUSES
  if (path === '/WareHouse' && method === 'GET') return MockDB.getWarehouses();

  // RENTALS
  if (path === '/api/Rentalagreement' && method === 'GET')  return MockDB.getRentals();
  if (/^\/api\/Rentalagreement\/[^/]+$/.test(path) && method === 'DELETE') {
    return MockDB.deleteRental(path.split('/')[3]);
  }

  throw { status: 404, message: 'Mock: ' + method + ' ' + path };
}