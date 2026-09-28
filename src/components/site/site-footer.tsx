import Link from "next/link"
import { lang } from "next/root-params"
import { Logo } from "@/components/site/logo"
import { getDictionary } from "@/lib/i18n/get-dictionary"

export async function SiteFooter() {
  const dict = await getDictionary()
  const currentLocale = await lang()

  return (
    <footer className="site-footer">
      <div className="site-footer__inner container">
        <Link href={`/${currentLocale}`} className="u-grow">
          <Logo name={dict.site.name} />
        </Link>
        <p className="site-footer__note">
          © {new Date().getFullYear()} {dict.site.name}. {dict.footer.rights}
        </p>
        <p className="site-footer__note">{dict.footer.madeWith}</p>
      </div>
    </footer>
  )
}
