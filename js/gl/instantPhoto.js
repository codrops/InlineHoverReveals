// An instant photo developing, drawn in WebGL: it comes out of the camera a
// blank, pale, milky blue-grey, and the picture rises out of it the way
// instant film's does, the highlights first and the shadows last, faint and cold to
// begin with, its colour and contrast coming in towards the end. The
// chemistry spreads unevenly, in soft blotches, and a little ahead at the
// edge that left the camera first.
//
// develop is how far it has got, 0 to 1, and topFirst whether its top edge
// left the camera first (else its bottom edge); render() draws it. Without WebGL the
// picture shows as an image under a murky layer that fades away.

import {loaded} from '../hoverCards.js';
import {SQUARE, positionsOf, programOf, textureOf} from './program.js';

const settings = {
    // the blank, milky blue-grey the picture rises out of
    murk: [0.66, 0.7, 0.72],
    // how much earlier the highlights clear than the shadows, how uneven the chemistry is, and
    // how far ahead it is at the edge that left the camera first
    highlightsFirst: 0.6,
    blotches: 0.18,
    edgeFirst: 0.12,
    // the cold cast it starts with, and how faded the finished picture is (its blacks lifted)
    cold: [0.82, 0.98, 1.08],
    fade: 0.05,
    // the emulsion's grain
    grain: 0.035,
};

const VERTEX = /* glsl */ `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
    vUv = vec2(aPosition.x * 0.5 + 0.5, 0.5 - aPosition.y * 0.5);
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision mediump float;

uniform sampler2D uPhoto;
uniform float uDevelop;
uniform float uSeed;
uniform vec3 uMurk;
uniform vec3 uCold;
uniform float uHighlightsFirst;
uniform float uBlotches;
uniform float uEdgeFirst;
uniform float uTopFirst;
uniform float uFade;
uniform float uGrain;

varying vec2 vUv;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
    vec3 picture = texture2D(uPhoto, vUv).rgb;
    float lum = dot(picture, vec3(0.299, 0.587, 0.114));

    // how far the chemistry has got here: behind in its blotches, ahead at the edge that left
    // the camera first
    float lead = mix(1.0 - vUv.y, vUv.y, uTopFirst);
    float lag = noise(vUv * 3.0) * uBlotches + lead * uEdgeFirst;
    float t = clamp(uDevelop * (1.0 + uBlotches + uEdgeFirst) - lag, 0.0, 1.0);

    // the murk clears from the highlights down into the shadows
    float clear = smoothstep(0.0, 1.0, t * (1.0 + uHighlightsFirst) - (1.0 - lum) * uHighlightsFirst);

    // faint, grey and cold at first; colour and contrast come in towards the end
    float tone = smoothstep(0.25, 1.0, t);
    vec3 colour = mix(vec3(lum), picture, tone);
    colour *= mix(uCold, vec3(1.0), tone);
    colour = mix(vec3(0.5), colour, mix(0.55, 1.0, tone));
    colour = colour * (1.0 - uFade * 2.0) + uFade;

    vec3 photo = mix(uMurk, colour, clear);
    photo += (hash(floor(vUv * 400.0)) - 0.5) * uGrain;
    gl_FragColor = vec4(photo, 1.0);
}
`;

export class InstantPhoto {
    develop = 0;
    topFirst = false;

    constructor(holder, src) {
        this.holder = holder;
        this.image = new Image();
        this.image.src = src;
        this.image.alt = '';
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl');
        if (gl) this.#setUpGl(canvas, gl);
        else this.#setUpFallback();
        this.ready = loaded(this.image).then(() => this.#upload());
    }

    get works() {
        return Boolean(this.gl);
    }

    #setUpGl(canvas, gl) {
        this.gl = gl;
        this.canvas = canvas;
        canvas.className = 'instant__canvas';
        this.holder.append(canvas);

        const program = programOf(gl, VERTEX, FRAGMENT);
        positionsOf(gl, program, SQUARE);

        const uniform = name => gl.getUniformLocation(program, name);
        this.uDevelop = uniform('uDevelop');
        this.uTopFirst = uniform('uTopFirst');
        gl.uniform1f(uniform('uSeed'), Math.random() * 100);
        gl.uniform3f(uniform('uMurk'), ...settings.murk);
        gl.uniform3f(uniform('uCold'), ...settings.cold);
        gl.uniform1f(uniform('uHighlightsFirst'), settings.highlightsFirst);
        gl.uniform1f(uniform('uBlotches'), settings.blotches);
        gl.uniform1f(uniform('uEdgeFirst'), settings.edgeFirst);
        gl.uniform1f(uniform('uFade'), settings.fade);
        gl.uniform1f(uniform('uGrain'), settings.grain);

        textureOf(gl);
    }

    #setUpFallback() {
        this.image.className = 'instant__image';
        this.murk = document.createElement('span');
        this.murk.className = 'instant__murk';
        this.murk.style.backgroundColor = `rgb(${settings.murk.map(v => Math.round(v * 255)).join(' ')})`;
        this.holder.append(this.image, this.murk);
    }

    // The picture into the GPU, and the canvas sized to its holder; then one unseen drawing,
    // sent to the GPU now, so it's ready before the first hover
    #upload() {
        if (!this.gl) return;
        const {gl} = this;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, this.image);
        this.resize();
        gl.flush();
    }

    resize() {
        if (!this.gl) return;
        const ratio = Math.min(window.devicePixelRatio, 2);
        const size = Math.round(this.holder.clientWidth * ratio);
        if (this.canvas.width === size) return;
        this.canvas.width = this.canvas.height = size;
        this.gl.viewport(0, 0, size, size);
        this.render();
    }

    render() {
        if (!this.gl) {
            this.murk.style.opacity = 1 - this.develop;
            return;
        }
        this.gl.uniform1f(this.uDevelop, this.develop);
        this.gl.uniform1f(this.uTopFirst, this.topFirst ? 1 : 0);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }
}
