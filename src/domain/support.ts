export type SupportTicketCategory =
  | "service_error"
  | "account_access"
  | "contract_flow"
  | "settlement_question"
  | "privacy_request"
  | "other";

export type SupportTicketRole = "advertiser" | "influencer" | "other";

export const buildSupportTicketPath = ({
  category = "service_error",
  role = "other",
  contractId,
  contractTitle,
}: {
  category?: SupportTicketCategory;
  role?: SupportTicketRole;
  contractId?: string;
  contractTitle?: string;
}) => {
  const params = new URLSearchParams({
    category,
    role,
  });

  if (contractId) params.set("contract_id", contractId);
  if (contractTitle) params.set("contract_title", contractTitle);

  return `/support?${params.toString()}`;
};
