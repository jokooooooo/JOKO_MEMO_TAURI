const state = {
  view: ['main', 'drawer', 'icon'].includes(new URLSearchParams(window.location.search).get('view'))
    ? new URLSearchParams(window.location.search).get('view')
    : 'main',
  data: { websites: [], tasks: [], notes: [] },
  activeTab: null,
  modal: null,
  saving: false
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const tauri = window.__TAURI__;
const currentWindow = tauri?.window?.getCurrentWindow?.() ?? tauri?.webviewWindow?.getCurrentWebviewWindow?.();
const listen = tauri?.event?.listen;
const invoke = tauri?.core?.invoke;

if (!tauri || !currentWindow || !listen || !invoke) {
  throw new Error('JOKO_MEMO must run inside Tauri.');
}

const icons = {
  server: '#',
  dns: '#',
  eye: 'O',
  database: 'DB',
  terminal: '$',
  shield: '[]',
  pulse: '~'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'UNKNOWN_TIME';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
    .format(date)
    .replaceAll('/', '.');
}

function nowIso() {
  return new Date().toISOString();
}

function clearTextSelection() {
  const selection = window.getSelection?.();
  if (selection) selection.removeAllRanges();
  if (document.activeElement && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

function makeId(kind) {
  const prefix = { website: 'WEB', task: 'TSK', note: 'NTE' }[kind];
  return `${prefix}-${Math.floor(100 + Math.random() * 900)}-${Date.now().toString(36).toUpperCase()}`;
}

function collectionName(kind) {
  return kind === 'website' ? 'websites' : kind === 'task' ? 'tasks' : 'notes';
}

function getRecord(kind, id) {
  return state.data[collectionName(kind)].find((item) => item.id === id);
}

function setRecord(kind, record) {
  const key = collectionName(kind);
  const exists = state.data[key].some((item) => item.id === record.id);
  state.data = {
    ...state.data,
    [key]: exists ? state.data[key].map((item) => (item.id === record.id ? record : item)) : [record, ...state.data[key]]
  };
}

function deleteRecord(kind, id) {
  const key = collectionName(kind);
  state.data = {
    ...state.data,
    [key]: state.data[key].filter((item) => item.id !== id)
  };
  persist();
  render();
}

async function persist() {
  await window.coreOS.data.save(state.data);
}

function progressBlocks(value, tone = 'primary') {
  const activeBlocks = Math.max(0, Math.min(10, Math.round(Number(value) / 10)));
  return Array.from({ length: 10 })
    .map((_, index) => `<span class="progress-block ${index < activeBlocks ? `progress-block--${tone}` : ''}"></span>`)
    .join('');
}

function render() {
  if (state.view === 'icon') return;

  if (state.view === 'drawer') {
    renderDrawer();
    return;
  }

  $('#metricWebsites').textContent = String(state.data.websites.length).padStart(2, '0');
  $('#metricTasks').textContent = String(state.data.tasks.length).padStart(2, '0');
  const pending = state.data.tasks.filter((task) => task.status === 'PENDING').length;
  $('#metricPending').textContent = String(pending).padStart(2, '0');
  $('#pendingMetric').classList.toggle('metric--warning', pending > 0);
  $('#bootStatus').textContent = 'STATUS: ONLINE';

  $$('.nav-item').forEach((button) => {
    button.classList.toggle('nav-item--active', button.dataset.tab === state.activeTab);
  });
}

function renderDrawer() {
  const canvas = $('#drawerCanvas');
  if (!canvas) return;
  if (!state.activeTab) {
    canvas.innerHTML = '';
    return;
  }

  if (state.activeTab === 'website') {
    canvas.innerHTML = panel('网络终端 // DOMAINS', 'website', websiteCards());
  } else if (state.activeTab === 'task') {
    canvas.innerHTML = panel('执行队列 // TASKS', 'task', taskCards());
  } else {
    canvas.innerHTML = panel('草稿区 // MEMORY_BUFFER', 'note', noteCards());
  }
}

async function toggleDrawer(nextTab) {
  await window.coreOS.drawer.toggle(nextTab);
}

function bindIconEvents() {
  document.body.classList.add('view-icon');
  $('#widgetCluster').remove();
  $('#modalOverlay').remove();
  const miniOrb = $('#miniOrb');
  miniOrb.classList.remove('hidden');

  let dragStart = null;
  let didDrag = false;

  miniOrb.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragStart = { clientX: event.clientX, clientY: event.clientY };
    didDrag = false;
    miniOrb.setPointerCapture(event.pointerId);
    miniOrb.classList.add('mini-orb--dragging');
  });

  miniOrb.addEventListener('pointermove', (event) => {
    if (!dragStart) return;
    const dx = event.clientX - dragStart.clientX;
    const dy = event.clientY - dragStart.clientY;
    if (Math.hypot(dx, dy) > 4) didDrag = true;
    if (didDrag) {
      currentWindow?.startDragging();
      dragStart = null;
    }
  });

  const finishPointer = (event) => {
    if (!dragStart && didDrag) {
      miniOrb.classList.remove('mini-orb--dragging');
      return;
    }
    miniOrb.classList.remove('mini-orb--dragging');
    if (miniOrb.hasPointerCapture(event.pointerId)) miniOrb.releasePointerCapture(event.pointerId);
    if (!didDrag) window.coreOS.window.restore();
    dragStart = null;
    didDrag = false;
  };

  miniOrb.addEventListener('pointerup', finishPointer);
  miniOrb.addEventListener('pointercancel', finishPointer);
}

function panel(title, kind, body) {
  return `
    <section class="panel">
      <header class="panel__header">
        <h1>${title}</h1>
        <button class="square-button" type="button" data-action="add" data-kind="${kind}" aria-label="Add ${kind}"><i class="glyph">+</i></button>
      </header>
      <div class="record-stack ${kind === 'note' ? 'record-stack--notes' : ''}">${body}</div>
    </section>
  `;
}

function websiteCards() {
  return state.data.websites
    .map(
      (site) => `
        <article class="website-card record-card" data-kind="website" data-id="${escapeHtml(site.id)}">
          <div class="serial-tag">${escapeHtml(site.id)}</div>
          <div class="record-actions">
            <button type="button" data-action="edit" aria-label="Edit"><i class="glyph">E</i></button>
            <button type="button" data-action="delete" aria-label="Delete"><i class="glyph">D</i></button>
          </div>
          <div class="website-card__icon"><i class="glyph">${icons[site.icon] ?? icons.terminal}</i></div>
          <div class="website-card__body">
            <h3>${escapeHtml(site.title)}</h3>
            <button type="button" class="external-link" data-action="open-external">${escapeHtml(site.domain)} <i class="glyph">&gt;</i></button>
            <p>${escapeHtml(site.description)}</p>
          </div>
        </article>
      `
    )
    .join('');
}

function taskCards() {
  return state.data.tasks
    .map((task) => {
      const tone = task.priority === 'HIGH' ? 'error' : task.priority === 'LOW' ? 'secondary' : 'primary';
      return `
        <article class="task-card record-card task-card--${task.priority.toLowerCase()}" data-kind="task" data-id="${escapeHtml(task.id)}">
          <div class="record-actions">
            <button type="button" data-action="edit" aria-label="Edit"><i class="glyph">E</i></button>
            <button type="button" data-action="delete" aria-label="Delete"><i class="glyph">D</i></button>
          </div>
          <div class="task-card__head">
            <span class="priority-chip priority-chip--${task.priority.toLowerCase()}">[${task.priority}]</span>
            <h3>${escapeHtml(task.title)}</h3>
            <span class="task-status ${task.status === 'DONE' ? 'task-status--done' : ''}">${task.status}</span>
          </div>
          <div class="progress-blocks">${progressBlocks(task.progress, tone)}</div>
          <div class="record-meta"><span>${escapeHtml(task.id)}</span><span>${formatDate(task.updatedAt)}</span></div>
        </article>
      `;
    })
    .join('');
}

function noteCards() {
  return state.data.notes
    .map(
      (note) => `
        <article class="note-card record-card" data-kind="note" data-id="${escapeHtml(note.id)}">
          <div class="record-actions">
            <button type="button" data-action="edit" aria-label="Edit"><i class="glyph">E</i></button>
            <button type="button" data-action="delete" aria-label="Delete"><i class="glyph">D</i></button>
          </div>
          <div class="record-meta record-meta--top"><span>SYS_LOG_ENTRY</span><span>${formatDate(note.createdAt)}</span></div>
          <h3>${escapeHtml(note.title)}</h3>
          <p>${escapeHtml(note.content)}</p>
        </article>
      `
    )
    .join('');
}

function openModal(kind, mode, record) {
  state.modal = { kind, mode, record };
  document.title = mode === 'edit' ? '[MODIFY_SEQUENCE]' : '[ADD_SEQUENCE]';
  $('#modalOverlay').classList.remove('hidden');
  $('#entityForm').classList.remove('hud-modal--error');
  $('#entityForm').classList.add('modal-glitch-in');
  $('#modalError').classList.add('hidden');
  $('#modalSync').classList.add('hidden');
  $('#modalMode').textContent = `DATA_ENTRY // ${mode.toUpperCase()}`;
  $('#modalTitle').textContent = `${mode === 'edit' ? '[MODIFY_SEQUENCE]' : '[ADD_SEQUENCE]'} // ${kind.toUpperCase()}`;
  $('#modalId').textContent = `ID: ${record?.id ?? '[AUTO_ALLOCATE]'}`;
  $('#modalStamp').textContent = `STAMP: ${record?.updatedAt ?? '[NOW]'}`;
  $('#modalProgress').innerHTML = progressBlocks(100, 'primary');
  renderModalBody(kind, record);
  setTimeout(() => $('#entityForm').classList.remove('modal-glitch-in'), 320);
  const firstInput = $('#modalBody input, #modalBody textarea, #modalBody select');
  if (firstInput) firstInput.focus();
}

function closeModal() {
  state.modal = null;
  document.title = 'JOKO_MEMO';
  clearTextSelection();
  $('#modalOverlay').classList.add('hidden');
}

function renderModalBody(kind, record = {}) {
  if (kind === 'website') {
    $('#modalBody').innerHTML = `
      <label class="field"><span>LINK_TITLE // 标题</span><input name="title" value="${escapeHtml(record.title ?? '')}" required /></label>
      <label class="field"><span>DOMAIN_NAME // 域名</span><input name="domain" value="${escapeHtml(record.domain ?? '')}" placeholder="sys.core.local" required /></label>
      <label class="field"><span>DESCRIPTION // 描述</span><textarea name="description" rows="4">${escapeHtml(record.description ?? '')}</textarea></label>
      <label class="field"><span>ICON_CLASS // 图标</span><input name="icon" value="${escapeHtml(record.icon ?? 'server')}" placeholder="server / eye / database" /></label>
    `;
  } else if (kind === 'task') {
    $('#modalBody').innerHTML = `
      <label class="field"><span>TASK_NAME // 任务名称</span><input name="title" value="${escapeHtml(record.title ?? '')}" required /></label>
      <div class="field-grid">
        <label class="field"><span>PRIORITY // 优先级</span><select name="priority">
          ${option('HIGH', record.priority)}${option('MED', record.priority ?? 'MED')}${option('LOW', record.priority)}
        </select></label>
        <label class="field"><span>STATUS // 状态</span><select name="status">
          ${option('PENDING', record.status ?? 'PENDING')}${option('DONE', record.status)}
        </select></label>
      </div>
      <label class="field"><span>PROGRESS // 进度</span><input type="range" min="0" max="100" step="10" name="progress" value="${escapeHtml(record.progress ?? 40)}" /></label>
    `;
  } else {
    $('#modalBody').innerHTML = `
      <label class="field"><span>TITLE // 标题</span><input name="title" value="${escapeHtml(record.title ?? '')}" required /></label>
      <label class="field"><span>CONTENT // 内容</span><textarea name="content" rows="8" required>${escapeHtml(record.content ?? '')}</textarea></label>
    `;
  }
}

function option(value, selected) {
  return `<option value="${value}" ${selected === value ? 'selected' : ''}>${value === 'HIGH' || value === 'MED' || value === 'LOW' ? `[${value}]` : value}</option>`;
}

function formValue(form, name) {
  return new FormData(form).get(name)?.toString().trim() ?? '';
}

function validate(form, kind) {
  const required = kind === 'website' ? ['title', 'domain'] : kind === 'task' ? ['title'] : ['title', 'content'];
  return required.every((name) => formValue(form, name));
}

async function saveModal(form) {
  if (!state.modal || state.saving) return;
  const { kind, record } = state.modal;
  if (!validate(form, kind)) {
    $('#entityForm').classList.add('hud-modal--error');
    $('#modalError').classList.remove('hidden');
    return;
  }

  const timestamp = nowIso();
  const base = {
    id: record?.id ?? makeId(kind),
    createdAt: record?.createdAt ?? timestamp,
    updatedAt: timestamp
  };
  let nextRecord;
  if (kind === 'website') {
    nextRecord = {
      ...base,
      title: formValue(form, 'title'),
      domain: formValue(form, 'domain'),
      description: formValue(form, 'description'),
      icon: formValue(form, 'icon') || 'server'
    };
  } else if (kind === 'task') {
    const status = formValue(form, 'status') || 'PENDING';
    nextRecord = {
      ...base,
      title: formValue(form, 'title'),
      priority: formValue(form, 'priority') || 'MED',
      status,
      progress: status === 'DONE' ? 100 : Number(formValue(form, 'progress') || 40)
    };
  } else {
    nextRecord = {
      ...base,
      title: formValue(form, 'title'),
      content: formValue(form, 'content')
    };
  }

  state.saving = true;
  $('#modalSync').classList.remove('hidden');
  $('#saveBtn').textContent = 'SYNCING...';
  await new Promise((resolve) => setTimeout(resolve, 520));
  setRecord(kind, nextRecord);
  await persist();
  state.saving = false;
  $('#saveBtn').textContent = 'SYNC_DATA // 保存';
  clearTextSelection();
  closeModal();
  render();
  requestAnimationFrame(clearTextSelection);
}

function bindEvents() {
  if (state.view === 'main') {
    document.body.classList.add('view-main');
    $('#drawer').remove();
    $$('.nav-item').forEach((button) => {
      button.addEventListener('click', () => {
        toggleDrawer(button.dataset.tab);
      });
    });

    $('#compactBtn').addEventListener('click', () => window.coreOS.window.compact());
    $('#minimizeBtn').addEventListener('click', () => window.coreOS.window.hideToTray());
    $('#closeToTrayBtn').addEventListener('click', () => window.coreOS.window.hideToTray());
    $('.core-card__header')?.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.no-drag, button, input, textarea, select')) return;
      currentWindow?.startDragging();
    });
    $('#syncBtn').addEventListener('click', async () => {
      $('#syncBtn').classList.add('sync-button--active');
      $('#syncBtn span').textContent = 'SYNCING_STREAM';
      await persist();
      setTimeout(() => {
        $('#syncBtn').classList.remove('sync-button--active');
        $('#syncBtn span').textContent = 'SYNC_DATA';
      }, 420);
    });

    window.coreOS.drawer.onState((payload) => {
      state.activeTab = payload.activeTab;
      render();
    });
  } else if (state.view === 'drawer') {
    document.body.classList.add('view-drawer');
    $('.core-card').remove();
    $('#drawer').classList.add('drawer--open');
    $('#drawer').setAttribute('aria-hidden', 'false');
    window.coreOS.drawer.onSetTab((tab) => {
      state.activeTab = tab;
      render();
    });
    window.coreOS.drawer.onSetVisible((visible) => {
      $('#drawer').classList.toggle('drawer--open', Boolean(visible));
    });
  } else {
    bindIconEvents();
    return;
  }

  window.coreOS.data.onUpdated((snapshot) => {
    state.data = snapshot;
    render();
  });

  if (!$('#drawerCanvas')) return;

  $('#drawerCanvas').addEventListener('click', (event) => {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;
    const action = actionTarget.dataset.action;
    const card = event.target.closest('.record-card');
    const kind = actionTarget.dataset.kind || card?.dataset.kind;
    if (action === 'add') openModal(kind, 'add');
    if (action === 'edit') openModal(kind, 'edit', getRecord(kind, card.dataset.id));
    if (action === 'delete') deleteRecord(kind, card.dataset.id);
    if (action === 'open-external') window.coreOS.shell.openExternal(getRecord(kind, card.dataset.id).domain);
    event.stopPropagation();
  });

  $('#drawerCanvas').addEventListener('dblclick', (event) => {
    const card = event.target.closest('.record-card');
    if (!card) return;
    openModal(card.dataset.kind, 'edit', getRecord(card.dataset.kind, card.dataset.id));
  });

  $('#modalCloseBtn').addEventListener('click', closeModal);
  $('#cancelBtn').addEventListener('click', closeModal);
  $('#modalOverlay').addEventListener('click', (event) => {
    if (event.target === $('#modalOverlay')) closeModal();
  });
  $('#entityForm').addEventListener('submit', (event) => {
    event.preventDefault();
    saveModal(event.currentTarget);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.modal) closeModal();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && state.modal) {
      event.preventDefault();
      saveModal($('#entityForm'));
    }
  });
}

async function boot() {
  window.coreOS = {
    data: {
      load: () => invoke('data_load'),
      save: (snapshot) => invoke('data_save', { snapshot }),
      onUpdated: (callback) => listen('data-updated', (event) => callback(event.payload))
    },
    window: {
      hideToTray: () => invoke('window_hide_to_tray'),
      compact: () => invoke('window_compact'),
      restore: () => invoke('window_restore')
    },
    drawer: {
      toggle: (tab) => invoke('drawer_toggle', { tab }),
      close: () => invoke('drawer_close'),
      onState: (callback) => listen('drawer-state', (event) => callback(event.payload)),
      onSetTab: (callback) => listen('drawer-set-tab', (event) => callback(event.payload)),
      onSetVisible: (callback) => listen('drawer-set-visible', (event) => callback(event.payload))
    },
    shell: {
      openExternal: (rawUrl) => invoke('open_external', { rawUrl })
    }
  };

  if (state.view !== 'icon') state.data = await window.coreOS.data.load();
  bindEvents();
  render();
}

boot();
