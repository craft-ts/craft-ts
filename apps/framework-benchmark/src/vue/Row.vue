<script setup>
import { settings } from '../common.js';
defineProps(['row', 'position']);
</script>
<template>
  <div :data-row="row.id">
    <span v-if="settings.indexes" :data-position="position"
      >{{ position + 1 }}. </span
    >{{ row.label }}
  </div>
</template>
