// Shared by the craft-ts and the SolidJS implementations of the "page"
// fixture: seeded data, URL settings, the pure reducer, pure formatting
// helpers and the timing harness. Nothing here knows about a framework.

// -- Settings ---------------------------------------------------------------

export const settings = (() => {
  const p = new URLSearchParams(location.search);
  const scale = Number(p.get('scale') ?? 1);
  return { scale: [1, 2, 4].includes(scale) ? scale : 1 };
})();

// -- Types (JSDoc, read by tsc for the craft sources) ------------------------

/**
 * @typedef {'admin' | 'editor' | 'viewer'} Role
 * @typedef {'active' | 'pending' | 'suspended'} Status
 * @typedef {{
 *   id: number; name: string; email: string; role: Role; status: Status;
 *   score: number; joined: string; tags: string[];
 *   starred: boolean; flagged: boolean;
 * }} Person
 * @typedef {'todo' | 'doing' | 'review' | 'done'} Column
 * @typedef {{
 *   id: number; column: Column; title: string; owner: string; tags: string[];
 *   likes: number; comments: number; due: string; done: boolean; pinned: boolean;
 * }} Task
 * @typedef {{
 *   id: number; name: string; kind: string; size: string; owner: string;
 *   shared: boolean;
 * }} FileEntry
 * @typedef {{
 *   id: number; actor: string; verb: string; target: string; time: string;
 *   kind: string;
 * }} FeedEntry
 * @typedef {'board' | 'files' | 'notes'} Tab
 * @typedef {'name' | 'role' | 'status' | 'score' | 'joined'} SortKey
 * @typedef {{
 *   revision: number; theme: 'light' | 'dark'; unread: number; search: string;
 *   menuOpen: boolean; tab: Tab; status: Status | 'all'; sortKey: SortKey;
 *   sortDir: 'asc' | 'desc'; compact: boolean; selected: number | null;
 *   people: Person[]; tasks: Task[]; files: FileEntry[]; feed: FeedEntry[];
 *   form: Record<string, string | boolean>;
 * }} Model
 * @typedef {{ type: string, [key: string]: any }} ActionObject
 * @typedef {string | ActionObject} Action
 */

// -- Seeded data ------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  'Ada', 'Alan', 'Grace', 'Linus', 'Margaret', 'Dennis', 'Barbara', 'Ken',
  'Hedy', 'Edsger', 'Radia', 'Tim', 'Sophie', 'Donald', 'Katherine', 'Guido',
];
const LAST = [
  'Lovelace', 'Turing', 'Hopper', 'Torvalds', 'Hamilton', 'Ritchie', 'Liskov',
  'Thompson', 'Lamarr', 'Dijkstra', 'Perlman', 'Berners', 'Wilson', 'Knuth',
  'Johnson', 'Rossum',
];
const TAGS = [
  'design', 'infra', 'billing', 'mobile', 'api', 'docs', 'security', 'growth',
  'research', 'support',
];
const ROLES = ['admin', 'editor', 'viewer'];
const STATUSES = ['active', 'pending', 'suspended'];
const COLUMNS = ['todo', 'doing', 'review', 'done'];
const VERBS = ['commented on', 'edited', 'created', 'reviewed', 'archived'];
const TARGETS = [
  'the pricing page', 'Q3 roadmap', 'onboarding flow', 'invoice #1042',
  'release notes', 'API tokens', 'mobile build', 'team handbook',
];
const KINDS = ['comment', 'edit', 'create', 'review', 'archive'];
const FILE_KINDS = ['doc', 'image', 'sheet', 'archive'];
const TITLES = [
  'Fix the login redirect', 'Write the changelog', 'Review pull request',
  'Update the pricing table', 'Migrate the billing job', 'Audit access rights',
  'Polish the empty states', 'Cache the search index', 'Plan the offsite',
  'Triage support inbox', 'Refresh the dashboard', 'Document the webhooks',
];

/** The dynamic content grows with `scale`; the shell (nav, form, stats) does not. */
export const sizes = (scale) => ({
  people: 40 * scale,
  tasksPerColumn: 12 * scale,
  files: 45 * scale,
  feed: 15 * scale,
});

