import { NavLink, Outlet, useParams } from 'react-router-dom';
import { Badge, Spinner } from '@reporter/ui';
import { useOperation } from '../api/hooks.js';

const STATUS_TONE = { active: 'success', complete: 'info', archived: 'neutral' } as const;

export function OperationLayout() {
  const { slug = '' } = useParams();
  const { data: op, isLoading, isError } = useOperation(slug);

  const tabs = [
    { to: 'evidence', label: 'Evidence' },
    { to: 'findings', label: 'Findings' },
    { to: 'tags', label: 'Tags' },
    { to: 'queries', label: 'Saved queries' },
    { to: 'settings', label: 'Settings' },
  ];

  return (
    <div>
      <div className="mb-4">
        {isLoading ? (
          <Spinner />
        ) : isError || !op ? (
          <p className="text-danger">Couldn't load this operation.</p>
        ) : (
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-text">{op.name}</h1>
            <Badge tone={STATUS_TONE[op.status]}>{op.status}</Badge>
            <span className="text-sm text-muted">{op.numEvidence ?? 0} evidence</span>
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
