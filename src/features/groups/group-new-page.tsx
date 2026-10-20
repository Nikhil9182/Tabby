import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Check, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TripImagePicker } from "@/components/groups/trip-image-picker";
import { useGroups } from "@/hooks/use-groups";
import { useCurrentUser } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";

export function GroupNewPage() {
  const navigate = useNavigate();
  const { createGroup, isCreating } = useGroups();
  const { user: currentUser } = useCurrentUser();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("USD");
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
    <div className="max-w-2xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in-50 duration-300 pb-16">
      <PageHeader
        title="Create Group"
        description="Set up a shared expense space for a trip, household, or vacation."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Groups", href: "/groups" },
          { label: "New" },
        ]}
      />

      <div className="rounded-3xl border border-border/80 bg-card p-6 sm:p-8 shadow-xs">
        <form onSubmit={handleSubmit} className="space-y-5">
          {formError && (
            <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-destructive/10 text-destructive text-xs border border-destructive/20 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="groupName" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Group / Trip Name
            </Label>
            <Input
              id="groupName"
              placeholder="e.g. Goa Getaway, Maple House, Road Trip"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-2xl bg-muted/30 border-0 text-sm font-medium focus-visible:ring-1 focus-visible:ring-primary"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Description (Optional)
            </Label>
            <Textarea
              id="description"
              placeholder="Brief notes about what this group or trip is for..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-2xl bg-muted/30 border-0 text-sm font-medium focus-visible:ring-1 focus-visible:ring-primary"
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="currency" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Default Currency
            </Label>
            <Input
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              placeholder="USD"
              className="h-11 rounded-2xl bg-muted/30 border-0 font-mono font-bold uppercase text-sm focus-visible:ring-1 focus-visible:ring-primary max-w-[120px]"
            />
          </div>

          {/* Trip Cover Image Picker */}
          <div className="pt-2 border-t border-border/40">
            <TripImagePicker value={imageUrl} onChange={setImageUrl} />
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/groups")}
              className="rounded-2xl font-bold h-11 px-5"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isCreating}
              className="h-11 px-6 rounded-2xl bg-[#0055FF] hover:bg-[#0055FF]/90 text-white font-bold gap-2 shadow-sm"
            >
              <Check className="h-4 w-4 stroke-[2.5]" />
              <span>{isCreating ? "Creating..." : "Create Group"}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default GroupNewPage;
