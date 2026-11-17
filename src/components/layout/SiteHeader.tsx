"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Avatar } from "@/components/shared/identity";
import { LogoMark } from "@/components/shared/Logo";
import { Button } from "@/components/shared/ui";

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={`display flex items-center gap-2 text-2xl tracking-wide ${className ?? ""}`}>
      <LogoMark size={34} className="shrink-0 drop-shadow-[0_4px_14px_rgba(246,196,83,0.35)]" />
      <span>
        Auction<span className="gold-text">Arena</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Wordmark />
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link href="/players" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-mute transition hover:text-chalk sm:block">
            Players
          </Link>
          {user && (
            <Link href="/dashboard" className="rounded-lg px-3 py-2 text-sm font-medium text-mute transition hover:text-chalk">
              Dashboard
            </Link>
          )}
          {profile?.is_admin && (
            <Link href="/admin" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-mute transition hover:text-chalk sm:block">
              Admin
            </Link>
          )}
          {loading ? (
            <span className="h-9 w-24 animate-pulse rounded-xl bg-white/5" />
          ) : user ? (
            <div className="flex items-center gap-2">
              <Link href="/profile" className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-3 transition hover:bg-white/[0.06]">
                <Avatar name={profile?.display_name ?? "You"} src={profile?.avatar_url} size={30} />
                <span className="hidden max-w-32 truncate text-sm font-medium sm:block">{profile?.display_name ?? "Profile"}</span>
              </Link>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await signOut();
                  router.push("/");
                }}
              >
                Sign out
              </Button>
            </div>
          ) : (
            <>
              <Link href="/login">
                <Button size="sm" variant="ghost">Log in</Button>
              </Link>
              <Link href="/register">
                <Button size="sm" variant="gold">Sign up</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
