import React, { useEffect, useRef } from "react";
import { shaderSource } from "./orb-shader";
import "./Orb.css";

/**
 * The Glass Liquid orb, as a component.
 *
 * Adapted from a standalone WebGPU script that owned the page: it queried
 * `#orb` and `#status` by id, kept the device and animation state in module
 * scope, published a `window.liquidOrb` control surface, and called `start()`
 * on import. All of that is per-instance here, so two orbs can coexist and an
 * unmount actually releases the GPU device.
 *
 * `audioBands` is an ordinary prop, which means a live analyser feeding it at
 * frame rate will re-render the parent at frame rate. For that case, drive it
 * from a throttled source rather than straight off `requestAnimationFrame`.
 */

export type OrbState = "idle" | "thinking";

export interface AudioBands {
  low?: number;
  mid?: number;
  high?: number;
  all?: number;
}

export interface OrbProps {
  /** Which seed the uniforms animate toward. */
  state?: OrbState;
  /** Normalised 0..1 levels. Omitted bands read as 0. */
  audioBands?: AudioBands;
  /**
   * Startup and device-loss failures. The original wrote these into a `#status`
   * element; a component has no business reaching for one, so they come out
   * here instead. Without a handler a failed orb is simply an empty box.
   */
  onError?: (error: Error) => void;
  className?: string;
}

// Uniform slots the loop writes directly. The rest are interpolated wholesale
// between the two seeds, so they need no names.
const U_WIDTH = 0;
const U_HEIGHT = 1;
const U_TIME = 2;
const U_SPEED = 3;
const U_STYLE = 15;

// Index 40 onward is the colour bank, four floats per entry. Within each entry
// the first three are RGB and interpolate through linear light; the fourth is
// alpha and interpolates straight.
const COLOR_BANK_START = 40;

const ribbonStyleIndex = 24;
const ribbonInstanceCount = 221184;
const activationDurationMs = 220;
const settleDurationMs = 650;

