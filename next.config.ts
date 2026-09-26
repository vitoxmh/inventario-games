import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node mínimo con el server standalone: el runtime de la imagen Docker solo
  // necesita .next/standalone + .next/static + public (sin node_modules, sin
  // devDependencies). `next start` sigue funcionando igual para las pruebas.
  output: "standalone",
};

export default nextConfig;
