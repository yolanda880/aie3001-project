import * as THREE from 'three'

export function createKeyFillUniforms(length: number) {
  return {
    uKeyFill: { value: 0 },
    uKeyFillLength: { value: length },
    uKeyFillColor: { value: new THREE.Color() },
    uKeyFillOpacity: { value: 1 },
    uKeyFillEmissive: { value: 1 },
  }
}

/** Colour the existing key geometry, preserving notches, depth and press motion. */
export function patchKeyFillMaterial(
  material: THREE.MeshStandardMaterial,
  uniforms: ReturnType<typeof createKeyFillUniforms>,
) {
  const previousPatch = material.onBeforeCompile
  const previousKey = material.customProgramCacheKey()
  material.onBeforeCompile = (shader, renderer) => {
    previousPatch.call(material, shader, renderer)
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      uniform float uKeyFillLength;
      varying float vKeyFillDistance;
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vKeyFillDistance = 0.5 - position.y / uKeyFillLength;
    `)
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      uniform float uKeyFill;
      uniform vec3 uKeyFillColor;
      uniform float uKeyFillOpacity;
      uniform float uKeyFillEmissive;
      varying float vKeyFillDistance;
    `).replace('#include <tonemapping_fragment>', `
      if (uKeyFill > 0.0 && vKeyFillDistance <= uKeyFill) {
        gl_FragColor.rgb = mix(gl_FragColor.rgb,
          uKeyFillColor * (1.0 + uKeyFillEmissive), uKeyFillOpacity);
      }
      #include <tonemapping_fragment>
    `)
  }
  material.customProgramCacheKey = () => previousKey + '-key-fill'
  material.needsUpdate = true
}
