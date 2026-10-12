import { SiteHeader } from "@/components/site/site-header"
import { SiteFooter } from "@/components/site/site-footer"

/*
 * Layout del sitio público (portada, precios, acceso, registro, 404).
 *
 * El chrome público (cabecera + pie) vive aquí y no en `[lang]/layout.tsx`
 * porque la zona autenticada usa un shell completamente distinto —el de
 * QuestVault, con sidebar fijo, barra superior y barra de estado— definido en
 * `(app)/layout.tsx`. Los route groups no afectan a la URL, así que `/es`,
 * `/es/pricing` o `/es/app` siguen siendo las mismas rutas.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  )
}
