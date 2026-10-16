/**
 * As marcas das plataformas: WhatsApp, Instagram, Meta e Google Agenda.
 *
 * Ícone genérico (um balão, uma câmera) diz "mensagem"; a logo diz QUAL
 * plataforma — é o que a pessoa reconhece de relance na grade de Conexões.
 * São marcas de terceiros: o glifo é o oficial e a cor é a da marca, não a do
 * white-label. Por isso as cores vivem como token em globals.css, e nenhum
 * hex aparece aqui.
 *
 * Os glifos são silhuetas (fill="currentColor"): a cor vem de fora, do chip
 * que os envolve ou da classe de texto — assim a mesma logo serve em 44px no
 * cartão e em 16px na lista do Criar.
 */
import { cn } from "@/lib/utils";

/** Qual plataforma a conexão é. O oficial é WhatsApp com o selo da Meta; o
 *  Google Agenda não é canal de mensagem, mas tem cartão em Conexões e a
 *  pessoa o reconhece pela logo (o dono, 01/10/2026). */
export type MarcaCanal = "whatsapp" | "whatsapp_oficial" | "instagram" | "google_agenda" | "facebook";

type Glifo = React.SVGProps<SVGSVGElement>;

export function LogoWhatsapp({ className, ...p }: Glifo) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden {...p}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

export function LogoInstagram({ className, ...p }: Glifo) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden {...p}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069M12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0m0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324M12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8m6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881" />
    </svg>
  );
}

/** O "f" do Facebook: a Página dos formulários de anúncio. */
export function LogoFacebook({ className, ...p }: Glifo) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden {...p}>
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
    </svg>
  );
}

/** O laço da Meta — vai no canto do WhatsApp oficial (Cloud API). */
export function LogoMeta({ className, ...p }: Glifo) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden {...p}>
      <path d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303m10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602m-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285" />
    </svg>
  );
}

/**
 * O Google Agenda: a folhinha com a moldura em quatro cores e o "31".
 *
 * É a única logo que não é silhueta: a marca É as quatro cores, e uma
 * versão de uma cor só viraria um calendário qualquer. As cores são tokens
 * (--marca-google-*), como as outras. O miolo é branco em qualquer tema, como
 * o ícone oficial.
 */
export function LogoGoogleAgenda({ className, ...p }: Glifo) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...p}>
      <path fill="var(--marca-google-fundo)" d="M6.5 6.5h11v11h-11z" />
      <path fill="var(--marca-google-azul)" d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.5H3zM3 6.5h3.5v11H3z" />
      <path fill="var(--marca-google-verde)" d="M17.5 6.5H21v11h-3.5z" />
      <path fill="var(--marca-google-amarelo)" d="M3 17.5h14.5V21H5a2 2 0 0 1-2-2z" />
      <path fill="var(--marca-google-vermelho)" d="M17.5 17.5H21l-3.5 3.5z" />
      <text
        x="12"
        y="15.1"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="7.6"
        fontWeight="700"
        fill="var(--marca-google-azul)"
      >
        31
      </text>
    </svg>
  );
}

/** A logo sozinha, na cor da marca: para listas e linhas, onde um quadrado
 *  colorido pesaria demais. */
export function LogoDaMarca({ marca, className }: { marca: MarcaCanal; className?: string }) {
  if (marca === "google_agenda") return <LogoGoogleAgenda className={className} />;
  if (marca === "facebook") return <LogoFacebook className={cn("text-[var(--marca-facebook)]", className)} />;
  if (marca === "instagram") {
    return <LogoInstagram className={cn("text-[var(--marca-instagram)]", className)} />;
  }
  return <LogoWhatsapp className={cn("text-[var(--marca-whatsapp)]", className)} />;
}

/** A logo no quadrado da plataforma — o que abre o cartão da conexão.
 *  Tamanho e raio vêm de fora; o glifo acompanha a caixa. */
export function MarcaDoCanal({ marca, className }: { marca: MarcaCanal; className?: string }) {
  const instagram = marca === "instagram";
  const google = marca === "google_agenda";
  const facebook = marca === "facebook";
  const nome = google ? "Google Agenda" : facebook ? "Facebook" : instagram ? "Instagram" : marca === "whatsapp_oficial" ? "WhatsApp oficial" : "WhatsApp";
  return (
    <span
      className={cn(
        "relative grid place-items-center rounded-xl flex-shrink-0 text-white",
        google ? "marca-google" : facebook ? "marca-facebook" : instagram ? "marca-instagram" : "marca-whatsapp",
        className,
      )}
      title={nome}
      aria-label={nome}
    >
      {google ? (
        // A folhinha do Google é maior que as silhuetas: ela já traz a
        // própria moldura, e em metade da caixa ficaria um selo perdido.
        <LogoGoogleAgenda className="w-[68%] h-[68%]" />
      ) : facebook ? (
        <LogoFacebook className="w-1/2 h-1/2" />
      ) : instagram ? (
        <LogoInstagram className="w-1/2 h-1/2" />
      ) : (
        <LogoWhatsapp className="w-1/2 h-1/2" />
      )}
      {marca === "whatsapp_oficial" && (
        <span className="absolute -bottom-1 -right-1 grid place-items-center w-[17px] h-[17px] rounded-full bg-card ring-1 ring-border text-[var(--marca-meta)]">
          <LogoMeta className="w-[11px] h-[11px]" />
        </span>
      )}
    </span>
  );
}
