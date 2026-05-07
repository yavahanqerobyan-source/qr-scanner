const SQL_WASM_PATH = "https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/";
const DB_KEY = "antescargo.sqlite.v1";
const SESSION_KEY = "antescargo.driver.id";
const AUTH_ROLE_KEY = "antescargo.auth.role";
const ADMIN_CREDENTIAL_KEY = "antescargo.admin.credential.v1";
const PASSWORD_KDF_ITERATIONS = 210000;

const root = document.querySelector("#app");

const state = {
  ready: false,
  view: "finance",
  financeTab: "overview",
  filters: {
    month: monthOffset(0),
    type: "all",
    vehicle: "all",
    driver: "all",
  },
  appliedFilters: {
    month: monthOffset(0),
    type: "all",
    vehicle: "all",
    driver: "all",
  },
  filterDirty: false,
  loading: null,
  selectedVehicleId: null,
  authRole: sessionStorage.getItem(AUTH_ROLE_KEY) || (Number(localStorage.getItem(SESSION_KEY)) ? "driver" : ""),
  driverId: Number(localStorage.getItem(SESSION_KEY)) || null,
  driverMode: "home",
};

let SQL = null;
let db = null;
let persistTimer = null;

init();

async function init() {
  try {
    SQL = await window.initSqlJs({
      locateFile: (file) => `${SQL_WASM_PATH}${file}`,
    });

    const saved = await idbGet(DB_KEY);
    db = saved ? new SQL.Database(new Uint8Array(saved)) : new SQL.Database();

    setupSchema();
    seedIfEmpty();
    recalculateAnalyticsSync(state.appliedFilters.month);
    await saveDb();
    restoreAuthSession();

    state.ready = true;
    render();
  } catch (error) {
    root.innerHTML = `
      <div class="boot-screen">
        <div class="boot-mark">!</div>
        <div>
          <h1>Не удалось запустить приложение</h1>
          <p>${escapeHtml(error.message || String(error))}</p>
        </div>
      </div>
    `;
  }
}

