import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Toaster } from '@/components/ui/sonner'
import { Receipt, Users, ArrowRightLeft, ShieldCheck, CheckCircle2 } from 'lucide-react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

function DashboardPlaceholder() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b bg-card/60 backdrop-blur-xs sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-xs">
              <Receipt className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">Tabby</span>
            <Badge variant="secondary" className="ml-2 font-mono text-xs">
              v0.1.0
            </Badge>
          </div>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/" className="text-foreground font-medium hover:text-primary transition-colors">
              Dashboard
            </Link>
            <Link to="/expenses" className="hover:text-primary transition-colors">
              Expenses
            </Link>
            <Link to="/groups" className="hover:text-primary transition-colors">
              Groups
            </Link>
            <Link to="/settlements" className="hover:text-primary transition-colors">
              Settlements
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 space-y-8">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Project Scaffold Initialized
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Fair, simple expense splitting
          </h1>
          <p className="text-muted-foreground text-base max-w-2xl">
            Tabby is built for offline-first performance, integer minor-unit money arithmetic,
            and seamless Google Drive & Sheets synchronization.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2">
                <Receipt className="h-5 w-5" />
              </div>
              <CardTitle>Precise Accounting</CardTitle>
              <CardDescription>
                Integer minor units (cents) prevent floating-point drift in splits.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Domain models handle exact share division, equal, percentage, and exact allocations.
              </p>
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm" className="w-full">
                View Expenses
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2">
                <Users className="h-5 w-5" />
              </div>
              <CardTitle>Groups & Friends</CardTitle>
              <CardDescription>
                Track balances across trips, roommates, and recurring shared tabs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Optimized debt simplification and settlement planning with multi-currency support.
              </p>
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm" className="w-full">
                Manage Groups
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <CardTitle>Offline-First & Private</CardTitle>
              <CardDescription>
                Local Dexie (IndexedDB) storage with optional Google Drive backup.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Your financial data stays on your device, private and instantly accessible anywhere.
              </p>
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm" className="w-full">
                Sync Settings
              </Button>
            </CardFooter>
          </Card>
        </div>

        <Card className="border-dashed">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>System Ready</CardTitle>
                <CardDescription>
                  React 19 + TypeScript (strict) + Tailwind v4 + shadcn/ui
                </CardDescription>
              </div>
              <Button size="sm">
                Get Started <ArrowRightLeft className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
        </Card>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Tabby Expense Splitting &copy; {new Date().getFullYear()} &mdash; Production Ready Scaffold
      </footer>
    </div>
  )
}

function NotFoundPlaceholder() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <CardTitle>Page Not Found</CardTitle>
          <CardDescription>The requested route does not exist.</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Button asChild>
            <Link to="/">Back to Dashboard</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DashboardPlaceholder />} />
          <Route path="/expenses" element={<DashboardPlaceholder />} />
          <Route path="/groups" element={<DashboardPlaceholder />} />
          <Route path="/settlements" element={<DashboardPlaceholder />} />
          <Route path="*" element={<NotFoundPlaceholder />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App