function generate(scale) {
  const random = mulberry32(20261115);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const count = sizes(scale);
  const people = Array.from({ length: count.people }, (_, id) => {
    const first = FIRST[id % FIRST.length];
    const last = LAST[(id * 7 + Math.floor(id / FIRST.length)) % LAST.length];
    return {
      id,
      name: `${first} ${last}`,
      email: `${first}.${last}${id}@example.com`.toLowerCase(),
      role: pick(ROLES),
      status: pick(STATUSES),
      score: Math.floor(random() * 101),
      joined: `20${String(18 + Math.floor(random() * 8)).padStart(2, '0')}-${String(1 + Math.floor(random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(random() * 28)).padStart(2, '0')}`,
      tags: [pick(TAGS), pick(TAGS)],
      starred: false,
      flagged: false,
    };
  });
  const owner = () => people[Math.floor(random() * people.length)].name;
  const tasks = [];
  for (const column of COLUMNS)
    for (let index = 0; index < count.tasksPerColumn; index++)
      tasks.push({
        id: tasks.length,
        column,
        title: `${pick(TITLES)} ${tasks.length}`,
        owner: owner(),
        tags: [pick(TAGS), pick(TAGS), pick(TAGS)],
        likes: Math.floor(random() * 20),
        comments: Math.floor(random() * 12),
        due: `in ${1 + Math.floor(random() * 14)} days`,
        done: column === 'done',
        pinned: false,
      });
  const files = Array.from({ length: count.files }, (_, id) => ({
    id,
    name: `${pick(TARGETS).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${id}`,
    kind: pick(FILE_KINDS),
    size: `${(random() * 9 + 0.1).toFixed(1)} MB`,
    owner: owner(),
    shared: random() > 0.5,
  }));
  const feed = Array.from({ length: count.feed }, (_, id) => ({
    id,
    actor: owner(),
    verb: pick(VERBS),
    target: pick(TARGETS),
    time: `${1 + Math.floor(random() * 58)}m ago`,
    kind: pick(KINDS),
  }));
  return { people, tasks, files, feed };
}

// -- Static page definitions (the shell: identical at every scale) ----------

export const NAV_LINKS = [
  { id: 'dashboard', label: 'Dashboard', active: true },
  { id: 'projects', label: 'Projects', active: false },
  { id: 'people', label: 'People', active: false },
  { id: 'billing', label: 'Billing', active: false },
  { id: 'reports', label: 'Reports', active: false },
];

export const MENU_ITEMS = [
  { id: 'profile', label: 'Profile' },
  { id: 'settings', label: 'Settings' },
  { id: 'help', label: 'Help' },
  { id: 'sign-out', label: 'Sign out' },
];

/** @typedef {{ id: string; label: string; icon: string; badge?: { kind: 'unread' } | { kind: 'static'; text: string } }} NavItem */
/** @type {{ id: string; title: string; items: NavItem[] }[]} */
export const SIDEBAR_GROUPS = [
  {
    id: 'workspace',
    title: 'Workspace',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'home' },
      { id: 'inbox', label: 'Inbox', icon: 'mail', badge: { kind: 'unread' } },
      { id: 'tasks', label: 'Tasks', icon: 'check', badge: { kind: 'static', text: '12' } },
      { id: 'calendar', label: 'Calendar', icon: 'calendar' },
      { id: 'files', label: 'Files', icon: 'file' },
      { id: 'search', label: 'Search', icon: 'search' },
    ],
  },
  {
    id: 'team',
    title: 'Team',
    items: [
      { id: 'members', label: 'Members', icon: 'user', badge: { kind: 'static', text: '40' } },
      { id: 'roles', label: 'Roles', icon: 'shield' },
      { id: 'invites', label: 'Invitations', icon: 'mail', badge: { kind: 'static', text: '3' } },
      { id: 'groups', label: 'Groups', icon: 'user' },
      { id: 'directory', label: 'Directory', icon: 'file' },
      { id: 'activity', label: 'Activity', icon: 'bolt' },
    ],
  },
  {
    id: 'finance',
    title: 'Finance',
    items: [
      { id: 'invoices', label: 'Invoices', icon: 'file', badge: { kind: 'static', text: '5' } },
      { id: 'payments', label: 'Payments', icon: 'card' },
      { id: 'plans', label: 'Plans', icon: 'star' },
      { id: 'taxes', label: 'Taxes', icon: 'file' },
      { id: 'payouts', label: 'Payouts', icon: 'card' },
      { id: 'exports', label: 'Exports', icon: 'download' },
    ],
  },
  {
    id: 'product',
    title: 'Product',
    items: [
      { id: 'roadmap', label: 'Roadmap', icon: 'flag' },
      { id: 'releases', label: 'Releases', icon: 'bolt' },
      { id: 'feedback', label: 'Feedback', icon: 'chat', badge: { kind: 'static', text: '9' } },
      { id: 'experiments', label: 'Experiments', icon: 'star' },
      { id: 'flags', label: 'Flags', icon: 'flag' },
      { id: 'changelog', label: 'Changelog', icon: 'file' },
    ],
  },
  {
    id: 'admin',
    title: 'Admin',
    items: [
      { id: 'settings', label: 'Settings', icon: 'gear' },
      { id: 'security', label: 'Security', icon: 'shield' },
      { id: 'audit', label: 'Audit log', icon: 'file' },
      { id: 'api', label: 'API keys', icon: 'bolt' },
      { id: 'webhooks', label: 'Webhooks', icon: 'bolt' },
      { id: 'integrations', label: 'Integrations', icon: 'gear' },
    ],
  },
];