const stateSeeds: Record<OrbState, number[]> = {
  idle: [
    1, 1, 0, 0.20160000026226044, 0.6600000262260437, 0.30000001192092896, 3,
    0.5, 2.200000047683716, 0.11999999731779099, 0.2800000011920929,
    0.23999999463558197, 0.18000000715255737, 0.18000000715255737,
    1.0063999891281128, 24, 0.004999999888241291, 0, 0, 1, 0.4399999976158142,
    0, 2, 0.41999998688697815, 0.7699999809265137, 0.23000000417232513, 65, 0,
    0, 1, 0.2199999988079071, 0.25, 1, 4, 0.29760000109672546,
    0.4830000102519989, 0.20999999344348907, 0.06840000301599503,
    1.1200000047683716, 1.2200000286102295, 0.22745098173618317,
    0.3764705955982208, 0.40784314274787903, 1, 0.21568627655506134,
    0.364705890417099, 0.47058823704719543, 1, 0.3490196168422699,
    0.30588236451148987, 0.5137255191802979, 1, 0.5215686559677124,
    0.2980392277240753, 0.47843137383461, 1, 0.7254902124404907,
    0.800000011920929, 0.8196078538894653, 1, 1, 1, 1, 1, 0.6078431606292725,
    0.95686274766922, 1, 1, 0.772549033164978, 0.6627451181411743, 1, 1,
    0.9176470637321472, 0.95686274766922, 1, 1, 0.8627451062202454,
    0.9176470637321472, 1, 1, 0.003921568859368563, 0.007843137718737125,
    0.0313725508749485, 1, 0.3176470696926117, 0.2980392277240753,
    0.47058823704719543, 1, 0.9686274528503418, 0.9843137264251709, 1, 1,
    0.9372549057006836, 0.9647058844566345, 0.9921568632125854, 1,
    0.8784313797950745, 0.9333333373069763, 0.9764705896377563, 1,
    0.8313725590705872, 0.9019607901573181, 0.9686274528503418, 1,
    0.7333333492279053, 0.8352941274642944, 0.9529411792755127, 1,
    0.6509804129600525, 0.7803921699523926, 0.9411764740943909, 1,
    0.529411792755127, 0.6901960968971252, 0.9215686321258545, 1,
    0.43529412150382996, 0.6196078658103943, 0.9098039269447327, 1,
    0.43529412150382996, 0.6196078658103943, 0.9098039269447327, 1,
    0.43529412150382996, 0.6196078658103943, 0.9098039269447327, 1,
    0.43529412150382996, 0.6196078658103943, 0.9098039269447327, 1,
    0.43529412150382996, 0.6196078658103943, 0.9098039269447327, 1,
  ],
  thinking: [
    1, 1, 0, 0.7200000286102295, 0.6600000262260437, 0.30000001192092896, 3,
    0.5, 2.200000047683716, 0.11999999731779099, 0.2800000011920929,
    0.23999999463558197, 0.18000000715255737, 0.18000000715255737,
    1.4800000190734863, 24, 0.004999999888241291, 0, 0, 1, 0.4399999976158142,
    0, 2, 0.41999998688697815, 0.7699999809265137, 0.23000000417232513, 65, 0,
    0, 1, 0.2199999988079071, 0.25, 1, 4, 0.47999998927116394,
    1.149999976158142, 0.6000000238418579, 0.3799999952316284,
    1.1200000047683716, 1.2200000286102295, 0.38823530077934265,
    0.9450980424880981, 1, 1, 0.29019609093666077, 0.615686297416687, 1, 1,
    0.5215686559677124, 0.4000000059604645, 1, 1, 0.9450980424880981,
    0.364705890417099, 0.8823529481887817, 1, 0.9607843160629272,
    0.9843137264251709, 1, 1, 1, 1, 1, 1, 0.6078431606292725, 0.95686274766922,
    1, 1, 0.772549033164978, 0.6627451181411743, 1, 1, 0.9176470637321472,
    0.95686274766922, 1, 1, 0.8627451062202454, 0.9176470637321472, 1, 1,
    0.003921568859368563, 0.007843137718737125, 0.0313725508749485, 1,
    0.4627451002597809, 0.3607843220233917, 1, 1, 0.9686274528503418,
    0.9843137264251709, 1, 1, 0.9372549057006836, 0.9647058844566345,
    0.9921568632125854, 1, 0.8784313797950745, 0.9333333373069763,
    0.9764705896377563, 1, 0.8313725590705872, 0.9019607901573181,
    0.9686274528503418, 1, 0.7333333492279053, 0.8352941274642944,
    0.9529411792755127, 1, 0.6509804129600525, 0.7803921699523926,
    0.9411764740943909, 1, 0.529411792755127, 0.6901960968971252,
    0.9215686321258545, 1, 0.43529412150382996, 0.6196078658103943,
    0.9098039269447327, 1, 0.43529412150382996, 0.6196078658103943,
    0.9098039269447327, 1, 0.43529412150382996, 0.6196078658103943,
    0.9098039269447327, 1, 0.43529412150382996, 0.6196078658103943,
    0.9098039269447327, 1, 0.43529412150382996, 0.6196078658103943,
    0.9098039269447327, 1,
  ],
};

type AudioBand = "low" | "mid" | "high" | "all";
type AudioLevels = Record<AudioBand, number>;

const AUDIO_BAND_KEYS: AudioBand[] = ["low", "mid", "high", "all"];

// [uniform index, band, additive gain, proportional gain, ceiling]
const audioRules: [number, AudioBand, number, number, number][] = [
  [3, "all", 0, 0.7, 5],
  [6, "mid", 0.85, 0, 7],
  [21, "low", 0.075, 0, 1],
  [10, "high", 0.16, 0, 2],
  [14, "all", 0, 0.12, 4],
];

// Only some flow programs respond to audio, and by different amounts.
const audioFlowStrengths: Record<number, number> = {
  9: 0.8,
  10: 0.65,
  11: 0.65,
  14: 0.75,
  19: 1,
  21: 0.7,
};

function applyAudioUniforms(values: Float32Array, bands: AudioLevels): void {
  const strength = audioFlowStrengths[Math.round(values[U_STYLE])] ?? 0;
  if (!strength) return;
  for (const [index, band, additive, proportional, ceiling] of audioRules) {
    const level = bands[band] * strength;
    if (!level) continue;
    values[index] = Math.min(
      Math.max(ceiling, values[index]),
      values[index] * (1 + proportional * level) + additive * level
    );
  }
}

