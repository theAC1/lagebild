import 'maplibre-gl/dist/maplibre-gl.css';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { appBereit } from './lib/update.svelte.ts';

mount(App, { target: document.getElementById('app')! });
appBereit();
