#version 300 es
precision highp float;
precision mediump int;

uniform sampler2D inPosTex;
uniform sampler2D flowMap;

uniform int sqrtNumParticles;
uniform int numParticles;
uniform float invSqrtNumParticles;
uniform float invNumParticles;

uniform float driftAmount;
uniform float noiseAmount;
uniform float yWind;

uniform float speed;
uniform float zCenter;
uniform float zGravity;

uniform float scrollDelta; 

uniform float noiseTime;
uniform float noiseFrequency;
uniform float flowStrength;

uniform vec2 aspect;
uniform float repel;
uniform float lineStrength;
uniform float lineFreq;

in vec2 particleId;

layout(location=0) out vec4 pos;

#include "./noise.glsl"

vec3 fbm4d(vec4 p) {
  vec3 result = vec3(0.0);
  float amplitude = 1.0;
  float frequency = 1.0;
  
  for(int i = 0; i < 5; i++) {
    result += amplitude * vec3(
      snoise4d(p * frequency + vec4(0.0, 0.0, 0.0, 0.0)),
      snoise4d(p * frequency + vec4(100.0, 0.0, 0.0, 0.0)), 
      snoise4d(p * frequency + vec4(0.0, 100.0, 0.0, 0.0))
    );
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  
  return result;
}

ivec2 idToUv(int idx) {
  return ivec2(idx % sqrtNumParticles, idx / sqrtNumParticles);
}

void main() {
  ivec2 iUv = ivec2(floor(particleId));
  int id = iUv.x + iUv.y * sqrtNumParticles;

  vec4 inData = texelFetch(inPosTex, iUv, 0);
  vec3 inPos = inData.xyz;
  float closestIdx = inData.w;

  float noiseSpeed = float(iUv.y) * invSqrtNumParticles + 0.5;

  vec3 drift = (vec3(
    hash(id),
    hash(id + numParticles),
    hash(id + numParticles * 2)
  ) - 0.5) * driftAmount;

  // Stochastic nearest neighbor search
  // Get current closest particle
  int closestId = int(closestIdx);
  vec3 closestPos = texelFetch(inPosTex, idToUv(closestId), 0).xyz;
  vec3 toClosest = inPos - closestPos;
  float closestDistSq = dot(toClosest, toClosest);

  // Generate pseudorandom particle index from position + uv + time
  float randSeed = hash(id) + inPos.x * 1000.0 + inPos.y * 1000.0 + noiseTime * 10.0;
  int randomId = int(mod(randSeed * float(numParticles), float(numParticles)));
  if (randomId == id) randomId = (randomId + 1) % numParticles;

  vec3 randomPos = texelFetch(inPosTex, idToUv(randomId), 0).xyz;
  vec3 toRandom = inPos - randomPos;
  float randomDistSq = dot(toRandom, toRandom);

  // Update closest if random is closer (and not self)
  vec3 repelDir;
  float repelDistSq;
  if (randomDistSq < closestDistSq) {
    closestIdx = float(randomId);
    repelDir = toRandom;
    repelDistSq = randomDistSq;
  } else {
    repelDir = toClosest;
    repelDistSq = closestDistSq;
  } 

  // Overnormalized repel force (divide by sqLen)
  vec3 repelForce = repelDir / (repelDistSq + 0.0001); 

  // Fetch Flow Data
  vec2 uv = inPos.xy * 0.5 + 0.5;
  
  vec2 flow = texture(flowMap, uv).xy; 

  vec4 noisePos = vec4(vec3(inPos.xy * inPos.z * aspect, inPos.z) * noiseFrequency, noiseTime);
  vec3 noise = fbm4d(noisePos);

  float zForce = (zCenter - inPos.z) * zGravity;
  float invZ = 1.0 / inPos.z;
  zForce += 0.2 * invZ; 

  vec3 combinedVelo = noiseSpeed * noise * noiseAmount + drift;
  combinedVelo.y += yWind;
  combinedVelo.z += zForce;
  combinedVelo += repelForce * repel;

  combinedVelo *= speed;

  combinedVelo.xy += flow * flowStrength;

  // Horizontal line alignment: push particles up or down based on y position
  float lineMod = mod(inPos.y, lineFreq) / lineFreq; // 0..1 within each band
  float lineFlow = (lineMod < 0.5) ? -1.0 : 1.0;     // push to band edges
  combinedVelo.y += lineFlow * lineStrength;

  vec3 newPos = inPos + combinedVelo * vec3(aspect.yx * invZ, 1.0);
  
  newPos.y += scrollDelta;

  newPos.z = max(newPos.z, 1.0);

  vec2 wrapBound = 1.0 + aspect.yx * 0.1;

  newPos.xy = mod(newPos.xy + wrapBound, wrapBound * 2.0) - wrapBound;

  pos = vec4(newPos, closestIdx);
}
