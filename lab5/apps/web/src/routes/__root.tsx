import type { QueryClient } from "@tanstack/react-query"
import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router"
import { AppShell } from "@/components/app/shell"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import appCss from "../styles.css?url"

// Applied before paint so the stored theme never flashes.
const themeScript = `try{var t=localStorage.getItem("theme");if(t!=="light")document.documentElement.classList.add("dark")}catch(e){document.documentElement.classList.add("dark")}`

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "GeoPulse — мониторинг природных явлений" },
      { name: "description", content: "Землетрясения, природные события и страны мира в едином GraphQL API" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootDocument,
  component: AppShell,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body className="min-h-svh bg-background font-sans text-foreground antialiased">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster richColors position="bottom-right" />
        <Scripts />
      </body>
    </html>
  )
}
