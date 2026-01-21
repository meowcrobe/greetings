#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in float t; // 0.0 start, 1.0 end

uniform sampler2D positionsTex;
uniform int sqrtNumParticles;

out float vDepth;
out float vMix;
flat out float vDistAlpha;

void main() {
  int instanceId = gl_InstanceID;
  
  // Calculate UV for current particle
  ivec2 uv = ivec2(
    instanceId % sqrtNumParticles,
    instanceId / sqrtNumParticles
  );
  
  // Fetch current particle data
  vec4 data = texelFetch(positionsTex, uv, 0);
  vec3 pos1 = data.xyz;
  float neighborIdx = data.w;
  
  // Calculate UV for neighbor particle
  ivec2 neighborUv = ivec2(
    int(neighborIdx) % sqrtNumParticles,
    int(neighborIdx) / sqrtNumParticles
  );
  
  // Fetch neighbor position
  vec3 pos2 = texelFetch(positionsTex, neighborUv, 0).xyz;

  // Calculate squared distance factor
  vec3 diff = pos1 - pos2;
  float distSq = dot(diff, diff);
  vDistAlpha = 1.0 / (1. + distSq); 
  
  // Mix based on t
  vec3 pos = mix(pos1, pos2, t);
  
  // Pass depth and mix factor to fragment shader
  vDepth = pos.z;
  vMix = t;
  
  // Output position (matching render.vert scaling)
  gl_Position = vec4(pos.xy * 1.1, 0.0, 1.0);
}