function setupSchema() {
  db.run(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      normalized_driver_key TEXT,
      phone TEXT,
      normalized_phone TEXT UNIQUE,
      current_vehicle_id INTEGER,
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_code TEXT NOT NULL UNIQUE,
      plate TEXT,
      normalized_plate TEXT UNIQUE,
      current_driver_id INTEGER,
      accounting_type TEXT DEFAULT 'Не задан',
      transponder_number TEXT,
      normalized_transponder TEXT,
      active INTEGER DEFAULT 1,
      comment TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vehicle_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      vehicle_code TEXT,
      plate TEXT,
      normalized_plate TEXT,
      driver_id INTEGER,
      driver_name_snapshot TEXT,
      normalized_driver_key TEXT,
      accounting_type TEXT,
      transponder_number TEXT,
      normalized_transponder TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      comment TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS uploaded_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uploaded_at TEXT NOT NULL,
      section TEXT,
      service TEXT,
      report_type TEXT,
      original_name TEXT,
      mime_type TEXT,
      size_bytes INTEGER,
      status TEXT,
      added_rows INTEGER DEFAULT 0,
      duplicate_rows INTEGER DEFAULT 0,
      skipped_rows INTEGER DEFAULT 0,
      error_message TEXT,
      comment TEXT
    );

    CREATE TABLE IF NOT EXISTS fuel_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_uid TEXT NOT NULL UNIQUE,
      uploaded_file_id INTEGER,
      operation_date TEXT,
      period_month TEXT,
      service TEXT,
      amount REAL DEFAULT 0,
      liters REAL DEFAULT 0,
      price_per_liter REAL DEFAULT 0,
      driver_id INTEGER,
      driver_name TEXT,
      normalized_driver_key TEXT,
      vehicle_id INTEGER,
      vehicle_code TEXT,
      vehicle_plate TEXT,
      normalized_plate TEXT,
      accounting_type TEXT,
      fuel_card TEXT,
      operation_type TEXT,
      is_return INTEGER DEFAULT 0,
      raw_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platon_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_uid TEXT NOT NULL UNIQUE,
      uploaded_file_id INTEGER,
      operation_date TEXT,
      period_month TEXT,
      operation_type TEXT,
      direction TEXT,
      amount REAL DEFAULT 0,
      distance_km REAL DEFAULT 0,
      transaction_number TEXT,
      driver_id INTEGER,
      driver_name TEXT,
      normalized_driver_key TEXT,
      vehicle_id INTEGER,
      vehicle_code TEXT,
      vehicle_plate TEXT,
      normalized_plate TEXT,
      accounting_type TEXT,
      route TEXT,
      raw_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transponder_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_uid TEXT NOT NULL UNIQUE,
      uploaded_file_id INTEGER,
      operation_date TEXT,
      period_month TEXT,
      operation_type TEXT,
      direction TEXT,
      amount REAL DEFAULT 0,
      transponder_number TEXT,
      normalized_transponder TEXT,
      driver_id INTEGER,
      driver_name TEXT,
      normalized_driver_key TEXT,
      vehicle_id INTEGER,
      vehicle_code TEXT,
      vehicle_plate TEXT,
      normalized_plate TEXT,
      accounting_type TEXT,
      payment_point TEXT,
      lane TEXT,
      vehicle_class TEXT,
      raw_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trip_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER,
      vehicle_id INTEGER,
      event_type TEXT,
      city TEXT,
      cargo TEXT,
      odometer REAL,
      event_time TEXT,
      source TEXT,
      request_id INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER,
      vehicle_id INTEGER,
      request_id INTEGER,
      load_time TEXT,
      unload_time TEXT,
      load_city TEXT,
      unload_city TEXT,
      cargo TEXT,
      load_odometer REAL,
      unload_odometer REAL,
      distance_km REAL DEFAULT 0,
      empty_distance_km REAL DEFAULT 0,
      status TEXT,
      source TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cargo_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT,
      customer TEXT,
      load_place TEXT,
      unload_place TEXT,
      cargo TEXT,
      weight REAL DEFAULT 0,
      volume REAL DEFAULT 0,
      pallets INTEGER DEFAULT 0,
      payment_amount REAL DEFAULT 0,
      payment_type TEXT,
      payment_deadline TEXT,
      assigned_driver_id INTEGER,
      assigned_vehicle_id INTEGER,
      trip_start_date TEXT,
      unloaded_date TEXT,
      payment_due_date TEXT,
      admin_notice TEXT,
      comment TEXT
    );

    CREATE TABLE IF NOT EXISTS analytics_summary_month (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_month TEXT NOT NULL,
      accounting_type TEXT,
      vehicle_id INTEGER,
      vehicle_code TEXT,
      plate TEXT,
      driver_id INTEGER,
      driver_name TEXT,
      fuel_amount REAL DEFAULT 0,
      fuel_liters REAL DEFAULT 0,
      platon_expense REAL DEFAULT 0,
      platon_income REAL DEFAULT 0,
      platon_km REAL DEFAULT 0,
      transponder_expense REAL DEFAULT 0,
      transponder_income REAL DEFAULT 0,
      trip_count INTEGER DEFAULT 0,
      trip_distance_km REAL DEFAULT 0,
      empty_distance_km REAL DEFAULT 0,
      total_expense REAL DEFAULT 0,
      expense_per_km REAL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      status TEXT,
      progress_percent INTEGER DEFAULT 0,
      message TEXT,
      started_at TEXT,
      finished_at TEXT,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_summary_period ON analytics_summary_month(period_month);
    CREATE INDEX IF NOT EXISTS idx_summary_driver ON analytics_summary_month(driver_id);
    CREATE INDEX IF NOT EXISTS idx_summary_vehicle ON analytics_summary_month(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_fuel_period ON fuel_operations(period_month);
    CREATE INDEX IF NOT EXISTS idx_platon_period ON platon_operations(period_month);
    CREATE INDEX IF NOT EXISTS idx_transponder_period ON transponder_operations(period_month);
    CREATE INDEX IF NOT EXISTS idx_trips_load_time ON trips(load_time);
  `);
}

function seedIfEmpty() {
  // Public GitHub Pages builds must not contain real fleet, driver, or finance data.
  // The database starts empty; entered/imported data remains only in this browser's IndexedDB.
}

function restoreAuthSession() {
  if (state.authRole === "driver") {
    const driver = state.driverId ? driverById(state.driverId) : null;
    if (!driver) {
      state.driverId = null;
      state.authRole = "";
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(AUTH_ROLE_KEY);
      return;
    }
    state.view = "driver";
  }
}

function setAuthRole(role) {
  state.authRole = role;
  if (role) {
    sessionStorage.setItem(AUTH_ROLE_KEY, role);
  } else {
    sessionStorage.removeItem(AUTH_ROLE_KEY);
  }
}

function isAdmin() {
  return state.authRole === "admin";
}

function isDriverSpace() {
  return state.authRole === "driver";
}

function hasAdminCredential() {
  return Boolean(getAdminCredential());
}

function getAdminCredential() {
  try {
    const raw = localStorage.getItem(ADMIN_CREDENTIAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function render() {
  if (!state.ready) return;
  if (!state.authRole) {
    root.innerHTML = renderAuthGate();
    bindEvents();
    refreshIcons();
    return;
  }
  if (isDriverSpace()) state.view = "driver";
  root.innerHTML = `
    <div class="app-shell">
      ${renderTopbar()}
      <main class="content">
        ${renderView()}
      </main>
      ${renderLoader()}
    </div>
  `;
  bindEvents();
  refreshIcons();
}

function renderAuthGate() {
  const adminReady = hasAdminCredential();
  return `
    <div class="auth-shell">
      <section class="auth-hero">
        <div class="brand auth-brand">
          <div class="brand-mark">AC</div>
          <div>
            <strong>AntesCargo</strong>
            <span>Публичный код, локальная SQLite-база</span>
          </div>
        </div>
        <div>
          <h1>Вход в систему учета</h1>
          <p>Данные не отправляются на GitHub Pages и не попадают в репозиторий. Они остаются в IndexedDB этого браузера, пока вы сами не скачаете и не передадите файл базы или Excel.</p>
        </div>
        <div class="security-notes">
          <span>${iconSvg("shield-check")} Пароль админа создается на устройстве</span>
          <span>${iconSvg("database")} SQLite хранится локально</span>
          <span>${iconSvg("smartphone")} Водитель входит по зарегистрированному телефону</span>
        </div>
      </section>
      <section class="auth-grid">
        <form class="panel compact auth-card" data-form="admin-auth" autocomplete="off">
          <div class="panel-title">
            <div>
              <h2>${adminReady ? "Администратор" : "Первичная настройка админа"}</h2>
              <p>${adminReady ? "Введите пароль администратора для доступа к отчетам и загрузкам." : "Задайте пароль на этом устройстве. В код и Git он не записывается."}</p>
            </div>
            <span class="badge gold">${adminReady ? "Вход" : "Настройка"}</span>
          </div>
          <div class="field">
            <label>Пароль</label>
            <input class="input" name="password" type="password" required autocomplete="current-password" />
          </div>
          ${
            adminReady
              ? ""
              : `<div class="field"><label>Повтор пароля</label><input class="input" name="confirm_password" type="password" required autocomplete="new-password" /></div>`
          }
          <button class="btn primary-blue" type="submit">${iconSvg(adminReady ? "log-in" : "key-round")}${adminReady ? "Войти" : "Сохранить и войти"}</button>
        </form>

        <form class="panel compact auth-card" data-form="driver-login" autocomplete="off">
          <div class="panel-title">
            <div>
              <h2>Водитель</h2>
              <p>Вход по номеру телефона, который указан в карточке водителя.</p>
            </div>
            <span class="badge green">Телефон</span>
          </div>
          <div class="field">
            <label>Телефон</label>
            <input class="input" name="phone" required inputmode="tel" placeholder="+7 999 000-00-00" />
          </div>
          <div class="inline-actions">
            <button class="btn success-green" type="submit">${iconSvg("smartphone")}Войти водителем</button>
            <button class="btn dark-secondary" type="button" data-action="driver-register-entry">${iconSvg("user-plus")}Регистрация</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderTopbar() {
  const views = isDriverSpace()
    ? [["driver", "Кабинет водителя", "smartphone"]]
    : [
    ["finance", "Финансы", "bar-chart-3"],
    ["uploads", "Загрузка отчетов", "upload"],
    ["vehicles", "Машины", "truck"],
    ["requests", "Заявки", "clipboard-list"],
    ["trips", "Рейсы", "route"],
    ["drivers", "Водители", "users"],
    ["driver", "Кабинет водителя", "smartphone"],
  ];
  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">AC</div>
        <div>
          <strong>AntesCargo</strong>
          <span>SQLite в браузере · GitHub Pages ready</span>
        </div>
      </div>
      <nav class="main-nav" aria-label="Главная навигация">
        ${views
          .map(
            ([id, label, icon]) => `
              <button class="nav-btn ${state.view === id ? "active" : ""}" data-view="${id}">
                ${iconSvg(icon)} ${label}
              </button>
            `,
          )
          .join("")}
      </nav>
      <div class="top-actions">
        ${
          isAdmin()
            ? `
              <button class="btn dark-secondary" data-action="download-db">${iconSvg("database")}SQLite</button>
              <button class="btn primary-blue" data-action="export-all">${iconSvg("file-spreadsheet")}Excel</button>
            `
            : ""
        }
        <button class="btn dark-secondary" data-action="logout">${iconSvg("log-out")}Выйти</button>
      </div>
    </header>
  `;
}

function renderView() {
  if (isDriverSpace()) return renderDriverApp();
  const status = renderStatusStrip();
  switch (state.view) {
    case "finance":
      return `${status}${renderFinance()}`;
    case "uploads":
      return `${status}${renderUploads()}`;
    case "vehicles":
      return `${status}${renderVehicles()}`;
    case "requests":
      return `${status}${renderRequests()}`;
    case "trips":
      return `${status}${renderTrips()}`;
    case "drivers":
      return `${status}${renderDrivers()}`;
    case "driver":
      return `${status}${renderDriverApp()}`;
    default:
      return `${status}${renderFinance()}`;
  }
}

function renderStatusStrip() {
  const counts = {
    drivers: one("SELECT COUNT(*) AS count FROM drivers").count,
    vehicles: one("SELECT COUNT(*) AS count FROM vehicles").count,
    trips: one("SELECT COUNT(*) AS count FROM trips").count,
    requests: one("SELECT COUNT(*) AS count FROM cargo_requests").count,
    uploads: one("SELECT COUNT(*) AS count FROM uploaded_files").count,
  };
  return `
    <div class="status-strip">
      <span class="status-pill">${iconSvg("database")} База: <strong>SQLite WASM</strong></span>
      <span class="status-pill">${iconSvg("truck")} Машины: <strong>${counts.vehicles}</strong></span>
      <span class="status-pill">${iconSvg("route")} Рейсы: <strong>${counts.trips}</strong></span>
      <span class="status-pill">${iconSvg("clipboard-list")} Заявки: <strong>${counts.requests}</strong></span>
      <span class="status-pill">${iconSvg("upload")} Загрузки: <strong>${counts.uploads}</strong></span>
    </div>
  `;
}

function renderFinance() {
  const tabs = [
    ["overview", "Общий", "layout-dashboard"],
    ["fuel", "Топливо", "fuel"],
    ["platon", "Платон", "landmark"],
    ["transponder", "Транспондер", "radio-tower"],
  ];
  return `
    <section>
      <div class="view-head">
        <div>
          <h1>Финансы</h1>
          <p>Сводки считаются заранее по SQLite, фильтры применяются только по кнопке “Показать”.</p>
        </div>
        <div class="inline-actions">
          <button class="btn primary-gold" data-action="recalculate">${iconSvg("refresh-cw")}Пересчитать</button>
          <button class="btn primary-blue" data-action="export-finance">${iconSvg("file-spreadsheet")}Экспорт финансов</button>
        </div>
      </div>
      <div class="tabs">
        ${tabs
          .map(
            ([id, label, icon]) => `
              <button class="tab ${state.financeTab === id ? "active" : ""}" data-finance-tab="${id}">
                ${iconSvg(icon)} ${label}
              </button>
            `,
          )
          .join("")}
      </div>
      ${renderFinanceFilters()}
      ${renderFinanceTab()}
    </section>
  `;
}

function renderFinanceFilters() {
  const vehicles = allVehicles();
  const drivers = allDrivers();
  return `
    <div class="panel compact">
      <div class="filter-bar">
        <div class="field">
          <label for="filter-month">Период</label>
          <input class="input" id="filter-month" type="month" value="${state.filters.month}" data-filter="month" />
        </div>
        <div class="field">
          <label for="filter-type">Тип</label>
          <select class="select" id="filter-type" data-filter="type">
            ${option("all", "Все", state.filters.type)}
            ${option("Склад", "Склад", state.filters.type)}
            ${option("Грузоперевозки", "Грузоперевозки", state.filters.type)}
            ${option("Не задан", "Не задан", state.filters.type)}
          </select>
        </div>
        <div class="field">
          <label for="filter-vehicle">Машина</label>
          <select class="select" id="filter-vehicle" data-filter="vehicle">
            ${option("all", "Все машины", state.filters.vehicle)}
            ${vehicles.map((vehicle) => option(String(vehicle.id), `${vehicle.vehicle_code} · ${vehicle.plate}`, state.filters.vehicle)).join("")}
          </select>
        </div>
        <div class="field">
          <label for="filter-driver">Водитель</label>
          <select class="select" id="filter-driver" data-filter="driver">
            ${option("all", "Все водители", state.filters.driver)}
            ${drivers.map((driver) => option(String(driver.id), driver.full_name, state.filters.driver)).join("")}
          </select>
        </div>
        <button class="btn primary-blue" data-action="show-finance">${iconSvg("eye")}Показать</button>
        <button class="btn dark-secondary" data-action="export-csv">${iconSvg("download")}CSV</button>
      </div>
      ${
        state.filterDirty
          ? `<div class="hint">${iconSvg("info")}Параметры изменены. Нажмите “Показать”, чтобы обновить данные.</div>`
          : ""
      }
    </div>
  `;
}

function renderFinanceTab() {
  if (state.financeTab === "fuel") return renderFuelFinance();
  if (state.financeTab === "platon") return renderPlatonFinance();
  if (state.financeTab === "transponder") return renderTransponderFinance();
  return renderFinanceOverview();
}

function renderFinanceOverview() {
  const report = getFinanceReport(state.appliedFilters);
  const typeRows = aggregateRows(report.rows, "accounting_type").map((row) => ({
    type: row.key || "Не задан",
    fuel: row.fuel_amount,
    platon: row.platon_expense,
    transponder: row.transponder_expense,
    total: row.total_expense,
    distance: row.trip_distance_km,
    perKm: row.trip_distance_km ? row.total_expense / row.trip_distance_km : 0,
  }));
  return `
    ${renderKpis(report.kpis)}
    <div class="panel">
      <div class="panel-title">
        <div>
          <h2>Сводка по водителям</h2>
          <p>Расходы связаны через машину, госномер и транспондер, а не только через ФИО.</p>
        </div>
      </div>
      ${renderDriverSummaryTable(report.rows)}
    </div>
    <div class="panel">
      <div class="panel-title">
        <div>
          <h2>Сводка по типам</h2>
          <p>Компактный общий срез по категориям учета.</p>
        </div>
      </div>
      ${renderTypeSummaryTable(typeRows)}
    </div>
    <div class="panel">
      <div class="panel-title">
        <div>
          <h2>Связанные отчеты</h2>
          <p>Экспорт собирает финансы, заявки и рейсы в один Excel-файл.</p>
        </div>
        <div class="actions">
          <button class="btn primary-blue" data-action="export-all">${iconSvg("file-spreadsheet")}Общий Excel</button>
          <button class="btn dark-secondary" data-view="requests">${iconSvg("clipboard-list")}Заявки</button>
          <button class="btn dark-secondary" data-view="trips">${iconSvg("route")}Рейсы</button>
        </div>
      </div>
      ${renderReportPreview()}
    </div>
  `;
}

function renderKpis(kpis) {
  const items = [
    ["Всего расходов", formatRub(kpis.totalExpense), "Сводка периода", "wallet", "blue"],
    ["Топливо", formatRub(kpis.fuel), `${formatNumber(kpis.liters)} л`, "fuel", "green"],
    ["Платон", formatRub(kpis.platon), `${formatKm(kpis.platonKm)} в отчете`, "landmark", "gold"],
    ["Транспондер", formatRub(kpis.transponder), `${formatRub(kpis.transponderIncome)} пополнения`, "radio-tower", "purple"],
    ["Расход на 1 км", formatRub(kpis.expensePerKm), `${formatKm(kpis.distance)} пробег`, "gauge", "red"],
  ];
  return `
    <div class="kpi-grid">
      ${items
        .map(
          ([label, value, note, icon, tone]) => `
            <article class="kpi ${tone}">
              <span>${iconSvg(icon)} ${label}</span>
              <strong>${value}</strong>
              <small>${note}</small>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderDriverSummaryTable(rows) {
  if (!rows.length) return `<div class="empty-state">Нет рассчитанных данных за выбранный период.</div>`;
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Водитель</th>
            <th>Машина / госномер</th>
            <th>Рейсы</th>
            <th>Пробег</th>
            <th>Холостой</th>
            <th>Топливо</th>
            <th>Платон</th>
            <th>Транспондер</th>
            <th>Итого</th>
            <th>₽/км</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td><span class="cell-main">${escapeHtml(row.driver_name || "Не назначен")}</span><span class="cell-sub">${escapeHtml(row.accounting_type || "Не задан")}</span></td>
                  <td><span class="cell-main">${escapeHtml(row.vehicle_code || "Без машины")}</span><span class="cell-sub">${escapeHtml(row.plate || "")}</span></td>
                  <td>${formatNumber(row.trip_count)}</td>
                  <td>${formatKm(row.trip_distance_km)}</td>
                  <td><span class="cell-main">${formatKm(row.empty_distance_km)}</span><span class="cell-sub">${formatPercent(row.empty_distance_km, row.trip_distance_km)}</span></td>
                  <td>${formatRub(row.fuel_amount)}</td>
                  <td>${formatRub(row.platon_expense)}</td>
                  <td>${formatRub(row.transponder_expense)}</td>
                  <td><strong>${formatRub(row.total_expense)}</strong></td>
                  <td>${formatRub(row.expense_per_km)}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderTypeSummaryTable(rows) {
  if (!rows.length) return `<div class="empty-state">Нет данных.</div>`;
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Тип</th>
            <th>Топливо</th>
            <th>Платон</th>
            <th>Транспондер</th>
            <th>Итого</th>
            <th>Пробег</th>
            <th>₽/км</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td><span class="badge gold">${escapeHtml(row.type)}</span></td>
                  <td>${formatRub(row.fuel)}</td>
                  <td>${formatRub(row.platon)}</td>
                  <td>${formatRub(row.transponder)}</td>
                  <td><strong>${formatRub(row.total)}</strong></td>
                  <td>${formatKm(row.distance)}</td>
                  <td>${formatRub(row.perKm)}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderReportPreview() {
  const requests = query(`
    SELECT r.*, d.full_name AS driver_name, v.vehicle_code, v.plate
    FROM cargo_requests r
    LEFT JOIN drivers d ON d.id = r.assigned_driver_id
    LEFT JOIN vehicles v ON v.id = r.assigned_vehicle_id
    ORDER BY r.created_at DESC
    LIMIT 4
  `);
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Заявка</th>
            <th>Маршрут</th>
            <th>Водитель</th>
            <th>Машина</th>
            <th>Сумма</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          ${requests
            .map(
              (request) => `
                <tr>
                  <td><span class="cell-main">#${request.id} ${escapeHtml(request.customer || "")}</span><span class="cell-sub">${escapeHtml(request.cargo || "")}</span></td>
                  <td>${escapeHtml(request.load_place || "")} → ${escapeHtml(request.unload_place || "")}</td>
                  <td>${escapeHtml(request.driver_name || "Не назначен")}</td>
                  <td>${escapeHtml(request.vehicle_code || "")} ${escapeHtml(request.plate || "")}</td>
                  <td>${formatRub(request.payment_amount)}</td>
                  <td>${statusBadge(request.status)}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderFuelFinance() {
  const rows = getOperationRows("fuel_operations", state.appliedFilters);
  const groupedDrivers = aggregateOperations(rows, "driver_name");
  const groupedVehicles = aggregateOperations(rows, "vehicle_code");
  const groupedSources = aggregateOperations(rows, "service");
  const total = sum(rows, "amount");
  const liters = sum(rows, "liters");
  const returns = rows.filter((row) => Number(row.is_return)).length;
  return `
    <div class="kpi-grid">
      ${simpleKpi("Сумма", formatRub(total), "Возвраты не удаляются", "fuel", "green")}
      ${simpleKpi("Литры", `${formatNumber(liters)} л`, "С учетом возвратов", "droplets", "blue")}
      ${simpleKpi("Средняя цена", formatRub(liters ? total / liters : 0), "₽/л", "gauge", "gold")}
      ${simpleKpi("Операции", formatNumber(rows.length), "Дубли отсекаются по UID", "list-checks", "purple")}
      ${simpleKpi("Возвраты", formatNumber(returns), "Сохраняются в базе", "undo-2", "red")}
    </div>
    <div class="grid cols-3">
      ${renderMiniGroup("По водителям", groupedDrivers)}
      ${renderMiniGroup("По машинам", groupedVehicles)}
      ${renderMiniGroup("По источникам", groupedSources)}
    </div>
  `;
}

function renderPlatonFinance() {
  const rows = getOperationRows("platon_operations", state.appliedFilters);
  const expenses = rows.filter((row) => row.direction === "expense");
  const incomes = rows.filter((row) => row.direction === "income");
  const expense = sum(expenses, "amount");
  const income = sum(incomes, "amount");
  const km = sum(rows, "distance_km");
  return `
    <div class="kpi-grid">
      ${simpleKpi("Списания", formatRub(expense), "Только расходы", "minus-circle", "red")}
      ${simpleKpi("Пополнения", formatRub(income), "Не включаются в расход", "plus-circle", "green")}
      ${simpleKpi("Км", formatKm(km), "Десятичные числа сохранены", "route", "blue")}
      ${simpleKpi("Средняя ₽/км", formatRub(km ? expense / km : 0), "По списаниям", "gauge", "gold")}
      ${simpleKpi("Операции", formatNumber(rows.length), "Без последних 500 строк", "list-checks", "purple")}
    </div>
    <div class="grid cols-2">
      ${renderMiniGroup("По машинам", aggregateOperations(expenses, "vehicle_code"))}
      ${renderMiniGroup("По водителям", aggregateOperations(expenses, "driver_name"))}
    </div>
  `;
}

function renderTransponderFinance() {
  const rows = getOperationRows("transponder_operations", state.appliedFilters);
  const expenses = rows.filter((row) => row.direction === "expense");
  const incomes = rows.filter((row) => row.direction === "income");
  const zero = rows.filter((row) => row.direction === "zero").length;
  const expense = sum(expenses, "amount");
  const income = sum(incomes, "amount");
  return `
    <div class="kpi-grid">
      ${simpleKpi("Расход", formatRub(expense), "Проезды / списания", "radio-tower", "purple")}
      ${simpleKpi("Пополнения", formatRub(income), "Отдельно от расходов", "plus-circle", "green")}
      ${simpleKpi("Проезды", formatNumber(expenses.length), "С ненулевой суммой", "traffic-cone", "blue")}
      ${simpleKpi("Средний проезд", formatRub(expenses.length ? expense / expenses.length : 0), "На операцию", "gauge", "gold")}
      ${simpleKpi("Нулевые проезды", formatNumber(zero), "Не искажают расход", "circle-zero", "red")}
    </div>
    <div class="grid cols-2">
      ${renderMiniGroup("По транспондерам", aggregateOperations(expenses, "transponder_number"))}
      ${renderMiniGroup("По машинам", aggregateOperations(expenses, "vehicle_code"))}
    </div>
  `;
}

function simpleKpi(label, value, note, icon, tone) {
  return `
    <article class="kpi ${tone}">
      <span>${iconSvg(icon)} ${label}</span>
      <strong>${value}</strong>
      <small>${note}</small>
    </article>
  `;
}

function renderMiniGroup(title, rows) {
  return `
    <div class="panel">
      <div class="panel-title">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p>Сгруппированная сводка без вывода тяжелого журнала операций.</p>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Группа</th>
              <th>Сумма</th>
              <th>Литры / км</th>
              <th>Операции</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows
                    .map(
                      (row) => `
                        <tr>
                          <td><span class="cell-main">${escapeHtml(row.key || "Не указано")}</span></td>
                          <td>${formatRub(row.amount)}</td>
                          <td>${formatNumber(row.liters || row.distance_km || 0)}</td>
                          <td>${formatNumber(row.count)}</td>
                        </tr>
                      `,
                    )
                    .join("")
                : `<tr><td colspan="4">Нет данных</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderUploads() {
  const logs = query("SELECT * FROM uploaded_files ORDER BY uploaded_at DESC LIMIT 60");
  const tiles = [
    ["fuel", "rosneft", "Топливо · Роснефть", "Дата, водитель, госномер, сумма, литры."],
    ["fuel", "lukoil", "Топливо · Лукойл", "Новый формат и TransactionsTable."],
    ["fuel", "gazprom", "Топливо · Газпром", "Универсальный импорт CSV/XLSX."],
    ["platon", "platon", "Платон · выписка", "Списания, зачисления, километраж."],
    ["transponder", "transponder", "Транспондер · проезды", "Электронное средство, пункт оплаты, сумма."],
  ];
  return `
    <section>
      <div class="view-head">
        <div>
          <h1>Загрузка отчетов</h1>
          <p>Файлы парсятся в SQLite, дубли отсеиваются по UID, журнал обновляется рядом с таблицей.</p>
        </div>
      </div>
      <div class="upload-grid">
        ${tiles
          .map(
            ([section, service, title, description]) => `
              <article class="upload-tile">
                <h3>${escapeHtml(title)}</h3>
                <p>${escapeHtml(description)}</p>
                <label class="drop-zone">
                  ${iconSvg("upload-cloud")}
                  <span>Выберите CSV/XLSX файл</span>
                  <input type="file" accept=".csv,.xlsx,.xls" data-upload-section="${section}" data-upload-service="${service}" />
                </label>
              </article>
            `,
          )
          .join("")}
      </div>
      <div class="panel">
        <div class="panel-title">
          <div>
            <h2>Журнал загрузок</h2>
            <p>Кнопка обновления находится рядом с журналом, как в ТЗ.</p>
          </div>
          <div class="actions">
            <button class="btn dark-secondary" data-action="refresh">${iconSvg("refresh-cw")}Обновить журнал</button>
            <button class="btn primary-blue" data-action="export-uploads">${iconSvg("file-spreadsheet")}Excel</button>
          </div>
        </div>
        ${renderUploadsTable(logs)}
      </div>
    </section>
  `;
}

function renderUploadsTable(logs) {
  if (!logs.length) return `<div class="empty-state">Журнал загрузок пока пуст.</div>`;
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Раздел</th>
            <th>Сервис</th>
            <th>Файл</th>
            <th>Статус</th>
            <th>Добавлено</th>
            <th>Дубли</th>
            <th>Пропущено</th>
          </tr>
        </thead>
        <tbody>
          ${logs
            .map(
              (log) => `
                <tr>
                  <td>${formatDateTime(log.uploaded_at)}</td>
                  <td>${escapeHtml(log.section || "")}</td>
                  <td>${escapeHtml(log.service || "")}</td>
                  <td><span class="cell-main">${escapeHtml(log.original_name || "")}</span><span class="cell-sub">${formatBytes(log.size_bytes)}</span></td>
                  <td>${statusBadge(log.status)}</td>
                  <td>${formatNumber(log.added_rows)}</td>
                  <td>${formatNumber(log.duplicate_rows)}</td>
                  <td>${formatNumber(log.skipped_rows)}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderVehicles() {
  const vehicles = query(`
    SELECT v.*, d.full_name AS driver_name
    FROM vehicles v
    LEFT JOIN drivers d ON d.id = v.current_driver_id
    ORDER BY v.vehicle_code
  `);
  const drivers = allDrivers();
  const selected = state.selectedVehicleId ? vehicleById(state.selectedVehicleId) : vehicles[0];
  const history = selected
    ? query(
        `SELECT * FROM vehicle_assignments WHERE vehicle_id = ? ORDER BY start_date DESC, id DESC`,
        [selected.id],
      )
    : [];
  return `
    <section>
      <div class="view-head">
        <div>
          <h1>Машины</h1>
          <p>Машина — центральная сущность связки. Смена водителя закрывает старую запись истории и создает новую.</p>
        </div>
        <button class="btn primary-blue" data-action="export-vehicles">${iconSvg("file-spreadsheet")}Excel</button>
      </div>
      <div class="panel">
        <div class="panel-title">
          <div>
            <h2>Добавить машину</h2>
            <p>Госномер и транспондер нормализуются перед сохранением.</p>
          </div>
        </div>
        <form class="form-grid" data-form="add-vehicle">
          <div class="field"><label>ID машины</label><input class="input" name="vehicle_code" required placeholder="Sitrak IV" /></div>
          <div class="field"><label>Госномер</label><input class="input" name="plate" required placeholder="А000АА761" /></div>
          <div class="field"><label>Водитель</label><select class="select" name="driver_id">${option("", "Не назначен", "")}${drivers.map((driver) => option(String(driver.id), driver.full_name, "")).join("")}</select></div>
          <div class="field"><label>Тип</label><select class="select" name="accounting_type">${option("Грузоперевозки", "Грузоперевозки", "Грузоперевозки")}${option("Склад", "Склад", "")}${option("Не задан", "Не задан", "")}</select></div>
          <div class="field wide"><label>Транспондер</label><input class="input" name="transponder_number" placeholder="3086595..." /></div>
          <div class="field wide"><label>Комментарий</label><input class="input" name="comment" placeholder="Примечание" /></div>
          <button class="btn success-green" type="submit">${iconSvg("save")}Сохранить</button>
        </form>
      </div>
      <div class="split-layout">
        <div class="panel">
          <div class="panel-title">
            <div>
              <h2>Справочник машин</h2>
              <p>Изменение водителя не переписывает старую историю.</p>
            </div>
          </div>
          ${renderVehiclesTable(vehicles, drivers)}
        </div>
        <aside class="panel">
          <div class="panel-title">
            <div>
              <h2>История закреплений</h2>
              <p>${selected ? `${escapeHtml(selected.vehicle_code)} · ${escapeHtml(selected.plate || "")}` : "Выберите машину"}</p>
            </div>
          </div>
          ${renderAssignmentHistory(history)}
        </aside>
      </div>
    </section>
  `;
}

function renderVehiclesTable(vehicles, drivers) {
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Госномер</th>
            <th>Водитель</th>
            <th>Тип</th>
            <th>Транспондер</th>
            <th>Активна</th>
            <th>Комментарий</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          ${vehicles
            .map(
              (vehicle) => `
                <tr data-vehicle-row="${vehicle.id}">
                  <td><input class="input" data-vehicle-field="vehicle_code" value="${escapeAttr(vehicle.vehicle_code)}" /></td>
                  <td><input class="input" data-vehicle-field="plate" value="${escapeAttr(vehicle.plate || "")}" /></td>
                  <td>
                    <select class="select" data-vehicle-field="current_driver_id">
                      ${option("", "Не назначен", vehicle.current_driver_id)}
                      ${drivers.map((driver) => option(String(driver.id), driver.full_name, String(vehicle.current_driver_id || ""))).join("")}
                    </select>
                  </td>
                  <td>
                    <select class="select" data-vehicle-field="accounting_type">
                      ${["Грузоперевозки", "Склад", "Не задан"].map((type) => option(type, type, vehicle.accounting_type)).join("")}
                    </select>
                  </td>
                  <td><input class="input" data-vehicle-field="transponder_number" value="${escapeAttr(vehicle.transponder_number || "")}" /></td>
                  <td>${Number(vehicle.active) ? `<span class="badge green">Да</span>` : `<span class="badge red">Нет</span>`}</td>
                  <td><input class="input" data-vehicle-field="comment" value="${escapeAttr(vehicle.comment || "")}" /></td>
                  <td>
                    <div class="inline-actions">
                      <button class="btn success-green" data-action="save-vehicle" data-id="${vehicle.id}">${iconSvg("save")}Сохранить</button>
                      <button class="btn dark-secondary" data-action="select-vehicle" data-id="${vehicle.id}">${iconSvg("history")}История</button>
                      <button class="btn ${Number(vehicle.active) ? "danger-red" : "success-green"}" data-action="toggle-vehicle" data-id="${vehicle.id}">
                        ${iconSvg(Number(vehicle.active) ? "power-off" : "power")} ${Number(vehicle.active) ? "Откл." : "Вкл."}
                      </button>
                    </div>
                  </td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAssignmentHistory(history) {
  if (!history.length) return `<div class="empty-state">История пока пустая.</div>`;
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Период</th>
            <th>Водитель</th>
            <th>Госномер</th>
            <th>Тип</th>
          </tr>
        </thead>
        <tbody>
          ${history
            .map(
              (item) => `
                <tr>
                  <td><span class="cell-main">${formatDate(item.start_date)}</span><span class="cell-sub">${item.end_date ? `до ${formatDate(item.end_date)}` : "активно"}</span></td>
                  <td>${escapeHtml(item.driver_name_snapshot || "Не назначен")}</td>
                  <td>${escapeHtml(item.plate || "")}</td>
                  <td>${escapeHtml(item.accounting_type || "")}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderRequests() {
  const drivers = allDrivers();
  const vehicles = allVehicles();
  const requests = query(`
    SELECT r.*, d.full_name AS driver_name, v.vehicle_code, v.plate
    FROM cargo_requests r
    LEFT JOIN drivers d ON d.id = r.assigned_driver_id
    LEFT JOIN vehicles v ON v.id = r.assigned_vehicle_id
    ORDER BY r.created_at DESC
  `);
  return `
    <section>
      <div class="view-head">
        <div>
          <h1>Заявки</h1>
          <p>Создание заявки и назначение водителя/машины для дальнейшей связки с рейсом.</p>
        </div>
        <button class="btn primary-blue" data-action="export-requests">${iconSvg("file-spreadsheet")}Excel</button>
      </div>
      <div class="panel">
        <div class="panel-title">
          <div>
            <h2>Создать заявку</h2>
            <p>Минимальная форма для быстрого запуска процесса.</p>
          </div>
        </div>
        <form class="form-grid" data-form="add-request">
          <div class="field"><label>Клиент</label><input class="input" name="customer" required placeholder="ООО Клиент" /></div>
          <div class="field"><label>Загрузка</label><input class="input" name="load_place" required placeholder="Ростов-на-Дону" /></div>
          <div class="field"><label>Выгрузка</label><input class="input" name="unload_place" required placeholder="Москва" /></div>
          <div class="field"><label>Груз</label><input class="input" name="cargo" required placeholder="Паллеты" /></div>
          <div class="field"><label>Сумма</label><input class="input" name="payment_amount" type="number" step="0.01" placeholder="150000" /></div>
          <div class="field"><label>Водитель</label><select class="select" name="assigned_driver_id">${option("", "Не назначен", "")}${drivers.map((driver) => option(String(driver.id), driver.full_name, "")).join("")}</select></div>
          <div class="field"><label>Машина</label><select class="select" name="assigned_vehicle_id">${option("", "Не назначена", "")}${vehicles.map((vehicle) => option(String(vehicle.id), `${vehicle.vehicle_code} · ${vehicle.plate}`, "")).join("")}</select></div>
          <div class="field"><label>Старт</label><input class="input" name="trip_start_date" type="date" /></div>
          <div class="field full"><label>Комментарий</label><input class="input" name="comment" placeholder="Условия, дедлайн, документы" /></div>
          <button class="btn success-green" type="submit">${iconSvg("plus")}Создать</button>
        </form>
      </div>
      <div class="panel">
        <div class="panel-title">
          <div>
            <h2>Журнал заявок</h2>
            <p>Изменение статуса сохраняется в SQLite.</p>
          </div>
        </div>
        ${renderRequestsTable(requests, drivers, vehicles)}
      </div>
    </section>
  `;
}

function renderRequestsTable(requests, drivers, vehicles) {
  if (!requests.length) return `<div class="empty-state">Заявок пока нет.</div>`;
  const statuses = ["Новая", "Назначена водителю", "Принята в работу", "В пути на выгрузку", "Выгружена", "Документы отправлены", "Оплачена", "Отклонена"];
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Клиент / груз</th>
            <th>Маршрут</th>
            <th>Водитель</th>
            <th>Машина</th>
            <th>Сумма</th>
            <th>Статус</th>
            <th>Действие</th>
          </tr>
        </thead>
        <tbody>
          ${requests
            .map(
              (request) => `
                <tr data-request-row="${request.id}">
                  <td>#${request.id}</td>
                  <td><span class="cell-main">${escapeHtml(request.customer || "")}</span><span class="cell-sub">${escapeHtml(request.cargo || "")}</span></td>
                  <td>${escapeHtml(request.load_place || "")} → ${escapeHtml(request.unload_place || "")}</td>
                  <td>
                    <select class="select" data-request-field="assigned_driver_id">
                      ${option("", "Не назначен", request.assigned_driver_id)}
                      ${drivers.map((driver) => option(String(driver.id), driver.full_name, String(request.assigned_driver_id || ""))).join("")}
                    </select>
                  </td>
                  <td>
                    <select class="select" data-request-field="assigned_vehicle_id">
                      ${option("", "Не назначена", request.assigned_vehicle_id)}
                      ${vehicles.map((vehicle) => option(String(vehicle.id), `${vehicle.vehicle_code} · ${vehicle.plate}`, String(request.assigned_vehicle_id || ""))).join("")}
                    </select>
                  </td>
                  <td>${formatRub(request.payment_amount)}</td>
                  <td>
                    <select class="select" data-request-field="status">
                      ${statuses.map((status) => option(status, status, request.status)).join("")}
                    </select>
                  </td>
                  <td><button class="btn success-green" data-action="save-request" data-id="${request.id}">${iconSvg("save")}Сохранить</button></td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderTrips() {
  const trips = query(`
    SELECT t.*, d.full_name AS driver_name, v.vehicle_code, v.plate
    FROM trips t
    LEFT JOIN drivers d ON d.id = t.driver_id
    LEFT JOIN vehicles v ON v.id = t.vehicle_id
    ORDER BY COALESCE(t.unload_time, t.load_time) DESC
  `);
  return `
    <section>
      <div class="view-head">
        <div>
          <h1>Рейсы</h1>
          <p>Пробег считается как выгрузка минус загрузка, холостой пробег — в рамках той же машины.</p>
        </div>
        <button class="btn primary-blue" data-action="export-trips">${iconSvg("file-spreadsheet")}Excel</button>
      </div>
      <div class="panel">
        ${renderTripsTable(trips)}
      </div>
    </section>
  `;
}

function renderTripsTable(trips) {
  if (!trips.length) return `<div class="empty-state">Рейсов пока нет.</div>`;
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Водитель</th>
            <th>Машина</th>
            <th>Загрузка</th>
            <th>Выгрузка</th>
            <th>Груз</th>
            <th>Одометр</th>
            <th>Пробег</th>
            <th>Холостой</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          ${trips
            .map(
              (trip) => `
                <tr>
                  <td>#${trip.id}</td>
                  <td>${escapeHtml(trip.driver_name || "")}</td>
                  <td><span class="cell-main">${escapeHtml(trip.vehicle_code || "")}</span><span class="cell-sub">${escapeHtml(trip.plate || "")}</span></td>
                  <td><span class="cell-main">${escapeHtml(trip.load_city || "")}</span><span class="cell-sub">${formatDateTime(trip.load_time)}</span></td>
                  <td><span class="cell-main">${escapeHtml(trip.unload_city || "Открыт")}</span><span class="cell-sub">${trip.unload_time ? formatDateTime(trip.unload_time) : "ожидает выгрузки"}</span></td>
                  <td>${escapeHtml(trip.cargo || "")}</td>
                  <td>${formatNumber(trip.load_odometer)} → ${trip.unload_odometer ? formatNumber(trip.unload_odometer) : "..."}</td>
                  <td>${formatKm(trip.distance_km)}</td>
                  <td>${formatKm(trip.empty_distance_km)}</td>
                  <td>${statusBadge(trip.status)}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDrivers() {
  const drivers = query(`
    SELECT d.*, v.vehicle_code, v.plate
    FROM drivers d
    LEFT JOIN vehicles v ON v.id = d.current_vehicle_id
    ORDER BY d.active DESC, d.full_name
  `);
  const report = getFinanceReport(state.appliedFilters);
  return `
    <section>
      <div class="view-head">
        <div>
          <h1>Водители</h1>
          <p>Увольнение выключает активность, но история рейсов и расходов остается.</p>
        </div>
        <button class="btn primary-blue" data-action="export-drivers">${iconSvg("file-spreadsheet")}Excel</button>
      </div>
      <div class="grid cols-3">
        ${drivers
          .map((driver) => {
            const row = report.rows.find((item) => Number(item.driver_id) === Number(driver.id));
            return `
              <article class="driver-card panel">
                <div class="panel-title">
                  <div>
                    <h2>${escapeHtml(driver.full_name)}</h2>
                    <p>${escapeHtml(driver.vehicle_code || "Машина не назначена")} ${escapeHtml(driver.plate || "")}</p>
                  </div>
                  ${Number(driver.active) ? `<span class="badge green">Активен</span>` : `<span class="badge red">Уволен</span>`}
                </div>
                <div class="grid cols-2">
                  ${simpleMetric("Рейсы", formatNumber(row?.trip_count || 0))}
                  ${simpleMetric("Пробег", formatKm(row?.trip_distance_km || 0))}
                  ${simpleMetric("Расходы", formatRub(row?.total_expense || 0))}
                  ${simpleMetric("₽/км", formatRub(row?.expense_per_km || 0))}
                </div>
                <div class="inline-actions" style="margin-top:12px">
                  <button class="btn ${Number(driver.active) ? "danger-red" : "success-green"}" data-action="toggle-driver" data-id="${driver.id}">
                    ${iconSvg(Number(driver.active) ? "user-x" : "user-check")} ${Number(driver.active) ? "Уволить" : "Вернуть"}
                  </button>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function simpleMetric(label, value) {
  return `
    <div class="status-pill" style="display:grid; gap:3px; align-items:start">
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function renderDriverApp() {
  const driver = state.driverId ? driverById(state.driverId) : null;
  return `
    <section>
      <div class="view-head">
        <div>
          <h1>Кабинет водителя</h1>
          <p>Мобильный сценарий: вход по телефону, загрузка, выгрузка, забытый рейс и заявки.</p>
        </div>
        ${driver ? `<button class="btn dark-secondary" data-action="driver-logout">${iconSvg("log-out")}Выйти</button>` : ""}
      </div>
      <div class="split-layout">
        <div class="panel">
          ${driver ? renderDriverCabinet(driver) : renderDriverAuth()}
        </div>
        <aside class="phone-preview">
          <div class="phone-frame">
            ${driver ? renderDriverPhone(driver) : renderDriverPhoneIntro()}
          </div>
        </aside>
      </div>
    </section>
  `;
}

function renderDriverAuth() {
  const vehicles = allVehicles();
  return `
    <div class="panel-title">
      <div>
        <h2>Вход / регистрация</h2>
        <p>Если телефон уже есть в базе, водитель сразу попадает в кабинет.</p>
      </div>
    </div>
    <div class="grid cols-2">
      <form class="panel compact" data-form="driver-login">
        <div class="panel-title"><div><h2>Войти</h2><p>Пароль на первом этапе не нужен.</p></div></div>
        <div class="field"><label>Телефон</label><input class="input" name="phone" required placeholder="+7 999 100-10-03" /></div>
        <button class="btn primary-blue" type="submit" style="margin-top:10px">${iconSvg("log-in")}Войти</button>
      </form>
      <form class="panel compact" data-form="driver-register">
        <div class="panel-title"><div><h2>Регистрация</h2><p>После регистрации кабинет открывается сразу.</p></div></div>
        <div class="form-grid">
          <div class="field wide"><label>Фамилия Имя</label><input class="input" name="full_name" required placeholder="Иванов Иван" /></div>
          <div class="field wide"><label>Телефон</label><input class="input" name="phone" required placeholder="8 999 123-45-67" /></div>
          <div class="field full"><label>Машина</label><select class="select" name="vehicle_id">${option("", "Не назначена", "")}${vehicles.map((vehicle) => option(String(vehicle.id), `${vehicle.vehicle_code} · ${vehicle.plate}`, "")).join("")}</select></div>
        </div>
        <button class="btn success-green" type="submit" style="margin-top:10px">${iconSvg("user-plus")}Зарегистрироваться</button>
      </form>
    </div>
  `;
}

function renderDriverCabinet(driver) {
  const openTrip = getOpenTrip(driver.id);
  const requests = query(
    `SELECT r.*, v.vehicle_code, v.plate
     FROM cargo_requests r
     LEFT JOIN vehicles v ON v.id = r.assigned_vehicle_id
     WHERE r.assigned_driver_id = ? AND r.status IN ('Назначена водителю', 'Новая', 'Принята в работу')
     ORDER BY r.created_at DESC`,
    [driver.id],
  );
  const monthlyTrips = query(
    `SELECT t.*, v.vehicle_code, v.plate
     FROM trips t
     LEFT JOIN vehicles v ON v.id = t.vehicle_id
     WHERE t.driver_id = ? AND substr(t.load_time, 1, 7) = ?
     ORDER BY t.load_time DESC`,
    [driver.id, state.appliedFilters.month],
  );
  return `
    <div class="panel-title">
      <div>
        <h2>${escapeHtml(driver.full_name)}</h2>
        <p>${escapeHtml(driver.phone || "")} · ${escapeHtml(driver.normalized_phone || "")}</p>
      </div>
      ${Number(driver.active) ? `<span class="badge green">Активен</span>` : `<span class="badge red">Неактивен</span>`}
    </div>
    ${openTrip ? `<div class="warning-box"><strong>У вас уже открыта загрузка.</strong><span>Сначала отметьте выгрузку: ${escapeHtml(openTrip.load_city || "")}, одометр ${formatNumber(openTrip.load_odometer)}.</span></div>` : ""}
    <div class="driver-actions">
      <button class="btn primary-blue" data-driver-mode="load" ${openTrip ? "disabled" : ""}>${iconSvg("package-plus")}Загрузка</button>
      <button class="btn success-green" data-driver-mode="unload" ${openTrip ? "" : "disabled"}>${iconSvg("package-check")}Выгрузка</button>
      <button class="btn dark-secondary" data-driver-mode="manual">${iconSvg("plus")}Добавить рейс</button>
      <button class="btn primary-gold" data-driver-mode="requests">${iconSvg("bell")}Новые заявки</button>
    </div>
    ${renderDriverMode(driver, openTrip, requests)}
    <div class="panel compact" style="margin-top:12px">
      <div class="panel-title">
        <div>
          <h2>Мои рейсы за ${escapeHtml(state.appliedFilters.month)}</h2>
          <p>Период берется из фильтра финансов, чтобы не плодить настройки.</p>
        </div>
      </div>
      ${renderTripsTable(monthlyTrips)}
    </div>
  `;
}

function renderDriverMode(driver, openTrip, requests) {
  const vehicle = driver.current_vehicle_id ? vehicleById(driver.current_vehicle_id) : null;
  if (state.driverMode === "unload") {
    return `
      <form class="panel compact" data-form="driver-unload">
        <div class="form-grid">
          <div class="field wide"><label>Город выгрузки</label><input class="input" name="unload_city" required placeholder="Москва" /></div>
          <div class="field wide"><label>Одометр</label><input class="input" name="unload_odometer" type="number" step="1" required placeholder="120350" /></div>
        </div>
        <button class="btn success-green" type="submit" style="margin-top:10px">${iconSvg("check")}Завершить рейс</button>
      </form>
    `;
  }
  if (state.driverMode === "manual") {
    return `
      <form class="panel compact" data-form="driver-manual">
        <div class="form-grid">
          <div class="field"><label>Дата загрузки</label><input class="input" name="load_time" type="datetime-local" required /></div>
          <div class="field"><label>Дата выгрузки</label><input class="input" name="unload_time" type="datetime-local" required /></div>
          <div class="field"><label>Город загрузки</label><input class="input" name="load_city" required /></div>
          <div class="field"><label>Город выгрузки</label><input class="input" name="unload_city" required /></div>
          <div class="field wide"><label>Груз</label><input class="input" name="cargo" required /></div>
          <div class="field"><label>Одометр загрузки</label><input class="input" name="load_odometer" type="number" step="1" /></div>
          <div class="field"><label>Одометр выгрузки</label><input class="input" name="unload_odometer" type="number" step="1" /></div>
        </div>
        <button class="btn success-green" type="submit" style="margin-top:10px">${iconSvg("save")}Добавить рейс</button>
      </form>
    `;
  }
  if (state.driverMode === "requests") {
    return `
      <div class="panel compact">
        <div class="panel-title">
          <div><h2>Новые заявки</h2><p>Водитель может принять или отклонить назначенную заявку.</p></div>
        </div>
        ${renderDriverRequests(requests)}
      </div>
    `;
  }
  return `
    <form class="panel compact" data-form="driver-load">
      <div class="info-box"><strong>${escapeHtml(vehicle?.vehicle_code || "Машина не назначена")}</strong><span>${escapeHtml(vehicle?.plate || "Админ должен назначить машину")}</span></div>
      <div class="form-grid" style="margin-top:10px">
        <div class="field"><label>Город загрузки</label><input class="input" name="load_city" required placeholder="Ростов-на-Дону" /></div>
        <div class="field"><label>Груз</label><input class="input" name="cargo" required placeholder="Паллеты" /></div>
        <div class="field"><label>Одометр</label><input class="input" name="load_odometer" type="number" step="1" required placeholder="120000" /></div>
      </div>
      <button class="btn primary-blue" type="submit" style="margin-top:10px" ${openTrip || !vehicle ? "disabled" : ""}>${iconSvg("package-plus")}Отметить загрузку</button>
    </form>
  `;
}

function renderDriverRequests(requests) {
  if (!requests.length) return `<div class="empty-state">Новых заявок нет.</div>`;
  return `
    <div class="grid">
      ${requests
        .map(
          (request) => `
            <div class="info-box">
              <strong>#${request.id} ${escapeHtml(request.customer || "")}</strong>
              <span>${escapeHtml(request.load_place || "")} → ${escapeHtml(request.unload_place || "")}</span>
              <span>${escapeHtml(request.cargo || "")} · ${formatRub(request.payment_amount)}</span>
              <div class="inline-actions">
                <button class="btn success-green" data-action="driver-request-status" data-id="${request.id}" data-status="Принята в работу">${iconSvg("check")}Принять</button>
                <button class="btn danger-red" data-action="driver-request-status" data-id="${request.id}" data-status="Отклонена">${iconSvg("x")}Отклонить</button>
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderDriverPhoneIntro() {
  return `
    <div class="phone-top"><span>AntesCargo</span><span>09:41</span></div>
    <h2 style="margin:0 0 6px;font-size:22px">Вход водителя</h2>
    <p class="muted" style="font-size:13px;line-height:1.45">Телефон приводится к формату 79991234567. Пароль на первом этапе не нужен.</p>
    <div class="driver-actions">
      <button class="btn primary-blue">${iconSvg("log-in")}Войти</button>
      <button class="btn success-green">${iconSvg("user-plus")}Регистрация</button>
    </div>
  `;
}

function renderDriverPhone(driver) {
  const openTrip = getOpenTrip(driver.id);
  return `
    <div class="phone-top"><span>AntesCargo</span><span>${escapeHtml(state.appliedFilters.month)}</span></div>
    <h2 style="margin:0 0 4px;font-size:21px">${escapeHtml(driver.full_name)}</h2>
    <p class="muted" style="font-size:12px;margin:0 0 12px">${escapeHtml(driver.phone || "")}</p>
    ${openTrip ? `<div class="warning-box"><strong>Открытая загрузка</strong><span>${escapeHtml(openTrip.load_city || "")} · ${formatNumber(openTrip.load_odometer)} км</span></div>` : `<div class="success-box"><strong>Можно начать рейс</strong><span>Открытой загрузки нет.</span></div>`}
    <div class="driver-actions">
      <button class="btn primary-blue">${iconSvg("package-plus")}Загрузка</button>
      <button class="btn success-green">${iconSvg("package-check")}Выгрузка</button>
      <button class="btn dark-secondary">${iconSvg("plus")}Добавить рейс</button>
      <button class="btn primary-gold">${iconSvg("bell")}Новые заявки</button>
    </div>
  `;
}

function renderLoader() {
  if (!state.loading) return "";
  return `
    <div class="loader-toast" role="status" aria-live="polite">
      <strong>${escapeHtml(state.loading.title)}</strong>
      <span>${escapeHtml(state.loading.message || "")}</span>
      <div class="progress-track">
        <div class="progress-bar" style="width:${Number(state.loading.progress || 0)}%"></div>
      </div>
    </div>
  `;
}

function bindEvents() {
  root.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      render();
    });
  });

  root.querySelectorAll("[data-finance-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.financeTab = button.dataset.financeTab;
      render();
    });
  });

  root.querySelectorAll("[data-filter]").forEach((input) => {
    input.addEventListener("change", () => {
      state.filters[input.dataset.filter] = input.value;
      state.filterDirty = JSON.stringify(state.filters) !== JSON.stringify(state.appliedFilters);
      render();
    });
  });

  root.querySelectorAll("[data-driver-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.driverMode = button.dataset.driverMode;
      render();
    });
  });

  root.querySelectorAll("[data-upload-section]").forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      await handleUpload(file, input.dataset.uploadSection, input.dataset.uploadService);
    });
  });

  root.querySelectorAll("[data-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await handleForm(form.dataset.form, new FormData(form), form);
    });
  });

  root.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleAction(button.dataset.action, button);
    });
  });
}

