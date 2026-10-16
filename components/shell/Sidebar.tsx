"use client";

import Link from "next/link";
import { Logo } from "@/components/marca/Logo";
import { usePathname } from "next/navigation";
import { ChevronsLeft } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/vex/avatar";
import { itemAtivo, type NavItem, type NavSection } from "@/components/shell/nav-config";
import { TrocarContexto, type Contexto } from "./TrocarContexto";
import type { PessoaDoCabecalho } from "./TopHeader";
import { AbaDoTrilho } from "./AbaDoTrilho";

/**
 * O estilo do trilho no computador (`data-trilho`, desenhado no globals.css):
 *   • "laranja": o degradê da marca, ícones brancos e a aba da cor da página
 *     que desliza até o item ativo (shell/AbaDoTrilho), desde 01/10/2026;
 *   • "claro": o trilho no cinza claro dos menus (`--sidebar-background`),
 *     os ícones do Phosphor (icones/menu, regular, 26px) em cinza-azulado e o
 *     ativo numa linha em cinza mais escuro, com o traço grafite na borda e o
 *     ícone cheio em grafite (o dono, 04/10/2026, com a referência que mandou;
 *     as cores são os tokens --sidebar-icone, -icone-ativo, -ativo e -barra).
 */
export const ESTILO_DO_TRILHO: "laranja" | "claro" = "claro";

/**
 * O trilho de navegação — dos DOIS ambientes. Um componente só: o que muda
 * entre o painel do cliente e o backoffice é conteúdo (marca, destinos,
 * rodapé), e conteúdo entra por props.
 *
 * O desenho é o dos sistemas de atendimento e de CRM: um trilho de 80px em
 * que cada destino é SÓ o ícone — o nome e a dica do que a tela é
 * aparecem no rótulo ao passar o mouse. O trilho é FIXO: não expande, não
 * tem botão de recolher nem tecla de atalho (o dono, 29/09/2026: "deixe
 * nossa sidebar permanente fechada, não pode expandir"). Até então havia
 * uma coluna de 224px com os nomes por extenso, guardada no navegador e
 * aberta pela tecla "["; saiu inteira. A barra fica com a OPERAÇÃO, o que
 * se abre todo dia; a seção marcada `coluna` (Configurações) vira um item
 * só, com a engrenagem, no pé — e os destinos dela aparecem numa coluna ao
 * lado da barra (shell/ColunaDeSecao) enquanto a pessoa está lá. O item
 * ativo é a linha em cinza mais escuro, com o traço grafite na borda e o
 * ícone cheio (04/10/2026; antes era só a barra de 3px laranja). Nada de
 * título de seção em caixa alta: o que organiza é a ordem e o espaço.
 *
 * De cima para baixo: a marca da VEX (sem linha embaixo — o que a separa
 * dos destinos é o espaço), os destinos, e o pé com a EMPRESA de agora (o
 * quadrado de trocar de empresa), Suporte e a engrenagem: o lugar do
 * "workspace" nos sistemas em que se trabalha o dia todo (pedido do dono,
 * 29/09/2026: "o workspace precisa ficar em cima de Suporte, embaixo").
 *
 * No celular (gaveta) não há trilho: a gaveta lista todas as seções, por
 * extenso, com a empresa e o nome ao lado — é o único lugar em que a barra
 * escreve nomes.
 *
 * Tema e Sair NÃO moram aqui: estão no cabeçalho, no menu da pessoa. O
 * rodapé é da EMPRESA (cliente) ou da equipe (backoffice).
 */

export type MarcaDaBarra = {
  nome: string;
  /** Legenda fina sob a marca-palavra: "Backoffice". */
  legenda?: string;
  href: string;
};

export type RodapeDaBarra = {
  /** A primeira linha em negrito e o resto em corpo fino. */
  titulo: string;
  subtitulo?: string;
  href?: string;
  /** Imagem do quadrado; sem ela, as iniciais do título. */
  imagem?: string | null;
};

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

