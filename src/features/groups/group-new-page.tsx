import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { CurrencySelector } from "@/components/currency/currency-selector";
import { TripImagePicker } from "@/components/groups/trip-image-picker";
import { useGroups } from "@/hooks/use-groups";
import { useCurrentUser } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import { useCurrency } from "@/hooks/use-currency";

const labelClass = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

export function GroupNewPage() {
  const navigate = useNavigate();
  const { createGroup, isCreating } = useGroups();
  const { user: currentUser } = useCurrentUser();
  const { user } = useAuth();
  const { defaultCurrency } = useCurrency();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // null = untouched, so it follows the user's default currency once that loads
  const [currencyChoice, setCurrencyChoice] = useState<string | null>(null);
  const currency = currencyChoice ?? defaultCurrency ?? "USD";
  const [imageUrl, setImageUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Group name is required");
      return;
    }

    const creatorId = currentUser?.id || user?.sub || "user_self";

    try {
      const group = await createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        currency: currency.toUpperCase(),
        imageUrl: imageUrl || undefined,
        createdBy: creatorId,
        members: [{ userId: creatorId, role: 'owner' }],
      });
      navigate(`/groups/${group.id}`);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create group");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <PageHeader
        title="Create Group"
        description="For a trip, a household, or anything you share costs on."
        onBack={() => navigate("/groups")}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-border/60 shadow-xs py-0 gap-0">
          <CardContent className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="groupName" className={labelClass}>
                Group name *
              </label>
              <Input
                id="groupName"
                placeholder="e.g. Goa Trip, Flat 302, Road Trip"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 text-base"
                autoFocus
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <label htmlFor="description" className={labelClass}>
                  Description (optional)
                </label>
                <Input
                  id="description"
                  placeholder="What is this group for?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <span className={labelClass}>Currency</span>
                <CurrencySelector value={currency} onChange={setCurrencyChoice} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-xs py-0 gap-0">
          <CardContent className="p-5 space-y-3">
            <span className={labelClass}>Cover photo (optional)</span>
            <TripImagePicker value={imageUrl} onChange={setImageUrl} />
          </CardContent>
        </Card>

        {formError && (
          <div className="flex items-center gap-2 p-4 text-sm rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate("/groups")}>
            Cancel
          </Button>
          <Button type="submit" disabled={isCreating} className="font-semibold min-w-[120px]">
            {isCreating ? "Creating..." : "Create Group"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default GroupNewPage;
