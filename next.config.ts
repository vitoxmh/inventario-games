import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node mínimo con el server standalone: el runtime de la imagen Docker solo
  // necesita .next/standalone + .next/static + public (sin node_modules, sin
  // devDependencies). `next start` sigue funcionando igual para las pruebas.
  output: "standalone",
  // SASS lo compila Next de forma nativa (no hace falta PostCSS). Se usa
  // `sass-embedded` porque es mucho más rápido que el paquete `sass` de Dart.
  sassOptions: {
    implementation: "sass-embedded",
  },
};

export default nextConfig;
