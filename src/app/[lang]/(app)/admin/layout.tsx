import { lang } from "next/root-params"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/guard"
import { isLocale } from "@/lib/i18n/locales"

/*
 * La navegación de administración ya la pinta el shell de QuestVault como una
 * segunda sección del sidebar, así que aquí solo queda la autorización: el rol
 * se comprueba contra la base de datos, no contra la sesión.
 */
export const dynamic = "force-dynamic"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const guard = await requireAdmin()
  const currentLocale = await lang()
  const locale = isLocale(currentLocale) ? currentLocale : "es"

  if (!guard.authorized) {
    redirect(`/${locale}/app`)
  }

  return <>{children}</>
}
