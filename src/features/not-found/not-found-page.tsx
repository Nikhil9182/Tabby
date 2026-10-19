import { Link, useNavigate } from "react-router-dom";
import { Cat, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 select-none">
      <div className="max-w-md w-full text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
        {/* Cat Illustration Badge */}
        <div className="relative mx-auto w-24 h-24 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs ring-8 ring-primary/5">
          <Cat className="h-12 w-12 stroke-[1.75]" />
          <span className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-mono font-bold shadow-xs">
            404
          </span>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Lost your way?
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Tabby looked everywhere under the rug and behind the sofa, but this page couldn't be found.
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-border/80 bg-card/60 text-xs text-muted-foreground">
          Tip: You might have clicked an outdated split link or mistyped the URL.
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            className="w-full sm:w-auto gap-2"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
            Go back
          </Button>

          <Button asChild className="w-full sm:w-auto gap-2">
            <Link to="/dashboard">
              <Home className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
      </div>

      <footer className="mt-12 text-center text-xs text-muted-foreground/60">
        Tabby Expense Splitting &bull; 404
      </footer>
    </div>
  );
}

export default NotFoundPage;
