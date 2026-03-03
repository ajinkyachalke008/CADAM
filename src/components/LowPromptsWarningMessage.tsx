import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { TrialDialog } from './auth/TrialDialog';
import { cn } from '@/lib/utils';

export function LowPromptsWarningMessage({
  promptsRemaining,
  layout = 'inline',
}: {
  promptsRemaining: number;
  layout?: 'inline' | 'stacked';
}) {
  return (
    <div className="p-3 text-center text-sm text-adam-text-secondary">
      <LowPromptsWarningContent
        promptsRemaining={promptsRemaining}
        layout={layout}
      />
    </div>
  );
}

function LowPromptsWarningContent({
  promptsRemaining,
  layout,
}: {
  promptsRemaining: number;
  layout: 'inline' | 'stacked';
}) {
  const { subscription, hasTrialed } = useAuth();

  // Data-driven content calculation
  const generationsText = `You have ${promptsRemaining} 3D generation${promptsRemaining === 1 ? '' : 's'} remaining`;
  const timePeriod = subscription === 'standard' ? 'this month' : 'today';

  // Free tier with trial already used
  if (subscription === 'free' && hasTrialed) {
    return (
      <span>
        {generationsText} {timePeriod}.{' '}
        <Link to="/subscription" className="text-adam-blue hover:underline">
          Upgrade
        </Link>{' '}
        to a paid plan for higher limits.
      </span>
    );
  }

  // Free tier without trial - pure CSS layout control
  if (subscription === 'free' && !hasTrialed) {
    return (
      <div
        className={cn(
          'flex justify-center',
          layout === 'stacked' ? 'flex-col gap-1' : 'flex-wrap gap-1',
        )}
      >
        <span>
          {generationsText} {timePeriod}.
        </span>
        <TrialDialog>
          <span className="cursor-pointer text-adam-blue hover:underline">
            Start a free trial of Pro
          </span>
        </TrialDialog>
      </div>
    );
  }

  // Standard tier
  if (subscription === 'standard') {
    return (
      <span>
        {generationsText} {timePeriod}. Upgrade to{' '}
        <Link to="/subscription" className="text-adam-blue hover:underline">
          Pro
        </Link>{' '}
        for unlimited 3D generations :)
      </span>
    );
  }

  // Pro tier
  return <span>{generationsText}. Please let us know if you need more :)</span>;
}
