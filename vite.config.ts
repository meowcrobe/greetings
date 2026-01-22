import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

export default defineConfig(({ command }) => {
  const isBuild = command === 'build'

  return {
    base: './',
    plugins: [
      glsl({
        minify: isBuild
      })
    ]
  }
})
