import { NavLink, Outlet, useParams } from 'react-router-dom';
import { Badge, Spinner } from '@reporter/ui';
import { useEngagement } from '../api/hooks.js';
import { formatDate } from '../lib/format.js';

const STATUS_TONE = { active: 'success', complete: 'info', archived: 'neutral' } as const;

export function EngagementLayout() {
  const { slug = '' } = useParams();
  const { data: eng, isLoading, isError } = useEngagement(slug);

  const tabs = [
    { to: 'evidence', label: 'Evidence' },
    { to: 'findings', label: 'Findings' },
    { to: 'queries', label: 'Saved queries' },
    { to: 'settings', label: 'Settings' },
  ];

  return (
    <div>
      <div className="mb-4">
        {isLoading ? (
          <Spinner />
        ) : isError || !eng ? (
          <p className="text-danger">Couldn't load this engagement.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold text-text">{eng.name}</h1>
            <Badge tone={STATUS_TONE[eng.status]}>{eng.status}</Badge>
            <span className="text-sm text-muted">{eng.numEvidence ?? 0} evidence</span>
            {(eng.numFindings ?? 0) > 0 && (
              <span className="text-sm text-muted">
                {eng.numFindings} {eng.numFindings === 1 ? 'finding' : 'findings'}
              </span>
            )}
            <span className="text-sm text-muted">Started {formatDate(eng.startedAt)}</span>
            {eng.actualEndAt ? (
              <span className="text-sm text-muted">Ended {formatDate(eng.actualEndAt)}</span>
            ) : eng.projectedEndAt ? (
              <span className="text-sm text-muted">Due {formatDate(eng.projectedEndAt)}</span>
            ) : null}
          </div>
        )}
      </div>

      <div className="mb-6 flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-accent text-text'
                  : 'border-transparent text-muted hover:text-text'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
