// 02 Slow Scan: the picture arrives the way night radio can send one,
// slow-scan television, painted row by row from the top. Each row lands grey
// and overexposed, a little off to the side, wobbles and locks in place, and
// the colour follows a few rows behind, so the front of the scan is lit by
// the picture itself. The caption comes once the picture is in. Leaving, the
// rows that are in drop out from the bottom up.
//
// Each card names its picture in data-picture, and its label and text are the
// caption under it. The picture is cut into rows of whole pixels, each with
// a grey layer and a colour layer; only opacity and transforms animate. The
// grey picture is drawn once per picture, not filtered in every row.

import {isHidden, urlOf} from '../hoverCards.js';

const settings = {
    // the height of a row, in px
    row: 8,
    // the picture's shape, the one slow-scan television sends (320 × 256)
    ratio: 5 / 4,
    // the scan from the top row to the bottom one, in seconds
    scanDuration: 1,
    // how long after the grey the colour arrives, and how long it takes, in seconds
    colourLag: 0.25,
    colourDuration: 0.3,
    // how far off to the side a row lands, at most, in px
    wobble: 104,
    // how far the other way it swings before it locks, as a part of where it landed
    swing: 7,
    // leaving, from the bottom row to the top one of a whole picture, in seconds
    closeDuration: 0.35,
    // the grey picture: how much brighter than the colour one (1 for as bright), and its contrast
    exposure: 1.2,
    contrast: 1.05,
};

// The grey, overexposed version of each picture, as an object URL, drawn once
// in a canvas: grey as CSS grayscale() weighs the colours, then brightened and
// given contrast as brightness() and contrast() would
const greys = new Map();
const greyOf = src => {
    if (!greys.has(src)) {
        const image = new Image();
        image.src = src;
        const grey = image.decode().then(() => {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            const data = pixels.data;
            for (let i = 0; i < data.length; i += 4) {
                const light = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
                // the array clamps each value to 0–255
                data[i] =
                    data[i + 1] =
                    data[i + 2] =
                        ((light * settings.exposure - 0.5) * settings.contrast + 0.5) * 255;
            }
            context.putImageData(pixels, 0, 0);
            return new Promise(resolve => canvas.toBlob(blob => resolve(URL.createObjectURL(blob))));
        });
        greys.set(src, grey);
    }
    return greys.get(src);
};

// each card's picture: {picture, rows, colours, width}
const pictures = new WeakMap();

// Cuts the card's picture into rows for the card's current width, once per width
const build = card => {
    const width = card.clientWidth;
    const known = pictures.get(card);
    if (known?.width === width) return;

    const count = Math.round(width / settings.ratio / settings.row);
    const height = count * settings.row;
    const picture = known?.picture ?? document.createElement('div');
    picture.className = 'scan';
    picture.setAttribute('aria-hidden', 'true');
    picture.style.height = `${height}px`;
    // absolute, since a url() in a custom property resolves against the stylesheet using it
    const src = urlOf(card.dataset.picture);
    picture.style.setProperty('--picture', `url(${src})`);
    greyOf(src).then(grey => picture.style.setProperty('--grey', `url(${grey})`));

    const rows = [];
    const colours = [];
    for (let i = 0; i < count; i++) {
        const row = document.createElement('div');
        row.className = 'scan__row';
        row.style.top = `${i * settings.row}px`;
        row.style.height = `${settings.row}px`;
        // each layer is the whole picture, moved up so the row shows its own slice
        ['grey', 'colour'].forEach(kind => {
            const layer = document.createElement('div');
            layer.className = `scan__${kind}`;
            layer.style.top = `${-i * settings.row}px`;
            layer.style.height = `${height}px`;
            row.append(layer);
        });
        rows.push(row);
        colours.push(row.lastChild);
    }
    picture.replaceChildren(...rows);
    if (!known) card.prepend(picture);
    pictures.set(card, {picture, rows, colours, width});
};

const captionOf = card => card.querySelectorAll('.card__label, .card__text');

export const slowScan = {
    // the picture beside the paragraph, on the word's line
    place: 'beside',
    // the pictures start loading with the page
    setup(section) {
        section.querySelectorAll('.card[data-picture]').forEach(build);
    },
    // a new width, a new cut
    prepare: build,
    open(card) {
        const {rows, colours} = pictures.get(card);
        const caption = captionOf(card);
        const each = settings.scanDuration / rows.length;
        const tl = gsap.timeline();

        // caught while leaving, it comes straight back
        if (!isHidden(card)) {
            return tl
                .to(rows, {autoAlpha: 1, x: 0, duration: 0.2}, 0)
                .to([...colours, ...caption], {opacity: 1, duration: 0.2}, 0);
        }

        gsap.set(card, {autoAlpha: 1});
        gsap.set(rows, {autoAlpha: 0, x: () => gsap.utils.random(-settings.wobble, settings.wobble)});
        gsap.set([...colours, ...caption], {opacity: 0});
        return tl
            .to(rows, {autoAlpha: 1, duration: 0.04, stagger: each}, 0)
            .to(
                rows,
                {
                    x: (i, row) => -gsap.getProperty(row, 'x') * settings.swing,
                    duration: 0.1,
                    ease: 'power1.out',
                    stagger: each,
                },
                0.04,
            )
            .to(rows, {x: 0, duration: 0.25, ease: 'power2.out', stagger: each}, 0.14)
            .to(
                colours,
                {opacity: 1, duration: settings.colourDuration, ease: 'power1.inOut', stagger: each},
                settings.colourLag,
            )
            .to(caption, {opacity: 1, duration: 0.4, stagger: 0.08}, settings.scanDuration);
    },
    close(card) {
        const {rows} = pictures.get(card);
        // only the rows already in, from the lowest one up, so leaving mid-scan starts at once
        const shown = rows.filter(row => !isHidden(row));
        const tl = gsap.timeline().to(captionOf(card), {opacity: 0, duration: 0.15}, 0);
        if (shown.length) {
            tl.to(
                shown,
                {
                    autoAlpha: 0,
                    x: () => gsap.utils.random(-settings.wobble, settings.wobble),
                    duration: 0.06,
                    stagger: {each: settings.closeDuration / rows.length, from: 'end'},
                },
                0,
            );
        }
        return tl.set(rows, {autoAlpha: 0}).set(card, {autoAlpha: 0});
    },
};
