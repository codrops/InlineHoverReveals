// Text tuning in out of static, drawn in WebGL over the text it becomes. A few
// specks of static appear around where the text will be, crowd into the
// shapes of its letters and resolve into the letters themselves, from left to
// right, like a station coming in; set signal back to 0 and it breaks up into
// static again. At signal 1 it's exactly the text as the page draws it, so it
// can hand over to the real text.
//
// draw() paints the text into a picture the shader reads: each character of
// the given elements drawn where the page has it, in its own font and colour
// (the static takes the first one's colour), plus a soft copy, the halo the
// static gathers in first. To find them it splits the text into characters
// (SplitText) and leaves it split, so the page's text and the picture are
// spaced the same, letter for letter. Call it again when the text wraps
// differently.

import {SQUARE, positionsOf, programOf, textureOf} from './program.js';

const settings = {
    // how far the canvas reaches past the text, in px, for the static around it
    margin: 30,
    // the static: the size of a speck, in px, and how often it changes, a second
    grain: 1.5,
    fps: 24,
    // how much static there is around the text before it gathers, and in the halo
    scatter: 0.03,
    halo: 0.22,
    // how soft the halo is: the text is shrunk this many times and stretched back, which blurs it
    haloShrink: 6,
};

const VERTEX = /* glsl */ `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D uText;
uniform sampler2D uHalo;
uniform vec2 uSize;
uniform float uSignal;
uniform float uFrame;
uniform float uGrain;
uniform float uScatter;
uniform float uHaloWeight;
uniform vec3 uStatic;

varying vec2 vUv;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void main() {
    vec4 text = texture2D(uText, vUv);
    float halo = texture2D(uHalo, vUv).a;

    // the signal comes in from the left
    float signal = clamp(uSignal * 1.5 - vUv.x * 0.5, 0.0, 1.0);

    // static that changes every frame, sparse around the text, denser in its halo,
    // then only in its letters
    float speck = hash(floor(vUv * uSize / uGrain) + uFrame * 7.31);
    float gathered = smoothstep(0.0, 0.7, signal);
    float density = mix(uScatter + uHaloWeight * halo, text.a, gathered) * smoothstep(0.0, 0.15, uSignal);
    float specks = step(speck, density) * 0.85;

    // and at last, the letters themselves
    float clear = smoothstep(0.75, 1.0, signal);
    float alpha = mix(specks, text.a, clear);
    vec3 colour = mix(uStatic, text.a > 0.0 ? text.rgb : uStatic, clear);
    gl_FragColor = vec4(colour * alpha, alpha);
}
`;

export class SignalText {
    signal = 0;

    // box: the element the canvas covers; parts: the elements whose text it draws
    constructor(box, parts) {
        this.box = box;
        this.parts = parts;
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'signal-text';
        this.canvas.setAttribute('aria-hidden', 'true');
        const gl = this.canvas.getContext('webgl', {premultipliedAlpha: true});
        if (!gl) return;
        this.gl = gl;

        const program = programOf(gl, VERTEX, FRAGMENT);
        positionsOf(gl, program, SQUARE);

        const uniform = name => gl.getUniformLocation(program, name);
        this.uniforms = {
            size: uniform('uSize'),
            signal: uniform('uSignal'),
            frame: uniform('uFrame'),
            static: uniform('uStatic'),
        };
        gl.uniform1i(uniform('uText'), 0);
        gl.uniform1i(uniform('uHalo'), 1);
        gl.uniform1f(uniform('uGrain'), settings.grain);
        gl.uniform1f(uniform('uScatter'), settings.scatter);
        gl.uniform1f(uniform('uHaloWeight'), settings.halo);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        this.textures = [textureOf(gl), textureOf(gl)];
        gl.clearColor(0, 0, 0, 0);

        this.canvas.style.left = this.canvas.style.top = `${-settings.margin}px`;
        box.append(this.canvas);
        this.render = this.render.bind(this);
    }

    get works() {
        return Boolean(this.gl);
    }

    // paints each character where the page has it
    draw() {
        const {gl, box, canvas} = this;
        const ratio = Math.min(window.devicePixelRatio, 2);
        const width = box.offsetWidth + 2 * settings.margin;
        const height = box.offsetHeight + 2 * settings.margin;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(this.uniforms.size, width, height);

        const paint = document.createElement('canvas');
        paint.width = canvas.width;
        paint.height = canvas.height;
        const context = paint.getContext('2d');
        context.scale(ratio, ratio);
        const origin = box.getBoundingClientRect();

        // the static is the colour of the text it becomes
        const colour = getComputedStyle(this.parts[0]).color.match(/[\d.]+/g);
        gl.uniform3f(this.uniforms.static, ...colour.slice(0, 3).map(c => c / 255));

        this.splits?.forEach(split => split.revert());
        this.splits = this.parts.map(part => SplitText.create(part, {type: 'words,chars', aria: 'auto'}));
        this.parts.forEach((part, i) => {
            const style = getComputedStyle(part);
            context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            context.fillStyle = style.color;
            context.textBaseline = 'alphabetic';
            const metrics = context.measureText('Hg');
            const ascent = metrics.fontBoundingBoxAscent;
            const leading = (parseFloat(style.lineHeight) - ascent - metrics.fontBoundingBoxDescent) / 2;
            this.splits[i].chars.forEach(char => {
                const r = char.getBoundingClientRect();
                const x = r.left - origin.left + settings.margin;
                const y = r.top - origin.top + settings.margin + leading + ascent;
                context.fillText(char.textContent, x, y);
            });
        });

        // the halo: the text shrunk, which the GPU stretches back softly (cheaper than a blur filter)
        const halo = document.createElement('canvas');
        halo.width = Math.ceil(paint.width / settings.haloShrink);
        halo.height = Math.ceil(paint.height / settings.haloShrink);
        const haloContext = halo.getContext('2d');
        haloContext.imageSmoothingQuality = 'high';
        haloContext.drawImage(paint, 0, 0, halo.width, halo.height);

        [paint, halo].forEach((picture, i) => {
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, this.textures[i]);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture);
        });

        // one unseen drawing now, so the GPU is ready before the first hover
        this.render();
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    start() {
        if (!this.gl || this.isRunning) return;
        this.isRunning = true;
        gsap.ticker.add(this.render);
    }

    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        gsap.ticker.remove(this.render);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }

    render() {
        const {gl, uniforms} = this;
        gl.uniform1f(uniforms.signal, this.signal);
        // kept small, so the static stays exact
        gl.uniform1f(uniforms.frame, Math.floor(gsap.ticker.time * settings.fps) % 1000);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}
