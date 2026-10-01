import Link from "next/link"
import { Database, Bell, Cloud, Lock } from "lucide-react"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { getPlan, planName as planNameOf } from "@/lib/plans"
import { sortPlatforms } from "@/lib/platforms"
import { sortGenresByName } from "@/lib/genres"
import { Logo } from "@/components/site/logo"
import { LocaleSwitcher } from "@/components/site/locale-switcher"
import { AddGameDialog } from "@/components/inventory/add-game-dialog"
import { ShellSidebarNav } from "@/components/app-shell/shell-sidebar-nav"
import { ShellUserMenu } from "@/components/app-shell/shell-user-menu"
import { TopbarSearch } from "@/components/app-shell/topbar-search"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import type { Locale } from "@/lib/i18n/locales"

/**
 * Shell de QuestVault para la zona autenticada (`/app` y `/admin`).
 *
 * Reproduce el armazón del diseño Stitch: un sidebar fijo de 16rem a la
 * izquierda, una barra superior fija con búsqueda y CTA, el área de contenido
 * desplazada por el ancho del sidebar, y una barra de estado fija al pie.
 *
 * Es un Server Component: consulta la sesión, el número de juegos y las
 * plataformas disponibles. Las únicas partes interactivas (ruta activa del
 * menú, avatar, búsqueda) son Client Components aparte.
 */
export async function AppShell({
  locale,
  isAdmin,
  children,
}: {
  locale: Locale
  isAdmin: boolean
  children: React.ReactNode
}) {
  const session = await auth()
  const dict = await getDictionary()

  const [gameCount, platforms, genres] = await Promise.all([
    prisma.game.count({ where: { userId: session!.user.id } }),
    prisma.platform.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    prisma.genre.findMany({
      orderBy: [{ sortOrder: "asc" }, { nameEs: "asc" }],
      select: { id: true, slug: true, nameEs: true, nameEn: true },
    }),
  ])

  const planRow = await getPlan(session!.user.plan)
  const planName = planRow ? planNameOf(planRow, locale) : dict.app.planNames.FREE

  const name = session!.user.name ?? session!.user.email ?? "—"

  return (
    <div className="shell">
      <aside className="shell__sidebar">
        <div className="shell__sidebar-top">
          <Link href={`/${locale}`} className="shell__brand">
            <Logo name={dict.site.name} className="shell__logo" />
          </Link>

          <ShellSidebarNav
            locale={locale}
            isAdmin={isAdmin}
            labels={{
              collection: dict.app.navLabel,
              admin: dict.admin.title,
              dashboard: dict.app.dashboard,
              stats: dict.app.stats,
              billing: dict.app.billing,
              account: dict.app.account,
              users: dict.admin.users,
              games: dict.admin.games,
              subscriptions: dict.admin.subscriptions,
              platforms: dict.admin.platforms,
              genres: dict.admin.genres,
              plans: dict.admin.plans,
              payments: dict.admin.payments,
            }}
          />
        </div>

        <div className="shell-vault">
          <div className="shell-vault__head">
            <p className="shell-vault__title">{dict.app.dashboard}</p>
            <span className="shell-vault__dot" aria-hidden="true" />
          </div>
          <p className="shell-vault__count">
            {dict.app.totalGames}: <strong>{gameCount}</strong>
          </p>
          <p className="shell-vault__meta">
            <Cloud className="shell-vault__meta-icon" aria-hidden="true" />
            {planName}
          </p>
        </div>
      </aside>

      <div className="shell__body">
        <header className="shell__topbar">
          <TopbarSearch
            locale={locale}
            statusLabels={dict.inventory.statuses}
            ratingValueTemplate={dict.inventory.ratingValue}
            dict={{
              placeholder: dict.app.searchPlaceholder,
              label: dict.app.searchLabel,
              searching: dict.app.searchSearching,
              noResults: dict.app.searchNoResults,
              searchError: dict.app.searchError,
            }}
          />

          <div className="topbar__actions">
            <div className="topbar__sync">
              <Cloud className="topbar__sync-icon" aria-hidden="true" />
              <span className="topbar__sync-text">{planName}</span>
            </div>

            <LocaleSwitcher
              currentLocale={locale}
              label={dict.locale.switchTo}
            />

            <AddGameDialog
              dict={dict.inventory}
              // Alfabéticos y en el idioma de la página, igual que en la
              // colección: el alta manual de la barra superior y la de la
              // página tienen que ofrecer las mismas listas en el mismo orden.
              platforms={sortPlatforms(platforms)}
              genres={sortGenresByName(genres, locale)}
              lang={locale}
              triggerClassName="topbar__cta"
              triggerLabel={dict.app.addGame}
            />

            <button type="button" className="topbar__icon-btn" aria-hidden="true">
              <Bell className="topbar__icon" />
              <span className="topbar__icon-dot" />
            </button>

            <ShellUserMenu
              name={name}
              email={session!.user.email ?? ""}
              role={planName}
              isAdmin={isAdmin}
              locale={locale}
              labels={{
                account: dict.app.account,
                billing: dict.app.billing,
                admin: dict.admin.title,
                logout: dict.app.logout,
              }}
            />
          </div>
        </header>

        <main className="shell__main">{children}</main>

        <footer className="shell__status">
          <div className="status-bar">
            <div className="status-bar__group">
              <span className="status-bar__item">
                <Database className="status-bar__icon" aria-hidden="true" />
                {dict.app.totalGames}: {gameCount}
              </span>
              <span className="status-bar__dot" aria-hidden="true" />
              <span className="status-bar__item">{planName}</span>
            </div>
            <div className="status-bar__group">
              <span className="status-bar__item">
                <Lock className="status-bar__icon" aria-hidden="true" />
                {name}
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
