import Link from "next/link"
import { lang } from "next/root-params"
import { Logo } from "@/components/site/logo"
import { getDictionary } from "@/lib/i18n/get-dictionary"

export async function SiteFooter() {
  const dict = await getDictionary()
  const currentLocale = await lang()

  return (
    <footer className="border-t py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
        <Link href={`/${currentLocale}`} className="shrink-0">
          <Logo name={dict.site.name} />
        </Link>
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} {dict.site.name}. {dict.footer.rights}
        </p>
        <p className="text-sm text-muted-foreground">{dict.footer.madeWith}</p>
      </div>
    </footer>
  )
}