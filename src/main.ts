import './style.css';
import SIM_VERT from './shaders/sim.vert';
import SIM_FRAG from './shaders/sim.frag';
import RENDER_VERT from './shaders/render.vert';
import RENDER_FRAG from './shaders/render.frag';
import LINE_VERT from './shaders/line.vert';
import LINE_FRAG from './shaders/line.frag';
import QUAD_VERT from './shaders/quad.vert';
import DEBUG_FRAG from './shaders/debug.frag';
import COMPOSITE_FRAG from './shaders/composite.frag';
import { TextManager } from './text-manager';

const names = [
// greetings
  "Matthi", 
  "philipp",
  "Raphaël", 
  "aBe", 
  "tom", 
  "gabor", 
  "fairlix", 
  "iq", 

// bei mir gemeldet
  "Elektrokiłka",
  "Grit Kit", 

// geliked
  "jcelerier", 
  "Nikita", 
  "tinka"
];

function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    
    let r=0, g=0, b=0;
    if (0 <= h && h < 60) { r=c; g=x; b=0; }
    else if (60 <= h && h < 120) { r=x; g=c; b=0; }
    else if (120 <= h && h < 180) { r=0; g=c; b=x; }
    else if (180 <= h && h < 240) { r=0; g=x; b=c; }
    else if (240 <= h && h < 300) { r=x; g=0; b=c; }
    else if (300 <= h && h < 360) { r=c; g=0; b=x; }
    
    return [r+m, g+m, b+m];
}

function stringToHue(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Exclude Green (80-160). Valid: 0-80, 160-360 (280 degrees)
    let hue = Math.abs(hash) % 280;
    if (hue >= 80) hue += 80; // Skip green zone
    return hue;
}

class ParticleSystem {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  
  textManager: TextManager;
  debugProgram: WebGLProgram;
  compositeProgram: WebGLProgram;

  sqrtNumParticles: number = 128;
  numParticles: number;
  
  simProgram: WebGLProgram;
  renderProgram: WebGLProgram;
  lineProgram: WebGLProgram;
  
  posTextures: WebGLTexture[] = [];
  framebuffers: WebGLFramebuffer[] = [];
  currentIdx: number = 0;
  
  quadVao: WebGLVertexArrayObject;
  lineVao: WebGLVertexArrayObject;
  sceneTexture: WebGLTexture;
  sceneFramebuffer: WebGLFramebuffer;
  
  startTime: number;
  lastScrollY: number = 0;
  getScrollY: () => number;

  // Sequence State
  phaseDuration: number = 7.0;
  lastSwitchTime: number = 0;
  nameIndex: number = names.length + 1; 
  recentIndices: number[] = [];
  pathDir: number = 1;

  noiseTime = 0;
  
  // Colors
  currentColors: { a: [number, number, number], b: [number, number, number] } = { a:[0,0,0], b:[0,0,0] };
  targetColors: { a: [number, number, number], b: [number, number, number] } = { a:[0,0,0], b:[0,0,0] };

