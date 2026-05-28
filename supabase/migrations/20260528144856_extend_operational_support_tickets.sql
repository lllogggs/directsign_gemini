alter table public.operational_support_tickets
  add column if not exists contract_id text,
  add column if not exists contract_title text,
  add column if not exists page_path text,
  add column if not exists browser_context jsonb not null default '{}'::jsonb;

alter table public.operational_support_tickets
  drop constraint if exists operational_support_tickets_browser_context_object;

alter table public.operational_support_tickets
  add constraint operational_support_tickets_browser_context_object
  check (jsonb_typeof(browser_context) = 'object');

create index if not exists operational_support_tickets_contract_created_idx
  on public.operational_support_tickets (contract_id, created_at desc)
  where contract_id is not null;

comment on column public.operational_support_tickets.contract_id is
  'Internal contract id when a customer inquiry is about a specific contract. Public share tokens and signatures must not be stored here.';

comment on column public.operational_support_tickets.contract_title is
  'Sanitized display title for operator triage.';

comment on column public.operational_support_tickets.page_path is
  'Sanitized page path where the inquiry was created.';

comment on column public.operational_support_tickets.browser_context is
  'Non-sensitive browser and viewport context for bug reports and contract-flow support.';
