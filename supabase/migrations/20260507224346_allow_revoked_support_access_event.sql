alter table public.support_access_events
  drop constraint if exists support_access_events_action;

alter table public.support_access_events
  add constraint support_access_events_action check (
    action in (
      'created',
      'viewed_contract',
      'viewed_pdf',
      'closed',
      'revoked',
      'expired'
    )
  );