export function Sidebar({
  marca,
  secoes,
  rodape,
  contextos,
  assinatura = false,
  modo = "fixa",
  aberta = false,
  aoAlternar,
  aoNavegar,
  badges = {},
  pe,
  pessoa,
  aoSuporte,
}: {
  marca: MarcaDaBarra;
  secoes: NavSection[];
  rodape?: RodapeDaBarra;
  /** Os contextos que a pessoa pode abrir: a Central, a VEX Sales e os
   *  clientes com IA contratada. */
  contextos?: Contexto[];
  /** "Tecnologia VEX Growth" no pé — só no painel do cliente, e só na gaveta,
   *  que é onde há largura para texto. */
  assinatura?: boolean;
  /** `gaveta` é a versão do celular: por extenso, fechada pelo X da casca. */
  modo?: "fixa" | "gaveta";
  /** No computador o trilho abre em coluna com os nomes por extenso. */
  aberta?: boolean;
  aoAlternar?: () => void;
  aoNavegar?: () => void;
  /** Contadores discretos por rota — só quando existe algo que pede ação. */
  badges?: Record<string, number>;
  /** O que vai no fim do trilho, abaixo de tudo (sino e Sair, desde 01/10). */
  pe?: React.ReactNode;
  /** Quem está logado: o quadrado da empresa vira o menu da conta (04/10). */
  pessoa?: PessoaDoCabecalho;
  aoSuporte?: () => void;
}) {
  const pathname = usePathname();
  // Só a gaveta escreve por extenso; o trilho é sempre só ícones.
  const expandida = modo === "gaveta" || aberta;

  // O ativo é o destino de href mais longo que contém a rota (nav-config).
  const atual = itemAtivo(pathname, secoes);
  const ativo = (href: string) => atual?.item.href === href;

  // Na barra ficam as seções principais; a seção em coluna vira um item só
  // no pé (menos na gaveta, que lista tudo).
  const principais = modo === "gaveta" ? secoes : secoes.filter((s) => !s.coluna && !s.pe);
  const noPe = modo === "gaveta" ? [] : secoes.filter((s) => s.pe);
  const emColuna = modo === "gaveta" ? [] : secoes.filter((s) => s.coluna);

  // O pé só existe quando tem o que mostrar. O backoffice não passa empresa
  // nem rodapé e não tem seção de pé: sem esta guarda ele ganhava uma faixa
  // vazia com uma linha em cima (quando havia o botão de recolher, o pé
  // nunca ficava vazio).
  const temEmpresa = !!contextos && contextos.length > 0;
  const temPe = temEmpresa || noPe.length > 0 || emColuna.length > 0 || !!rodape || (expandida && assinatura);

  return (
    <aside
      data-trilho={modo === "fixa" ? ESTILO_DO_TRILHO : undefined}
      className={cn(
        "relative flex flex-col h-full flex-shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border",
        modo === "gaveta" ? "w-[272px]" : aberta ? "w-[248px]" : "w-[80px]",
        "transition-[width] duration-200 ease-out",
      )}
    >
      {/* A aba do item ativo, que desliza a cada página (o dono, 01/10). */}
      <AbaDoTrilho />
      {/* ── Marca ─────────────────────────────────────────────────────── */}
      <div className={cn("flex items-center flex-shrink-0 h-[52px] [@media(max-height:780px)]:h-12", expandida ? "px-4 justify-between gap-2" : "justify-center")}>
        <Link
          href={marca.href}
          onClick={aoNavegar}
          aria-label={`${marca.nome}, início`}
          className={cn("flex items-center gap-2.5 min-w-0 rounded-lg", focusRing)}
        >
          {/* A marca é a da VEX: o símbolo no trilho fechado, a marca-palavra
              quando ele abre. O produto em que se está fica no pé. */}
          {expandida ? (
            <span className="flex flex-col items-start gap-1 min-w-0">
              <Logo altura={22} palavra />
              {marca.legenda && <span className="text-[11px] leading-none text-muted-foreground">{marca.legenda}</span>}
            </span>
          ) : (
            <Logo altura={14} />
          )}
        </Link>
      </div>
      {/* Linha bem leve entre a marca e os destinos (o dono, 15/10). O abrir
          e recolher mora no pé, abaixo de Configurações. */}
      <div aria-hidden className="mx-4 h-px flex-shrink-0 bg-sidebar-border/60" />

      {/* ── Navegação ─────────────────────────────────────────────────── */}
      <nav className={cn("flex-1 overflow-y-auto overflow-x-hidden", expandida ? "py-2" : "py-1.5")}>
        {principais.map((secao, i) =>
          expandida ? (
            <div key={secao.label} className={cn(i > 0 && "mt-3")}>
              {principais.length > 1 && (
                <p className="px-[18px] mb-1 text-[11px] leading-4 font-medium text-subtle">{secao.label}</p>
              )}
              <div className="space-y-px">
                {secao.items.map((item) => (
                  <ItemDaColuna key={item.href} item={item} on={ativo(item.href)} badge={badges[item.href] ?? 0} aoNavegar={aoNavegar} aoSuporte={aoSuporte} />
                ))}
              </div>
            </div>
          ) : (
            <div key={secao.label}>
              {i > 0 && <div aria-hidden className="mx-auto my-1 h-px w-7 bg-sidebar-border" />}
              {secao.items.map((item) => (
                <ItemDoTrilho key={item.href} item={item} on={ativo(item.href)} badge={badges[item.href] ?? 0} aoNavegar={aoNavegar} aoSuporte={aoSuporte} />
              ))}
            </div>
          ),
        )}
      </nav>

      {/* ── Pé: a empresa de agora, Suporte, a engrenagem e a equipe ─────── */}
      {temPe && (
        <div className={cn("flex-shrink-0 border-t border-sidebar-border", expandida ? "px-2 pt-2 pb-2" : "flex flex-col items-center py-2")}>
          {/* A EMPRESA em que se está, em cima dos destinos de apoio: é o
              "workspace" dos sistemas de atendimento, e mora no pé, acima de
              Suporte (o dono, 29/09). Ver shell/TrocarEmpresa. */}
          {temEmpresa && (
            <TrocarContexto
              contextos={contextos!}
              expandida={expandida}
              aoNavegar={aoNavegar}
              pessoa={pessoa}
            />
          )}
          {noPe.flatMap((secao) =>
            secao.items.map((item) =>
              expandida ? (
                <div key={item.href} className="-mx-2 mb-1">
                  <ItemDaColuna item={item} on={ativo(item.href)} badge={badges[item.href] ?? 0} aoNavegar={aoNavegar} aoSuporte={aoSuporte} />
                </div>
              ) : (
                <ItemDoTrilho key={item.href} item={item} on={ativo(item.href)} badge={badges[item.href] ?? 0} aoNavegar={aoNavegar} aoSuporte={aoSuporte} />
              ),
            ),
          )}
          {emColuna.map((secao) => {
            const primeiro = secao.items[0];
            if (!primeiro) return null;
            const Icone = secao.coluna!.icone;
            const entrada: NavItem = { href: primeiro.href, icon: Icone, label: secao.label, hint: secao.items.map((i) => i.label.toLowerCase()).slice(0, 4).join(", ") + "…" };
            const on = atual?.secao === secao;
            return expandida ? (
              <div key={secao.label} className="-mx-2 mb-1">
                <ItemDaColuna item={entrada} on={on} badge={0} aoNavegar={aoNavegar} />
              </div>
            ) : (
              <ItemDoTrilho key={secao.label} item={entrada} on={on} badge={0} aoNavegar={aoNavegar} />
            );
          })}
          {aoAlternar && modo === "fixa" && <BotaoRecolher aberta={expandida} aoAlternar={aoAlternar} />}
          {rodape && <RodapeConteudo rodape={rodape} expandida={expandida} aoNavegar={aoNavegar} />}
          {expandida && assinatura && (
            <div className="flex items-center h-9 pl-2">
              <p className="text-[11px] text-subtle">
                Tecnologia <span className="font-semibold text-muted-foreground">VEX Growth</span>
              </p>
            </div>
          )}
        </div>
      )}
      {pe && !expandida && pe}
    </aside>
  );
}

