<script setup lang="ts">
import { withBase } from 'vitepress';
</script>

<template>
  <section class="author-note" aria-label="A note from the author">
    <span class="author-note__photo-frame">
      <img
        class="author-note__photo"
        :src="withBase('/assets/romain-geffrault.png')"
        alt="Romain Geffrault, creator of @craft-ng"
        width="132"
        height="132"
      />
    </span>
    <figure class="author-note__body">
      <blockquote>
        <p>
          I built @craft-ng around one priority: robustness. Applications that
          stay solid over time, composed from the smallest possible pieces —
          so the people who use them inherit a reliability they never have to
          think about.
        </p>
        <p>
          The project is open to every suggestion and improvement that can take
          that robustness further.
        </p>
      </blockquote>
      <figcaption>
        <strong>Romain Geffrault</strong>
        <span>creator of @craft-ng</span>
      </figcaption>
    </figure>
  </section>
</template>
