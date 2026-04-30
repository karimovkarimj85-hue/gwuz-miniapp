import type { HTMLAttributes } from "react";
import { useEffect, useRef } from "react";
import { Color, Mesh, Program, Renderer, Triangle } from "ogl";

import "./Threads.css";

export type ThreadsProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "color"> & {
  /** RGB нити (0–1), не CSS `color`. */
  color?: [number, number, number];
  amplitude?: number;
  distance?: number;
  enableMouseInteraction?: boolean;
};

const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float iTime;
uniform vec3 iResolution;
uniform vec3 uColor;
uniform float uAmplitude;
uniform float uDistance;
uniform vec2 uMouse;

#define PI 3.1415926538

const int u_line_count = 40;
const float u_line_width = 7.0;
const float u_line_blur = 10.0;

float Perlin2D(vec2 P) {
    vec2 Pi = floor(P);
    vec4 Pf_Pfmin1 = P.xyxy - vec4(Pi, Pi + 1.0);
    vec4 Pt = vec4(Pi.xy, Pi.xy + 1.0);
    Pt = Pt - floor(Pt * (1.0 / 71.0)) * 71.0;
    Pt += vec2(26.0, 161.0).xyxy;
    Pt *= Pt;
    Pt = Pt.xzxz * Pt.yyww;
    vec4 hash_x = fract(Pt * (1.0 / 951.135664));
    vec4 hash_y = fract(Pt * (1.0 / 642.949883));
    vec4 grad_x = hash_x - 0.49999;
    vec4 grad_y = hash_y - 0.49999;
    vec4 grad_results = inversesqrt(grad_x * grad_x + grad_y * grad_y)
        * (grad_x * Pf_Pfmin1.xzxz + grad_y * Pf_Pfmin1.yyww);
    grad_results *= 1.4142135623730950;
    vec2 blend = Pf_Pfmin1.xy * Pf_Pfmin1.xy * Pf_Pfmin1.xy
               * (Pf_Pfmin1.xy * (Pf_Pfmin1.xy * 6.0 - 15.0) + 10.0);
    vec4 blend2 = vec4(blend, vec2(1.0 - blend));
    return dot(grad_results, blend2.zxzx * blend2.wwyy);
}

float pixel(float count, vec2 resolution) {
    return (1.0 / max(resolution.x, resolution.y)) * count;
}

