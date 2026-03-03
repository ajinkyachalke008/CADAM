import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { TrialDialog } from './auth/TrialDialog';
import { useState, useEffect } from 'react';

const TRIAL_DIALOG_SHOWN_KEY = 'adam_trial_dialog_shown';

export function LimitReachedMessage() {
  const { subscription, hasTrialed } = useAuth();
  const [showTrialDialog, setShowTrialDialog] = useState(false);

  // Automatically open trial dialog for free users who haven't trialed
  useEffect(() => {
    if (subscription === 'free' && !hasTrialed) {
      // Check if dialog has been shown before
      const hasDialogBeenShown =
        localStorage.getItem(TRIAL_DIALOG_SHOWN_KEY) === 'true';

      if (!hasDialogBeenShown) {
        // Wait 1 second before showing the trial dialog
        const timer = setTimeout(() => {
          setShowTrialDialog(true);
          // Mark dialog as shown in localStorage
          localStorage.setItem(TRIAL_DIALOG_SHOWN_KEY, 'true');
        }, 1000);

        return () => clearTimeout(timer);
      }
    }
  }, [subscription, hasTrialed]);

  const handleTrialClick = () => {
    setShowTrialDialog(true);
  };

  return (
    <div className="p-3 text-center text-sm text-adam-text-secondary">
      <LimitReachedSpan onTrialClick={handleTrialClick} />
      {subscription === 'free' && !hasTrialed && (
        <TrialDialog open={showTrialDialog} onOpenChange={setShowTrialDialog} />
      )}
    </div>
  );
}

function LimitReachedSpan({ onTrialClick }: { onTrialClick?: () => void }) {
  const { subscription, hasTrialed } = useAuth();

  // Free tier with trial already used
  if (subscription === 'free' && hasTrialed) {
    return (
      <span>
        You have reached the limit of 3 daily 3D generations.{' '}
        <Link to="/subscription" className="text-adam-blue hover:underline">
          Upgrade
        </Link>{' '}
        to a paid plan for higher limits.
      </span>
    );
  }

  // Free tier without trial
  if (subscription === 'free' && !hasTrialed) {
    return (
      <span>
        You have reached the limit of 3 daily 3D generations.{' '}
        <span
          className="cursor-pointer text-adam-blue hover:underline"
          onClick={onTrialClick}
        >
          Start a trial
        </span>{' '}
        to experience all Pro features for 7 days, completely free.
      </span>
    );
  }

  // Standard tier
  if (subscription === 'standard') {
    return (
      <span>
        You have reached the limit of 100 monthly 3D generations. Please upgrade
        to{' '}
        <Link to="/subscription" className="text-adam-blue hover:underline">
          Pro
        </Link>{' '}
        for unlimited 3D generations :)
      </span>
    );
  }

  // Pro tier
  return (
    <span>
      You've somehow reached the unlimited generation limit! Please contact us
      through the feedback form if you see this message as it shouldn't be
      possible.
    </span>
  );
}
