import { lang } from "next/root-params"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { requireAdmin } from "@/lib/guard"
import { AppShell } from "@/components/app-shell/app-shell"
import { isLocale, type Locale } from "@/lib/i18n/locales"

export const dynamic = "force-dynamic"

/**
 * Layout de la zona autenticada.
 *
 * Aquí viven tanto `/app` como `/admin`; el propio shell decide si el sidebar
 * muestra la sección de administración según el rol. Las guardas de acceso se
 * resuelven en este nivel para que ninguna página autenticada tenga que
 * repetirlas: sin sesión va al acceso, y con la cuenta suspendida a la pantalla
 * de suspensión.
 */
export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  const currentLocale = await lang()
  const locale: Locale = isLocale(currentLocale) ? currentLocale : "es"

  if (!session?.user?.id) {
    redirect(`/${locale}/login`)
  }

  if (session.user.banned) {
    redirect(`/${locale}/suspended`)
  }

  // `requireAdmin` relee el rol desde BD, que es la fuente autoritativa: la
  // sesión puede llevar un rol obsoleto tras una promoción.
  const guard = await requireAdmin()

  return (
    <AppShell locale={locale} isAdmin={guard.authorized}>
      {children}
    </AppShell>
  )
}
