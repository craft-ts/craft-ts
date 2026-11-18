<script setup>
import { shallowRef, computed } from 'vue';
import Row from './Row.vue';
import {
  initialModel,
  visibleRows,
  reduce,
  settings,
  installActionHandler,
} from '../common.js';
const model = shallowRef(initialModel);
const visible = computed(() => visibleRows(model.value));
installActionHandler((action) => {
  model.value = reduce(model.value, action);
});
</script>
<template>
  <div id="rows" :data-revision="model.revision">
    <Row
      v-for="(row, i) in visible"
      :key="row.id"
      :row="row"
      :position="settings.indexes ? i : 0"
    />
  </div>
</template>