async function handleAction(action, button) {
  if (action === "logout") {
    state.driverId = null;
    state.driverMode = "home";
    state.view = "finance";
    setAuthRole("");
    localStorage.removeItem(SESSION_KEY);
    render();
    return;
  }
  if (action === "driver-register-entry") {
    state.driverId = null;
    state.driverMode = "home";
    state.view = "driver";
    setAuthRole("driver");
    localStorage.removeItem(SESSION_KEY);
    render();
    return;
  }
  if (!isAdmin() && !["driver-logout", "driver-request-status"].includes(action)) {
    window.alert("Для этого действия нужен вход администратора.");
    return;
  }
  if (action === "show-finance") {
    state.appliedFilters = { ...state.filters };
    state.filterDirty = false;
    if (!hasAnalytics(state.appliedFilters.month)) recalculateAnalyticsSync(state.appliedFilters.month);
    render();
    return;
  }
  if (action === "recalculate") {
    await recalculateAnalyticsWithProgress(state.filters.month);
    state.appliedFilters = { ...state.filters };
    state.filterDirty = false;
    render();
    return;
  }
  if (action === "download-db") {
    downloadSqlite();
    return;
  }
  if (action === "export-all" || action === "export-finance") {
    exportWorkbook(`antescargo_общий_отчет_${state.appliedFilters.month}`, buildExportSheets());
    return;
  }
  if (action === "export-csv") {
    exportCsv(`antescargo_finance_${state.appliedFilters.month}`, financeRowsForExport());
    return;
  }
  if (action === "export-uploads") {
    exportWorkbook("antescargo_uploads", { "Загрузки отчетов": uploadRowsForExport() });
    return;
  }
  if (action === "export-vehicles") {
    exportWorkbook("antescargo_vehicles", { Машины: vehicleRowsForExport(), "История закреплений": assignmentRowsForExport() });
    return;
  }
  if (action === "export-requests") {
    exportWorkbook("antescargo_requests", { Заявки: requestRowsForExport() });
    return;
  }
  if (action === "export-trips") {
    exportWorkbook("antescargo_trips", { Рейсы: tripRowsForExport() });
    return;
  }
  if (action === "export-drivers") {
    exportWorkbook("antescargo_drivers", { Водители: driverRowsForExport(), "Сводка по водителям": financeRowsForExport() });
    return;
  }
  if (action === "refresh") {
    render();
    return;
  }
  if (action === "save-vehicle") {
    saveVehicle(Number(button.dataset.id));
    return;
  }
  if (action === "select-vehicle") {
    state.selectedVehicleId = Number(button.dataset.id);
    render();
    return;
  }
  if (action === "toggle-vehicle") {
    toggleVehicle(Number(button.dataset.id));
    return;
  }
  if (action === "save-request") {
    saveRequest(Number(button.dataset.id));
    return;
  }
  if (action === "toggle-driver") {
    toggleDriver(Number(button.dataset.id));
    return;
  }
  if (action === "driver-logout") {
    state.driverId = null;
    state.driverMode = "home";
    state.view = "finance";
    setAuthRole("");
    localStorage.removeItem(SESSION_KEY);
    render();
    return;
  }
  if (action === "driver-request-status") {
    updateRequestStatus(Number(button.dataset.id), button.dataset.status);
    state.driverMode = "requests";
    render();
  }
}

