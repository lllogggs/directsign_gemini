update public.operational_support_tickets
set
  category = 'other',
  admin_note = concat_ws(
    E'\n',
    nullif(admin_note, ''),
    '[system] Retired settlement_question category because yeollock.me does not handle settlement, payout, escrow, tax, refund, or collection inquiries.'
  )
where category = 'settlement_question';

alter table public.operational_support_tickets
  drop constraint if exists operational_support_tickets_category;

alter table public.operational_support_tickets
  add constraint operational_support_tickets_category check (
    category in (
      'service_error',
      'account_access',
      'contract_flow',
      'privacy_request',
      'other'
    )
  );

comment on table public.operational_support_tickets is
  'Operational customer support tickets for service errors, account access, contract flow, and privacy requests. Settlement, payout, escrow, tax, refund, and collection inquiries are outside yeollock.me scope.';
