// MoltenMetal shader adapted from React Bits for the vanilla JS portfolio.
(() => {
  const container = document.getElementById('molten-metal');
  const hero = container?.closest('.hero');
  if (!container || !hero) return;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false
  });
  if (!gl) return;

  const vertex = `#version 300 es
  in vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
  `;
  
  const fragment = `#version 300 es
  precision highp float;
  uniform vec2 iResolution;
  uniform float iTime;
  uniform float uSpeed;
  uniform float uScale;
  uniform float uDetail;
  uniform float uGlow;
  uniform float uCoreSize;
  uniform float uSwirl;
  uniform float uFold;
  uniform float uBlackPoint;
  uniform float uBrightness;
  uniform float uColorMode;
  uniform float uGrain;
  uniform float uGrainIntensity;
  uniform float uOpacity;
  uniform vec2 uMouse;
  uniform float uMouseStrength;
  uniform bool uEnableMouse;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec3 uBackgroundColor;
  uniform bool uLightMode;
  out vec4 fragColor;
  
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }
  
  void main() {
    float time = iTime * uSpeed;
    vec2 p = uScale * ((gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y) - 0.5;
  
    vec2 drift = vec2(0.0);
    if (uEnableMouse) {
      drift = (uMouse - 0.5) * uMouseStrength * 2.0;
    }
    p += drift;
  
    vec2 i = p;
    float c = 0.0;
    float r = length(p + vec2(sin(time), sin(time * 0.3 + 5.0)) * 0.5);
    float d = length(p);
    float rot = d + time + p.x * uSwirl;
  
    float cosRot = cos(rot);
    mat2 warp = mat2(cos(rot - sin(time / 5.0)), sin(rot), -sin(cosRot - time), cosRot) * uFold;
    float glowCore = uGlow * uCoreSize;
  
    for (float n = 0.0; n < 8.0; n++) {
      if (n >= uDetail) break;
      p *= warp;
      float t = r - time / (n + 3.0);
      i -= p + vec2(cos(t - i.x - r) + sin(t + i.y), sin(t - i.y) + cos(t + i.x) + r);
      c += glowCore / length(vec2(sin(i.x + t), cos(i.y + t)));
    }
  
    c /= 6.0;
  
    float intensity = max(c - uBlackPoint, 0.0) * uBrightness;
  
    float g = clamp(intensity, 0.0, 1.0);
  
    float mid = 0.5;
    if (uColorMode > 1.5) {
      mid = 0.65;
    } else if (uColorMode > 0.5) {
      mid = 0.35;
    }
  
    vec3 col = mix(uColor1, uColor2, smoothstep(0.0, mid, g));
    col = mix(col, uColor3, smoothstep(mid, 1.0, g));
  
    float a = g;
    if (uGrain > 0.5) {
      float gr = hash(gl_FragCoord.xy + iTime);
      a += (gr - 0.5) * uGrainIntensity;
    }
    a = clamp(a, 0.0, 1.0) * uOpacity;
    if (uLightMode) {
      float signal = 1.0 - exp(-max(c, 0.0) * 6.5);
      float body = smoothstep(0.075, 0.68, signal);
      float ridge = smoothstep(0.42, 0.92, signal);
  
      vec3 lightCol = mix(uColor1, uColor2, smoothstep(0.08, 0.52, signal));
      lightCol = mix(lightCol, uColor3, smoothstep(0.52, 0.96, signal));
      lightCol = mix(lightCol, lightCol * 0.72, ridge * 0.24);
  
      float coverage = body * mix(0.2, 0.86, signal) * uOpacity;
      if (uGrain > 0.5) {
        float gr = hash(gl_FragCoord.xy + iTime);
        coverage += (gr - 0.5) * uGrainIntensity * body * 0.16;
      }
      fragColor = vec4(mix(uBackgroundColor, lightCol, clamp(coverage, 0.0, 0.92)), 1.0);
    } else {
      fragColor = vec4(col * a, a);
    }
  }
  `;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    console.warn('MoltenMetal shader could not start:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  const vertexShader = compile(gl.VERTEX_SHADER, vertex);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, fragment);
  if (!vertexShader || !fragmentShader) return;

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('MoltenMetal program could not start:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return;
  }

  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const uniformNames = [
    'iResolution', 'iTime', 'uSpeed', 'uScale', 'uDetail', 'uGlow', 'uCoreSize',
    'uSwirl', 'uFold', 'uBlackPoint', 'uBrightness', 'uColorMode', 'uGrain',
    'uGrainIntensity', 'uOpacity', 'uMouse', 'uMouseStrength', 'uEnableMouse',
    'uColor1', 'uColor2', 'uColor3', 'uBackgroundColor', 'uLightMode'
  ];
  const uniforms = Object.fromEntries(uniformNames.map(name => [name, gl.getUniformLocation(program, name)]));
  const float = (name, value) => gl.uniform1f(uniforms[name], value);
  const bool = (name, value) => gl.uniform1i(uniforms[name], Number(value));
  const vec2 = (name, x, y) => gl.uniform2f(uniforms[name], x, y);
  const color = (name, value) => {
    const hex = value.trim().replace('#', '');
    const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    gl.uniform3f(uniforms[name], ...channels);
  };

  gl.useProgram(program);
  const theme = getComputedStyle(document.documentElement);
  float('uSpeed', 0.35);
  float('uScale', 4);
  float('uDetail', 3);
  float('uGlow', 1.6);
  float('uCoreSize', 0.1);
  float('uSwirl', 1);
  float('uFold', -0.2);
  float('uBlackPoint', 0.05);
  float('uBrightness', 1.3);
  float('uColorMode', 0);
  float('uGrain', 1);
  float('uGrainIntensity', 0.025);
  float('uOpacity', 0.72);
  float('uMouseStrength', 0.3);
  bool('uEnableMouse', true);
  color('uColor1', theme.getPropertyValue('--purple-bright'));
  color('uColor2', theme.getPropertyValue('--pink'));
  color('uColor3', theme.getPropertyValue('--white'));
  color('uBackgroundColor', theme.getPropertyValue('--purple-deep'));
  bool('uLightMode', false);

  container.appendChild(canvas);
  let visible = true;
  let raf = 0;
  let elapsed = 0;
  let previousTime = 0;
  let lastDrawTime = 0;
  const currentMouse = [0.5, 0.5];
  const targetMouse = [0.5, 0.5];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobileMedia = matchMedia('(max-width: 640px)');

  function render() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    vec2('iResolution', canvas.width, canvas.height);
    float('iTime', elapsed);
    vec2('uMouse', currentMouse[0], currentMouse[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  function tick(time) {
    raf = 0;
    if (lastDrawTime && time - lastDrawTime < 1000 / (mobileMedia.matches ? 24 : 30)) {
      start();
      return;
    }
    elapsed += previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
    previousTime = time;
    lastDrawTime = time;
    currentMouse[0] += (targetMouse[0] - currentMouse[0]) * 0.05;
    currentMouse[1] += (targetMouse[1] - currentMouse[1]) * 0.05;
    render();
    start();
  }

  function start() {
    if (!raf && visible && !document.hidden && !reducedMotion) raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    previousTime = 0;
    lastDrawTime = 0;
  }

  function resize() {
    const bounds = container.getBoundingClientRect();
    const mobile = mobileMedia.matches;
    gl.useProgram(program);
    float('uSpeed', mobile ? 0.25 : 0.35);
    float('uScale', mobile ? 2.8 : 4);
    float('uDetail', mobile ? 2 : 3);
    float('uGlow', mobile ? 1.25 : 1.6);
    float('uCoreSize', mobile ? 0.13 : 0.1);
    float('uBlackPoint', mobile ? 0.08 : 0.05);
    float('uBrightness', mobile ? 1.05 : 1.3);
    float('uGrain', mobile ? 0 : 1);
    float('uOpacity', mobile ? 0.68 : 0.72);
    color('uColor1', theme.getPropertyValue(mobile ? '--purple' : '--purple-bright'));
    color('uColor2', theme.getPropertyValue(mobile ? '--pink-bright' : '--pink'));
    color('uColor3', theme.getPropertyValue(mobile ? '--lavender' : '--white'));
    const scale = mobile
      ? Math.min(devicePixelRatio || 1, 1.5, 1200 / Math.max(1, bounds.width), 2000 / Math.max(1, bounds.height))
      : Math.min(devicePixelRatio || 1, 1.25, 1600 / Math.max(1, bounds.width), 1200 / Math.max(1, bounds.height));
    canvas.width = Math.max(1, Math.round(bounds.width * scale));
    canvas.height = Math.max(1, Math.round(bounds.height * scale));
    render();
  }

  let touchActive = false;
  let touchResetTimer = 0;
  function updateMouse(event) {
    const bounds = container.getBoundingClientRect();
    targetMouse[0] = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    targetMouse[1] = Math.max(0, Math.min(1, 1 - (event.clientY - bounds.top) / bounds.height));
  }
  hero.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    clearTimeout(touchResetTimer);
    touchActive = true;
    updateMouse(event);
  }, { passive: true });
  hero.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' && !touchActive) return;
    updateMouse(event);
  }, { passive: true });
  hero.addEventListener('pointerleave', () => {
    if (touchActive) return;
    targetMouse[0] = 0.5;
    targetMouse[1] = 0.5;
  });
  function finishTouch(event) {
    if (event.pointerType !== 'touch') return;
    touchActive = false;
    clearTimeout(touchResetTimer);
    touchResetTimer = setTimeout(() => {
      targetMouse[0] = 0.5;
      targetMouse[1] = 0.5;
    }, 900);
  }
  window.addEventListener('pointerup', finishTouch);
  window.addEventListener('pointercancel', finishTouch);

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(container);
  else window.addEventListener('resize', resize, { passive: true });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start(); else stop();
    }).observe(container);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else start();
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    stop();
  });

  resize();
  start();
})();
