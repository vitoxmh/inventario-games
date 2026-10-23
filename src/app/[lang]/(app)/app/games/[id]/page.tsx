import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { lang } from "next/root-params"
import { Pen } from "lucide-react"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { Breadcrumb } from "@/components/ui/breadcrumb"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { GameDetailActions } from "@/components/inventory/game-detail-actions"
import { ImageLightbox } from "@/components/inventory/image-lightbox"
import { PartsBadges } from "@/components/inventory/parts-badges"
import { RatingStars } from "@/components/inventory/rating"
import { ratingLabel } from "@/lib/rating"
import { genreNames } from "@/lib/genres"
import { conditionLabel } from "@/lib/conditions"
import {
  KIND_ICONS,
  kindSupportsDeveloper,
  kindSupportsGenre,
  kindSupportsParts,
  kindSupportsPlatform,
  kindSupportsPlaytime,
  kindSupportsVolume,
} from "@/lib/kinds"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale } from "@/lib/i18n/locales"

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  const currentLocale = await lang()
  const locale = isLocale(currentLocale) ? currentLocale : "es"

  if (!session) {
    redirect(
      `/${locale}/login?callbackUrl=${encodeURIComponent(`/${locale}/app/games/${id}`)}`,
    )
  }

  const dict = await getDictionary()
  const inv = dict.inventory

  const game = await prisma.game.findFirst({
    where: { id, userId: session.user.id },
    include: {
      images: { orderBy: { position: "asc" } },
      platform: { select: { name: true } },
      genres: {
        orderBy: { genre: { sortOrder: "asc" } },
        select: { genre: { select: { slug: true, nameEs: true, nameEn: true } } },
      },
    },
  })
  if (!game) notFound()

  const dateFormatter = new Intl.DateTimeFormat(
    locale === "es" ? "es-ES" : "en-US",
    { dateStyle: "long" },
  )
  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  })

  const cover = game.images[0]?.url ?? game.coverImageUrl
  const images = game.images.map((image) => image.url)
  const price =
    game.purchasePrice != null
      ? currencyFormatter.format(Number(game.purchasePrice))
      : null
  const playtime =
    kindSupportsPlaytime(game.kind) &&
    game.playtimeMin != null &&
    game.playtimeMin > 0
      ? `${Math.round(game.playtimeMin / 60)} ${inv.playtime}`
      : null

  const fields = inv.kindFields[game.kind]
  const KindIcon = KIND_ICONS[game.kind]
  // Las figuras no usan plataforma, género ni desarrollador: no se pintan
  // siquiera como fila vacía.
  const showPlatform = kindSupportsPlatform(game.kind)
  const showGenre = kindSupportsGenre(game.kind)
  const showDeveloper = kindSupportsDeveloper(game.kind)

  const genreLabels = genreNames(
    game.genres.map((row) => row.genre),
    locale,
  )
  const genreLabel = genreLabels.join(", ")

  const meta: Array<{ label: string; value: string }> = [
    ...(showPlatform && game.platform
      ? [{ label: fields.platform, value: game.platform.name }]
      : []),
    ...(showGenre ? [{ label: inv.genre, value: genreLabel || "—" }] : []),
    ...(showDeveloper
      ? [{ label: fields.developer, value: game.developer ?? "—" }]
      : []),
    { label: fields.publisher, value: game.publisher ?? "—" },
    ...(game.series ? [{ label: inv.series, value: game.series }] : []),
    ...(kindSupportsVolume(game.kind) && game.volume != null
      ? [{ label: inv.volume, value: String(game.volume) }]
      : []),
    {
      label: inv.condition,
      value: conditionLabel(game.condition, inv.conditions) ?? "—",
    },
    ...(playtime ? [{ label: inv.playtimeLabel, value: playtime }] : []),
    { label: inv.purchasePrice, value: price ?? "—" },
    {
      label: inv.purchaseDate,
      value: game.purchaseDate
        ? dateFormatter.format(new Date(game.purchaseDate))
        : "—",
    },
    { label: inv.addedAt, value: dateFormatter.format(new Date(game.createdAt)) },
  ]

  return (
    <div className="game-detail">
      {/* La miga sustituye al enlace "volver": cumple la misma función de
          regreso y además sitúa la ficha dentro de la colección. */}
      <Breadcrumb
        label={inv.breadcrumb}
        items={[
          {
            label: inv.collectionTitle,
            href: `/${locale}/app`,
            icon: <KindIcon aria-hidden="true" />,
          },
          { label: game.title },
        ]}
      />

      <div className="page-head">
        <div className="u-grow u-min-0">
          <div className="game-detail__title-row">
            <h1 className="page-title page-title--lg">
              {game.title}
            </h1>
            <Badge variant="outline">{inv.kinds[game.kind]}</Badge>
            <Badge variant="secondary">{inv.statuses[game.status]}</Badge>
          </div>
          <p className="page-lead page-lead--spaced">
            {[
              showPlatform ? game.platform?.name : null,
              showGenre && genreLabels.length > 0
                ? genreLabels.join(" · ")
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {/* La valoración va bajo el título, no en el grid de datos: es el dato
              que resume el juego de un vistazo, y enterrarlo entre condición y
              precio lo convertía en una fila más. */}
          {game.rating != null && (
            <RatingStars
              value={game.rating}
              label={ratingLabel(inv.ratingValue, game.rating)}
              className="game-detail__rating"
            />
          )}
        </div>
        <div className="u-cluster u-cluster--tight">
          <Link
            href={`/${locale}/app/games/${game.id}/edit`}
            className={cn(buttonVariants({ size: "sm" }), "u-flex u-gap-2")}
          >
            <Pen className="u-icon" aria-hidden="true" />
            {inv.edit}
          </Link>
          <GameDetailActions
            gameId={game.id}
            title={game.title}
            dict={inv}
            lang={locale}
          />
        </div>
      </div>

      <div className="game-detail__body">
        <div className="game-detail__aside">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={game.title}
              className="game-detail__cover"
            />
          ) : (
            <div className="game-detail__cover game-detail__cover--empty">
              <KindIcon aria-hidden="true" />
            </div>
          )}
          {/* Qué tiene la copia, bajo la portada y no en el bloque de datos: es el
              detalle que se mira junto al juego, y en digital o en deseos el
              componente no pinta nada. */} 
          {kindSupportsParts(game.kind) && (
            <PartsBadges
              parts={game.parts}
              status={game.status}
              labels={inv.parts}
              title={inv.partsLabel}
            />
          )}
        </div>

        <div className="game-detail__main">
          <div className="game-detail__tags">
            {meta.map(({ label, value }) => (
              <div
                key={label}
                className="game-detail__tag"
              >
                <p className="game-detail__tag-key">{label}</p>
                <p className="game-detail__tag-value">{value}</p>
              </div>
            ))}
          </div>

          {game.notes ? (
            <div className="game-detail__panel">
              <h2 className="game-detail__panel-title">{inv.notes}</h2>
              <p className="game-detail__panel-body">{game.notes}</p>
            </div>
          ) : null}
        </div>
      </div>

      {images.length > 0 && (
        <div className="game-detail__actions">
          <h2 className="game-detail__panel-title">{inv.galleryTitle}</h2>
          <ImageLightbox images={images} dict={inv} />
        </div>
      )}
    </div>
  )
}