// Reference renderer for the redesigned day summary (Heily). Plain DOM, no deps.
// Sprout: adapt field names to the post-care-remap `out`; everything else is presentation.
// renderSummaryCard(cardEl, data, { night, art }) where
//   data = { eyebrow, title, hero: { icon, num, text, art? },
//            garden: [{ kind: 'grew'|'harvest'|'resting'|'ready'|'unlock', icon, plantImg?, name, meta }],
//            sun: { value, src } | null,
//            care: [{ key: 'water'|'fertilizer'|'stake'|'harvest', label, value, src }] | null,
//            note }
(function (root) {
    'use strict';
    const MAX_GARDEN_ROWS = 3;
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function img(src, cls) { const i = new Image(); i.src = src; i.alt = ''; if (cls) i.className = cls; return i; }
    function renderSummaryCard(card, d, opts) {
        const o = opts || {}; const night = !!o.night;
        // the summary card stays cream at night, so the day-painted icons read best on it; pass iconSuffix:'-night' to override
        const sfx = o.iconSuffix || '';
        const CARE = (o.art || '../assets/ui/care/'); const SUM = (o.sumArt || '../assets/ui/summary/');
        card.className = 'sg-summary'; card.dataset.mode = night ? 'night' : 'day'; card.textContent = '';
        const head = el('header', 'sum-head');
        head.append(el('p', 'sum-eyebrow', d.eyebrow), el('h1', 'sum-title', d.title));
        card.append(head);
        const scroll = el('div', 'sum-scroll');
        if (d.hero && d.hero.art) scroll.append(img(SUM + d.hero.art, 'sum-hero-art'));
        if (d.hero) {
            const hero = el('div', 'sum-hero');
            const ic = el('div', 'sum-hero-icon'); ic.append(img(CARE + d.hero.icon + sfx + '.png'));
            const line = el('div', 'sum-hero-line');
            if (d.hero.num != null) line.append(el('span', 'sum-hero-num', String(d.hero.num)));
            line.append(el('span', 'sum-hero-text', d.hero.text));
            hero.append(ic, line); scroll.append(hero);
        }
        if (d.garden && d.garden.length) {
            const ul = el('ul', 'sum-garden');
            d.garden.slice(0, MAX_GARDEN_ROWS).forEach((g) => {
                const li = el('li', 'is-' + g.kind);
                li.append(g.plantImg ? img(g.plantImg, 'plant') : img(CARE + g.icon + sfx + '.png'));
                const t = el('span'); t.append(el('span', 'name', g.name), document.createTextNode(' '), el('span', 'meta', g.meta));
                li.append(t); ul.append(li);
            });
            if (d.garden.length > MAX_GARDEN_ROWS) ul.append(el('li', 'more', `+${d.garden.length - MAX_GARDEN_ROWS} more in your journal`));
            scroll.append(ul);
        }
        card.append(scroll);
        if (d.sun || d.care) {
            card.append(el('div', 'sum-divider'));
            const sec = el('section', 'sum-care');
            sec.append(el('h2', 'sum-label', d.careLabel || "Today's care"));
            if (d.sun) {
                const s = el('div', 'sum-sun');
                const txt = el('div'); txt.append(el('span', 'k', 'Sunlight'), el('span', 'src', d.sun.src));
                const v = el('span', 'v' + (d.sun.quiet ? ' quiet' : ''), d.sun.value);
                s.append(img(CARE + (d.sun.icon || 'sun-glow-3') + sfx + '.png'), txt, v); sec.append(s);
            }
            if (d.care) {
                const grid = el('div', 'sum-care-grid');
                const ICON = { water: 'icon-water', fertilizer: 'icon-fertilizer', stake: 'icon-stake', harvest: 'harvest-prompt-64' };
                d.care.forEach((c) => {
                    const cell = el('div', 'sum-cell is-' + c.key);
                    const txt = el('div'); const r1 = el('div', 'row1');
                    r1.append(el('span', 'k', c.label), el('span', 'v' + (c.quiet ? ' quiet' : ''), c.value));
                    txt.append(r1, el('span', 'src', c.src));
                    cell.append(img(CARE + ICON[c.key] + sfx + '.png'), txt); grid.append(cell);
                });
                sec.append(grid);
            }
            card.append(sec);
        }
        if (d.note) card.append(el('p', 'sum-note', d.note));
        const actions = el('div', 'actions');
        const j = el('button', 'btn btn-soft', '📖 Journal'); j.id = 'btn-sum-journal'; j.type = 'button';
        const b = el('button', 'btn btn-primary', 'Back to the garden'); b.id = 'btn-sum-done'; b.type = 'button';
        actions.append(j, b); card.append(actions);
        return { journal: j, done: b };
    }
    root.renderSummaryCard = renderSummaryCard;
})(typeof window !== 'undefined' ? window : globalThis);
