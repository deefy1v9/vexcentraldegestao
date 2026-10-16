"use client";

import Link from "next/link";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, SunMoon, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/vex/avatar";
import { Button } from "@/components/vex/button";
import { usarTema } from "@/components/usar-tema";
import { signOut } from "next-auth/react";

/**
 * O menu da pessoa, no canto superior direito de TODAS as telas dos dois
 * ambientes: avatar + nome abrem Meu perfil, tema e Sair.
 *
 * É o mesmo componente no painel e no backoffice — só mudam o texto do papel
 * e para onde o Sair volta. O tema aqui escreve o MESMO cookie do botão ao
 * lado (usarTema); dois controles, uma verdade. O item "Tema" diz o estado
 * ATUAL ("Claro"/"Escuro") e o clique alterna — o rótulo nunca contradiz a
 * legenda.
 */
export function UserMenu({
  nome,
  email,
  papel,
  avatar,
  perfilHref = "/perfil",
  sairPara,
}: {
  nome: string;
  email: string;
  /** Rótulo humano: "Administrador da conta", "Equipe VEX"… */
  papel: string;
  avatar?: string | null;
  perfilHref?: string;
  /** Para onde o logout manda; sem valor, o /login do host. */
  sairPara?: string;
}) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <Button
          variant="ghost"
          aria-label={`Menu de ${nome}`}
          className={cn(
            "group h-9 pl-1 pr-1.5 gap-2.5 text-foreground",
            "data-[state=open]:bg-secondary data-[state=open]:text-foreground",
          )}
        >
          <Avatar nome={nome} src={avatar} tamanho="sm" />
          <span className="hidden lg:block min-w-0 text-left">
            <span className="block text-[13px] font-medium leading-tight truncate max-w-[160px]">{nome}</span>
            <span className="block text-[11px] font-normal leading-tight text-muted-foreground truncate max-w-[160px]">{papel}</span>
          </span>
          <ChevronDown
            className="hidden lg:block text-muted-foreground transicao group-data-[state=open]:rotate-180"
            strokeWidth={2}
          />
        </Button>
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={8}
          className={cn(
            "z-50 w-[256px] rounded-xl border border-border bg-popover p-1.5 text-popover-foreground",
            "shadow-[var(--sombra-flutuante)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2",
            "duration-150",
          )}
        >
          <ItensDaPessoa nome={nome} email={email} papel={papel} avatar={avatar} perfilHref={perfilHref} sairPara={sairPara} />
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * O miolo do menu da pessoa: quem é, Meu perfil, o tema e Sair. Mora aqui
 * para o menu do cabeçalho (celular) e o do quadrado da empresa no pé do
 * trilho (computador, desde 04/10/2026) serem o MESMO: `antesDosItens` é o
 * que o quadrado põe no meio (a troca de empresa).
 */
export function ItensDaPessoa({
  nome,
  email,
  papel,
  avatar,
  perfilHref = "/perfil",
  sairPara,
  antesDosItens,
}: {
  nome: string;
  email: string;
  papel: string;
  avatar?: string | null;
  perfilHref?: string;
  sairPara?: string;
  antesDosItens?: React.ReactNode;
}) {
  const { escuro, montado, alternar } = usarTema();
  // A Central autentica pelo NextAuth: o logout é do cliente, não um POST.
  const sair = () => signOut({ callbackUrl: sairPara ?? "/login" });
  return (
    <>
      <div className="flex items-center gap-3 px-2.5 pt-2.5 pb-3">
        <Avatar nome={nome} src={avatar} tamanho="lg" className="w-10 h-10 text-[14px]" />
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold leading-tight truncate">{nome}</p>
          <p className="t-legenda truncate mt-0.5">{email}</p>
          <p className="t-legenda truncate">{papel}</p>
        </div>
      </div>
      <Menu.Separator className="my-1 h-px bg-border" />
      {antesDosItens}

      <Menu.Item asChild>
        <Link href={perfilHref} className={ITEM}>
          <UserRound className={ICONE} strokeWidth={1.75} />
          Meu perfil
        </Link>
      </Menu.Item>

      <Menu.Item
        className={ITEM}
        aria-label={montado ? (escuro ? "Mudar para o tema claro" : "Mudar para o tema escuro") : "Tema"}
        onSelect={(e) => {
          e.preventDefault();
          alternar();
        }}
      >
        <SunMoon className={ICONE} strokeWidth={1.75} />
        <span className="flex-1">Tema</span>
        <span className="t-legenda">{montado ? (escuro ? "Escuro" : "Claro") : ""}</span>
      </Menu.Item>

      <Menu.Separator className="my-1 h-px bg-border" />

      <Menu.Item
        className={ITEM}
        onSelect={(e) => {
          e.preventDefault();
          sair();
        }}
      >
        <LogOut className={ICONE} strokeWidth={1.75} />
        Sair
      </Menu.Item>
    </>
  );
}

const ITEM = cn(
  "flex items-center gap-2.5 w-full rounded-lg px-2.5 h-9 text-[13.5px] text-foreground cursor-pointer select-none",
  "outline-none transicao data-[highlighted]:bg-secondary",
);

const ICONE = "w-4 h-4 text-muted-foreground flex-shrink-0";
