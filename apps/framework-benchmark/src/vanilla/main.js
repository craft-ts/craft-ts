import {
  initialModel,
  visibleRows,
  reduce,
  settings,
  begin,
  installActionHandler,
} from '../common.js';
begin();
let model = initialModel;
const list = document.createElement('div');
list.id = 'rows';
let entries = new Map();
function patch() {
  const next = new Map();
  const visible = visibleRows(model);
  const keys = new Set(visible.map((row) => row.id));
  for (const [id, entry] of entries) if (!keys.has(id)) entry.node.remove();
  let cursor = list.firstChild;
  for (const [index, row] of visible.entries()) {
    let entry = entries.get(row.id);
    if (!entry) {
      const node = document.createElement('div');
      node.dataset.row = String(row.id);
      const position = settings.indexes ? document.createElement('span') : null;
      if (position) node.append(position);
      const text = document.createTextNode(row.label);
      node.append(text);
      entry = { node, text, position };
    }
    if (entry.text.data !== row.label) entry.text.data = row.label;
    if (entry.position && entry.position.dataset.position !== String(index)) {
      entry.position.dataset.position = String(index);
      entry.position.textContent = `${index + 1}. `;
    }
    if (entry.node !== cursor) list.insertBefore(entry.node, cursor);
    else cursor = cursor.nextSibling;
    next.set(row.id, entry);
  }
  entries = next;
  list.dataset.revision = String(model.revision);
}
patch();
document.getElementById('mount').append(list);
installActionHandler((action) => {
  model = reduce(model, action);
  patch();
});
