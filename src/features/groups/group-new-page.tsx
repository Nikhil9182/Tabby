import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Check, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
        createdBy: creatorId,
        members: [{ userId: creatorId, role: 'owner' }],
      });
      navigate(`/groups/${group.id}`);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create group");
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-in fade-in-50 duration-300">
      <PageHeader
        title="Create Group"
        description="Set up a shared expense space for a trip, household, or project."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Groups", href: "/groups" },
          { label: "New" },
        ]}
      />

      <Card className="rounded-2xl border-border bg-card shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Group Info</CardTitle>
          <CardDescription>
            You can invite friends and add members anytime after creating the group.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-xs border border-destructive/20">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="groupName" className="text-xs font-semibold">
                Group Name
              </Label>
              <Input
                id="groupName"
                placeholder="e.g. Summer Vacation, Roommates 402, Road Trip"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs font-semibold">
                Description (Optional)
              </Label>
              <Textarea
                id="description"
                placeholder="Brief notes about what this group is for..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="currency" className="text-xs font-semibold">
                Default Currency
              </Label>
              <Input
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="USD"
                className="font-mono uppercase"
              />
            </div>

            <div className="pt-4 flex items-center justify-end gap-3 border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/groups")}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating} className="gap-2">
                <Check className="h-4 w-4" />
                {isCreating ? "Creating..." : "Create Group"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default GroupNewPage;
