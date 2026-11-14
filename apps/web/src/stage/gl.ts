// The few WebGL2 calls the stage needs, without a rendering library: it draws
// three kinds of things (a full-screen grid, instanced squares, bent
// pictures), each with one small program.

export type GL = WebGL2RenderingContext;

function compile(gl: GL, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Shader allocation failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "Shader compilation failed";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

export type Program<U extends string> = {
  program: WebGLProgram;
  uniforms: Record<U, WebGLUniformLocation | null>;
  attribute: (name: string) => number;
};

export function createProgram<U extends string>(
  gl: GL,
  vertex: string,
  fragment: string,
  uniformNames: readonly U[],
): Program<U> {
  const program = gl.createProgram();
  if (!program) throw new Error("Program allocation failed");
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  // The program keeps what it needs of both.
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Program link failed");
  }
  const uniforms = {} as Record<U, WebGLUniformLocation | null>;
  for (const name of uniformNames) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  return {
    program,
    uniforms,
    attribute: (name) => gl.getAttribLocation(program, name),
  };
}

/** A triangle that covers the whole viewport. */
export const fullscreenVertex = /* glsl */ `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

export function createFullscreenTriangle(gl: GL, location: number) {
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { vao, buffer };
}