export const STAT_DEFS = [
  { id: 'people', label: 'People', icon: 'user', delta: 4 },
  { id: 'active', label: 'Active', icon: 'bolt', delta: 2 },
  { id: 'done', label: 'Tasks done', icon: 'check', delta: 9 },
  { id: 'open', label: 'Open tasks', icon: 'flag', delta: -3 },
  { id: 'unread', label: 'Unread', icon: 'mail', delta: 1 },
  { id: 'score', label: 'Average score', icon: 'star', delta: -1 },
];

export const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'pending', label: 'Pending' },
  { id: 'suspended', label: 'Suspended' },
];

export const SORT_COLUMNS = [
  { id: 'name', label: 'Name' },
  { id: 'role', label: 'Role' },
  { id: 'status', label: 'Status' },
  { id: 'score', label: 'Score' },
  { id: 'joined', label: 'Joined' },
];

export const BOARD_COLUMNS = [
  { id: 'todo', title: 'To do' },
  { id: 'doing', title: 'In progress' },
  { id: 'review', title: 'In review' },
  { id: 'done', title: 'Done' },
];

export const TABS = [
  { id: 'board', label: 'Board' },
  { id: 'files', label: 'Files' },
  { id: 'notes', label: 'Notes' },
];

export const NOTES = [
  'Standup is at 10:00, the demo moved to Thursday.',
  'Remember to rotate the API tokens before the audit.',
  'The pricing experiment ends on the 30th.',
];

export const FOOTER_LINKS = [
  'Terms', 'Privacy', 'Status', 'Docs', 'Contact', 'Careers',
];

/** @typedef {{ id: string; group: string; label: string; kind: 'text' | 'select' | 'textarea' | 'checkbox'; required: boolean; help: string; options?: string[] }} FieldDef */
/** @type {FieldDef[]} */
export const FORM_FIELDS = [
  { id: 'firstName', group: 'profile', label: 'First name', kind: 'text', required: true, help: 'As on your ID.' },
  { id: 'lastName', group: 'profile', label: 'Last name', kind: 'text', required: true, help: 'As on your ID.' },
  { id: 'email', group: 'profile', label: 'Email', kind: 'text', required: true, help: 'We never share it.' },
  { id: 'phone', group: 'profile', label: 'Phone', kind: 'text', required: false, help: 'With country code.' },
  { id: 'bio', group: 'profile', label: 'Bio', kind: 'textarea', required: false, help: 'A few words.' },
  { id: 'company', group: 'work', label: 'Company', kind: 'text', required: true, help: 'Legal name.' },
  { id: 'title', group: 'work', label: 'Job title', kind: 'text', required: false, help: 'Shown on your card.' },
  { id: 'team', group: 'work', label: 'Team', kind: 'select', required: true, help: 'Pick one.', options: ['Design', 'Engineering', 'Support', 'Finance'] },
  { id: 'manager', group: 'work', label: 'Manager', kind: 'text', required: false, help: 'Full name.' },
  { id: 'location', group: 'work', label: 'Location', kind: 'select', required: false, help: 'Main office.', options: ['Paris', 'Berlin', 'Lisbon', 'Remote'] },
  { id: 'language', group: 'preferences', label: 'Language', kind: 'text', required: false, help: 'Two letters.' },
  { id: 'timezone', group: 'preferences', label: 'Time zone', kind: 'text', required: true, help: 'IANA name.' },
  { id: 'digest', group: 'preferences', label: 'Weekly digest', kind: 'checkbox', required: false, help: 'Mondays at 9.' },
  { id: 'website', group: 'preferences', label: 'Website', kind: 'text', required: false, help: 'Starts with https.' },
  { id: 'notes', group: 'preferences', label: 'Notes', kind: 'textarea', required: false, help: 'Private notes.' },
];