function normaliseBands(bands: AudioBands | undefined): AudioLevels {
  const levels = { low: 0, mid: 0, high: 0, all: 0 };
  if (!bands) return levels;
  for (const key of AUDIO_BAND_KEYS) {
    const value = bands[key];
    levels[key] = Number.isFinite(value)
      ? Math.max(0, Math.min(1, value as number))
      : 0;
  }
  return levels;
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  return value <= 0.0031308
    ? value * 12.92
    : 1.055 * value ** (1 / 2.4) - 0.055;
}

// Colours cross-fade through linear light; a straight sRGB lerp between two
// saturated stops dips through a muddier midpoint.
function mixSrgb(from: number, to: number, progress: number): number {
  return linearToSrgb(
    srgbToLinear(from) + (srgbToLinear(to) - srgbToLinear(from)) * progress
  );
}

const Orb: React.FC<OrbProps> = ({
  state = "idle",
  audioBands,
  onError,
  className = "",
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Written by the props effect, read by the render loop — so prop changes
  // never restart the device.
  const setStateRef = useRef<((next: OrbState) => void) | null>(null);
  const audioRef = useRef<AudioLevels>({ low: 0, mid: 0, high: 0, all: 0 });
  const stateRef = useRef<OrbState>(state);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement("canvas");
    container.appendChild(canvas);

    // Everything below was module state in the original script.
    let animationFrame = 0;
    let device: GPUDevice | null = null;
    let ribbonTarget: GPUTexture | null = null;
    let stopped = false;
    let current: OrbState = stateRef.current;
    let transitionTargetState: OrbState = current;
    let fromUniforms = new Float32Array(stateSeeds[current]);
    let targetUniforms = new Float32Array(stateSeeds[current]);
    const displayedUniforms = new Float32Array(stateSeeds[current]);
    let transitionStartedAt = 0;
    let activeTransitionDuration = 0;
    let lastFrameAt: number | null = null;
    let motionPhase = 0;

    function transitionProgress(now: number): number {
      if (activeTransitionDuration === 0) return 1;
      const raw = Math.min(
        1,
        Math.max(0, (now - transitionStartedAt) / activeTransitionDuration)
      );
      // Thinking snaps in (ease-out cubic); settling eases both ends.
      return transitionTargetState === "thinking"
        ? 1 - (1 - raw) ** 3
        : raw * raw * (3 - 2 * raw);
    }

    function sampleTransition(now: number): Float32Array {
      const progress = transitionProgress(now);
      // From 3: the first three slots are resolution and time, which the frame
      // owns rather than the seeds.
      for (let index = 3; index < displayedUniforms.length; index += 1) {
        const colorComponent =
          index >= COLOR_BANK_START && (index - COLOR_BANK_START) % 4 < 3;
        displayedUniforms[index] = colorComponent
          ? mixSrgb(fromUniforms[index], targetUniforms[index], progress)
          : fromUniforms[index] +
            (targetUniforms[index] - fromUniforms[index]) * progress;
      }
      return displayedUniforms;
    }

    // Re-aims the transition from wherever it currently is, so an interrupted
    // fade continues from the displayed value rather than snapping back.
    function goToState(nextState: OrbState): void {
      if (nextState === current) return;
      const now = performance.now();
      sampleTransition(now);
      fromUniforms = new Float32Array(displayedUniforms);
      targetUniforms = new Float32Array(stateSeeds[nextState]);
      transitionTargetState = nextState;
      transitionStartedAt = now;
      activeTransitionDuration =
        nextState === "thinking" ? activationDurationMs : settleDurationMs;
      current = nextState;
    }

    setStateRef.current = goToState;

    // Declared ahead of start(), which assigns the real implementations once a
    // device exists. Until then the observers below drive no-ops, so an orb
    // scrolled out of view before boot simply never starts its loop.
    let isVisible = true;
    let isPageVisible = !document.hidden;
    let startLoop: () => void = () => {};
    let stopLoop: () => void = () => {};

    function stopWithError(error: unknown): void {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      ribbonTarget?.destroy();
      ribbonTarget = null;
      device?.destroy();
      device = null;
      onErrorRef.current?.(
        error instanceof Error ? error : new Error(String(error))
      );
    }

    async function start(): Promise<void> {
      if (!navigator.gpu) {
        throw new Error("WebGPU is not supported in this environment.");
      }
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error("No compatible WebGPU adapter was found.");
      const gpuDevice = await adapter.requestDevice();

      // Two awaits have passed: React may have unmounted us in between, and a
      // device created after teardown would never be released.
      if (stopped) {
        gpuDevice.destroy();
        return;
      }
      device = gpuDevice;

      const context = canvas.getContext("webgpu");
      if (!context) throw new Error("Unable to create a WebGPU canvas context.");

      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({ device: gpuDevice, format, alphaMode: "premultiplied" });

      const shader = gpuDevice.createShaderModule({ code: shaderSource });
      const compilation = await shader.getCompilationInfo();
      if (stopped) return;
      const errors = compilation.messages.filter(
        (message) => message.type === "error"
      );
      if (errors.length) {
        throw new Error(
          errors
            .map(
              (message) =>
                `${message.lineNum}:${message.linePos} ${message.message}`
            )
            .join("\n")
        );
      }

      const premultipliedBlend: GPUBlendState = {
        color: {
          srcFactor: "one",
          dstFactor: "one-minus-src-alpha",
          operation: "add",
        },
        alpha: {
          srcFactor: "one",
          dstFactor: "one-minus-src-alpha",
          operation: "add",
        },
      };

      const pipeline = gpuDevice.createRenderPipeline({
        layout: "auto",
        vertex: { module: shader, entryPoint: "vs_main" },
        fragment: {
          module: shader,
          entryPoint: "fs_main",
          targets: [{ format, blend: premultipliedBlend }],
        },
        primitive: { topology: "triangle-list" },
      });

      // Particles accumulate additively into their own target before the
      // composite pass folds them back over the scene.
      const ribbonPipeline = gpuDevice.createRenderPipeline({
        layout: "auto",
        vertex: { module: shader, entryPoint: "ribbon_vs_main" },
        fragment: {
          module: shader,
          entryPoint: "ribbon_fs_main",
          targets: [
            {
              format,
              blend: {
                color: { srcFactor: "one", dstFactor: "one", operation: "add" },
                alpha: {
                  srcFactor: "one",
                  dstFactor: "one-minus-src-alpha",
                  operation: "add",
                },
              },
            },
          ],
        },
        primitive: { topology: "triangle-list" },
      });

      const ribbonCompositePipeline = gpuDevice.createRenderPipeline({
        layout: "auto",
        vertex: { module: shader, entryPoint: "vs_main" },
        fragment: {
          module: shader,
          entryPoint: "ribbon_composite_fs_main",
          targets: [{ format, blend: premultipliedBlend }],
        },
        primitive: { topology: "triangle-list" },
      });

      const values = new Float32Array(displayedUniforms);
      const uniformBuffer = gpuDevice.createBuffer({
        size: values.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const bindGroup = gpuDevice.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
      });
      const ribbonBindGroup = gpuDevice.createBindGroup({
        layout: ribbonPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
      });
      const ribbonSampler = gpuDevice.createSampler({
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
        magFilter: "linear",
        minFilter: "linear",
      });
      let ribbonCompositeBindGroup: GPUBindGroup | null = null;

      // A destroy() during teardown also resolves this; `stopped` filters it.
      async function watchDeviceLoss() {
        const info = await gpuDevice.lost;
        stopWithError(
          new Error(`WebGPU device lost: ${info.message || info.reason}`)
        );
      }
      void watchDeviceLoss();
      gpuDevice.addEventListener("uncapturederror", (event) => {
        const detail = event as GPUUncapturedErrorEvent;
        detail.preventDefault();
        stopWithError(
          new Error(`WebGPU rendering error: ${detail.error.message}`)
        );
      });

      function frame(now: number): void {
        if (stopped) return;
        try {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
          const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            ribbonTarget?.destroy();
            ribbonTarget = null;
            ribbonCompositeBindGroup = null;
          }

          values.set(sampleTransition(now));
          // Clamped, so a backgrounded tab resuming does not jump the phase.
          const frameDelta =
            lastFrameAt === null
              ? 0
              : Math.min(0.1, Math.max(0, (now - lastFrameAt) / 1000));
          lastFrameAt = now;
          applyAudioUniforms(values, audioRef.current);

          // Time is integrated against the *current* speed and divided back
          // out, so changing speed bends the motion instead of teleporting it.
          motionPhase += frameDelta * Math.max(values[U_SPEED], 0);
          values[U_WIDTH] = width;
          values[U_HEIGHT] = height;
          values[U_TIME] = motionPhase / Math.max(values[U_SPEED], 0.001);
          gpuDevice.queue.writeBuffer(uniformBuffer, 0, values);

          const isParticleRibbon =
            Math.round(values[U_STYLE]) === ribbonStyleIndex;
          const encoder = gpuDevice.createCommandEncoder();

          if (isParticleRibbon) {
            if (!ribbonTarget || !ribbonCompositeBindGroup) {
              ribbonTarget = gpuDevice.createTexture({
                size: { width, height },
                format,
                usage:
                  GPUTextureUsage.RENDER_ATTACHMENT |
                  GPUTextureUsage.TEXTURE_BINDING,
              });
              ribbonCompositeBindGroup = gpuDevice.createBindGroup({
                layout: ribbonCompositePipeline.getBindGroupLayout(0),
                entries: [
                  { binding: 0, resource: { buffer: uniformBuffer } },
                  { binding: 1, resource: ribbonTarget.createView() },
                  { binding: 2, resource: ribbonSampler },
                ],
              });
            }
            const particlePass = encoder.beginRenderPass({
              colorAttachments: [
                {
                  view: ribbonTarget.createView(),
                  clearValue: { r: 0, g: 0, b: 0, a: 0 },
                  loadOp: "clear",
                  storeOp: "store",
                },
              ],
            });
            particlePass.setPipeline(ribbonPipeline);
            particlePass.setBindGroup(0, ribbonBindGroup);
            particlePass.draw(6, ribbonInstanceCount);
            particlePass.end();
          }

          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: context!.getCurrentTexture().createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                loadOp: "clear",
                storeOp: "store",
              },
            ],
          });
          if (isParticleRibbon) {
            pass.setPipeline(ribbonCompositePipeline);
            pass.setBindGroup(0, ribbonCompositeBindGroup!);
          } else {
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bindGroup);
          }
          pass.draw(3);
          pass.end();
          gpuDevice.queue.submit([encoder.finish()]);

          animationFrame = requestAnimationFrame(frame);
        } catch (error) {
          stopWithError(error);
        }
      }

      // Same pause policy as WebThreads: offscreen or a hidden tab stops the
      // loop. The original ran unconditionally, which on a WebGPU orb is real
      // GPU time spent on something nobody is looking at.
      const tryStart = () => {
        if (!stopped && isVisible && isPageVisible && animationFrame === 0) {
          // A pause can be long; without this the first frame back would see a
          // huge delta and the clamp would eat it silently.
          lastFrameAt = null;
          animationFrame = requestAnimationFrame(frame);
        }
      };
      const tryStop = () => {
        if (animationFrame !== 0) {
          cancelAnimationFrame(animationFrame);
          animationFrame = 0;
        }
      };
      startLoop = tryStart;
      stopLoop = tryStop;
      tryStart();
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible) startLoop();
        else stopLoop();
      },
      { threshold: 0 }
    );
    io.observe(container);

    const onVisibility = () => {
      isPageVisible = !document.hidden;
      if (isPageVisible) startLoop();
      else stopLoop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    async function boot() {
      try {
        await start();
      } catch (error) {
        stopWithError(error);
      }
    }
    void boot();

    return () => {
      stopped = true;
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      setStateRef.current = null;
      ribbonTarget?.destroy();
      ribbonTarget = null;
      device?.destroy();
      device = null;
      canvas.remove();
    };
  }, []);

  // Props in, uniforms out — never a device restart.
  useEffect(() => {
    stateRef.current = state;
    setStateRef.current?.(state);
  }, [state]);

  useEffect(() => {
    audioRef.current = normaliseBands(audioBands);
  }, [audioBands]);

  return (
    <div ref={containerRef} className={`orb-container ${className}`.trim()} />
  );
};

export default Orb;
