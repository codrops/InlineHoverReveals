import {reducedMotion, setUpHoverCards} from './hoverCards.js';
import {backdrop} from './variations/backdrop.js';
import {slowScan} from './variations/slowScan.js';
import {orbit} from './variations/orbit.js';
import {filmstrip} from './variations/filmstrip.js';
import {entry} from './variations/entry.js';
import {signal} from './variations/signal.js';
import {onAir} from './variations/onAir.js';
import {afterglow} from './variations/afterglow.js';
import {instant} from './variations/instant.js';
import {doors} from './variations/doors.js';
import {departures} from './variations/departures.js';
import {scrub} from './variations/scrub.js';
import {rewind} from './variations/rewind.js';
import {slats} from './variations/slats.js';
import {register} from './variations/register.js';
import {focusPull} from './variations/focusPull.js';

gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText);

// How each section's cards look, open and close, by its data-variation name
const looks = {
    'backdrop': backdrop,
    'slow-scan': slowScan,
    'orbit': orbit,
    'filmstrip': filmstrip,
    'entry': entry,
    'signal': signal,
    'on-air': onAir,
    'afterglow': afterglow,
    'instant': instant,
    'doors': doors,
    'departures': departures,
    'scrub': scrub,
    'rewind': rewind,
    'slats': slats,
    'register': register,
    'focus-pull': focusPull,
};

// set while an in-page link moves the focus to where the page is already scrolling
let isLinkFocus = false;

// visitors who prefer reduced motion get native scrolling
const smoother = reducedMotion
    ? null
    : ScrollSmoother.create({
          wrapper: '#smooth-wrapper',
          content: '#smooth-content',
          smooth: 1,
          // the smoother scrolls to whatever takes the focus, except there
          onFocusIn: () => !isLinkFocus,
      });

// on touch screens the words are tapped
if (window.matchMedia('(hover: none)').matches) {
    document.querySelector('.intro__hint').textContent = 'Tap the words that stand out.';
}

// The variation numbers again, in a bar fixed at the top centre once the
// frame has scrolled out of view, with the variation on screen marked
const pager = document.createElement('nav');
pager.className = 'pager';
pager.setAttribute('aria-label', 'Jump to variation');
pager.append(...[...document.querySelectorAll('.frame__demo')].map(link => link.cloneNode(true)));

document.body.prepend(pager);
const setPagerVisible = isVisible => pager.classList.toggle('is-visible', isVisible);

// shown from the moment the frame's bottom passes the top of the screen, all
// the way down, and hidden again only back above it
const showPager = ScrollTrigger.create({
    trigger: '.frame',
    start: 'bottom top',
    onEnter: () => setPagerVisible(true),
    onLeaveBack: () => setPagerVisible(false),
});
const syncPager = () => setPagerVisible(showPager.scroll() > showPager.start);
syncPager();
ScrollTrigger.addEventListener('refresh', syncPager);

// the variation whose top has passed the middle of the screen is marked; the
// last one stays marked down to the end of the page, and none above the first
const pagerLinks = [...pager.querySelectorAll('a')];
const markCurrent = id => {
    pagerLinks.forEach(link => {
        if (link.getAttribute('href') === `#${id}`) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
    });
};
document.querySelectorAll('[data-variation]').forEach((section, index) => {
    const trigger = ScrollTrigger.create({
        trigger: section,
        start: 'top center',
        end: 'bottom center',
        onEnter: () => markCurrent(section.id),
        onEnterBack: () => markCurrent(section.id),
        onLeaveBack: () => index === 0 && markCurrent(null),
    });
    if (trigger.scroll() > trigger.start) markCurrent(section.id);
});

// In-page links (the variation numbers, back to top) go through the smoother
// too; the words that open cards are links only for the keyboard and screen readers
document.querySelectorAll('a[href^="#"]:not(.term)').forEach(link => {
    link.addEventListener('click', ev => {
        const target = document.querySelector(link.getAttribute('href'));
        if (!target) return;
        ev.preventDefault();
        // a variation stops with its heading just under the bar of numbers
        const offset = target.matches('[data-variation]') ? pager.offsetTop + pager.offsetHeight + 12 : 0;
        if (smoother) smoother.scrollTo(target, true, `top ${offset}px`);
        else window.scrollTo({top: target.getBoundingClientRect().top + window.scrollY - offset});
        // keyboard focus and the address follow
        target.tabIndex = -1;
        isLinkFocus = true;
        target.focus({preventScroll: true});
        isLinkFocus = false;
        history.pushState(null, '', link.getAttribute('href'));
    });
});

// once the fonts are in, so the looks that split or measure the text get it right
document.fonts.ready.then(() => setUpHoverCards({looks}));