async function handleForm(name, formData, form) {
  const data = Object.fromEntries(formData.entries());
  if (name === "admin-auth") {
    await authenticateAdmin(data);
    return;
  }
  if (name === "driver-login") {
    loginDriver(data.phone);
    return;
  }
  if (!isAdmin() && !["driver-register", "driver-load", "driver-unload", "driver-manual"].includes(name)) {
    window.alert("Для изменения этих данных нужен вход администратора.");
    return;
  }
  if (name === "add-vehicle") {
    addVehicle(data);
    form.reset();
    render();
    return;
  }
  if (name === "add-request") {
    addRequest(data);
    form.reset();
    render();
    return;
  }
  if (name === "driver-register") {
    registerDriver(data);
    return;
  }
  if (name === "driver-load") {
    createDriverLoad(data);
    return;
  }
  if (name === "driver-unload") {
    createDriverUnload(data);
    return;
  }
  if (name === "driver-manual") {
    createDriverManualTrip(data);
  }
}

async function handleUpload(file, section, service) {
  const uploadId = createUploadLog({
    section,
    service,
    reportType: reportTypeLabel(section, service),
    originalName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    status: "processing",
    addedRows: 0,
    duplicateRows: 0,
    skippedRows: 0,
    errorMessage: "",
  });

  try {
    setLoading("Загружаем данные...", `Читаем ${file.name}`, 12);
    const rows = await readRowsFromFile(file);
    setLoading("Парсинг отчета", `${rows.length} строк`, 35);

    let result;
    if (section === "fuel") result = await parseFuelRows(rows, service, uploadId);
    if (section === "platon") result = await parsePlatonRows(rows, uploadId);
    if (section === "transponder") result = await parseTransponderRows(rows, uploadId);

    result = result || { added: 0, duplicate: 0, skipped: rows.length };
    run(
      `UPDATE uploaded_files
       SET status = 'processed', added_rows = ?, duplicate_rows = ?, skipped_rows = ?, error_message = ''
       WHERE id = ?`,
      [result.added, result.duplicate, result.skipped, uploadId],
    );

    setLoading("Пересчет не запущен", "Аналитика помечена как устаревшая. Нажмите “Пересчитать” в финансах.", 100);
    await saveDb();
    setTimeout(() => {
      state.loading = null;
      render();
    }, 900);
    render();
  } catch (error) {
    run("UPDATE uploaded_files SET status = 'error', error_message = ? WHERE id = ?", [
      error.message || String(error),
      uploadId,
    ]);
    state.loading = null;
    await saveDb();
    render();
    window.alert(`Ошибка загрузки: ${error.message || error}`);
  }
}

