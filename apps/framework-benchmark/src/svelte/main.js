import { mount } from 'svelte';
import App from './App.svelte';
import { begin } from '../common.js';
begin();
mount(App, { target: document.getElementById('mount') });