float lineFn(vec2 st, float width, float perc, float offset, vec2 mouse, float time, float amplitude, float distance) {
    float split_offset = (perc * 0.4);
    float split_point = 0.1 + split_offset;

    float amplitude_normal = smoothstep(split_point, 0.7, st.x);
    float amplitude_strength = 0.5;
    float finalAmplitude = amplitude_normal * amplitude_strength
                           * amplitude * (1.0 + (mouse.y - 0.5) * 0.2);

    float time_scaled = time / 10.0 + (mouse.x - 0.5) * 1.0;
    float blur = smoothstep(split_point, split_point + 0.05, st.x) * perc;

    float xnoise = mix(
        Perlin2D(vec2(time_scaled, st.x + perc) * 2.5),
        Perlin2D(vec2(time_scaled, st.x + time_scaled) * 3.5) / 1.5,
        st.x * 0.3
    );

    float y = 0.5 + (perc - 0.5) * distance + xnoise / 2.0 * finalAmplitude;

    float line_start = smoothstep(
        y + (width / 2.0) + (u_line_blur * pixel(1.0, iResolution.xy) * blur),
        y,
        st.y
    );

    float line_end = smoothstep(
        y,
        y - (width / 2.0) - (u_line_blur * pixel(1.0, iResolution.xy) * blur),
        st.y
    );

    return clamp(
        (line_start - line_end) * (1.0 - smoothstep(0.0, 1.0, pow(perc, 0.3))),
        0.0,
        1.0
    );
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;

    float line_strength = 1.0;
    for (int i = 0; i < u_line_count; i++) {
        float p = float(i) / float(u_line_count);
        line_strength *= (1.0 - lineFn(
            uv,
            u_line_width * pixel(1.0, iResolution.xy) * (1.0 - p),
            p,
            (PI * 1.0) * p,
            uMouse,
            iTime,
            uAmplitude,
            uDistance
        ));
    }

    float colorVal = 1.0 - line_strength;
    fragColor = vec4(uColor * colorVal, colorVal);
}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`;

const GOLD: [number, number, number] = [201 / 255, 162 / 255, 39 / 255];

export default function Threads({
  color = GOLD,
  amplitude = 1,
  distance = 0,
  enableMouseInteraction = false,
  className = "",
  ...rest
}: ThreadsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafId = useRef<number | undefined>(undefined);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const root: HTMLElement = el;

    const renderer = new Renderer({ alpha: true });
    const gl = renderer.gl;

    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    root.appendChild(gl.canvas);

    const geometry = new Triangle(gl);
    const resolution = new Color(
      gl.canvas.width,
      gl.canvas.height,
      gl.canvas.width / Math.max(gl.canvas.height, 1),
    );

    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: resolution },
        uColor: { value: new Color(color[0], color[1], color[2]) },
        uAmplitude: { value: amplitude },
        uDistance: { value: distance },
        uMouse: { value: new Float32Array([0.5, 0.5]) },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });

    const setResolution = () => {
      const w = root.clientWidth;
      const h = Math.max(root.clientHeight, 1);
      renderer.setSize(w, h);
      const res = program.uniforms.iResolution.value as Color & { set?: (x: number, y: number, z: number) => void };
      if (typeof res?.set === "function") res.set(w, h, w / h);
      else {
        res.r = w;
        res.g = h;
        res.b = w / h;
      }
    };

    window.addEventListener("resize", setResolution);
    setResolution();

    let currentMouse = [0.5, 0.5];
    let targetMouse = [0.5, 0.5];

    function handleMouseMove(e: MouseEvent) {
      const rect = root.getBoundingClientRect();
      const x = (e.clientX - rect.left) / Math.max(rect.width, 1);
      const y = 1 - (e.clientY - rect.top) / Math.max(rect.height, 1);
      targetMouse = [x, y];
    }

    function handleTouchMove(e: TouchEvent) {
      if (!e.touches.length) return;
      const rect = root.getBoundingClientRect();
      const touch = e.touches[0];
      const x = (touch.clientX - rect.left) / Math.max(rect.width, 1);
      const y = 1 - (touch.clientY - rect.top) / Math.max(rect.height, 1);
      targetMouse = [x, y];
    }

    function handleLeave() {
      targetMouse = [0.5, 0.5];
    }

    if (enableMouseInteraction) {
      root.addEventListener("mousemove", handleMouseMove);
      root.addEventListener("mouseleave", handleLeave);
      root.addEventListener("touchmove", handleTouchMove, { passive: true });
      root.addEventListener("touchend", handleLeave, { passive: true });
    }

    function frame(t: number) {
      program.uniforms.iTime.value = t * 0.001;
      const mu = program.uniforms.uMouse.value as Float32Array;

      if (enableMouseInteraction) {
        const s = 0.05;
        currentMouse[0] += s * (targetMouse[0] - currentMouse[0]);
        currentMouse[1] += s * (targetMouse[1] - currentMouse[1]);
        mu[0] = currentMouse[0];
        mu[1] = currentMouse[1];
      } else {
        mu[0] = 0.5;
        mu[1] = 0.5;
      }

      renderer.render({ scene: mesh });
      rafId.current = requestAnimationFrame(frame);
    }

    rafId.current = requestAnimationFrame(frame);

    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      window.removeEventListener("resize", setResolution);
      if (enableMouseInteraction) {
        root.removeEventListener("mousemove", handleMouseMove);
        root.removeEventListener("mouseleave", handleLeave);
        root.removeEventListener("touchmove", handleTouchMove);
        root.removeEventListener("touchend", handleLeave);
      }
      if (root.contains(gl.canvas)) root.removeChild(gl.canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [color, amplitude, distance, enableMouseInteraction]);

  return (
    <div ref={containerRef} className={`threads-container ${className}`.trim()} {...rest} />
  );
}