async function readRowsFromFile(file) {
  const buffer = await file.arrayBuffer();
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const workbook = window.XLSX.read(buffer, { type: "array", cellDates: true });
    const firstSheet = workbook.SheetNames[0];
    return window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });
  }
  const text = new TextDecoder("utf-8").decode(buffer);
  return parseCsv(text);
}

function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/).find(Boolean) || "";
  const delimiter = firstLine.includes(";") ? ";" : ",";
  const lines = clean.split(/\r?\n/).filter((line) => line.trim());
  const headers = splitCsvLine(lines.shift() || "", delimiter);
  return lines.map((line) => {
    const values = splitCsvLine(line, delimiter);
    const row = {};
    headers.forEach((header, index) => {
      row[header.trim()] = values[index] ?? "";
    });
    return row;
  });
}

function splitCsvLine(line, delimiter) {
  const result = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      result.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  result.push(value);
  return result;
}

async function parseFuelRows(rows, service, uploadId) {
  const result = { added: 0, duplicate: 0, skipped: 0 };
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const operationDate = normalizeDateValue(pick(row, ["Дата", "Дата операции", "operation_date", "date"]));
    const amount = parseDecimal(pick(row, ["Сумма", "Сумма, ₽", "Стоимость", "Итого", "amount"]));
    const liters = parseDecimal(pick(row, ["Литры", "Количество", "Объем", "liters"]));
    const driverName = String(pick(row, ["Водитель", "ФИО", "driver", "driver_name"]) || "");
    const plate = String(pick(row, ["Госномер", "Гос. номер", "Номер ТС", "plate"]) || "");
    const operationType = String(pick(row, ["Тип операции", "Операция", "operation_type"]) || "Покупка топлива");

    if (!operationDate || (!amount && !liters)) {
      result.skipped += 1;
      continue;
    }

    const matched = matchVehicleAndDriver({ plate, driverName });
    const uid = await sha256(`fuel|${service}|${operationDate}|${normalizePlate(plate)}|${normalizeDriverName(driverName)}|${amount}|${liters}|${index}`);
    if (exists("fuel_operations", uid)) {
      result.duplicate += 1;
      continue;
    }

    insertFuelOperation({
      uploadedFileId: uploadId,
      operationUid: uid,
      operationDate,
      service,
      amount,
      liters,
      driver: matched.driver,
      vehicle: matched.vehicle,
      operationType,
      isReturn: amount < 0 || /возврат/i.test(operationType) ? 1 : 0,
      raw: row,
    });
    result.added += 1;
  }
  return result;
}

async function parsePlatonRows(rows, uploadId) {
  const result = { added: 0, duplicate: 0, skipped: 0 };
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const operationDate = normalizeDateValue(pick(row, ["Дата", "Дата операции", "operation_date", "date"]));
    const amount = Math.abs(parseDecimal(pick(row, ["Сумма", "Сумма, ₽", "amount"])));
    const distanceKm = parseDecimal(pick(row, ["Км", "Расстояние", "Пробег", "distance_km"]));
    const plate = String(pick(row, ["Госномер", "Гос. номер", "Номер ТС", "plate"]) || "");
    const driverName = String(pick(row, ["Водитель", "ФИО", "driver"]) || "");
    const operationType = String(pick(row, ["Тип операции", "Операция", "operation_type"]) || "Списание");
    const transactionNumber = String(pick(row, ["Номер операции", "Транзакция", "transaction_number", "Номер"]) || "");
    const direction = /зачис|пополн|income/i.test(operationType) ? "income" : "expense";

    if (!operationDate || !amount) {
      result.skipped += 1;
      continue;
    }

    const matched = matchVehicleAndDriver({ plate, driverName });
    const uid = transactionNumber
      ? `platon|${transactionNumber}`
      : await sha256(`platon|${operationDate}|${operationType}|${normalizePlate(plate)}|${amount}|${distanceKm}|${index}`);
    if (exists("platon_operations", uid)) {
      result.duplicate += 1;
      continue;
    }

    insertPlatonOperation({
      uploadedFileId: uploadId,
      operationUid: uid,
      operationDate,
      operationType,
      direction,
      amount,
      distanceKm,
      transactionNumber,
      driver: matched.driver,
      vehicle: matched.vehicle,
      route: String(pick(row, ["Маршрут", "Дорога", "route"]) || ""),
      raw: row,
    });
    result.added += 1;
  }
  return result;
}

