import './viewer.css';

const data = JSON.parse(document.getElementById('sl-data')!.textContent!) as { name: string; mediaType: string; bytes: number; sha256: string };
const card = document.createElement('dl');
card.className = 'card';
for (const [k, v] of [['Name', data.name], ['Type', data.mediaType], ['Size', `${data.bytes} bytes`], ['SHA-256', data.sha256]]) {
  card.append(Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: v }));
}
document.getElementById('app')!.replaceChildren(card);