export const FORM_GROUPS = [
  { id: 'profile', title: 'Profile' },
  { id: 'work', title: 'Work' },
  { id: 'preferences', title: 'Preferences' },
].map((group) => ({
  ...group,
  fields: FORM_FIELDS.filter((field) => field.group === group.id),
}));

export const CURRENT_USER = { id: 7, name: 'Grace Hopper', role: 'admin' };

// -- Model ------------------------------------------------------------------

const base = generate(settings.scale);

/**
 * A fresh model, never shared: SolidJS stores mutate the object they wrap.
 * @param {number} revision
 * @returns {Model}
 */
export function makeModel(revision = 0) {
  return structuredClone({
    revision,
    theme: 'light',
    unread: 7,
    search: '',
    menuOpen: false,
    tab: 'board',
    status: 'all',
    sortKey: 'name',
    sortDir: 'asc',
    compact: false,
    selected: null,
    ...base,
    form: {
      firstName: 'Grace',
      lastName: '',
      email: 'grace@example.com',
      phone: '',
      bio: '',
      company: '',
      title: 'Rear admiral',
      team: 'Engineering',
      manager: '',
      location: 'Paris',
      language: 'en',
      timezone: '',
      digest: true,
      website: '',
      notes: '',
    },
  });
}

/** Counts of the content that does not move: what the DOM must contain. */
export const expected = () => {
  const count = sizes(settings.scale);
  return { people: count.people };
};

const mapById = (list, id, change) =>
  list.map((entry) => (entry.id === id ? { ...entry, ...change(entry) } : entry));

/**
 * The only state machine. `action` is either a name used by the timing harness
 * or the object a component dispatches.
 * @param {Model} model
 * @param {Action} action
 * @returns {Model}
 */
export function reduce(model, action) {
  const a = typeof action === 'string' ? { type: action } : action;
  const next = { ...model, revision: model.revision + 1 };
  switch (a.type) {
    case 'toggle-one':
      return reduce(model, { type: 'toggle-task', id: model.tasks[0].id });
    case 'counter':
      return { ...next, unread: model.unread + 1 };
    case 'filter':
      return { ...next, status: model.status === 'all' ? 'active' : 'all' };
    case 'sort':
      return model.sortKey === 'name'
        ? { ...next, sortKey: 'score', sortDir: 'desc' }
        : { ...next, sortKey: 'name', sortDir: 'asc' };
    case 'tab':
      return { ...next, tab: model.tab === 'board' ? 'files' : 'board' };
    case 'theme':
      return { ...next, theme: model.theme === 'light' ? 'dark' : 'light' };
    case 'set-status':
      return { ...next, status: a.status };
    case 'set-sort':
      return {
        ...next,
        sortKey: a.key,
        sortDir:
          model.sortKey === a.key && model.sortDir === 'asc' ? 'desc' : 'asc',
      };
    case 'set-tab':
      return { ...next, tab: a.tab };
    case 'toggle-task':
      return {
        ...next,
        tasks: mapById(model.tasks, a.id, (task) => ({ done: !task.done })),
      };
    case 'like-task':
      return {
        ...next,
        tasks: mapById(model.tasks, a.id, (task) => ({ likes: task.likes + 1 })),
      };
    case 'pin-task':
      return {
        ...next,
        tasks: mapById(model.tasks, a.id, (task) => ({ pinned: !task.pinned })),
      };
    case 'select-person':
      return {
        ...next,
        selected: model.selected === a.id ? null : a.id,
      };
    case 'toggle-star':
      return {
        ...next,
        people: mapById(model.people, a.id, (person) => ({
          starred: !person.starred,
        })),
      };
    case 'toggle-flag':
      return {
        ...next,
        people: mapById(model.people, a.id, (person) => ({
          flagged: !person.flagged,
        })),
      };
    case 'search':
      return { ...next, search: a.value };
    case 'read-all':
      return { ...next, unread: 0 };
    case 'toggle-menu':
      return { ...next, menuOpen: !model.menuOpen };
    case 'density':
      return { ...next, compact: !model.compact };
    case 'noop':
      return next;
    case 'edit-field':
      return { ...next, form: { ...model.form, [a.id]: a.value } };
    default:
      throw new Error(`Unknown action ${JSON.stringify(action)}`);
  }
}

