import React, { useEffect, useRef } from 'react';

export const ImmuneCoreShader = ({
  className = "w-full h-full relative overflow-hidden",
  intensity = 1.0
}) => {
  const canvasRef = useRef(null);
  const animationFrameId = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl = null;
    try {
      gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    } catch (e) {
      console.warn('WebGL not supported', e);
      return;
    }
    if (!gl) return;

    const vsSource = `
      attribute vec2 a_position;
      varying vec2 v_texCoord;
      void main() {
        v_texCoord = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision highp float;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec2 u_mouse;
      uniform float u_intensity;
      varying vec2 v_texCoord;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.y, u_resolution.x);
        vec2 mouse = (u_mouse.xy / u_resolution.xy) - 0.5;
        uv += mouse * 0.04;

        float d = length(uv);
        float angle = atan(uv.y, uv.x);

        // Core Shield / Sphere Pulse
        float coreRadius = 0.22;
        float pulse = sin(u_time * 1.5) * 0.015;
        float core = smoothstep(coreRadius + pulse, coreRadius + pulse - 0.04, d);

        // Outer concentric orbital protection rings
        float ring1 = abs(d - (0.34 + sin(u_time * 0.8) * 0.01));
        float ring1Alpha = smoothstep(0.006, 0.0, ring1) * 0.6;

        float ring2 = abs(d - (0.42 + cos(u_time * 0.6) * 0.015));
        float ring2Alpha = smoothstep(0.004, 0.0, ring2) * 0.4;

        // Connected Nodes positions (Google, GitHub, AWS, Identity)
        vec2 node1 = vec2(cos(u_time * 0.3) * 0.34, sin(u_time * 0.3) * 0.34);
        vec2 node2 = vec2(cos(u_time * 0.3 + 2.094) * 0.34, sin(u_time * 0.3 + 2.094) * 0.34);
        vec2 node3 = vec2(cos(u_time * 0.3 + 4.188) * 0.34, sin(u_time * 0.3 + 4.188) * 0.34);

        float d1 = length(uv - node1);
        float d2 = length(uv - node2);
        float d3 = length(uv - node3);

        float nodes = smoothstep(0.022, 0.005, d1) + smoothstep(0.022, 0.005, d2) + smoothstep(0.022, 0.005, d3);
        float halos = (exp(-d1 * 18.0) + exp(-d2 * 18.0) + exp(-d3 * 18.0)) * 0.4;

        // Radial scan lines
        float scanline = sin(angle * 32.0 + u_time * 2.0) * 0.05 + 0.95;
        float grid = (sin(uv.x * 60.0) * sin(uv.y * 60.0)) * 0.03;

        // Colors
        vec3 darkCanvas = vec3(0.04, 0.05, 0.08);
        vec3 primaryCyan = vec3(0.02, 0.71, 0.83); // #06B6D4
        vec3 brightCyan = vec3(0.30, 0.84, 0.96);  // #4CD7F6
        vec3 emerald = vec3(0.31, 0.87, 0.64);     // #4EDEA3
        vec3 deepBlue = vec3(0.05, 0.20, 0.40);

        vec3 col = darkCanvas;

        // Atmospheric center glow
        col += deepBlue * exp(-d * 3.5) * 1.5;
        col += primaryCyan * core * 0.8;
        col += brightCyan * (ring1Alpha + ring2Alpha);
        col += emerald * (nodes + halos);

        // Core inner glow & highlights
        if (d < coreRadius + pulse) {
          col += brightCyan * (1.0 - d / (coreRadius + pulse)) * 0.4;
          col += scanline * 0.1;
        }

        col += grid;

        // Noise grit
        float n = hash(uv + vec2(u_time * 0.01)) * 0.02;
        col += vec3(n);

        gl_FragColor = vec4(col * u_intensity, 1.0);
      }
    `;

    function createShader(glCtx, type, source) {
      const shader = glCtx.createShader(type);
      if (!shader) return null;
      glCtx.shaderSource(shader, source);
      glCtx.compileShader(shader);
      if (!glCtx.getShaderParameter(shader, glCtx.COMPILE_STATUS)) {
        console.error(glCtx.getShaderInfoLog(shader));
        glCtx.deleteShader(shader);
        return null;
      }
      return shader;
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      return;
    }

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
    const timeLocation = gl.getUniformLocation(program, 'u_time');
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    const mouseLocation = gl.getUniformLocation(program, 'u_mouse');
    const intensityLocation = gl.getUniformLocation(program, 'u_intensity');

    let mouseX = 0;
    let mouseY = 0;

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = rect.height - (e.clientY - rect.top);
    };

    window.addEventListener('mousemove', handleMouseMove);

    const syncSize = () => {
      if (!canvas) return;
      const w = canvas.clientWidth || 800;
      const h = canvas.clientHeight || 450;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
    };

    const resizeObserver = new ResizeObserver(syncSize);
    resizeObserver.observe(canvas);
    syncSize();

    let startTime = performance.now();

    const render = (time) => {
      if (!gl || !canvas) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);

      gl.enableVertexAttribArray(positionAttributeLocation);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

      const elapsedTime = (time - startTime) * 0.001;
      gl.uniform1f(timeLocation, elapsedTime);
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform2f(mouseLocation, mouseX * (canvas.width / (canvas.clientWidth || 1)), mouseY * (canvas.height / (canvas.clientHeight || 1)));
      gl.uniform1f(intensityLocation, intensity);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animationFrameId.current = requestAnimationFrame(render);
    };

    animationFrameId.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      resizeObserver.disconnect();
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [intensity]);

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
};

