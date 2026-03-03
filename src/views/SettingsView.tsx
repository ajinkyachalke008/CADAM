import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useManageSubscription } from '@/services/subscriptionService';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { DeleteAccountDialog } from '@/components/auth/DeleteAccountDialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import * as Sentry from '@sentry/react';
import { useProfile, useUpdateProfile } from '@/services/profileService';
import { AvatarUpdateDialog } from '@/components/auth/AvatarUpdateDialog';

export default function SettingsView() {
  const { subscription, generationsRemaining, user, resetPassword } = useAuth();
  const { data: profile } = useProfile();
  const { mutate: updateProfile, isPending: isUpdateLoading } =
    useUpdateProfile();
  const { toast } = useToast();
  const [newName, setNewName] = useState(profile?.full_name || '');
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const generationsUsed = 100 - generationsRemaining;

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
    }
  }, [editingName]);

  useEffect(() => {
    setNewName(profile?.full_name || '');
  }, [profile?.full_name]);

  const { mutate: handleManageSubscription, isPending: isManageLoading } =
    useManageSubscription();

  const handleUpdateName = () => {
    updateProfile(
      { full_name: newName },
      {
        onSuccess: () => {
          setEditingName(false);
          setNewName(profile?.full_name || '');
          toast({
            title: 'Success',
            description: 'Your name has been updated',
          });
        },
        onError: (e) => {
          Sentry.captureException(e);
          toast({
            title: 'Error',
            description: 'Failed to update name',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleUpdateNotifications = async (notificationsEnabled: boolean) => {
    updateProfile(
      {
        notifications_enabled: notificationsEnabled,
      },
      {
        onSuccess: () => {
          toast({
            title: 'Success',
            description: 'Your notifications have been updated',
          });
        },
        onError: (e) => {
          Sentry.captureException(e);
          toast({
            title: 'Error',
            description: 'Failed to update notifications',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const { mutate: handleResetPassword, isPending: isResetLoading } =
    useMutation({
      mutationFn: async () => {
        if (!user?.email) throw new Error('User email not found');
        await resetPassword(user?.email);
      },
      onSuccess: () => {
        toast({
          title: 'Success',
          description:
            'Password reset instructions have been sent to your email',
        });
      },
      onError: () => {
        toast({
          title: 'Error',
          description: 'Failed to reset password',
          variant: 'destructive',
        });
      },
    });

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-adam-background-1 p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-12">
        <h1 className="text-2xl font-medium text-adam-neutral-50">Settings</h1>

        <div className="flex flex-col gap-24">
          <div className="grid grid-cols-3 items-center gap-4 sm:grid-cols-4">
            <div className="h-full w-full">
              <h2 className="text-lg font-medium text-adam-neutral-50">
                Account
              </h2>
            </div>
            <div className="col-span-3 flex w-full flex-col gap-8 text-adam-neutral-50">
              <div className="col-span-3 grid grid-cols-3 items-center gap-4">
                <div className="col-span-2 flex items-center gap-4 text-adam-neutral-50">
                  <AvatarUpdateDialog />
                  {editingName ? (
                    <Input
                      ref={nameInputRef}
                      value={newName}
                      className="h-9 w-full"
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleUpdateName();
                        }
                      }}
                    />
                  ) : (
                    <div className="text-sm font-medium">
                      {profile?.full_name || user?.email}
                    </div>
                  )}
                </div>
                {editingName ? (
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      onClick={() => handleUpdateName()}
                      variant="light"
                      disabled={isUpdateLoading}
                      className="justify-self-end rounded-full font-light"
                    >
                      {isUpdateLoading ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving...
                        </div>
                      ) : (
                        'Save'
                      )}
                    </Button>
                    <Button
                      onClick={() => {
                        setEditingName(false);
                        setNewName(profile?.full_name || '');
                      }}
                      variant="dark"
                      className="justify-self-end rounded-full font-light"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => setEditingName(true)}
                    variant="dark"
                    className="justify-self-end rounded-full font-light"
                  >
                    Edit
                  </Button>
                )}
              </div>
              <div className="col-span-2 flex flex-col gap-2">
                <div className="text-sm font-medium">Email</div>
                <div className="text-xs text-adam-neutral-200">
                  {user?.email}
                </div>
              </div>
              <div className="col-span-3 grid grid-cols-3 items-center gap-2">
                <div className="col-span-2 flex flex-col gap-2">
                  <div className="text-sm font-medium">Password</div>
                  <div className="text-xs text-adam-neutral-200">
                    Reset your password
                  </div>
                </div>
                <Button
                  onClick={() => handleResetPassword()}
                  disabled={isResetLoading}
                  variant="dark"
                  className="justify-self-end rounded-full font-light"
                >
                  {isResetLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </div>
                  ) : (
                    'Reset Password'
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 items-center gap-4 sm:grid-cols-4">
            <div className="h-full w-full">
              <h2 className="text-lg font-medium text-adam-neutral-50">
                Notifications
              </h2>
            </div>
            <div className="col-span-3 grid grid-cols-3 items-center gap-4">
              <div className="col-span-2 flex w-full flex-col gap-2 text-adam-neutral-50">
                <div className="text-sm font-medium">Responses</div>
                <div className="text-xs text-adam-neutral-200">
                  Get notified when Adam finishes a long-running request, like a
                  highest quality mesh generation.
                </div>
              </div>
              <Switch
                className="justify-self-end"
                checked={profile?.notifications_enabled}
                onCheckedChange={handleUpdateNotifications}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 items-center gap-4 sm:grid-cols-4">
            <div className="h-full w-full">
              <h2 className="text-lg font-medium text-adam-neutral-50">
                Billing
              </h2>
            </div>
            <div className="col-span-3 grid grid-cols-3 items-center gap-4">
              <div className="col-span-2 flex w-full flex-col gap-2">
                {subscription === 'free' ? (
                  <div className="flex items-center gap-2 text-adam-neutral-50">
                    <p className="text-sm font-medium">Adam Free</p>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-4 w-4" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>3 3D generations a day</p>
                        <p>Conversational Edits</p>
                        <p>Unlimited Parameter Edits</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ) : subscription === 'standard' ? (
                  <div className="flex w-full flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-adam-neutral-50">
                        <p className="text-sm font-medium">Adam Standard</p>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>100 3D generations per month</p>
                            <p>Conversational Edits</p>
                            <p>Unlimited Parameter Edits</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="text-xs text-adam-neutral-200">
                        {generationsUsed} / 100
                      </div>
                    </div>
                    {/* Progress bar showing generations remaining */}
                    <Progress
                      indicatorClassName={cn(
                        generationsUsed < 70
                          ? 'bg-lime-500'
                          : generationsUsed < 90
                            ? 'bg-amber-500'
                            : 'bg-[#FB2C2C]',
                      )}
                      className={cn(
                        generationsUsed < 70
                          ? 'bg-lime-800'
                          : generationsUsed < 90
                            ? 'bg-amber-800'
                            : 'bg-[#843535]',
                      )}
                      max={100}
                      value={generationsUsed}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-adam-neutral-50">
                    <p className="text-sm font-medium">Adam Pro</p>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-4 w-4" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Unlimited 3D generations per month</p>
                        <p>Conversational Edits</p>
                        <p>Unlimited Parameter Edits</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>

              {subscription !== 'free' ? (
                <Button
                  onClick={() => handleManageSubscription()}
                  className="justify-self-end rounded-full font-light"
                  variant="dark"
                  disabled={isManageLoading}
                >
                  {isManageLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </div>
                  ) : (
                    'Manage'
                  )}
                </Button>
              ) : (
                <Link to="/subscription" className="justify-self-end">
                  <Button
                    className="justify-self-end rounded-full font-light"
                    variant="dark"
                  >
                    Upgrade
                  </Button>
                </Link>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-8">
            <div className="grid grid-cols-3 items-center gap-4 sm:grid-cols-4">
              <div className="h-full w-full">
                <h2 className="text-lg font-medium text-adam-neutral-50">
                  Data and Privacy
                </h2>
              </div>
              <div className="col-span-3 grid grid-cols-3 items-center gap-4">
                <div className="col-span-2 flex w-full flex-col gap-2 text-adam-neutral-50">
                  <div className="text-sm font-medium">Delete Account</div>
                  <div className="text-xs text-adam-neutral-200">
                    Permanently delete your account and all associated data from
                    Adam
                  </div>
                </div>
                <DeleteAccountDialog>
                  <Button
                    className="justify-self-end rounded-full font-light"
                    variant="destructive"
                  >
                    Delete
                  </Button>
                </DeleteAccountDialog>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <div className="col-span-4 flex w-full items-center justify-center gap-2 sm:col-span-2 sm:col-start-2 sm:justify-normal">
                <Button
                  className="rounded-full font-light"
                  variant="dark"
                  asChild
                >
                  <Link to="/terms-of-service">Terms of Service</Link>
                </Button>
                <Button
                  className="rounded-full font-light"
                  variant="dark"
                  asChild
                >
                  <Link to="/privacy-policy">Privacy Policy</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
