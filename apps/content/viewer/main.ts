import 'highlight.js/styles/github.css';
import './viewer.css';
import type { ViewerData } from '@superlibrary/contract';
import { h } from './dom';
import { applyTheme, listenForLinks, listenForTheme, reportExpiredMedia, reportHeight, themeFromQuery } from './protocol';
import { render } from './render';

const data = JSON.parse(document.getElementById('sl-data')!.textContent!) as ViewerData;
const app = document.getElementById('app')!;
// No theme in the URL and no message from the host: the system's (the stylesheet's default).
const initial = themeFromQuery(location.search);
if (initial) applyTheme(initial);
listenForTheme(data.host, (theme) => applyTheme(theme));
listenForLinks(data.host, app);
reportExpiredMedia(data.host, data);
render(app, data)
  .catch((e: unknown) => {
    app.replaceChildren(h('p', { class: 'note' }, `This file could not be shown: ${e instanceof Error ? e.message : String(e)}`));
  })
  .finally(() => reportHeight(data.host));
