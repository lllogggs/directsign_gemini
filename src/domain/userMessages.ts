const isAsciiOnly = (value: string) =>
  value.split("").every((character) => character.charCodeAt(0) <= 0x7f);

const exactApiErrorMessages: Record<string, string> = {
  "Advertiser session is required": "광고주 로그인이 필요합니다.",
  "Influencer session is required": "인플루언서 로그인이 필요합니다.",
  "Authenticated session is required": "로그인 후 이용할 수 있습니다.",
  "Admin session is required": "운영자 로그인이 필요합니다.",
  "Advertiser account is required":
    "광고주 계정 권한이 필요합니다. 광고주 계정으로 로그인해 주세요.",
  "Influencer account is required":
    "인플루언서 계정 권한이 필요합니다. 인플루언서 계정으로 로그인해 주세요.",
  "Influencer role is required":
    "인플루언서 계정 권한이 필요합니다. 인플루언서 계정으로 로그인해 주세요.",
  "Cross-site request origin is not allowed":
    "허용되지 않은 요청입니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.",
  "Too many authentication attempts. Try again later.":
    "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  "Too many sensitive requests. Try again later.":
    "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  "Too many failed admin login attempts. Try again later.":
    "운영자 로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  "Invalid admin access code": "운영자 인증 코드가 올바르지 않습니다.",
  "Valid email and password are required": "이메일과 비밀번호를 입력해 주세요.",
  "Account creation requires Supabase Auth":
    "현재 계정 생성 기능을 사용할 수 없습니다. 관리자에게 문의해 주세요.",
  "Contract not found": "계약서를 찾을 수 없습니다.",
  "Contract access is not allowed": "이 계약을 볼 권한이 없습니다.",
  "Deliverable submission requires Supabase":
    "현재 계정에서는 콘텐츠 제출을 사용할 수 없습니다. 관리자에게 문의해 주세요.",
  "Deliverable review requires Supabase":
    "현재 계정에서는 콘텐츠 검수를 사용할 수 없습니다. 관리자에게 문의해 주세요.",
  "Contract must be signed before deliverables can be submitted":
    "전자서명 완료 후 콘텐츠를 제출할 수 있습니다.",
  "Valid deliverable requirement is required":
    "제출할 콘텐츠 항목을 다시 선택해 주세요.",
  "Content URL or proof file is required":
    "콘텐츠 URL 또는 증빙 파일을 하나 이상 추가해 주세요.",
  "Content URL must be http or https":
    "콘텐츠 URL은 https:// 또는 http:// 주소만 입력할 수 있습니다.",
  "Only PDF, PNG, JPG, or WebP proof files are allowed":
    "증빙 파일은 PDF, PNG, JPG, WebP만 첨부할 수 있습니다.",
  "Proof file must be 10MB or smaller": "증빙 파일은 10MB 이하로 첨부해 주세요.",
  "Proof file is invalid": "증빙 파일 형식을 확인해 주세요.",
  "Proof file content is invalid": "증빙 파일 내용과 형식이 일치하지 않습니다.",
  "File could not be read": "파일을 읽지 못했습니다. 파일을 다시 선택해 주세요.",
  "Valid review status is required": "검수 상태를 다시 선택해 주세요.",
  "Review comment is required when requesting changes or rejecting":
    "수정 요청이나 반려에는 검수 코멘트가 필요합니다.",
  "Deliverable not found": "제출물을 찾을 수 없습니다.",
  "Deliverable file not found": "증빙 파일을 찾을 수 없습니다.",
  "Deliverable file metadata is invalid": "증빙 파일 정보가 올바르지 않습니다.",
  "Deliverable file integrity check failed":
    "증빙 파일 무결성 확인에 실패했습니다. 다시 업로드해 주세요.",
  "Valid share token is required": "공유 링크가 만료되었거나 올바르지 않습니다.",
  "Share token has expired": "공유 링크 유효기간이 만료되었습니다.",
  "Active contract is required for account verification":
    "진행 중인 계약이 있어야 계정 인증을 요청할 수 있습니다.",
  "Account verification requires an active unsigned contract":
    "서명 완료 전 진행 중인 계약에서만 계정 인증을 요청할 수 있습니다.",
  "Company or brand name is required": "회사명 또는 브랜드명을 입력해 주세요.",
  "Valid manager name and email are required":
    "담당자명과 이메일을 올바르게 입력해 주세요.",
  "Representative name is required": "대표자명을 입력해 주세요.",
  "Business registration number is invalid":
    "사업자등록번호 형식을 확인해 주세요.",
  "Document issue date is required": "사업자등록증명원 발급일을 입력해 주세요.",
  "Valid name and email are required": "이름과 이메일을 올바르게 입력해 주세요.",
  "Valid platform is required": "플랫폼을 다시 선택해 주세요.",
  "Valid ownership verification method is required":
    "계정 인증 방식을 다시 선택해 주세요.",
  "Valid profile handle and URL are required":
    "프로필 계정명과 URL을 입력해 주세요.",
  "Profile URL does not match the selected platform":
    "선택한 플랫폼과 프로필 URL이 일치하지 않습니다.",
  "Proof URL does not match the selected platform":
    "선택한 플랫폼과 인증 확인 URL이 일치하지 않습니다.",
  "Screenshot evidence is required for screenshot review":
    "스크린샷 검수를 선택한 경우 증빙 파일을 첨부해 주세요.",
  "Verification request not found": "인증 요청을 찾을 수 없습니다.",
  "Evidence file integrity check failed":
    "증빙 파일 확인에 실패했습니다. 파일을 다시 제출해 주세요.",
  "Evidence file data is invalid": "증빙 파일 형식을 확인해 주세요.",
  "Evidence file content type is invalid":
    "증빙 파일 내용과 파일 형식이 일치하지 않습니다.",
  "Evidence file size is invalid": "증빙 파일 용량을 확인해 주세요.",
  "Legacy evidence file type is not allowed":
    "지원하지 않는 증빙 파일 형식입니다.",
  "Evidence file is not available": "증빙 파일을 열 수 없습니다.",
  "Valid verification status is required": "인증 처리 상태를 다시 선택해 주세요.",
  "Valid support access status is required": "지원 열람 상태를 다시 선택해 주세요.",
  "Support access request not found": "지원 열람 요청을 찾을 수 없습니다.",
  "Active support access request id is required":
    "활성화된 지원 열람 요청 정보가 필요합니다.",
  "Active support access request is required":
    "활성화된 지원 열람 요청이 있어야 열람할 수 있습니다.",
  "This support access request does not include private file access":
    "이 지원 열람 요청에는 비공개 파일 열람 권한이 없습니다.",
  "This support access request does not include PDF access":
    "이 지원 열람 요청에는 PDF 열람 권한이 없습니다.",
  "Support request reason must be between 5 and 1000 characters":
    "지원 요청 사유는 5자 이상 1000자 이하로 입력해 주세요.",
  "An active support access request already exists for this contract":
    "이 계약에는 이미 활성화된 지원 열람 요청이 있습니다.",
  "Signed PDF access is not allowed": "서명본 PDF를 열람할 권한이 없습니다.",
  "Signed PDF is not available": "서명본 PDF를 아직 사용할 수 없습니다.",
  "Signed PDF integrity check failed":
    "서명본 PDF 확인에 실패했습니다. 다시 시도해 주세요.",
  "Valid signature image data is required": "서명 이미지를 다시 입력해 주세요.",
  "Signer name is required": "서명자 이름을 입력해 주세요.",
  "Signature consent is required": "전자서명 동의가 필요합니다.",
  "Contract must be approved and actively shared before signing":
    "광고주가 최종본 공유를 활성화한 뒤 서명할 수 있습니다.",
  "Contract platform verification must be approved before signing":
    "이 계약의 플랫폼 계정 인증 승인 후 서명할 수 있습니다.",
  "All clauses must be approved before signing":
    "서명 전에 모든 조항이 승인되어야 합니다.",
  "Signature image data is invalid": "서명 이미지 형식을 확인해 주세요.",
  "Valid contract payload is required": "계약서 정보를 다시 확인해 주세요.",
  "Invalid actor": "현재 계정으로 처리할 수 없는 요청입니다.",
  "Influencer session is required for contract review changes":
    "계약 검토 변경은 인플루언서 로그인 후 진행할 수 있습니다.",
  "Internal server error": "서버에서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

export const translateApiErrorMessage = (
  message: string | null | undefined,
  fallback = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
) => {
  if (!message) return fallback;
  const trimmed = message.trim();
  if (!trimmed) return fallback;
  if (exactApiErrorMessages[trimmed]) return exactApiErrorMessages[trimmed];

  const normalized = trimmed.toLowerCase();
  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid_credentials")
  ) {
    return "이메일 또는 비밀번호를 확인해 주세요.";
  }
  if (
    normalized.includes("email not confirmed") ||
    normalized.includes("email not verified")
  ) {
    return "이메일 인증 후 로그인할 수 있습니다. 받은 편지함의 확인 메일을 열어주세요.";
  }
  if (normalized.includes("too many")) {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (normalized.includes("valid") && normalized.includes("challenge code")) {
    return "인증 코드를 다시 확인해 주세요.";
  }
  if (normalized.includes("api error") || normalized.includes("failed")) {
    return fallback;
  }
  if (isAsciiOnly(trimmed)) return fallback;

  return trimmed;
};
