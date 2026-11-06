import { render } from 'solid-js/web';
import { For, batch, createSignal } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import {
  initialModel,
  visibleRows,
  reduce,
  settings,
  begin,
  installActionHandler,
} from '../common.js';
function Row(props) {
  return (
    <div data-row={props.row.id}>
      {settings.indexes ? (
        <span data-position={props.position}>{props.position + 1}. </span>
      ) : null}
      {props.row.label}
    </div>
  );
}
function App() {
  let model = initialModel;
  const [rows, setRows] = createStore(visibleRows(model));
  const [revision, setRevision] = createSignal(0);
  installActionHandler((action) =>
    batch(() => {
      model = reduce(model, action);
      // The store matches by id, retaining objects and DOM across immutable row updates.
      setRows(reconcile(visibleRows(model), { key: 'id' }));
      setRevision(model.revision);
    }),
  );
  return (
    <div id="rows" data-revision={revision()}>
      <For each={rows}>
        {(row, i) => <Row row={row} position={settings.indexes ? i() : 0} />}
      </For>
    </div>
  );
}
begin();
render(() => <App />, document.getElementById('mount'));