async function parseTransponderRows(rows, uploadId) {
  const result = { added: 0, duplicate: 0, skipped: 0 };
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const operationDate = normalizeDateValue(pick(row, ["Дата", "Дата операции", "operation_date", "date"]));
    const amount = Math.abs(parseDecimal(pick(row, ["Сумма, ₽", "Сумма", "amount"])));
    const transponderNumber = String(pick(row, ["Электронное средство", "Транспондер", "transponder_number"]) || "");
    const operationType = String(pick(row, ["Тип операции", "Операция", "operation_type"]) || "Проезд");
    const paymentPoint = String(pick(row, ["Пункт оплаты", "payment_point"]) || "");
    const lane = String(pick(row, ["Полоса", "lane"]) || "");
    const vehicleClass = String(pick(row, ["Класс", "vehicle_class"]) || "");
    const direction = /пополн|зачис|income/i.test(operationType) ? "income" : amount === 0 ? "zero" : "expense";

    if (!operationDate || (!transponderNumber && !paymentPoint)) {
      result.skipped += 1;
      continue;
    }

    const matched = matchVehicleAndDriver({ transponderNumber });
    const uid = await sha256(
      `transponder|${operationDate}|${normalizeTransponder(transponderNumber)}|${operationType}|${paymentPoint}|${lane}|${vehicleClass}|${amount}|${index}`,
    );
    if (exists("transponder_operations", uid)) {
      result.duplicate += 1;
      continue;
    }

    insertTransponderOperation({
      uploadedFileId: uploadId,
      operationUid: uid,
      operationDate,
      operationType,
      direction,
      amount,
      transponderNumber,
      driver: matched.driver,
      vehicle: matched.vehicle,
      paymentPoint,
      lane,
      vehicleClass,
      raw: row,
    });
    result.added += 1;
  }
  return result;
}

function insertFuelOperation(input) {
  const period = monthFromDate(input.operationDate);
  const vehicle = input.vehicle || {};
  const driver = input.driver || {};
  const price = input.liters ? input.amount / input.liters : 0;
  runRaw(
    `INSERT INTO fuel_operations
      (operation_uid, uploaded_file_id, operation_date, period_month, service, amount, liters,
       price_per_liter, driver_id, driver_name, normalized_driver_key, vehicle_id, vehicle_code,
       vehicle_plate, normalized_plate, accounting_type, fuel_card, operation_type, is_return,
       raw_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.operationUid,
      input.uploadedFileId,
      input.operationDate,
      period,
      input.service,
      input.amount,
      input.liters,
      price,
      driver.id || null,
      driver.full_name || "",
      driver.normalized_driver_key || "",
      vehicle.id || null,
      vehicle.vehicle_code || "",
      vehicle.plate || "",
      vehicle.normalized_plate || "",
      vehicle.accounting_type || "Не задан",
      input.fuelCard || "",
      input.operationType || "",
      input.isReturn || 0,
      JSON.stringify(input.raw || {}),
      isoNow(),
    ],
    input.persist !== false,
  );
}

function insertPlatonOperation(input) {
  const period = monthFromDate(input.operationDate);
  const vehicle = input.vehicle || {};
  const driver = input.driver || {};
  runRaw(
    `INSERT INTO platon_operations
      (operation_uid, uploaded_file_id, operation_date, period_month, operation_type, direction,
       amount, distance_km, transaction_number, driver_id, driver_name, normalized_driver_key,
       vehicle_id, vehicle_code, vehicle_plate, normalized_plate, accounting_type, route, raw_json,
       created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.operationUid,
      input.uploadedFileId,
      input.operationDate,
      period,
      input.operationType || "",
      input.direction || "expense",
      input.amount,
      input.distanceKm || 0,
      input.transactionNumber || "",
      driver.id || null,
      driver.full_name || "",
      driver.normalized_driver_key || "",
      vehicle.id || null,
      vehicle.vehicle_code || "",
      vehicle.plate || "",
      vehicle.normalized_plate || "",
      vehicle.accounting_type || "Не задан",
      input.route || "",
      JSON.stringify(input.raw || {}),
      isoNow(),
    ],
    input.persist !== false,
  );
}

function insertTransponderOperation(input) {
  const period = monthFromDate(input.operationDate);
  const vehicle = input.vehicle || {};
  const driver = input.driver || {};
  const normalizedTransponder = normalizeTransponder(input.transponderNumber || vehicle.transponder_number || "");
  runRaw(
    `INSERT INTO transponder_operations
      (operation_uid, uploaded_file_id, operation_date, period_month, operation_type, direction,
       amount, transponder_number, normalized_transponder, driver_id, driver_name,
       normalized_driver_key, vehicle_id, vehicle_code, vehicle_plate, normalized_plate,
       accounting_type, payment_point, lane, vehicle_class, raw_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.operationUid,
      input.uploadedFileId,
      input.operationDate,
      period,
      input.operationType || "",
      input.direction || "expense",
      input.amount || 0,
      input.transponderNumber || vehicle.transponder_number || "",
      normalizedTransponder,
      driver.id || null,
      driver.full_name || "",
      driver.normalized_driver_key || "",
      vehicle.id || null,
      vehicle.vehicle_code || "",
      vehicle.plate || "",
      vehicle.normalized_plate || "",
      vehicle.accounting_type || "Не задан",
      input.paymentPoint || "",
      input.lane || "",
      input.vehicleClass || "",
      JSON.stringify(input.raw || {}),
      isoNow(),
    ],
    input.persist !== false,
  );
}

function addVehicle(data) {
  const now = isoNow();
  const driverId = Number(data.driver_id) || null;
  run(
    `INSERT INTO vehicles
      (vehicle_code, plate, normalized_plate, current_driver_id, accounting_type,
       transponder_number, normalized_transponder, active, comment, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [
      data.vehicle_code,
      data.plate,
      normalizePlate(data.plate),
      driverId,
      data.accounting_type || "Не задан",
      data.transponder_number || "",
      normalizeTransponder(data.transponder_number || ""),
      data.comment || "",
      now,
      now,
    ],
  );
  const vehicleId = lastId();
  if (driverId) {
    run("UPDATE drivers SET current_vehicle_id = ?, updated_at = ? WHERE id = ?", [vehicleId, now, driverId]);
  }
  createAssignmentSnapshot(vehicleId, todayDate(), "Создание машины");
  state.selectedVehicleId = vehicleId;
}

function saveVehicle(id) {
  const row = root.querySelector(`[data-vehicle-row="${id}"]`);
  if (!row) return;
  const oldVehicle = vehicleById(id);
  const data = {};
  row.querySelectorAll("[data-vehicle-field]").forEach((input) => {
    data[input.dataset.vehicleField] = input.value;
  });
  const driverId = Number(data.current_driver_id) || null;
  const now = isoNow();
  run(
    `UPDATE vehicles
     SET vehicle_code = ?, plate = ?, normalized_plate = ?, current_driver_id = ?,
         accounting_type = ?, transponder_number = ?, normalized_transponder = ?,
         comment = ?, updated_at = ?
     WHERE id = ?`,
    [
      data.vehicle_code,
      data.plate,
      normalizePlate(data.plate),
      driverId,
      data.accounting_type || "Не задан",
      data.transponder_number || "",
      normalizeTransponder(data.transponder_number || ""),
      data.comment || "",
      now,
      id,
    ],
  );
  if (driverId) {
    run("UPDATE drivers SET current_vehicle_id = ?, updated_at = ? WHERE id = ?", [id, now, driverId]);
  }
  if (Number(oldVehicle.current_driver_id || 0) !== Number(driverId || 0)) {
    closeActiveAssignment(id, todayDate());
    createAssignmentSnapshot(id, todayDate(), "Смена водителя");
  } else {
    createAssignmentSnapshot(id, todayDate(), "Обновление реквизитов");
  }
  recalculateAnalyticsSync(state.appliedFilters.month);
  state.selectedVehicleId = id;
  render();
}

function toggleVehicle(id) {
  const vehicle = vehicleById(id);
  run("UPDATE vehicles SET active = ?, updated_at = ? WHERE id = ?", [Number(vehicle.active) ? 0 : 1, isoNow(), id]);
  render();
}

function toggleDriver(id) {
  const driver = driverById(id);
  run("UPDATE drivers SET active = ?, updated_at = ? WHERE id = ?", [Number(driver.active) ? 0 : 1, isoNow(), id]);
  render();
}

function addRequest(data) {
  const now = isoNow();
  const vehicleId = Number(data.assigned_vehicle_id) || null;
  const driverId = Number(data.assigned_driver_id) || vehicleById(vehicleId)?.current_driver_id || null;
  run(
    `INSERT INTO cargo_requests
      (created_at, updated_at, status, customer, load_place, unload_place, cargo,
       payment_amount, payment_type, assigned_driver_id, assigned_vehicle_id, trip_start_date, comment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      now,
      now,
      driverId ? "Назначена водителю" : "Новая",
      data.customer,
      data.load_place,
      data.unload_place,
      data.cargo,
      parseDecimal(data.payment_amount),
      "Безнал",
      driverId,
      vehicleId,
      data.trip_start_date || "",
      data.comment || "",
    ],
  );
}

function saveRequest(id) {
  const row = root.querySelector(`[data-request-row="${id}"]`);
  if (!row) return;
  const values = {};
  row.querySelectorAll("[data-request-field]").forEach((input) => {
    values[input.dataset.requestField] = input.value;
  });
  run(
    `UPDATE cargo_requests
     SET assigned_driver_id = ?, assigned_vehicle_id = ?, status = ?, updated_at = ?
     WHERE id = ?`,
    [
      Number(values.assigned_driver_id) || null,
      Number(values.assigned_vehicle_id) || null,
      values.status || "Новая",
      isoNow(),
      id,
    ],
  );
  render();
}

function updateRequestStatus(id, status) {
  run("UPDATE cargo_requests SET status = ?, updated_at = ? WHERE id = ?", [status, isoNow(), id]);
}

async function authenticateAdmin(data) {
  const password = String(data.password || "");
  const credential = getAdminCredential();
  if (!credential) {
    if (password.length < 3) {
      window.alert("Пароль администратора должен быть не короче 3 символов.");
      return;
    }
    if (password !== String(data.confirm_password || "")) {
      window.alert("Пароли администратора не совпадают.");
      return;
    }
    await saveAdminCredential(password);
    setAuthRole("admin");
    state.view = "finance";
    render();
    return;
  }

  const ok = await verifyAdminPassword(password, credential);
  if (!ok) {
    window.alert("Неверный пароль администратора.");
    return;
  }
  setAuthRole("admin");
  state.view = "finance";
  render();
}

async function saveAdminCredential(password) {
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derivePasswordHash(password, salt, PASSWORD_KDF_ITERATIONS);
  localStorage.setItem(
    ADMIN_CREDENTIAL_KEY,
    JSON.stringify({
      version: 1,
      algorithm: "PBKDF2-SHA256",
      iterations: PASSWORD_KDF_ITERATIONS,
      salt,
      hash,
      createdAt: isoNow(),
    }),
  );
}

async function verifyAdminPassword(password, credential) {
  if (!credential?.salt || !credential?.hash) return false;
  const iterations = Number(credential.iterations || PASSWORD_KDF_ITERATIONS);
  const hash = await derivePasswordHash(password, credential.salt, iterations);
  return timingSafeEqual(hash, credential.hash);
}

async function derivePasswordHash(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: hexToBytes(saltHex),
      iterations,
    },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function timingSafeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex) {
  const clean = String(hex || "").replace(/[^a-f0-9]/gi, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function loginDriver(phone) {
  const normalized = normalizePhone(phone);
  const driver = one("SELECT * FROM drivers WHERE normalized_phone = ?", [normalized]);
  if (!driver) {
    window.alert("Водитель с таким телефоном не найден. Используйте регистрацию.");
    return;
  }
  state.driverId = driver.id;
  state.driverMode = "home";
  state.view = "driver";
  setAuthRole("driver");
  localStorage.setItem(SESSION_KEY, String(driver.id));
  render();
}

function registerDriver(data) {
  const normalized = normalizePhone(data.phone);
  const existing = one("SELECT * FROM drivers WHERE normalized_phone = ?", [normalized]);
  if (existing) {
    state.driverId = existing.id;
    state.view = "driver";
    setAuthRole("driver");
    localStorage.setItem(SESSION_KEY, String(existing.id));
    render();
    return;
  }
  const now = isoNow();
  const vehicleId = Number(data.vehicle_id) || null;
  run(
    `INSERT INTO drivers
      (full_name, normalized_driver_key, phone, normalized_phone, current_vehicle_id, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    [data.full_name, normalizeDriverName(data.full_name), data.phone, normalized, vehicleId, now, now],
  );
  const driverId = lastId();
  if (vehicleId) {
    run("UPDATE vehicles SET current_driver_id = ?, updated_at = ? WHERE id = ?", [driverId, now, vehicleId]);
    closeActiveAssignment(vehicleId, todayDate());
    createAssignmentSnapshot(vehicleId, todayDate(), "Регистрация водителя");
  }
  state.driverId = driverId;
  state.driverMode = "home";
  state.view = "driver";
  setAuthRole("driver");
  localStorage.setItem(SESSION_KEY, String(driverId));
  render();
}

function createDriverLoad(data) {
  const driver = driverById(state.driverId);
  if (!driver?.current_vehicle_id) {
    window.alert("Админ должен назначить машину водителю.");
    return;
  }
  if (getOpenTrip(driver.id)) {
    window.alert("У вас уже открыта загрузка. Сначала отметьте выгрузку.");
    return;
  }
  const loadTime = isoNow();
  const loadOdometer = parseDecimal(data.load_odometer);
  createTrip({
    driverId: driver.id,
    vehicleId: driver.current_vehicle_id,
    loadTime,
    unloadTime: "",
    loadCity: data.load_city,
    unloadCity: "",
    cargo: data.cargo,
    loadOdometer,
    unloadOdometer: null,
    emptyDistanceKm: calcEmptyDistance(driver.current_vehicle_id, loadOdometer, loadTime),
    status: "open",
    source: "driver",
  });
  state.driverMode = "home";
  render();
}

function createDriverUnload(data) {
  const driver = driverById(state.driverId);
  const openTrip = getOpenTrip(driver.id);
  if (!openTrip) {
    window.alert("Открытой загрузки нет.");
    return;
  }
  const unloadOdometer = parseDecimal(data.unload_odometer);
  const distance = Math.max(0, unloadOdometer - Number(openTrip.load_odometer || 0));
  run(
    `UPDATE trips
     SET unload_time = ?, unload_city = ?, unload_odometer = ?, distance_km = ?, status = 'closed', updated_at = ?
     WHERE id = ?`,
    [isoNow(), data.unload_city, unloadOdometer, distance, isoNow(), openTrip.id],
  );
  run(
    `INSERT INTO trip_events
      (driver_id, vehicle_id, event_type, city, odometer, event_time, source, created_at)
     VALUES (?, ?, 'unload', ?, ?, ?, 'driver', ?)`,
    [driver.id, openTrip.vehicle_id, data.unload_city, unloadOdometer, isoNow(), isoNow()],
  );
  recalculateAnalyticsSync(monthFromDate(openTrip.load_time));
  state.driverMode = "home";
  render();
}

function createDriverManualTrip(data) {
  const driver = driverById(state.driverId);
  const loadOdometer = parseDecimal(data.load_odometer);
  const unloadOdometer = parseDecimal(data.unload_odometer);
  const distance = loadOdometer && unloadOdometer ? Math.max(0, unloadOdometer - loadOdometer) : 0;
  createTrip({
    driverId: driver.id,
    vehicleId: driver.current_vehicle_id,
    loadTime: toIsoFromLocal(data.load_time),
    unloadTime: toIsoFromLocal(data.unload_time),
    loadCity: data.load_city,
    unloadCity: data.unload_city,
    cargo: data.cargo,
    loadOdometer,
    unloadOdometer,
    emptyDistanceKm: loadOdometer ? calcEmptyDistance(driver.current_vehicle_id, loadOdometer, toIsoFromLocal(data.load_time)) : 0,
    status: "closed",
    source: "manual",
  });
  recalculateAnalyticsSync(monthFromDate(toIsoFromLocal(data.load_time)));
  state.driverMode = "home";
  render();
}

function createTrip(input) {
  const distance = input.unloadOdometer ? Math.max(0, Number(input.unloadOdometer) - Number(input.loadOdometer || 0)) : 0;
  const now = isoNow();
  runRaw(
    `INSERT INTO trips
      (driver_id, vehicle_id, request_id, load_time, unload_time, load_city, unload_city, cargo,
       load_odometer, unload_odometer, distance_km, empty_distance_km, status, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.driverId,
      input.vehicleId,
      input.requestId || null,
      input.loadTime,
      input.unloadTime || "",
      input.loadCity || "",
      input.unloadCity || "",
      input.cargo || "",
      input.loadOdometer || null,
      input.unloadOdometer || null,
      input.distanceKm ?? distance,
      input.emptyDistanceKm || 0,
      input.status || "closed",
      input.source || "manual",
      now,
      now,
    ],
    input.persist !== false,
  );
  const tripId = lastId();
  runRaw(
    `INSERT INTO trip_events
      (driver_id, vehicle_id, event_type, city, cargo, odometer, event_time, source, request_id, created_at)
     VALUES (?, ?, 'load', ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.driverId,
      input.vehicleId,
      input.loadCity || "",
      input.cargo || "",
      input.loadOdometer || null,
      input.loadTime,
      input.source || "manual",
      input.requestId || null,
      now,
    ],
    input.persist !== false,
  );
  if (input.unloadTime) {
    runRaw(
      `INSERT INTO trip_events
        (driver_id, vehicle_id, event_type, city, cargo, odometer, event_time, source, request_id, created_at)
       VALUES (?, ?, 'unload', ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.driverId,
        input.vehicleId,
        input.unloadCity || "",
        input.cargo || "",
        input.unloadOdometer || null,
        input.unloadTime,
        input.source || "manual",
        input.requestId || null,
        now,
      ],
      input.persist !== false,
    );
  }
  return tripId;
}

function createAssignmentSnapshot(vehicleId, startDate, comment, persist = true) {
  const vehicle = vehicleById(vehicleId);
  if (!vehicle) return;
  const driver = vehicle.current_driver_id ? driverById(vehicle.current_driver_id) : null;
  const now = isoNow();
  runRaw(
    `INSERT INTO vehicle_assignments
      (vehicle_id, vehicle_code, plate, normalized_plate, driver_id, driver_name_snapshot,
       normalized_driver_key, accounting_type, transponder_number, normalized_transponder,
       start_date, end_date, comment, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    [
      vehicle.id,
      vehicle.vehicle_code,
      vehicle.plate || "",
      normalizePlate(vehicle.plate || ""),
      driver?.id || null,
      driver?.full_name || "",
      driver?.normalized_driver_key || "",
      vehicle.accounting_type || "Не задан",
      vehicle.transponder_number || "",
      normalizeTransponder(vehicle.transponder_number || ""),
      startDate,
      comment || "",
      now,
      now,
    ],
    persist,
  );
}

function closeActiveAssignment(vehicleId, endDate) {
  run(
    `UPDATE vehicle_assignments
     SET end_date = ?, updated_at = ?
     WHERE vehicle_id = ? AND end_date IS NULL`,
    [endDate, isoNow(), vehicleId],
  );
}

function createUploadLog(input) {
  runRaw(
    `INSERT INTO uploaded_files
      (uploaded_at, section, service, report_type, original_name, mime_type, size_bytes,
       status, added_rows, duplicate_rows, skipped_rows, error_message, comment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      isoNow(),
      input.section,
      input.service,
      input.reportType,
      input.originalName,
      input.mimeType,
      input.sizeBytes,
      input.status,
      input.addedRows || 0,
      input.duplicateRows || 0,
      input.skippedRows || 0,
      input.errorMessage || "",
      input.comment || "",
    ],
    input.persist !== false,
  );
  return lastId();
}

async function recalculateAnalyticsWithProgress(month) {
  const jobId = createJob("analytics", "running", 0, "Подготовка");
  const steps = [
    [0, "Подготовка"],
    [25, "Топливо"],
    [50, "Платон"],
    [75, "Транспондер"],
    [90, "Рейсы / пробег"],
  ];
  for (const [progress, message] of steps) {
    updateJob(jobId, "running", progress, message);
    setLoading("Идет расчет выбранного периода", message, progress);
    await sleep(140);
  }
  recalculateAnalyticsSync(month);
  updateJob(jobId, "done", 100, "Завершено");
  setLoading("Идет расчет выбранного периода", "Завершено", 100);
  await saveDb();
  await sleep(450);
  state.loading = null;
}

function recalculateAnalyticsSync(month) {
  runRaw("DELETE FROM analytics_summary_month WHERE period_month = ?", [month], false);
  const vehicles = allVehicles();
  for (const vehicle of vehicles) {
    const driver = vehicle.current_driver_id ? driverById(vehicle.current_driver_id) : null;
    const tripStats = one(
      `SELECT COUNT(*) AS trip_count,
              COALESCE(SUM(distance_km), 0) AS distance,
              COALESCE(SUM(empty_distance_km), 0) AS empty_distance
       FROM trips
       WHERE vehicle_id = ? AND substr(load_time, 1, 7) = ? AND status = 'closed'`,
      [vehicle.id, month],
    );
    const fuel = one(
      `SELECT COALESCE(SUM(amount), 0) AS amount, COALESCE(SUM(liters), 0) AS liters
       FROM fuel_operations
       WHERE vehicle_id = ? AND period_month = ?`,
      [vehicle.id, month],
    );
    const platon = one(
      `SELECT
          COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END), 0) AS expense,
          COALESCE(SUM(CASE WHEN direction = 'income' THEN amount ELSE 0 END), 0) AS income,
          COALESCE(SUM(distance_km), 0) AS km
       FROM platon_operations
       WHERE vehicle_id = ? AND period_month = ?`,
      [vehicle.id, month],
    );
    const transponder = one(
      `SELECT
          COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END), 0) AS expense,
          COALESCE(SUM(CASE WHEN direction = 'income' THEN amount ELSE 0 END), 0) AS income
       FROM transponder_operations
       WHERE vehicle_id = ? AND period_month = ?`,
      [vehicle.id, month],
    );
    const totalExpense = Number(fuel.amount || 0) + Number(platon.expense || 0) + Number(transponder.expense || 0);
    const distance = Number(tripStats.distance || 0);
    runRaw(
      `INSERT INTO analytics_summary_month
        (period_month, accounting_type, vehicle_id, vehicle_code, plate, driver_id, driver_name,
         fuel_amount, fuel_liters, platon_expense, platon_income, platon_km,
         transponder_expense, transponder_income, trip_count, trip_distance_km,
         empty_distance_km, total_expense, expense_per_km, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        month,
        vehicle.accounting_type || "Не задан",
        vehicle.id,
        vehicle.vehicle_code,
        vehicle.plate || "",
        driver?.id || null,
        driver?.full_name || "",
        Number(fuel.amount || 0),
        Number(fuel.liters || 0),
        Number(platon.expense || 0),
        Number(platon.income || 0),
        Number(platon.km || 0),
        Number(transponder.expense || 0),
        Number(transponder.income || 0),
        Number(tripStats.trip_count || 0),
        distance,
        Number(tripStats.empty_distance || 0),
        totalExpense,
        distance ? totalExpense / distance : 0,
        isoNow(),
      ],
      false,
    );
  }
  schedulePersist();
}

