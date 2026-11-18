import React, { memo, useState, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  initialModel,
  visibleRows,
  reduce,
  settings,
  begin,
  installActionHandler,
} from '../common.js';
const h = React.createElement;
const Row = memo(function Row({ row, position }) {
  return h(
    'div',
    { 'data-row': row.id },
    settings.indexes
      ? h('span', { 'data-position': position }, `${position + 1}. `)
      : null,
    row.label,
  );
});
function App() {
  const [model, setModel] = useState(initialModel);
  useLayoutEffect(() => {
    installActionHandler((action) =>
      setModel((previous) => reduce(previous, action)),
    );
  }, []);
  return h(
    'div',
    { id: 'rows', 'data-revision': model.revision },
    visibleRows(model).map((row, i) =>
      h(Row, { key: row.id, row, position: settings.indexes ? i : 0 }),
    ),
  );
}
begin();
createRoot(document.getElementById('mount')).render(h(App));
