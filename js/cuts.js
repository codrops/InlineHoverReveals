// Cards cut into the paragraph itself (10 Doors, 14 Slats): a piece of whole
// lines of the paragraph, just above or below the trigger's line, faced with a
// copy of the paragraph's own text, letter for letter over the page's, so it
// looks like the page until it moves; the card, behind it, covers the page's
// text there. Where the cut goes, the copy of the text, and what happens when
// two cuts overlap.

import {bounds, pageMargin} from './hoverCards.js';

// Where the cut goes, in screen px: whole lines of the paragraph, on screen, at least height px
// tall (rounded up to whole lines) and as wide as aspect times its height, never wider than the
// paragraph (with even, a width in even px, to halve). Just above the trigger's line if there are
// enough lines there, else just below it; else fewer, two at least, on whichever side has more of
// them. Where none of that fits on screen, fallback says: 'screen', full size on whichever side
// has more room on screen, past the paragraph's text; 'lines', as many of the paragraph's lines as
// are on screen, on whichever side has more of them. Across, centred on the trigger, inside the paragraph and the screen's
// margins. Returns {left, top, width, height, count, lineHeight, side}, side 'top' or 'bottom'.
export const cutFor = (term, statement, {height: least, aspect, even = false, fallback}) => {
    const root = document.documentElement;
    const margin = pageMargin();
    const lineHeight = parseFloat(getComputedStyle(statement).lineHeight);
    const text = statement.getBoundingClientRect();
    const word = term.getBoundingClientRect();
    const lines = Math.round(text.height / lineHeight);
    const line = Math.floor((word.top + word.height / 2 - text.top) / lineHeight);
    const rows = Math.ceil(least / lineHeight);
    const {roof, floor} = bounds();

    // where n lines above or below the trigger's line would start, and whether they're on screen
    const topOf = (side, n) => text.top + (side === 'top' ? line - n : line + 1) * lineHeight;
    const fits = (side, n) => (side === 'top' ? topOf('top', n) >= roof : topOf('bottom', n) + n * lineHeight <= floor);
    // the paragraph's lines on each side
    const room = {top: line, bottom: lines - line - 1};

    let side = ['top', 'bottom'].find(s => room[s] >= rows && fits(s, rows));
    let count = rows;
    if (!side) {
        const sides = room.top >= room.bottom ? ['top', 'bottom'] : ['bottom', 'top'];
        side = sides.find(s => room[s] >= 2 && fits(s, Math.min(rows, room[s])));
        if (side) count = Math.min(rows, room[side]);
        else if (fallback === 'screen') {
            side = topOf('top', rows) + rows * lineHeight - roof >= floor - topOf('bottom', rows) ? 'top' : 'bottom';
        } else {
            // as many of the paragraph's lines as are on screen, on whichever side has more of them
            const onScreen = s => {
                let n = 0;
                while (n < Math.min(rows, room[s]) && fits(s, n + 1)) n++;
                return n;
            };
            side = onScreen('bottom') > onScreen('top') ? 'bottom' : 'top';
            count = Math.max(1, onScreen(side));
        }
    }

    const height = count * lineHeight;
    const step = even ? 2 : 1;
    const width = Math.min(Math.round((height * aspect) / step) * step, Math.floor(text.width / step) * step);
    const first = Math.max(text.left, margin);
    const last = Math.max(first, Math.min(text.right, root.clientWidth - margin) - width);
    const left = Math.round(gsap.utils.clamp(first, last, word.left + word.width / 2 - width / 2));
    return {left, top: topOf(side, count), width, height, count, lineHeight, side};
};

// A copy of the block's text, the label and the paragraph, to face a cut with: name__text, its
// triggers turned into words that only look like them (name__term), so only the page's own open
// cards
export const copyOf = (block, name) => {
    const copy = block.cloneNode(true);
    copy.className = `${name}__text`;
    copy.querySelector('.cards').remove();
    copy.querySelectorAll('a').forEach(link => {
        const word = document.createElement('span');
        word.className = `${name}__term`;
        word.textContent = link.textContent;
        link.replaceWith(word);
    });
    return copy;
};

// each card's closing, while it runs
const closings = new WeakMap();

// Keeps a card's closing, so a card opening over it can hurry it; returns it
export const closing = (card, tl) => {
    closings.set(card, tl);
    return tl;
};

// Going from one trigger to another whose cut overlaps the last: the card opening goes over the
// one still closing, which closes speed times faster
export const handOver = (card, block, speed) => {
    card.style.zIndex = 11;
    block.querySelectorAll('.card').forEach(other => {
        if (other === card) return;
        other.style.zIndex = '';
        const tl = closings.get(other);
        if (tl && tl.progress() < 1) tl.timeScale(speed);
    });
};