// -- Pure derivations (both frameworks call these from their own reactivity) -

const sortValue = { name: (p) => p.name, role: (p) => p.role, status: (p) => p.status, score: (p) => p.score, joined: (p) => p.joined };

/**
 * @param {Person[]} people
 * @param {Model['status']} status
 * @param {SortKey} key
 * @param {'asc' | 'desc'} dir
 */
export function visibleRows(people, status, key, dir) {
  const value = sortValue[key];
  const sign = dir === 'asc' ? 1 : -1;
  return people
    .filter((person) => status === 'all' || person.status === status)
    .sort((a, b) => {
      const left = value(a);
      const right = value(b);
      return left < right ? -sign : left > right ? sign : a.id - b.id;
    });
}

/** @param {Person[]} people @param {Task[]} tasks @param {number} unread */
export function stats(people, tasks, unread) {
  let active = 0;
  let total = 0;
  for (const person of people) {
    if (person.status === 'active') active++;
    total += person.score;
  }
  const done = tasks.filter((task) => task.done).length;
  return {
    people: people.length,
    active,
    done,
    open: tasks.length - done,
    unread,
    score: Math.round(total / Math.max(1, people.length)),
  };
}

/** @param {Task[]} tasks */
export function groupTasks(tasks) {
  /** @type {Record<Column, Task[]>} */
  const groups = { todo: [], doing: [], review: [], done: [] };
  for (const task of tasks) groups[task.column].push(task);
  return groups;
}

/** @param {Person[]} people */
export function statusCounts(people) {
  const counts = { all: people.length, active: 0, pending: 0, suspended: 0 };
  for (const person of people) counts[person.status]++;
  return counts;
}

// -- Pure formatting helpers -------------------------------------------------

/** @param {...(string | false | null | undefined)} parts */
export const cx = (...parts) => parts.filter(Boolean).join(' ');
/** @param {string} name */
export const initials = (name) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('');
/** @type {Record<string, string>} */
const GLYPHS = {
  home: '⌂', mail: '✉', check: '✓', calendar: '▦', file: '▤', search: '⌕',
  user: '☺', shield: '⛨', bolt: '⚡', card: '▭', star: '★', 'star-off': '☆',
  flag: '⚑', chat: '✎', gear: '⚙', download: '⇩', heart: '♥', bell: '♪',
  close: '×', up: '▲', down: '▼',
};
/** @param {string} name */
export const glyph = (name) => GLYPHS[name] ?? '?';
/** @param {string} status */
export const statusLabel = (status) =>
  status.charAt(0).toUpperCase() + status.slice(1);
/** @type {Record<string, string>} */
export const statusTone = { active: 'success', pending: 'warning', suspended: 'danger' };
/** @type {Record<string, string>} */
export const roleTone = { admin: 'info', editor: 'neutral', viewer: 'neutral' };
/** @param {number} value */
export const bucket = (value) => Math.round(value / 10) * 10;
/** @param {FieldDef} field @param {string | boolean} value */
export const isMissing = (field, value) =>
  field.required && field.kind !== 'checkbox' && String(value).trim() === '';
/** @param {number} shown @param {number} total */
export const pageSummary = (shown, total) => `${shown} of ${total} people`;
/** @param {number} unread */
export const unreadSummary = (unread) =>
  `${unread} unread ${unread === 1 ? 'message' : 'messages'}`;

// -- Timing harness ----------------------------------------------------------
//
// Same principle as common.js: a hidden control triggers each action, and the
// root's data-revision attribute reaching the expected revision stops the
// clock (a MutationObserver reads it, after the synchronous flush). mount and
// remount additionally wait for the footer and all table rows to exist.

let pending;
let currentUpdate;
let currentRemount;
let controlsInstalled = false;
const bench = (window.__bench = {
  bootstrapMs: undefined,
  started: undefined,
  revision: 0,
  mountNodes: undefined,
});

