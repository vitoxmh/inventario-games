import type { Metadata } from "next"
import Link from "next/link"
import { lang } from "next/root-params"
import { Home } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { locales } from "@/lib/i18n/locales"
import { absoluteUrl } from "@/lib/seo"

// Sin metadata propia, el not-found heredaba el title por defecto del layout
// ("… · VMVault") en un 404, que es lo que Google muestra como título en los
// resultados. Solo las locales reales del sitio, y siempre noindex.
export const metadata: Metadata = {
  title: "404",
  robots: { index: false, follow: true },
  alternates: {
    canonical: absoluteUrl("/"),
    languages: {
      es: absoluteUrl("/es"),
      en: absoluteUrl("/en"),
      "x-default": absoluteUrl(`/${locales[0]}`),
    },
  },
}

export default async function NotFound() {
  const dict = await getDictionary()
  const currentLocale = await lang()

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 px-4 py-24 text-center sm:px-6">
      <h1 className="text-4xl font-bold tracking-tight">{dict.notFound.title}</h1>
      <p className="text-muted-foreground">{dict.notFound.description}</p>
      <Link href={`/${currentLocale}`} className={buttonVariants()}>
        <Home aria-hidden="true" />
        {dict.notFound.home}
      </Link>
    </div>
  )
}