/**
 * A barrinha escura na borda esquerda da linha ativa, da altura da linha (a
 * referência do dono, 04/10/2026: a linha do destino ativo em cinza mais
 * escuro, com o traço grafite na borda e o ícone cheio em grafite).
 */
function Marcador() {
  return <span aria-hidden data-marcador="" className="absolute left-0 inset-y-0 w-[2px] bg-sidebar-barra" />;
}

/** O contador de pendências: sobre o ícone no trilho, à direita na coluna. */
function Contador({ n, sobreOIcone = false }: { n: number; sobreOIcone?: boolean }) {
  if (n <= 0) return null;
  return (
    <span
      aria-label={`${n} pendente${n === 1 ? "" : "s"}`}
      data-contador=""
      className={cn(
        "tabular font-semibold rounded-full bg-primary text-primary-foreground grid place-items-center surgir",
        sobreOIcone
          ? "absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 text-[10px] ring-2 ring-sidebar"
          : "min-w-[18px] h-[18px] px-1.5 text-[10.5px]",
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

/**
 * O rótulo em portal, à direita: no trilho só o ícone está na tela, então o
 * rótulo traz o NOME do destino em negrito e, embaixo, o que a tela É
 * (nav-config `hint`). Em portal porque a nav rola, e um rótulo posicionado
 * dentro dela seria cortado pela borda.
 */
function Dica({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={12}
          data-dica-menu=""
          className={cn(
            "z-50 rounded-lg bg-foreground px-2.5 py-1.5 text-background shadow-[var(--sombra-flutuante)] select-none",
            "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:slide-in-from-left-1 duration-150",
          )}
        >
          <span className="block text-[12.5px] font-semibold leading-4">{label}</span>
          {hint && <span className="block text-[11.5px] leading-4 opacity-70">{hint}</span>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Um destino no trilho: só o ícone, 44×44; o nome está no rótulo. */
function ItemDoTrilho({ item, on, badge, aoNavegar, aoSuporte }: { item: NavItem; on: boolean; badge: number; aoNavegar?: () => void; aoSuporte?: () => void }) {
  const Icone = item.icon;
  const suporte = item.href === "/suporte" && !!aoSuporte;
  return (
    <Dica label={item.label} hint={item.hint}>
      {/* `w-full`: no pé (flex-col items-center) o embrulho encolheria para
          os 44px do ícone e a barrinha do ativo ficaria solta no meio, não
          na borda esquerda como nos destinos da nav. */}
      <div data-destino="" className={cn("relative w-full", on && "bg-sidebar-ativo")}>
        {on && <Marcador />}
        <Link
          href={item.href}
          onClick={(e) => {
            if (suporte) {
              e.preventDefault();
              aoSuporte?.();
              return;
            }
            aoNavegar?.();
          }}
          aria-current={on ? "page" : undefined}
          className={cn(
            // Em tela baixa (notebook de 768px, ~650px úteis) os destinos descem
            // para 40px: com 44 o trilho rolava e escondia os últimos.
            "ico-vivo mx-auto grid place-items-center w-11 h-11 [@media(max-height:780px)]:h-10 rounded-lg transicao",
            on ? "text-sidebar-icone-ativo" : "text-sidebar-icone hover:text-sidebar-icone-ativo",
            focusRing,
          )}
        >
          <span className="relative">
            <Icone cheio={on} className="w-[26px] h-[26px]" />
            <Contador n={badge} sobreOIcone />
          </span>
        </Link>
      </div>
    </Dica>
  );
}

/**
 * Abrir e recolher o trilho, no pé e no mesmo desenho dos destinos: fechado é
 * um ícone de 44px com a dica; aberto, uma linha com "Recolher". A seta gira
 * meia volta a cada troca.
 */
function BotaoRecolher({ aberta, aoAlternar }: { aberta: boolean; aoAlternar: () => void }) {
  const seta = (
    <ChevronsLeft
      className={cn("transition-transform duration-300 ease-out flex-shrink-0", aberta ? "w-[21px] h-[21px]" : "w-[26px] h-[26px] rotate-180")}
      strokeWidth={1.75}
    />
  );
  if (!aberta) {
    return (
      <Dica label="Expandir menu" hint="mostra o nome de cada destino">
        <div className="relative w-full">
          <button
            type="button"
            onClick={aoAlternar}
            aria-label="Expandir menu"
            aria-expanded={false}
            className={cn("ico-vivo mx-auto grid place-items-center w-11 h-11 [@media(max-height:780px)]:h-10 rounded-lg transicao text-sidebar-icone hover:text-sidebar-icone-ativo", focusRing)}
          >
            {seta}
          </button>
        </div>
      </Dica>
    );
  }
  return (
    <div className="-mx-2 mb-1">
      <button
        type="button"
        onClick={aoAlternar}
        aria-label="Recolher menu"
        aria-expanded
        className={cn("ico-vivo mx-2 w-[calc(100%-1rem)] flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13px] font-medium transicao text-sidebar-icone hover:bg-sidebar-ativo/60 hover:text-sidebar-icone-ativo", focusRing)}
      >
        {seta}
        <span className="flex-1 min-w-0 truncate text-left surgir">Recolher</span>
      </button>
    </div>
  );
}

/** Um destino na gaveta: ícone e nome na mesma linha, 36px. */
function ItemDaColuna({ item, on, badge, aoNavegar, aoSuporte }: { item: NavItem; on: boolean; badge: number; aoNavegar?: () => void; aoSuporte?: () => void }) {
  const Icone = item.icon;
  const suporte = item.href === "/suporte" && !!aoSuporte;
  return (
    <div className={cn("relative", on && "bg-sidebar-ativo")}>
      {on && <Marcador />}
      <Link
        href={item.href}
        onClick={(e) => {
          if (suporte) {
            e.preventDefault();
            aoSuporte?.();
            return;
          }
          aoNavegar?.();
        }}
        aria-current={on ? "page" : undefined}
        className={cn(
          "ico-vivo mx-2 flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13px] transicao",
          on ? "text-sidebar-icone-ativo font-semibold" : "text-sidebar-icone font-medium hover:bg-sidebar-ativo/60 hover:text-sidebar-icone-ativo",
          focusRing,
        )}
      >
        <Icone cheio={on} className="w-[21px] h-[21px] flex-shrink-0" />
        <span className="flex-1 min-w-0 truncate">{item.label}</span>
        <Contador n={badge} />
      </Link>
    </div>
  );
}

/**
 * A EMPRESA da sessão, do jeito que ela é chamada: a primeira linha em
 * negrito e o resto em corpo fino. NUNCA cortada com reticências — nome de
 * empresa quebra linha, porque "Distribuidora São Jorge Com…" não identifica
 * ninguém.
 */
function RodapeConteudo({
  rodape,
  expandida,
  aoNavegar,
}: {
  rodape: RodapeDaBarra;
  expandida: boolean;
  aoNavegar?: () => void;
}) {
  const conteudo = (
    <>
      <Avatar nome={rodape.titulo} src={rodape.imagem} tamanho="sm" />
      {expandida && (
        <span className="min-w-0">
          <span className="block text-[12.5px] font-semibold leading-snug break-words text-foreground">
            {rodape.titulo}
          </span>
          {rodape.subtitulo && (
            <span className="block text-[11.5px] font-normal leading-snug break-words text-muted-foreground">
              {rodape.subtitulo}
            </span>
          )}
        </span>
      )}
    </>
  );
  const classe = cn(
    "flex items-center rounded-lg transicao",
    expandida ? "gap-2.5 px-2 py-1.5 mb-1" : "justify-center w-10 h-10 mt-1",
  );
  const titulo = !expandida ? `${rodape.titulo}${rodape.subtitulo ? `, ${rodape.subtitulo}` : ""}` : undefined;
  if (!rodape.href) {
    return (
      <div className={classe} title={titulo}>
        {conteudo}
      </div>
    );
  }
  return (
    <Link href={rodape.href} onClick={aoNavegar} title={titulo} className={cn(classe, "hover:bg-secondary", focusRing)}>
      {conteudo}
    </Link>
  );
}