export function begin() {
  bench.started = performance.now();
}
/** The revision a freshly mounted page starts at: the one the harness waits for. */
export function startRevision() {
  return pending?.revision ?? 0;
}
export function installHandlers({ update, remount }) {
  currentUpdate = update;
  currentRemount = remount;
  if (controlsInstalled) return;
  controlsInstalled = true;
  for (const button of document.querySelectorAll('[data-action]'))
    button.addEventListener('click', () => {
      const start = performance.now();
      if (button.dataset.action === 'remount') currentRemount();
      else currentUpdate(button.dataset.action);
      if (pending) pending.dispatchMs = performance.now() - start;
    });
}

const mount = document.getElementById('mount');
const countNodes = () => mount.querySelectorAll('*').length;
function fullyMounted() {
  return (
    mount.querySelector('footer.footer') !== null &&
    mount.querySelectorAll('tr[data-person]').length === expected().people
  );
}
const observer = new MutationObserver(() => {
  const root = mount.querySelector('[data-page-root]');
  if (!root) return;
  const revision = Number(root.dataset.revision);
  if (bench.bootstrapMs === undefined && fullyMounted()) {
    bench.bootstrapMs = performance.now() - bench.started;
    bench.mountNodes = countNodes();
  }
  if (pending && revision === pending.revision) {
    if (pending.remount && !fullyMounted()) return;
    const { resolve, started, dispatchMs, timeout } = pending;
    const domMs = performance.now() - started;
    pending = undefined;
    clearTimeout(timeout);
    bench.revision = revision;
    resolve({ domMs, dispatchMs, nodes: countNodes() });
  }
});
observer.observe(mount, {
  subtree: true,
  childList: true,
  attributes: true,
  characterData: true,
});
bench.run = (action) =>
  new Promise((resolve, reject) => {
    if (pending) throw new Error('Overlapping benchmark actions');
    const timeout = setTimeout(() => {
      pending = undefined;
      reject(new Error(`Timed out: ${action}`));
    }, 15000);
    pending = {
      resolve,
      started: performance.now(),
      revision: bench.revision + 1,
      remount: action === 'remount',
      timeout,
    };
    document.querySelector(`[data-action="${action}"]`).click();
  });

// -- Normalized DOM (used by the equivalence check) --------------------------

/**
 * A comparable serialization of the mounted page: no comments, no
 * framework-only attributes, attributes sorted, adjacent text merged, and the
 * live value of form controls (a property, not an attribute).
 */
bench.snapshot = () => {
  const skip = (name) => name.startsWith('data-craft-') || name.startsWith('data-hk');
  const walk = (node, out) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.data !== '') out.push(node.data);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.localName;
    const attrs = [...node.attributes]
      .filter((attr) => !skip(attr.name))
      .map((attr) => `${attr.name}="${attr.value}"`)
      .sort();
    if (tag === 'input' || tag === 'textarea' || tag === 'select')
      attrs.push(`.value="${node.value}"`);
    if (tag === 'input') attrs.push(`.checked=${node.checked}`);
    if (tag === 'option') attrs.push(`.selected=${node.selected}`);
    if (tag === 'button' || tag === 'input') attrs.push(`.disabled=${node.disabled}`);
    out.push(`<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>`);
    for (const child of node.childNodes) walk(child, out);
    out.push(`</${tag}>`);
  };
  const parts = [];
  walk(mount, parts);
  // merge adjacent text pieces, then one entry per line for readable diffs
  const lines = [];
  for (const part of parts) {
    if (!part.startsWith('<') && lines.length && !lines.at(-1).startsWith('<'))
      lines[lines.length - 1] += part;
    else lines.push(part);
  }
  return lines.join('\n');
};

/** @param {string} kind */
export const fileIcon = (kind) =>
  kind === 'image'
    ? 'star'
    : kind === 'sheet'
      ? 'calendar'
      : kind === 'archive'
        ? 'download'
        : 'file';
/** @param {FieldDef} field */
export const fieldLabel = (field) => field.label + (field.required ? ' *' : '');
/** @param {ReturnType<typeof stats>} values @param {string} id */
export const statValue = (values, id) =>
  String(values[/** @type {keyof typeof values} */ (id)]);
/** @param {Column} id @param {ReturnType<typeof groupTasks>} groups */
export const columnTasks = (groups, id) => groups[id];
