const STORAGE_TASKS = 'todo-tasks';
const STORAGE_NOTES = 'todo-notes';
const STORAGE_SORT = 'todo-sort';

const DAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

const FILTERS = [
  ['all', 'Все'],
  ['active', 'Невыполненные'],
  ['done', 'Выполненные'],
];

const MAX_TITLE = 120;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
 
const STATUS_TEXT = {
  overdue: 'просрочено',
  upcoming: 'предстоит',
  undated: 'без даты',
  done: 'выполнено',
};

const SORTS = [
  ['manual', 'Вручную'],
  ['asc', 'По дате: сначала ближайшие'],
  ['desc', 'По дате: сначала дальние'],
];

const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
 
function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
 
function addDays(date, n) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + n);
  return copy;
}
 
function startOfWeek(date) {
  const offset = (date.getDay() + 6) % 7;
  return addDays(date, -offset);
}
 
function shortDate(iso) {
  const d = fromISO(iso);
  const base = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base}.${String(d.getFullYear()).slice(2)}`;
}

function el(tag, options = {}, ...children) {
  const node = document.createElement(tag);
  const { className, text, attrs, dataset, on } = options;
 
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (attrs) {
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === false || value === null || value === undefined) return;
      node.setAttribute(key, value === true ? '' : value);
    });
  }
  if (dataset) Object.assign(node.dataset, dataset);
  if (on) Object.entries(on).forEach(([name, handler]) => node.addEventListener(name, handler));
 
  node.append(...children.filter(Boolean));
  return node;
}

function loadTasks() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_TASKS));
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (t) =>
          t &&
          typeof t.id === 'string' &&
          typeof t.title === 'string' &&
          t.title.trim() !== '' &&
          typeof t.done === 'boolean' &&
          (t.date === null || (typeof t.date === 'string' && ISO_RE.test(t.date)))
      )
      .map((t) => ({ id: t.id, title: t.title, date: t.date, done: t.done, urgent: t.urgent === true }));
  } catch {
    return [];
  }
}
 
function saveTasks() {
  try {
    localStorage.setItem(STORAGE_TASKS, JSON.stringify(state.tasks));
  } catch {
  }
}

function loadNotes() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_NOTES));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function loadSort() {
  try {
    const value = localStorage.getItem(STORAGE_SORT);
    return SORTS.some(([key]) => key === value) ? value : 'manual';
  } catch {
    return 'manual';
  }
}
 
function saveSort() {
  try {
    localStorage.setItem(STORAGE_SORT, state.sort);
  } catch {
  }
}

const currentWeekDates = () => Array.from({ length: 7 }, (_, i) => toISO(addDays(state.weekStart, i)));

const state = {
  tasks: loadTasks(),
  notes: loadNotes(),
  filter: 'all',
  query: '',
  sort: loadSort(),
  weekStart: startOfWeek(new Date()),
  editingId: null,
  movingId: null,
};

const ui = {
  search: null,
  filterButtons: [],
  pileList: null,
  rangeLabel: null,
  grid: null,
  newTitle: null,
  dayLists: new Map(),
  pileCount: null,
};

let dragId = null;
const indicator = el('li', {className: 'drop-indicator', attrs: {'aria-hidden': 'true'}});

function zoneKeyOf(task) {
    return task.date && currentWeekDates().includes(task.date) ? task.date
: 'pile';
}

function addTask(title, date, urgent = false) {
  const task = { id: newId(), title, date, done: false, urgent };
  state.tasks.push(task);
  if (!matches(task)) resetFilters();
  saveTasks();
  renderTasks();
}

function toggleDone(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  task.done = !task.done;
  saveTasks();
  renderTasks();
}
 
function deleteTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  if (state.editingId === id) state.editingId = null;
  if (state.movingId === id) state.movingId = null;
  saveTasks();
  renderTasks();
}
 
function startEdit(id) {
  state.editingId = id;
  state.movingId = null;
  renderTasks();
  const field = document.querySelector('.task-edit__title');
  if (field) field.focus();
}
 
function cancelRowMode() {
  state.editingId = null;
  state.movingId = null;
  renderTasks();
}

function startMove(id) {
  state.movingId = id;
  state.editingId = null;
  renderTasks();
  const select = document.querySelector('.task-move__select');
  if (select) select.focus();
}

function moveTask(id, key, beforeId) {
  const from = state.tasks.findIndex((t) => t.id === id);
  if (from < 0) return;
 
  const [task] = state.tasks.splice(from, 1);
  task.date = key === 'pile' ? null : key;
 
  let at = -1;
  const ordered = !(key === 'pile' && state.sort !== 'manual');
  if (ordered && beforeId && beforeId !== id) {
    at = state.tasks.findIndex((t) => t.id === beforeId);
  }
  if (at < 0) {
    let last = -1;
    state.tasks.forEach((t, i) => {
      if (zoneKeyOf(t) === key) last = i;
    });
    at = last < 0 ? state.tasks.length : last + 1;
  }
 
  state.tasks.splice(at, 0, task);
  saveTasks();
  renderTasks();
}
 
function placeIndicator(list, y) {
  const items = [...list.querySelectorAll('.task:not(.is-dragging)')];
  const target =
    items.find((li) => {
      const rect = li.getBoundingClientRect();
      return y < rect.top + rect.height / 2;
    }) || null;
 
  if (indicator.parentNode !== list || indicator.nextElementSibling !== target) {
    list.insertBefore(indicator, target);
  }
}
 
function finishDrag() {
  dragId = null;
  indicator.remove();
  document.querySelectorAll('.is-over').forEach((n) => n.classList.remove('is-over'));
  document.querySelectorAll('.is-dragging').forEach((n) => n.classList.remove('is-dragging'));
}
 
function attachDropZone(zone, list, key) {
  zone.addEventListener('dragover', (e) => {
    if (!dragId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    zone.classList.add('is-over');
    if (key === 'pile' && state.sort !== 'manual') return;
    placeIndicator(list, e.clientY);
  });
 
  zone.addEventListener('dragleave', (e) => {
    if (e.relatedTarget && zone.contains(e.relatedTarget)) return;
    zone.classList.remove('is-over');
    if (indicator.parentNode === list) indicator.remove();
  });
 
  zone.addEventListener('drop', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const next = indicator.parentNode === list ? indicator.nextElementSibling : null;
    const beforeId = (next && next.dataset && next.dataset.id) || null;
    const id = dragId;
    finishDrag();
    moveTask(id, key, beforeId);
  });
}

function buildTaskRow(task, today, showDate) {
  if (state.editingId === task.id) return buildEditRow(task);
  if (state.movingId === task.id) return buildMoveRow(task);

  const status = task.done ? 'done' : !task.date ? 'undated' : task.date < today ? 'overdue' : 'upcoming';
  
  const check = el('button', {
    className: 'task__check',
    attrs: {
      type: 'button',
      'aria-pressed': String(task.done),
      'aria-label': task.done ? 'Отметить невыполненной' : 'Отметить выполненной',
    },
    on: { click: () => toggleDone(task.id) },
  });

  const urgentMark =
    task.urgent && !task.done
      ? el(
          'span',
          { className: 'task__urgent', attrs: { title: 'Срочно' } },
          el('span', { text: '!', attrs: { 'aria-hidden': 'true' } }),
          el('span', { className: 'visually-hidden', text: 'срочно' })
        )
      : null;

  const title = el(
    'span',
    { className: 'task__title', text: task.title },
    el('span', { className: 'visually-hidden', text: ` (${STATUS_TEXT[status]})` }),

    status === 'overdue'
      ? el('span', { className: 'task__flag', text: ' (бро.............)', attrs: { 'aria-hidden': 'true' } })
      : null
  );
 
  const date =
    showDate && task.date
      ? el('time', { className: 'task__date', text: shortDate(task.date), attrs: { datetime: task.date } })
      : null;

   const actions = el(
    'div',
    { className: 'task__actions' },
    el('button', {
      className: 'task__btn',
      text: '⇄',
      attrs: { type: 'button', 'aria-label': `Перенести: ${task.title}`, title: 'Перенести' },
      on: { click: () => startMove(task.id) },
    }),

    el('button', {
      className: 'task__btn',
      text: '✎',
      attrs: { type: 'button', 'aria-label': `Редактировать: ${task.title}`, title: 'Редактировать' },
      on: { click: () => startEdit(task.id) },
    }),
    el('button', {
      className: 'task__btn',
      text: '×',
      attrs: { type: 'button', 'aria-label': `Удалить: ${task.title}`, title: 'Удалить' },
      on: { click: () => deleteTask(task.id) },
    })
    );

   const li = el(
    'li',
    {
      className: `task task--${status}`,
      dataset: { id: task.id },
      attrs: { draggable: 'true' },
    },
    check,
    urgentMark,
    title,
    date,
    actions,
  );

  li.addEventListener('dragstart', (e) => {
    dragId = task.id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', task.id);
    }
    requestAnimationFrame(() => li.classList.add('is-dragging'));
  });
  li.addEventListener('dragend', finishDrag);

  return li;
}

function buildEditRow(task) {
  const titleInput = el('input', {
    className: 'task-edit__title',
    attrs: { type: 'text', maxlength: MAX_TITLE, 'aria-label': 'Название задачи', autocomplete: 'off' },
  });
  titleInput.value = task.title;
 
  const dateInput = el('input', {
    className: 'task-edit__date',
    attrs: { type: 'date', 'aria-label': 'Дата (можно очистить — задача уйдёт в общий список)' },
  });
  dateInput.value = task.date || '';
 
  const error = el('p', { className: 'form-error', attrs: { role: 'alert' } });
  const urgentBtn = buildUrgentToggle(Boolean(task.urgent));

  const form = el(
    'form',
    {
      className: 'task-edit',
      attrs: { novalidate: true },
      on: {
        submit: (e) => {
          e.preventDefault();
          const title = titleInput.value.trim();
          if (!title) {
            error.textContent = 'Название не может быть пустым';
            titleInput.classList.add('is-invalid');
            titleInput.focus();
            return;
          }
          task.title = title;
          task.date = dateInput.value || null;
          task.urgent = isUrgent(urgentBtn);
          state.editingId = null;
          saveTasks();
          renderTasks();
        },
        keydown: (e) => {
          if (e.key === 'Escape') cancelRowMode();
        },
      },
    },
    titleInput,
    el(
      'div',
      { className: 'task-edit__row' },
      dateInput,
      urgentBtn,
      el('button', { className: 'btn btn--small btn--primary', text: 'Сохранить', attrs: { type: 'submit' } }),
      el('button', {
        className: 'btn btn--small',
        text: 'Отмена',
        attrs: { type: 'button' },
        on: { click: cancelRowMode },
      })
    ),
    error
  );
 
  titleInput.addEventListener('input', () => {
    error.textContent = '';
    titleInput.classList.remove('is-invalid');
  });
 
  return el('li', { className: 'task task--editing', dataset: { id: task.id } }, form);
}

function buildMoveRow(task) {
  const current = zoneKeyOf(task);
  const select = el('select', {
    className: 'task-move__select',
    attrs: { 'aria-label': `Куда перенести: ${task.title}` },
    on: {
      change: (e) => {
        const key = e.target.value;
        if (!key) return;
        state.movingId = null;
        moveTask(task.id, key, null);
      },
      keydown: (e) => {
        if (e.key === 'Escape') cancelRowMode();
      },
    },
  });
 
  select.append(el('option', { text: 'Перенести в…', attrs: { value: '', disabled: true, selected: true } }));
  if (current !== 'pile') select.append(el('option', { text: 'Общий список задач', attrs: { value: 'pile' } }));
  currentWeekDates().forEach((iso, i) => {
    if (iso === current) return;
    select.append(el('option', { text: `${DAY_NAMES[i]}, ${shortDate(iso)}`, attrs: { value: iso } }));
  });
 
  return el(
    'li',
    { className: 'task task--moving', dataset: { id: task.id } },
    el(
      'div',
      { className: 'task-move' },
      el('span', { className: 'task__title', text: task.title }),
      el(
        'div',
        { className: 'task-edit__row' },
        select,
        el('button', {
          className: 'btn btn--small',
          text: 'Отмена',
          attrs: { type: 'button' },
          on: { click: cancelRowMode },
        })
      )
    )
  );
}

function buildUrgentToggle(initial) {
  const btn = el('button', {
    className: 'urgent-toggle',
    text: '!',
    attrs: { type: 'button', 'aria-pressed': String(initial), 'aria-label': 'Срочно', title: 'Срочно' },
  });
  btn.addEventListener('click', () => {
    btn.setAttribute('aria-pressed', String(btn.getAttribute('aria-pressed') !== 'true'));
  });
  return btn;
}
 
const isUrgent = (btn) => btn.getAttribute('aria-pressed') === 'true';

function compareByDate(a, b) {
  if (a.date === b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  const result = a.date < b.date ? -1 : 1;
  return state.sort === 'desc' ? -result : result;
}

function renderTasks() {
  const today = toISO(new Date());
  const groups = new Map([['pile', []]]);
  ui.dayLists.forEach((_, iso) => groups.set(iso, []));

  const visible = state.tasks.filter(matches);
  const weekDates = new Set(ui.dayLists.keys());
  visible.forEach((task) => {
    const key = task.date && weekDates.has(task.date) ? task.date : 'pile';
    groups.get(key).push(task);
  });

  if (state.sort !== 'manual') groups.get('pile').sort(compareByDate);
  const pileTasks = groups.get('pile');
  const pileNodes = pileTasks.map((task) => buildTaskRow(task, today, true));
  if (pileNodes.length === 0) {
    const filtersActive = state.query !== '' || state.filter !== 'all';
    const message =
      state.tasks.length === 0
        ? 'Пока нет задач. Добавьте первую выше.'
        :filtersActive
          ? 'Ничего не найдено...'
          : 'Список пуст — всё распланировано.';
    pileNodes.push(el('li', { className: 'empty', text: message }));
  }
  ui.pileList.replaceChildren(...pileNodes);
  ui.pileCount.textContent = String(pileTasks.length);
 
  ui.dayLists.forEach((list, iso) => {
    list.replaceChildren(...groups.get(iso).map((task) => buildTaskRow(task, today, false)));
  });
}

function updateFilterButtons() {
  ui.filterButtons.forEach((btn) => {
    const active = btn.dataset.filter === state.filter;
    btn.setAttribute('aria-pressed', String(active));
    btn.classList.toggle('is-active', active);
  });
}
 
function buildToolbar() {
    const group = el('div', {
        className: 'segmented',
        attrs: { role: 'group', 'aria-label': 'Фильтр по статусу' },
  });
    ui.filterButtons = FILTERS.map(([value, label]) => {
        const btn = el('button', {
            className: 'segmented__btn',
            text: label,
            attrs: { type: 'button' },
            dataset: { filter: value },
            on: {
                click: () => {
                    state.filter = value;
                    updateFilterButtons();
                    renderTasks();
                },
            },
        });
    group.append(btn);
    return btn;
  });
  updateFilterButtons();
 
  const legend = el(
    'ul',
    { className: 'legend', attrs: { 'aria-label': 'Обозначения' } },
    el('li', { className: 'legend__item legend__item--overdue', text: 'Просрочено' }),
    el('li', { className: 'legend__item legend__item--upcoming', text: 'Предстоит' }),
    el('li', { className: 'legend__item legend__item--done', text: 'Выполнено' })
  );
 
  return el(
    'form',
    { className: 'toolbar', attrs: { role: 'search' }, on: { submit: (e) => e.preventDefault() } },
    ui.search,
    group,
    legend
  );
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const normalize = (text) => text.toLowerCase().replaceAll('ё', 'е');

function matches(task) {
  if (state.filter === 'active' && task.done) return false;
  if (state.filter === 'done' && !task.done) return false;
  if (state.query) {
    const title = normalize(task.title);
    const words = normalize(state.query).split(/\s+/).filter(Boolean);
    if (!words.every((word) => title.includes(word))) return false;
  }
  return true;
}
 
function resetFilters() {
  state.filter = 'all';
  state.query = '';
  if (ui.search) ui.search.value = '';
  updateFilterButtons();
}

function buildHeader() {
  return el(
    'header',
    { className: 'header' },
    el(
      'div',
      { className: 'container header__content' },
      el('h1', { className: 'logo', text: 'mt9v0' }),
      el('p', { className: 'header__subtitle', text: '2-do list' })
    )
  );
}

function buildPile() {
  ui.pileCount = el('span', { className: 'pile__count', attrs: { 'aria-label': 'Количество задач' } });
  ui.pileList = el('ul', { className: 'task-list pile__list', attrs: { 'aria-label': 'Список дел' } });
 
  ui.newTitle = el('input', {
    className: 'field',
    attrs: {
      type: 'text',
      placeholder: 'Новая задача',
      maxlength: MAX_TITLE,
      'aria-label': 'Название новой задачи',
      autocomplete: 'off',
    },
  });
  const newDate = el('input', {
    className: 'field field--date',
    attrs: { type: 'date', 'aria-label': 'Дата (необязательно)' },
  });
  const newUrgent = buildUrgentToggle(false);
  const error = el('p', { className: 'form-error', attrs: { role: 'alert' } });
 
  ui.newTitle.addEventListener('input', () => {
    error.textContent = '';
    ui.newTitle.classList.remove('is-invalid');
  });
 
  const form = el(
    'form',
    {
      className: 'add-form',
      attrs: { novalidate: true },
      on: {
        submit: (e) => {
          e.preventDefault();
          const title = ui.newTitle.value.trim();
          if (!title) {
            error.textContent = 'Введите название задачи';
            ui.newTitle.classList.add('is-invalid');
            ui.newTitle.focus();
            return;
          }
          addTask(title, newDate.value || null, isUrgent(newUrgent));
          newUrgent.setAttribute('aria-pressed', 'false');
          ui.newTitle.value = '';
          newDate.value = '';
          ui.newTitle.focus();
        },
      },
    },
    ui.newTitle,
    el(
      'div',
      { className: 'add-form__row' },
      newDate,
      newUrgent,
      el('button', { className: 'btn btn--primary', text: 'Добавить', attrs: { type: 'submit' } })
    ),
    error
  );
 
  ui.sortSelect = el('select', {
    className: 'field field--select',
    attrs: { id: 'pile-sort' },
    on: {
      change: (e) => {
        state.sort = e.target.value;
        saveSort();
        renderTasks();
      },
    },
  });
  SORTS.forEach(([value, label]) => ui.sortSelect.append(el('option', { text: label, attrs: { value } })));
  ui.sortSelect.value = state.sort;
 
  const sortRow = el(
    'label',
    { className: 'pile__sort', attrs: { for: 'pile-sort' } },
    el('span', { text: 'Порядок' }),
    ui.sortSelect
  );

  ui.search = el('input', {
    className: 'field pile__search',
    attrs: {
      type: 'search',
      placeholder: 'Поиск по названию',
      'aria-label': 'Поиск задач по названию',
      autocomplete: 'off',
    },
    on: {
      input: (e) => {
        state.query = e.target.value.trim().toLowerCase();
        renderTasks();
      },
    },
  });

  const section = el(
    'section',
    { className: 'pile' },
    el('h2', { className: 'section-title section-title--split' }, el('span', { text: 'Список дел' }), ui.pileCount),
    el('p', {
      className: 'pile__hint',
    }),
    form,
    ui.search,
    ui.pileList,
    sortRow
  );
  attachDropZone(section, ui.pileList, 'pile');
  return section;
}

function buildDay(iso, index, todayISO) {
  const d = fromISO(iso);
  const isToday = iso === todayISO;

  const list = el('ul', { className: 'task-list day__list', attrs: { 'aria-label': DAY_NAMES[index] } });
  ui.dayLists.set(iso, list);

  const addInput = el('input', {
    className: 'day__add-input',
    attrs: {
      type: 'text',
      placeholder: '+ добавить',
      maxlength: MAX_TITLE,
      'aria-label': `Добавить задачу: ${DAY_NAMES[index].toLowerCase()}`,
      autocomplete: 'off',
    },
  });
  const addForm = el(
    'form',
    {
      className: 'day__add',
      on: {
        submit: (e) => {
          e.preventDefault();
          const title = addInput.value.trim();
          if (!title) return;
          addTask(title, iso);
          addInput.value = '';
          addInput.focus();
        },
      },
    },
    addInput
  );

  const title = el(
    'h3',
    { className: 'day__title' },
    el(
      'span',
      { className: 'day__name' },
      el('span', { text: DAY_NAMES[index] }),
      isToday ? el('span', { className: 'day__badge', text: 'сегодня' }) : null
    ),
    el('time', { className: 'day__date', text: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`, attrs: { datetime: iso } })
  );
  const section = el('section', { className: isToday ? 'day day--today' : 'day' }, title, list, addForm);

  attachDropZone(section, list, iso);
  return section;
}