function getFinanceReport(filters) {
  if (!hasAnalytics(filters.month)) recalculateAnalyticsSync(filters.month);
  const conditions = ["period_month = ?"];
  const params = [filters.month];
  if (filters.type !== "all") {
    conditions.push("accounting_type = ?");
    params.push(filters.type);
  }
  if (filters.vehicle !== "all") {
    conditions.push("vehicle_id = ?");
    params.push(Number(filters.vehicle));
  }
  if (filters.driver !== "all") {
    conditions.push("driver_id = ?");
    params.push(Number(filters.driver));
  }
  const rows = query(
    `SELECT * FROM analytics_summary_month
     WHERE ${conditions.join(" AND ")}
     ORDER BY total_expense DESC, vehicle_code`,
    params,
  );
  const kpis = {
    totalExpense: sum(rows, "total_expense"),
    fuel: sum(rows, "fuel_amount"),
    liters: sum(rows, "fuel_liters"),
    platon: sum(rows, "platon_expense"),
    platonKm: sum(rows, "platon_km"),
    transponder: sum(rows, "transponder_expense"),
    transponderIncome: sum(rows, "transponder_income"),
    distance: sum(rows, "trip_distance_km"),
  };
  kpis.expensePerKm = kpis.distance ? kpis.totalExpense / kpis.distance : 0;
  return { rows, kpis };
}

function getOperationRows(table, filters) {
  const conditions = ["period_month = ?"];
  const params = [filters.month];
  if (filters.type !== "all") {
    conditions.push("accounting_type = ?");
    params.push(filters.type);
  }
  if (filters.vehicle !== "all") {
    conditions.push("vehicle_id = ?");
    params.push(Number(filters.vehicle));
  }
  if (filters.driver !== "all") {
    conditions.push("driver_id = ?");
    params.push(Number(filters.driver));
  }
  return query(`SELECT * FROM ${table} WHERE ${conditions.join(" AND ")}`, params);
}

function hasAnalytics(month) {
  return Number(one("SELECT COUNT(*) AS count FROM analytics_summary_month WHERE period_month = ?", [month]).count) > 0;
}

function buildExportSheets() {
  return {
    "Финансовая сводка": financeRowsForExport(),
    "Сводка по водителям": financeRowsForExport(),
    "Журнал заявок": requestRowsForExport(),
    "Журнал рейсов": tripRowsForExport(),
    "Сводка по машинам": vehicleSummaryRowsForExport(),
    "Загрузки отчетов": uploadRowsForExport(),
  };
}

function financeRowsForExport() {
  return getFinanceReport(state.appliedFilters).rows.map((row) => ({
    Период: row.period_month,
    Водитель: row.driver_name,
    "ID машины": row.vehicle_code,
    Госномер: row.plate,
    Тип: row.accounting_type,
    Рейсы: row.trip_count,
    "Пробег, км": round(row.trip_distance_km),
    "Холостой пробег, км": round(row.empty_distance_km),
    "Холостой, %": row.trip_distance_km ? round((row.empty_distance_km / row.trip_distance_km) * 100) : 0,
    "Топливо, ₽": round(row.fuel_amount),
    "Литры": round(row.fuel_liters),
    "Платон расход, ₽": round(row.platon_expense),
    "Платон пополнения, ₽": round(row.platon_income),
    "Платон км": round(row.platon_km),
    "Транспондер расход, ₽": round(row.transponder_expense),
    "Транспондер пополнения, ₽": round(row.transponder_income),
    "Итого расходов, ₽": round(row.total_expense),
    "Расход ₽/км": round(row.expense_per_km),
  }));
}

function requestRowsForExport() {
  return query(`
    SELECT r.*, d.full_name AS driver_name, v.vehicle_code, v.plate
    FROM cargo_requests r
    LEFT JOIN drivers d ON d.id = r.assigned_driver_id
    LEFT JOIN vehicles v ON v.id = r.assigned_vehicle_id
    ORDER BY r.created_at DESC
  `).map((row) => ({
    ID: row.id,
    Создана: row.created_at,
    Статус: row.status,
    Клиент: row.customer,
    Загрузка: row.load_place,
    Выгрузка: row.unload_place,
    Груз: row.cargo,
    "Сумма, ₽": round(row.payment_amount),
    Водитель: row.driver_name,
    Машина: row.vehicle_code,
    Госномер: row.plate,
    Комментарий: row.comment,
  }));
}

