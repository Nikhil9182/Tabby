import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Users,
  UserPlus,
  Mail,
  X,
  AlertCircle,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/page-header';
import { CurrencySelector } from '@/components/currency/currency-selector';
import {
  useGroups,
  useGroup,
  useCurrentUser,
  useUsers,
  useCurrency,
} from '@/hooks';
import { userRepository } from '@/storage/repositories/user-repository';
import { generateId } from '@/lib/id';
import type { User, MemberRole } from '@/domain/models/types';

interface GroupFormProps {
  groupId?: string;
}

const groupFormSchema = z.object({
  name: z.string().trim().min(1, 'Group name is required').max(100),
  description: z.string().max(500).optional(),
  currency: z.string().trim().length(3).toUpperCase(),
});

type GroupFormData = z.infer<typeof groupFormSchema>;

interface MemberItem {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  isExisting: boolean;
}

export function GroupForm({ groupId: propGroupId }: GroupFormProps) {
  const navigate = useNavigate();
  const routeParams = useParams<{ id?: string }>();
  const groupId = propGroupId || routeParams.id;
  const isEditing = Boolean(groupId);

  const { user: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.id || 'current_user';

  const { defaultCurrency } = useCurrency();
  const { createGroup, updateGroup } = useGroups();
  const { group: existingGroup, members: existingMembers, isLoading: isLoadingGroup } = useGroup(groupId || '');
  const { users } = useUsers();

  const [membersList, setMembersList] = useState<MemberItem[]>([]);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<GroupFormData>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: {
      name: '',
      description: '',
      currency: defaultCurrency,
    },
  });

  // Initialize members list with current user if creating
  useEffect(() => {
    if (!isEditing && membersList.length === 0) {
      setMembersList([
        {
          id: currentUserId,
          name: currentUser?.name || 'You',
          email: currentUser?.email || 'you@example.com',
          role: 'owner',
          isExisting: true,
        },
      ]);
    }
  }, [isEditing, currentUserId, currentUser, membersList.length]);

  // Prepopulate if editing
  useEffect(() => {
    if (existingGroup) {
      reset({
        name: existingGroup.name,
        description: existingGroup.description || '',
        currency: existingGroup.currency || defaultCurrency,
      });

      if (existingMembers && existingMembers.length > 0) {
        const loaded: MemberItem[] = existingMembers.map((m) => {
          const u = users.find((user) => user.id === m.userId);
          return {
            id: m.userId,
            name: m.userId === currentUserId ? 'You' : u?.name || u?.email || m.userId,
            email: u?.email || '',
            role: (m.role as MemberRole) || 'member',
            isExisting: true,
          };
        });
        setMembersList(loaded);
      }
    }
  }, [existingGroup, existingMembers, defaultCurrency, currentUserId, users, reset]);

  // Add a new member to list
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);

    const email = newMemberEmail.trim().toLowerCase();
    const name = newMemberName.trim() || email.split('@')[0];

    if (!email) {
      setEmailError('Please enter an email address.');
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      setEmailError('Please enter a valid email address.');
      return;
    }

    if (membersList.some((m) => m.email.toLowerCase() === email)) {
      setEmailError('This member is already in the group.');
      return;
    }

    // Check if user exists in local database
    const existing = users.find((u) => u.email.toLowerCase() === email);
    const userId = existing?.id || generateId();

    if (!existing) {
      const now = new Date().toISOString();
      const newUser: User = {
        id: userId,
        name,
        email,
        createdAt: now,
        updatedAt: now,
      };
      await userRepository.upsertUser(newUser);
    }

    setMembersList((prev) => [
      ...prev,
      {
        id: userId,
        name: existing?.name || name,
        email,
        role: 'member',
        isExisting: false,
      },
    ]);

    setNewMemberEmail('');
    setNewMemberName('');
  };

  const handleRemoveMember = (id: string) => {
    if (id === currentUserId) return; // Prevent removing owner/self
    setMembersList((prev) => prev.filter((m) => m.id !== id));
  };

  const onSubmit = async (data: GroupFormData) => {
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      if (isEditing && groupId) {
        const updated = await updateGroup({
          id: groupId,
          name: data.name,
          description: data.description,
          currency: data.currency,
        });
        navigate(`/groups/${updated.id}`);
      } else {
        const membersPayload = membersList.map((m) => ({
          userId: m.id,
          role: m.role,
        }));

        const created = await createGroup({
          name: data.name,
          description: data.description,
          currency: data.currency,
          createdBy: currentUserId,
          members: membersPayload,
        });
        navigate(`/groups/${created.id}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save group';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <PageHeader
        title={isEditing ? 'Edit Group' : 'New Group'}
        description={
          isEditing
            ? 'Update group settings, currency, and members.'
            : 'Create a shared group ledger to split trip, house, or project expenses.'
        }
        onBack={() => navigate(-1)}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Details */}
        <Card className="border-border/60 shadow-xs">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base sm:text-lg">Group Information</CardTitle>
            <CardDescription>
              Name and primary currency used for calculations and debt simplification.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-5 pt-2 space-y-4">
            {/* Group Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Group Name *
              </label>
              <Input
                {...register('name')}
                placeholder="e.g. Summer Eurotrip 2026, 42 Elm Street, Weekend Cabin"
                className="h-10 text-base"
              />
              {errors.name && (
                <p className="text-xs text-rose-500 font-medium">{errors.name.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Description (Optional)
              </label>
              <Textarea
                {...register('description')}
                placeholder="What is this group for? Add any notes or plans..."
                className="resize-none h-20 text-sm"
              />
            </div>

            {/* Default Currency */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Default Currency
              </label>
              <Controller
                control={control}
                name="currency"
                render={({ field }) => (
                  <CurrencySelector
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Group Members Section */}
        <Card className="border-border/60 shadow-xs">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base sm:text-lg">Group Members</CardTitle>
            <CardDescription>
              Add friends by email so expenses can be divided between you.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-5 pt-2 space-y-4">
            {/* Add member inputs */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="flex-1">
                <Input
                  type="email"
                  placeholder="friend@example.com"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="sm:w-36">
                <Input
                  type="text"
                  placeholder="Name (optional)"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddMember}
                className="gap-1.5 h-9 shrink-0"
              >
                <UserPlus className="h-4 w-4" />
                <span>Add</span>
              </Button>
            </div>

            {emailError && (
              <p className="text-xs text-rose-500 font-medium flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{emailError}</span>
              </p>
            )}

            {/* Members List */}
            <div className="space-y-2 pt-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Current Members ({membersList.length})
              </span>

              <div className="rounded-xl border border-border/60 divide-y divide-border/40 overflow-hidden">
                {membersList.map((member) => {
                  const isSelf = member.id === currentUserId;

                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 bg-card hover:bg-muted/20 transition-colors text-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar size="sm">
                          <AvatarFallback className="text-[10px] font-semibold uppercase">
                            {member.name.slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-foreground truncate">
                              {member.name}
                            </span>
                            {isSelf && (
                              <Badge variant="secondary" className="text-[10px] h-4 px-1 py-0 font-normal">
                                You
                              </Badge>
                            )}
                            {member.role === 'owner' && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 font-normal">
                                Owner
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {member.email}
                          </p>
                        </div>
                      </div>

                      {!isSelf && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleRemoveMember(member.id)}
                          className="text-muted-foreground hover:text-rose-600 rounded-full"
                          title="Remove member"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {submitError && (
          <div className="p-4 text-sm rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            {submitError}
          </div>
        )}

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="font-semibold min-w-[120px]"
          >
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Group'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default GroupForm;