function renderWeek() {
  const todayISO = toISO(new Date());
  ui.dayLists.clear();
  const days = currentWeekDates().map((iso, i) => buildDay(iso, i, todayISO));
  ui.grid.replaceChildren(...days);

  const fmtDay = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
  const fmtFull = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  ui.rangeLabel.textContent = `${fmtDay.format(state.weekStart)} — ${fmtFull.format(addDays(state.weekStart, 6))}`;
}

function showWeek(start) {
  state.weekStart = start;
  state.editingId = null;
  state.movingId = null;
  renderWeek();
  renderTasks();
}

function buildWeekSection() {
  ui.rangeLabel = el('h2', { className: 'week-nav__range', attrs: { 'aria-live': 'polite' } });
  ui.grid = el('div', { className: 'week__grid' });

  const nav = el(
    'nav',
    { className: 'week-nav', attrs: { 'aria-label': 'Навигация по неделям' } },
    el('button', {
      className: 'btn btn--icon',
      text: '‹',
      attrs: { type: 'button', 'aria-label': 'Предыдущая неделя' },
      on: { click: () => showWeek(addDays(state.weekStart, -7)) },
    }),
    ui.rangeLabel,
    el('button', {
      className: 'btn btn--icon',
      text: '›',
      attrs: { type: 'button', 'aria-label': 'Следующая неделя' },
      on: { click: () => showWeek(addDays(state.weekStart, 7)) },
    }),
    el('button', {
      className: 'btn',
      text: 'Сегодня',
      attrs: { type: 'button' },
      on: { click: () => showWeek(startOfWeek(new Date())) },
    })
  );

  return el('section', { className: 'week' }, nav, ui.grid);
}

function startApp() {
  document.body.append(buildHeader());
  const main = el('main', { className: 'container main' });
  main.append(buildToolbar());
  const layout = el('div', { className: 'layout' });
  layout.append(buildPile());
  layout.append(buildWeekSection());
  main.append(layout);
  document.body.append(main);
  renderWeek();
  renderTasks();
}

let started = false;
function run() {
  if (started) return;
  started = true;
  startApp();
}
 
const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet';
stylesheet.href = 'style.css';
stylesheet.addEventListener('load', run);
stylesheet.addEventListener('error', run);
document.head.append(stylesheet);
setTimeout(run, 3000);