import { PRODUCT_NAME } from "./brand";

const readPublicEnv = (name: string) => {
  const value =
    typeof import.meta !== "undefined"
      ? (import.meta.env[name] as string | undefined)
      : undefined;
  return value?.trim() || undefined;
};

const LEGAL_OPERATING_MODES = ["free_individual", "registered_business"] as const;
type LegalOperatingMode = (typeof LEGAL_OPERATING_MODES)[number];

const readLegalOperatingMode = (): LegalOperatingMode => {
  const value = readPublicEnv("VITE_LEGAL_OPERATING_MODE");
  return LEGAL_OPERATING_MODES.includes(value as LegalOperatingMode)
    ? (value as LegalOperatingMode)
    : "free_individual";
};

export const LEGAL_CONTACT_EMAIL =
  readPublicEnv("VITE_LEGAL_CONTACT_EMAIL") ?? "support@yeollock.me";

export const LEGAL_OPERATING_MODE = readLegalOperatingMode();

const isRegisteredBusiness = LEGAL_OPERATING_MODE === "registered_business";
const defaultLegalOperatorName = `${PRODUCT_NAME} 운영자`;
const defaultLegalRepresentativeName = "개인정보 보호책임자";

const LEGAL_OPERATING_MODE_LABELS: Record<LegalOperatingMode, string> = {
  free_individual: "무료 개인 운영 서비스",
  registered_business: "사업자 운영 서비스",
};

export const LEGAL_OPERATOR = {
  operatingMode: LEGAL_OPERATING_MODE,
  name: readPublicEnv("VITE_LEGAL_OPERATOR_NAME") ?? defaultLegalOperatorName,
  representative:
    readPublicEnv("VITE_LEGAL_REPRESENTATIVE_NAME") ??
    defaultLegalRepresentativeName,
  businessRegistrationNumber: readPublicEnv(
    "VITE_LEGAL_BUSINESS_REGISTRATION_NUMBER",
  ),
  mailOrderBusinessNumber: readPublicEnv(
    "VITE_LEGAL_MAIL_ORDER_BUSINESS_NUMBER",
  ),
  address: readPublicEnv("VITE_LEGAL_ADDRESS"),
  contactEmail: LEGAL_CONTACT_EMAIL,
  contactPhone: readPublicEnv("VITE_LEGAL_CONTACT_PHONE"),
};

interface LegalOperatorField {
  label: string;
  value: string | undefined;
  required: boolean;
}

export const LEGAL_OPERATOR_FIELDS = [
  {
    label: "운영 형태",
    value: LEGAL_OPERATING_MODE_LABELS[LEGAL_OPERATOR.operatingMode],
    required: true,
  },
  { label: "서비스 운영자", value: LEGAL_OPERATOR.name, required: true },
  {
    label: "대표자/개인정보 보호책임자",
    value: LEGAL_OPERATOR.representative,
    required: true,
  },
  {
    label: "사업자등록번호",
    value: isRegisteredBusiness
      ? LEGAL_OPERATOR.businessRegistrationNumber
      : "해당 없음(무료 개인 운영)",
    required: isRegisteredBusiness,
  },
  {
    label: "통신판매업 신고번호",
    value: isRegisteredBusiness
      ? LEGAL_OPERATOR.mailOrderBusinessNumber
      : "해당 없음(무료 제공)",
    required: isRegisteredBusiness,
  },
  {
    label: "주소",
    value: isRegisteredBusiness
      ? LEGAL_OPERATOR.address
      : LEGAL_OPERATOR.address ?? "미공개(이메일 문의)",
    required: isRegisteredBusiness,
  },
  {
    label: "고객/개인정보 문의",
    value: LEGAL_OPERATOR.contactEmail,
    required: true,
  },
  {
    label: "전화번호",
    value: isRegisteredBusiness
      ? LEGAL_OPERATOR.contactPhone
      : LEGAL_OPERATOR.contactPhone ?? "미공개(이메일 문의)",
    required: isRegisteredBusiness,
  },
] satisfies LegalOperatorField[];

export const missingLegalOperatorFields = LEGAL_OPERATOR_FIELDS.filter(
  (field) => field.required && !field.value,
);

export const hasConfiguredLegalOperator = missingLegalOperatorFields.length === 0;
