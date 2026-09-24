import { Resend } from "resend"

const apiKey = process.env.RESEND_API_KEY
const fromAddress = process.env.EMAIL_FROM ?? "GameVault <onboarding@resend.dev>"

export const resend = apiKey ? new Resend(apiKey) : null

export async function sendVerificationEmail(params: {
  to: string
  locale: "es" | "en"
  verificationUrl: string
}) {
  const { to, locale, verificationUrl } = params

  if (!resend) {
    console.warn(
      "[email] RESEND_API_KEY no configurado. Envía de verificación omitido.",
    )
    return null
  }

  const messages = {
    es: {
      subject: "Verifica tu correo en GameVault",
      heading: "Verifica tu correo electrónico",
      body: "Para completar tu registro, confirma tu dirección de correo:",
      cta: "Verificar correo",
      footer:
        "Si no creaste una cuenta en GameVault, ignora este mensaje. El enlace caduca en 24 horas.",
    },
    en: {
      subject: "Verify your email on GameVault",
      heading: "Verify your email address",
      body: "To complete your registration, confirm your email address:",
      cta: "Verify email",
      footer:
        "If you didn't create a GameVault account, ignore this email. The link expires in 24 hours.",
    },
  }[locale]

  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to,
    subject: messages.subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h1 style="font-size: 20px;">${messages.heading}</h1>
        <p style="color: #444;">${messages.body}</p>
        <p>
          <a href="${verificationUrl}"
             style="display: inline-block; padding: 12px 20px; background: #111827; color: #fff;
                    border-radius: 8px; text-decoration: none; font-weight: 600;">
            ${messages.cta}
          </a>
        </p>
        <p style="color:#888; font-size: 12px;">${messages.footer}</p>
      </div>
    `,
  })

  if (error) {
    console.error("[email] Error enviando verificación:", error)
    return null
  }

  return data
}