function tripRowsForExport() {
  return query(`
    SELECT t.*, d.full_name AS driver_name, v.vehicle_code, v.plate
    FROM trips t
    LEFT JOIN drivers d ON d.id = t.driver_id
    LEFT JOIN vehicles v ON v.id = t.vehicle_id
    ORDER BY COALESCE(t.unload_time, t.load_time) DESC
  `).map((row) => ({
    ID: row.id,
    Водитель: row.driver_name,
    Машина: row.vehicle_code,
    Госномер: row.plate,
    "Город загрузки": row.load_city,
    "Дата загрузки": row.load_time,
    "Город выгрузки": row.unload_city,
    "Дата выгрузки": row.unload_time,
    Груз: row.cargo,
    "Одометр загрузки": round(row.load_odometer),
    "Одометр выгрузки": round(row.unload_odometer),
    "Пробег, км": round(row.distance_km),
    "Холостой пробег, км": round(row.empty_distance_km),
    Статус: row.status,
  }));
}

function vehicleRowsForExport() {
  return query(`
    SELECT v.*, d.full_name AS driver_name
    FROM vehicles v
    LEFT JOIN drivers d ON d.id = v.current_driver_id
    ORDER BY v.vehicle_code
  `).map((row) => ({
    ID: row.id,
    "ID машины": row.vehicle_code,
    Госномер: row.plate,
    "Норм. госномер": row.normalized_plate,
    Водитель: row.driver_name,
    Тип: row.accounting_type,
    Транспондер: row.transponder_number,
    "Норм. транспондер": row.normalized_transponder,
    Активна: Number(row.active) ? "Да" : "Нет",
    Комментарий: row.comment,
  }));
}

function vehicleSummaryRowsForExport() {
  return getFinanceReport(state.appliedFilters).rows.map((row) => ({
    Машина: row.vehicle_code,
    Госномер: row.plate,
    Водитель: row.driver_name,
    Тип: row.accounting_type,
    "Рейсы": row.trip_count,
    "Пробег, км": round(row.trip_distance_km),
    "Расходы, ₽": round(row.total_expense),
    "Расход ₽/км": round(row.expense_per_km),
  }));
}

function driverRowsForExport() {
  return query(`
    SELECT d.*, v.vehicle_code, v.plate
    FROM drivers d
    LEFT JOIN vehicles v ON v.id = d.current_vehicle_id
    ORDER BY d.full_name
  `).map((row) => ({
    ID: row.id,
    Водитель: row.full_name,
    "Норм. ключ": row.normalized_driver_key,
    Телефон: row.phone,
    "Норм. телефон": row.normalized_phone,
    Машина: row.vehicle_code,
    Госномер: row.plate,
    Активен: Number(row.active) ? "Да" : "Нет",
  }));
}

function uploadRowsForExport() {
  return query("SELECT * FROM uploaded_files ORDER BY uploaded_at DESC").map((row) => ({
    ID: row.id,
    Дата: row.uploaded_at,
    Раздел: row.section,
    Сервис: row.service,
    "Тип отчета": row.report_type,
    Файл: row.original_name,
    Размер: row.size_bytes,
    Статус: row.status,
    Добавлено: row.added_rows,
    Дубли: row.duplicate_rows,
    Пропущено: row.skipped_rows,
    Ошибка: row.error_message,
  }));
}

function assignmentRowsForExport() {
  return query("SELECT * FROM vehicle_assignments ORDER BY vehicle_id, start_date").map((row) => ({
    ID: row.id,
    Машина: row.vehicle_code,
    Госномер: row.plate,
    Водитель: row.driver_name_snapshot,
    Тип: row.accounting_type,
    Транспондер: row.transponder_number,
    Начало: row.start_date,
    Конец: row.end_date,
    Комментарий: row.comment,
  }));
}

function exportWorkbook(fileName, sheets) {
  if (!window.XLSX) {
    exportCsv(fileName, Object.values(sheets)[0] || []);
    return;
  }
  const workbook = window.XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    const worksheet = window.XLSX.utils.json_to_sheet(rows.length ? rows : [{ Пусто: "Нет данных" }]);
    worksheet["!cols"] = inferColumnWidths(rows);
    window.XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  }
  window.XLSX.writeFile(workbook, `${sanitizeFileName(fileName)}.xlsx`);
}

function exportCsv(fileName, rows) {
  const safeRows = rows.length ? rows : [{ Пусто: "Нет данных" }];
  const headers = Object.keys(safeRows[0]);
  const lines = [
    headers.join(";"),
    ...safeRows.map((row) => headers.map((header) => csvCell(row[header])).join(";")),
  ];
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
    type: "text/csv;charset=utf-8",
  });
  downloadBlob(blob, `${sanitizeFileName(fileName)}.csv`);
}

function downloadSqlite() {
  const bytes = db.export();
  const blob = new Blob([bytes], { type: "application/vnd.sqlite3" });
  downloadBlob(blob, `antescargo_${state.appliedFilters.month}.sqlite`);
}

function matchVehicleAndDriver(input) {
  let vehicle = null;
  let driver = null;
  const normalizedPlate = normalizePlate(input.plate || "");
  const normalizedTransponder = normalizeTransponder(input.transponderNumber || "");
  const normalizedDriver = normalizeDriverName(input.driverName || "");
  if (normalizedPlate) {
    vehicle = one("SELECT * FROM vehicles WHERE normalized_plate = ?", [normalizedPlate]);
  }
  if (!vehicle && normalizedTransponder) {
    vehicle = one("SELECT * FROM vehicles WHERE normalized_transponder = ?", [normalizedTransponder]);
  }
  if (!vehicle && normalizedDriver) {
    driver = one("SELECT * FROM drivers WHERE normalized_driver_key = ?", [normalizedDriver]);
    if (driver?.current_vehicle_id) vehicle = vehicleById(driver.current_vehicle_id);
  }
  if (vehicle && vehicle.current_driver_id) driver = driverById(vehicle.current_driver_id);
  if (!driver && normalizedDriver) driver = one("SELECT * FROM drivers WHERE normalized_driver_key = ?", [normalizedDriver]);
  return { vehicle, driver };
}

function calcEmptyDistance(vehicleId, currentLoadOdometer, currentLoadTime) {
  if (!vehicleId || !currentLoadOdometer) return 0;
  const previous = one(
    `SELECT unload_odometer
     FROM trips
     WHERE vehicle_id = ? AND status = 'closed' AND unload_odometer IS NOT NULL AND unload_time < ?
     ORDER BY unload_time DESC
     LIMIT 1`,
    [vehicleId, currentLoadTime],
  );
  if (!previous?.unload_odometer) return 0;
  const empty = Number(currentLoadOdometer) - Number(previous.unload_odometer);
  return empty > 0 ? empty : 0;
}

function createJob(type, status, progress, message) {
  run("INSERT INTO jobs (type, status, progress_percent, message, started_at) VALUES (?, ?, ?, ?, ?)", [
    type,
    status,
    progress,
    message,
    isoNow(),
  ]);
  return lastId();
}

function updateJob(id, status, progress, message) {
  run("UPDATE jobs SET status = ?, progress_percent = ?, message = ?, finished_at = ? WHERE id = ?", [
    status,
    progress,
    message,
    status === "done" ? isoNow() : "",
    id,
  ]);
}

function setLoading(title, message, progress) {
  state.loading = { title, message, progress };
  render();
}

function exists(table, operationUid) {
  return Number(one(`SELECT COUNT(*) AS count FROM ${table} WHERE operation_uid = ?`, [operationUid]).count) > 0;
}

function allDrivers() {
  return query("SELECT * FROM drivers ORDER BY active DESC, full_name");
}

function allVehicles() {
  return query("SELECT * FROM vehicles ORDER BY active DESC, vehicle_code");
}

function vehicleById(id) {
  if (!id) return null;
  return one("SELECT * FROM vehicles WHERE id = ?", [Number(id)]);
}

function driverById(id) {
  if (!id) return null;
  return one("SELECT * FROM drivers WHERE id = ?", [Number(id)]);
}

function getOpenTrip(driverId) {
  return one("SELECT * FROM trips WHERE driver_id = ? AND status = 'open' ORDER BY load_time DESC LIMIT 1", [driverId]);
}

function run(sql, params = []) {
  runRaw(sql, params, true);
}

function runRaw(sql, params = [], persist = true) {
  db.run(sql, params);
  if (persist) schedulePersist();
}

function query(sql, params = []) {
  const statement = db.prepare(sql);
  statement.bind(params);
  const rows = [];
  while (statement.step()) rows.push(statement.getAsObject());
  statement.free();
  return rows;
}

function one(sql, params = []) {
  return query(sql, params)[0] || null;
}

function lastId() {
  return Number(one("SELECT last_insert_rowid() AS id").id);
}

function schedulePersist() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(saveDb, 220);
}

async function saveDb() {
  if (!db) return;
  const bytes = db.export();
  await idbSet(DB_KEY, bytes);
}

function idbOpen() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("antescargo-db", 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("kv");
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function idbGet(key) {
  const storeDb = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = storeDb.transaction("kv", "readonly");
    const request = tx.objectStore("kv").get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

async function idbSet(key, value) {
  const storeDb = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = storeDb.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function normalizeDriverName(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/\+?\d[\d\s\-()]{6,}\d/g, " ")
    .replace(/[^a-zа-я\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((part) => part.length > 1)
    .sort((a, b) => a.localeCompare(b, "ru"))
    .join(" ");
}

function normalizePlate(value) {
  const map = {
    A: "А",
    B: "В",
    E: "Е",
    K: "К",
    M: "М",
    H: "Н",
    O: "О",
    P: "Р",
    C: "С",
    T: "Т",
    X: "Х",
    Y: "У",
  };
  return String(value || "")
    .toUpperCase()
    .replace(/[ABEKMHOPCTXY]/g, (char) => map[char] || char)
    .replace(/[^0-9А-Я]/g, "");
}

function normalizeTransponder(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  return digits;
}

function parseDecimal(value) {
  if (value instanceof Date) return Number.NaN;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^0-9.\-]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDateValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") {
    const date = window.XLSX?.SSF?.parse_date_code?.(value);
    if (date) return new Date(Date.UTC(date.y, date.m - 1, date.d, date.H || 0, date.M || 0, date.S || 0)).toISOString();
  }
  const raw = String(value || "").trim();
  if (!raw) return "";
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  const match = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return "";
  const [, dd, mm, yyyy, hh = "0", min = "0"] = match;
  const year = yyyy.length === 2 ? `20${yyyy}` : yyyy;
  return new Date(Date.UTC(Number(year), Number(mm) - 1, Number(dd), Number(hh), Number(min))).toISOString();
}

function pick(row, names) {
  const normalized = new Map();
  for (const [key, value] of Object.entries(row)) {
    normalized.set(normalizeHeader(key), value);
  }
  for (const name of names) {
    const value = normalized.get(normalizeHeader(name));
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9]/gi, "");
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function aggregateRows(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const groupKey = row[key] || "Не задан";
    const entry =
      map.get(groupKey) ||
      {
        key: groupKey,
        fuel_amount: 0,
        platon_expense: 0,
        transponder_expense: 0,
        total_expense: 0,
        trip_distance_km: 0,
      };
    entry.fuel_amount += Number(row.fuel_amount || 0);
    entry.platon_expense += Number(row.platon_expense || 0);
    entry.transponder_expense += Number(row.transponder_expense || 0);
    entry.total_expense += Number(row.total_expense || 0);
    entry.trip_distance_km += Number(row.trip_distance_km || 0);
    map.set(groupKey, entry);
  }
  return Array.from(map.values());
}

function aggregateOperations(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const groupKey = row[key] || "Не указано";
    const entry = map.get(groupKey) || { key: groupKey, amount: 0, liters: 0, distance_km: 0, count: 0 };
    entry.amount += Number(row.amount || 0);
    entry.liters += Number(row.liters || 0);
    entry.distance_km += Number(row.distance_km || 0);
    entry.count += 1;
    map.set(groupKey, entry);
  }
  return Array.from(map.values()).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function option(value, label, selected) {
  return `<option value="${escapeAttr(value)}" ${String(value) === String(selected ?? "") ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function statusBadge(status) {
  const value = status || "Не задан";
  let tone = "blue";
  if (/оплач|актив|processed|closed|done|принята/i.test(value)) tone = "green";
  if (/новая|назнач|open|processing/i.test(value)) tone = "gold";
  if (/ошиб|отклон|error|уволен/i.test(value)) tone = "red";
  return `<span class="badge ${tone}">${escapeHtml(value)}</span>`;
}

function iconSvg(name) {
  return `<i data-lucide="${name}" aria-hidden="true"></i>`;
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons({
      attrs: {
        width: 15,
        height: 15,
        "stroke-width": 2,
      },
    });
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function formatRub(value) {
  return `${formatNumber(value, 0)} ₽`;
}

function formatKm(value) {
  return `${formatNumber(value, 0)} км`;
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Number(value || 0));
}

function formatPercent(part, total) {
  if (!Number(total)) return "0%";
  return `${formatNumber((Number(part || 0) / Number(total)) * 100, 1)}%`;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU").format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "0 Б";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, 1)} КБ`;
  return `${formatNumber(bytes / 1024 / 1024, 1)} МБ`;
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function monthOffset(offset) {
  const date = new Date();
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthFromDate(value) {
  return String(value || "").slice(0, 7);
}

function dateInMonth(month, day, hour) {
  return `${month}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

function isoNow() {
  return new Date().toISOString();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function toIsoFromLocal(value) {
  return value ? new Date(value).toISOString() : "";
}

function reportTypeLabel(section, service) {
  const labels = {
    fuel: "Топливо",
    platon: "Платон — выписка",
    transponder: "Транспондер — проезды",
  };
  return `${labels[section] || section} · ${service}`;
}

function sanitizeFileName(value) {
  return String(value || "export").replace(/[\\/:*?"<>|]+/g, "_");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[;"\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function inferColumnWidths(rows) {
  if (!rows.length) return [];
  return Object.keys(rows[0]).map((key) => ({
    wch: Math.min(
      36,
      Math.max(
        key.length + 2,
        ...rows.slice(0, 100).map((row) => String(row[key] ?? "").length + 2),
      ),
    ),
  }));
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
