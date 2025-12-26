/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // !! ADVERTENCIA !!
    // Esto permite que el deploy continúe a pesar de que haya errores de tipo.
    ignoreBuildErrors: true,
  },
  eslint: {
    // Esto ignora los errores de linting (como lo de las imágenes <img>)
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