  constructor(canvas: HTMLCanvasElement, getScrollY: () => number) {
    this.canvas = canvas;
    this.getScrollY = getScrollY;
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      desynchronized: false,
    });
    if (!gl) throw new Error('WebGL 2 not supported');
    this.gl = gl;
    
    if (!gl.getExtension('EXT_color_buffer_float')) {
        console.warn('Float textures not supported');
    }
    gl.getExtension('EXT_float_blend');

    this.numParticles = this.sqrtNumParticles * this.sqrtNumParticles;
    this.startTime = performance.now();

    this.simProgram = this.createProgram(SIM_VERT, SIM_FRAG);
    this.renderProgram = this.createProgram(RENDER_VERT, RENDER_FRAG);
    this.lineProgram = this.createProgram(LINE_VERT, LINE_FRAG);
    this.debugProgram = this.createProgram(QUAD_VERT, DEBUG_FRAG);
    this.compositeProgram = this.createProgram(QUAD_VERT, COMPOSITE_FRAG);
    
    this.textManager = new TextManager(gl);

    this.initTextures();
    this.quadVao = this.createQuad();
    this.lineVao = this.createLineVao();
    this.sceneTexture = gl.createTexture()!;
    this.sceneFramebuffer = gl.createFramebuffer()!;
    this.initSceneTarget();
    
    // Initialize recent indices history
    const historySize = Math.floor(names.length / 2);
    for (let i = 0; i < historySize; i++) {
        this.recentIndices.push(names.length + i);
    }

    // Initialize Sequence
    this.stepSequence()

    // Initialize current color to target immediately
    // this.currentColors.a = [...this.targetColors.a];
    // this.currentColors.b = [...this.targetColors.b];
    
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  updateText() {
    const text = names[this.nameIndex];
    this.textManager.renderText(text);
    this.textManager.computeJFA();
    
    // Center on Random
    // console.log("index", this.nameIndex, "name", text);
    const hue = stringToHue(text);
    this.targetColors.a = hsv2rgb(hue % 360, 1, 1);
    this.targetColors.b = hsv2rgb((hue + 120) % 360, 1, 1);
  }
  
  stepSequence() {
    // random name avoiding recent indices
    let nextIndex;
    let safety = 0;
    do {
        nextIndex = Math.floor(Math.random() * names.length);
        safety++;
    } while (this.recentIndices.includes(nextIndex) && safety < 100);

    // Update history
    this.recentIndices.shift();
    this.recentIndices.push(nextIndex);

    this.nameIndex = nextIndex;
    this.updateText();
  }

  createProgram(vsSource: string, fsSource: string) {
    const gl = this.gl;
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(vs));
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(fs));
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  initTextures() {
    const gl = this.gl;
    const size = this.sqrtNumParticles;
    const data = new Float32Array(size * size * 4);
    
    for(let i=0; i<this.numParticles; i++) {
        data[i*4 + 0] = (Math.random() * 2 - 1) * 2.0;
        data[i*4 + 1] = (Math.random() * 2 - 1) * 2.0;
        data[i*4 + 2] = Math.random() * 2.0;
        // Initialize alpha with random particle index (not self) for repel neighbor search
        let randomIdx = Math.floor(Math.random() * this.numParticles);
        if (randomIdx === i) randomIdx = (randomIdx + 1) % this.numParticles;
        data[i*4 + 3] = randomIdx;
    }

    for(let i=0; i<2; i++) {
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        // RGBA32F for full precision (alpha stores particle index up to 16384)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, size, size, 0, gl.RGBA, gl.FLOAT, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.posTextures.push(tex);

        const fb = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        this.framebuffers.push(fb);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  createQuad() {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,  1, -1,  -1, 1,  1, 1
    ]), gl.STATIC_DRAW);
    
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    
    return vao;
  }

  createLineVao() {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // Just t=0 and t=1
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1]), gl.STATIC_DRAW);
    
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);
    
    return vao;
  }

  resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.initSceneTarget();
  }

  initSceneTarget() {
    const gl = this.gl;

    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.canvas.width,
      this.canvas.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTexture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private lastTime = 0; 
  animate() {
    const gl = this.gl;
    const time = (performance.now() - this.startTime) / 1000;
    const deltaTime = time - this.lastTime; 
    this.lastTime = time;
    
    // Sequence Logic
    if (time - this.lastSwitchTime > this.phaseDuration) {
        this.lastSwitchTime = time;
        this.stepSequence();
    }
    
    // Color Lerp
    const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t) as [number, number, number];
    const dt = 0.01; 
    this.currentColors.a = lerp(this.currentColors.a, this.targetColors.a, dt);
    this.currentColors.b = lerp(this.currentColors.b, this.targetColors.b, dt);
    
    const readIdx = this.currentIdx;
    const writeIdx = (this.currentIdx + 1) % 2;

    gl.disable(gl.BLEND);
    gl.useProgram(this.simProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[writeIdx]);
    gl.viewport(0, 0, this.sqrtNumParticles, this.sqrtNumParticles);
    
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.posTextures[readIdx]);
    gl.uniform1i(gl.getUniformLocation(this.simProgram, "inPosTex"), 0);
    
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textManager.getFlowTexture());
    gl.uniform1i(gl.getUniformLocation(this.simProgram, "flowMap"), 1);
    
    // No inverse map binding needed if using combined map in flowMap?
    // Wait, sim.frag uses flowMap. Combined map IS flowMap.
    
    gl.uniform1i(gl.getUniformLocation(this.simProgram, "sqrtNumParticles"), this.sqrtNumParticles);
    gl.uniform1i(gl.getUniformLocation(this.simProgram, "numParticles"), this.numParticles);
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "invSqrtNumParticles"), 1.0/this.sqrtNumParticles);
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "invNumParticles"), 1.0/this.numParticles);
    
    const currentScrollY = this.getScrollY();
    const deltaY = (currentScrollY - this.lastScrollY) / this.canvas.height;
    this.lastScrollY = currentScrollY;
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "scrollDelta"), deltaY);

    // Flow Strength Modulation
    const elapsed = time - this.lastSwitchTime;
    const phase = Math.min(elapsed / this.phaseDuration, 1.0);
    
    // Cosine Wave: 0 -> 2 -> 0
    const rawFlow = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2.0);
    const peakedFlow = Math.pow(rawFlow, 2.0); 
    
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "flowStrength"), 2.5 * peakedFlow ** 2);
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "rawFlow"), rawFlow);

    this.noiseTime += deltaTime * 0.1; 
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "noiseTime"), this.noiseTime);
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "noiseFrequency"), 0.6);
    
    // Exaggerated sine: snaps to ±1 quickly, inverts each phase
    const s = Math.sin((time / (this.phaseDuration * 2) - 0.1) * Math.PI * 2);
    const driftFactor = Math.sign(s) * Math.pow(Math.abs(s), 0.5);
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "driftAmount"), 0.25 * driftFactor); 
    
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "noiseAmount"), 0.8 - 0.7 * peakedFlow);
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "yWind"), 0); 
    
    // Speed: High at edges, Low at center
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "speed"), 0.03 - peakedFlow * 0.02);
    
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "zCenter"), 1.8);
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "zGravity"), 0.1);

    gl.uniform1f(gl.getUniformLocation(this.simProgram, "repel"), 0.001 * rawFlow);

    // Horizontal line alignment (active when flow is strong)
    const lineStrength = 0.03 / (0.03 + 0.5 + 0.5 * Math.cos((phase - 0.15) * Math.PI * 2.0))
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "lineStrength"), lineStrength * 0.005);
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "lineFreq"), 0.025);

    const aspectX = Math.sqrt(this.canvas.width / this.canvas.height);
    gl.uniform2f(gl.getUniformLocation(this.simProgram, "aspect"), aspectX, 1.0/aspectX);

    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFramebuffer);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    // Keep additive accumulation in RGB only. Final page-facing alpha is resolved in a separate pass.
    gl.colorMask(true, true, true, false);

    // --- Render Lines ---
    gl.useProgram(this.lineProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.posTextures[writeIdx]); 
    gl.uniform1i(gl.getUniformLocation(this.lineProgram, "positionsTex"), 0);
    gl.uniform1i(gl.getUniformLocation(this.lineProgram, "sqrtNumParticles"), this.sqrtNumParticles);
    
    gl.uniform3fv(gl.getUniformLocation(this.lineProgram, "colorA"), this.currentColors.a); 
    gl.uniform3fv(gl.getUniformLocation(this.lineProgram, "colorB"), this.currentColors.b); 
    gl.uniform1f(gl.getUniformLocation(this.lineProgram, "intensity"), 0.35 * (1.0 - rawFlow)); 
    
    gl.bindVertexArray(this.lineVao);
    // Render lines for a subset (e.g., 6.25%) to keep it clean
    gl.drawArraysInstanced(gl.LINES, 0, 2, this.numParticles / 16);

    // --- Render Particles ---
    gl.useProgram(this.renderProgram);
    gl.bindVertexArray(this.quadVao);
    
    // Disable Alpha Write for particles so they don't occlude the CSS background
    gl.colorMask(true, true, true, false);
    
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.posTextures[writeIdx]); 
    gl.uniform1i(gl.getUniformLocation(this.renderProgram, "positionsTex"), 0);
    
    gl.uniform1i(gl.getUniformLocation(this.renderProgram, "sqrtNumParticles"), this.sqrtNumParticles);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "invSqrtNumParticles"), 1.0/this.sqrtNumParticles);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "invNumParticles"), 1.0/this.numParticles);
    
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "intensityFactor"), 0.7);
    
    // Focus Distance Animation (4.0 -> 1.5 -> 4.0)
    // Peak (1.5) at phase 0.5
    const focusCos = - Math.cos((phase - 0.3) * Math.PI * 2.0 * 2);
    const focusDistance = 2.8 - 1 * focusCos;
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "focusDistance"), focusDistance);

    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "invMaxDistance"), 0.1);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "maxDistanceSlope"), 1.0);
    
    // Use dynamic colors
    gl.uniform3fv(gl.getUniformLocation(this.renderProgram, "colorA"), this.currentColors.a); 
    gl.uniform3fv(gl.getUniformLocation(this.renderProgram, "colorB"), this.currentColors.b); 
    gl.uniform3f(gl.getUniformLocation(this.renderProgram, "intensityColor"), 1.0, 0.7, 0.2);  
    
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "dofAmount"), 2 - peakedFlow);
    gl.uniform2f(gl.getUniformLocation(this.renderProgram, "aspect"), aspectX, 1.0/aspectX);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "particleSize"), 0.008);
    
    // Sync blink to phase for consistent timing
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "blinkPhase"), time * 0.1 % 1);
    
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "blinkAmount"), 6.0);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "blinkSlope"), 70.0);

    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "relativeFeather"), 0.3); 
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "maxFd"), 3.0); 
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "mixBias"), peakedFlow);

    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.numParticles);
    
    gl.colorMask(true, true, true, true);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.compositeProgram);
    gl.bindVertexArray(this.quadVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, "u_texture"), 0);
    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, "u_alphaScale"), 0.8);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // this.renderDebug();

    this.currentIdx = writeIdx;
    requestAnimationFrame(this.animate);
  }

  renderDebug() {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.debugProgram);
    gl.bindVertexArray(this.quadVao);
    
    // Top Left: 16:9 small (320x180)
    const debugW = 320;
    const debugH = 180;
    
    gl.viewport(0, this.canvas.height - debugH, debugW, debugH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textManager.textTexture);
    gl.uniform1i(gl.getUniformLocation(this.debugProgram, "u_texture"), 0);
    gl.uniform1i(gl.getUniformLocation(this.debugProgram, "u_mode"), 0);
    gl.uniform1f(gl.getUniformLocation(this.debugProgram, "u_opacity"), 1.0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    gl.viewport(this.canvas.width - debugW, this.canvas.height - debugH, debugW, debugH);
    gl.bindTexture(gl.TEXTURE_2D, this.textManager.getFlowTexture());
    gl.uniform1i(gl.getUniformLocation(this.debugProgram, "u_mode"), 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const system = new ParticleSystem(canvas, () => 0);

window.addEventListener('resize', () => {
    system.resize(window.innerWidth, window.innerHeight);
});
system.resize(window.innerWidth, window.innerHeight);
