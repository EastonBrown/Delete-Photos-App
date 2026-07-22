import { ExpoWebGLRenderingContext, GLView } from "expo-gl";
import { getLocalUri } from "./mediaLibrary";
import { Hash } from "./similarityMatch";

// dHash: downscale to a (HASH_WIDTH x HASH_HEIGHT) grayscale grid, then for
// each row compare each pixel to its right-hand neighbor. HASH_WIDTH is one
// wider than HASH_HEIGHT so every row yields exactly HASH_HEIGHT comparisons —
// HASH_HEIGHT * HASH_HEIGHT = 64 bits total, matching the spec's 64-bit hash.
const HASH_HEIGHT = 8;
const HASH_WIDTH = HASH_HEIGHT + 1;

const VERTEX_SHADER = `
  attribute vec2 position;
  varying vec2 vTexCoord;
  void main() {
    vTexCoord = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 vTexCoord;
  uniform sampler2D uTexture;
  void main() {
    vec4 color = texture2D(uTexture, vTexCoord);
    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    gl_FragColor = vec4(luma, luma, luma, 1.0);
  }
`;

function compileShader(gl: ExpoWebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${info}`);
  }
  return shader;
}

function createGrayscaleProgram(gl: ExpoWebGLRenderingContext): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${info}`);
  }
  return program;
}

// Draws a full-viewport quad, letting the vertex shader derive texture
// coordinates from clip-space position — no separate texcoord buffer needed.
function drawFullscreenQuad(gl: ExpoWebGLRenderingContext, program: WebGLProgram): void {
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  // prettier-ignore
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW
  );

  const positionLocation = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.deleteBuffer(positionBuffer);
}

function bitsToHash(bits: boolean[]): Hash {
  let hash = 0n;
  for (const bit of bits) {
    hash = (hash << 1n) | (bit ? 1n : 0n);
  }
  return hash;
}

// Renders the photo downscaled and grayscale into a small offscreen
// framebuffer, reads the raw pixels back, and derives a 64-bit difference
// hash by comparing each pixel to its right-hand neighbor. See CONTEXT.md /
// docs/adr/0001-windowed-random-similarity-scan.md for how this feeds the
// Similarity Scan. Not unit tested (no expo-gl in the test environment) —
// verify manually on-device, same as mediaLibrary.ts's other adapters.
export async function computeHash(photoId: string): Promise<Hash> {
  const localUri = await getLocalUri(photoId);
  const gl = await GLView.createContextAsync();

  try {
    const program = createGrayscaleProgram(gl);
    gl.useProgram(program);

    const sourceTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // expo-gl accepts `{ localUri }` as a texImage2D pixels source, on top of the
    // standard WebGL2 pixels types its own type defs are limited to.
    const localImageSource = { localUri } as unknown as TexImageSource;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, localImageSource);

    const targetTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, targetTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      HASH_WIDTH,
      HASH_HEIGHT,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, targetTexture, 0);

    gl.viewport(0, 0, HASH_WIDTH, HASH_HEIGHT);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    drawFullscreenQuad(gl, program);

    const pixels = new Uint8Array(HASH_WIDTH * HASH_HEIGHT * 4);
    gl.readPixels(0, 0, HASH_WIDTH, HASH_HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.endFrameEXP();

    const luminanceAt = (col: number, row: number) => pixels[(row * HASH_WIDTH + col) * 4];

    const bits: boolean[] = [];
    for (let row = 0; row < HASH_HEIGHT; row++) {
      for (let col = 0; col < HASH_HEIGHT; col++) {
        bits.push(luminanceAt(col, row) > luminanceAt(col + 1, row));
      }
    }

    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(targetTexture);
    gl.deleteTexture(sourceTexture);
    gl.deleteProgram(program);

    return bitsToHash(bits);
  } finally {
    await GLView.destroyContextAsync(gl);
  }
}
