// Entry point. Mounts the UI; all game rules live in src/core.

import { mount } from './ui/app';

const root = document.querySelector<HTMLElement>('#app');
if (root) mount(root);
