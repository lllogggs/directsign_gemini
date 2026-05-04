import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { PRODUCT_NAME } from "../../domain/brand";

type LegalDocumentType = "privacy" | "terms" | "eSignConsent";

interface LegalSection {
  heading: string;
  body: string[];
}

interface LegalDocument {
  title: string;
  description: string;
  effectiveDate: string;
  sections: LegalSection[];
}

const legalDocuments: Record<LegalDocumentType, LegalDocument> = {
  privacy: {
    title: "개인정보처리방침",
    description:
      `${PRODUCT_NAME}가 서비스 제공, 계약 관리, 본인 확인, 전자서명 증빙을 위해 처리하는 개인정보 기준입니다.`,
    effectiveDate: "2026-05-04",
    sections: [
      {
        heading: "처리 목적",
        body: [
          "회원가입, 로그인, 광고주 및 인플루언서 계정 관리",
          "계약 초안 작성, 검토, 수정 협의, 공유 링크 발급, 전자서명 기록 보관",
          "광고주 사업자 인증, 인플루언서 플랫폼 계정 소유 확인, 고객 지원 열람 승인과 감사 기록 관리",
          "보안 사고 대응, 부정 이용 방지, 법령상 의무 이행",
        ],
      },
      {
        heading: "처리 항목",
        body: [
          "계정 정보: 이름, 이메일, 비밀번호 인증 정보, 회사명, 담당자명",
          "계약 정보: 광고주명, 인플루언서명, 채널 URL, 연락처, 계약 조건, 검토 의견, 서명자명",
          "인증 및 증빙 정보: 사업자등록번호, 대표자명, 증빙 파일명과 메타데이터, 플랫폼 핸들, 증빙 URL, 인증 코드 확인 결과",
          "접속 및 보안 정보: IP 주소, 사용자 에이전트, 로그인 및 전자서명 시각, 감사 이벤트",
        ],
      },
      {
        heading: "보유 기간",
        body: [
          "계정 정보는 회원 탈퇴 또는 서비스 이용계약 종료 시까지 보관합니다.",
          "계약서, 전자서명 증빙, 감사 기록은 분쟁 대응과 계약 이행 확인을 위해 계약 종료 후 5년까지 보관할 수 있습니다.",
          "사업자 인증 및 고객 지원 열람 기록은 목적 달성 후 3년까지 보관할 수 있습니다.",
          "법령상 더 긴 보관 의무가 있거나 분쟁이 진행 중이면 해당 기간 동안 보관합니다.",
        ],
      },
      {
        heading: "제3자 제공 및 위탁",
        body: [
          `${PRODUCT_NAME}는 이용자의 동의 또는 법령상 근거 없이 개인정보를 제3자에게 판매하지 않습니다.`,
          "계약 검토와 서명을 위해 계약 당사자에게 필요한 범위의 계약 정보와 서명 상태가 제공될 수 있습니다.",
          "인프라, 인증, 저장소, 이메일 발송 등 서비스 운영을 위해 Supabase, 호스팅 사업자, 이메일 발송 사업자 등 수탁사를 사용할 수 있으며 운영자는 실제 사용 사업자를 배포 전 확정해 고지해야 합니다.",
        ],
      },
      {
        heading: "정보주체 권리",
        body: [
          "이용자는 개인정보 열람, 정정, 삭제, 처리정지, 동의 철회를 요청할 수 있습니다.",
          "계약 증빙처럼 다른 당사자의 권리 보호나 법령상 보존이 필요한 정보는 즉시 삭제가 제한될 수 있으며, 이 경우 제한 사유와 보관 기간을 안내합니다.",
          "문의 및 권리행사 채널은 운영자가 실제 사용하는 이메일 또는 고객센터 주소로 배포 전 교체해야 합니다.",
        ],
      },
      {
        heading: "안전성 확보 조치",
        body: [
          "관리자 기능은 서버 전용 비밀값, HttpOnly 쿠키, 로그인 실패 제한, 감사 기록으로 보호합니다.",
          "서명 완료 PDF와 인증 증빙 파일은 공개 URL 대신 권한 확인 후 제공되는 비공개 저장소 사용을 원칙으로 합니다.",
          "서명 이미지는 계약 화면 표시와 감사 증빙 목적에 필요한 범위로 처리하며, 운영자는 배포 전 원본 이미지 보관 범위를 최종 점검해야 합니다.",
          "프로덕션 환경에서는 개발용 키와 운영 키를 분리하고, 데이터베이스 백업과 접근 권한 점검을 정기적으로 수행해야 합니다.",
        ],
      },
    ],
  },
  terms: {
    title: "이용약관",
    description:
      `${PRODUCT_NAME} 서비스 이용, 계약 작성, 광고 표시 책임, 계정 관리에 관한 기본 약관입니다.`,
    effectiveDate: "2026-05-04",
    sections: [
      {
        heading: "서비스 범위",
        body: [
          `${PRODUCT_NAME}는 광고주와 인플루언서가 광고 캠페인 계약 조건을 작성, 검토, 협의, 서명, 보관할 수 있도록 지원하는 업무 도구입니다.`,
          `${PRODUCT_NAME}는 광고주와 인플루언서 간 계약 체결을 위한 플랫폼을 제공하며, 계약의 당사자가 되거나 계약 이행을 보증하지 않습니다.`,
          `${PRODUCT_NAME}는 계약 플랫폼만 제공하며, 대금 지급, 정산, 세금계산서 발행, 원천징수, 에스크로, 채권 추심을 대행하지 않습니다.`,
          `${PRODUCT_NAME}는 법률, 세무, 노무 자문을 직접 제공하지 않으며, 이용자는 계약 발송 전 각자의 책임으로 조건과 법령 준수 여부를 검토해야 합니다.`,
        ],
      },
      {
        heading: "계정과 권한",
        body: [
          "이용자는 정확한 계정 정보와 권한 있는 담당자 정보를 제공해야 합니다.",
          "광고주 계정은 사업자 인증 승인 전에도 초안을 작성할 수 있으나, 외부 공유와 발송은 인증 승인 후 가능합니다.",
          "운영자는 보안, 권한 오남용, 허위 정보 제출이 의심되는 경우 계정 이용을 제한할 수 있습니다.",
        ],
      },
      {
        heading: "계약 내용과 책임",
        body: [
          "광고주와 인플루언서는 계약 조건, 대가, 일정, 검수, 지식재산권, 광고 표시 문구, 금지 업종 여부를 직접 확인해야 합니다.",
          "계약상 대가 지급, 환불, 취소, 세금 처리는 계약 당사자 사이에서 직접 이행하며, 서비스 화면의 지급 조건은 계약 조항 기록 목적입니다.",
          "광고성 콘텐츠에는 경제적 이해관계가 명확히 드러나는 표시를 콘텐츠의 제목, 본문 첫 부분, 영상 또는 설명 영역 등 소비자가 쉽게 볼 수 있는 위치에 포함해야 합니다.",
          "허위·과장 광고, 부당 표시, 누락된 광고 표시에 따른 책임은 해당 콘텐츠와 계약을 운영한 당사자에게 귀속될 수 있습니다.",
        ],
      },
      {
        heading: "전자서명과 증빙",
        body: [
          "이용자가 전자서명 버튼을 누르고 동의 문구를 확인하면 해당 계약 최종본에 전자서명하는 것으로 봅니다.",
          "서비스는 서명 시각, IP 주소, 사용자 에이전트, 동의 문구 버전, 계약 해시, 서명 이미지 해시, PDF 해시를 감사 기록으로 보관할 수 있습니다.",
          "서명 이후 계약 내용을 변경하려면 새 버전의 계약을 작성하고 당사자 동의를 다시 받아야 합니다.",
        ],
      },
      {
        heading: "서비스 중단과 데이터",
        body: [
          "운영자는 장애, 보안 점검, 외부 인프라 문제, 법령상 요구가 있는 경우 서비스를 일시 중단할 수 있습니다.",
          "이용자는 중요한 계약서와 증빙을 자체적으로 내려받아 보관할 책임이 있습니다.",
          "서비스 탈퇴 또는 종료 후에도 계약 증빙, 서명 기록, 고객 지원 감사 기록은 분쟁 대응과 법령상 보존 필요 범위에서 보관될 수 있습니다.",
          "운영자는 중대한 장애나 개인정보 침해가 확인되면 법령과 내부 절차에 따라 고지하고 필요한 조치를 수행합니다.",
        ],
      },
    ],
  },
  eSignConsent: {
    title: "전자서명 안내 및 동의",
    description:
      `${PRODUCT_NAME}에서 전자서명할 때 고정되는 최종본, 동의 방식, 감사 증빙, 분쟁 대응 기준입니다.`,
    effectiveDate: "2026-05-04",
    sections: [
      {
        heading: "전자서명 방식",
        body: [
          "서명자는 계약 조항, 대가, 일정, 광고 표시 의무, 특약을 확인한 뒤 서명 패드에 이름 또는 서명을 입력합니다.",
          "서명자는 전자서명이 수기 서명 또는 날인에 준하는 계약 의사표시로 사용될 수 있음을 이해하고 동의합니다.",
        ],
      },
      {
        heading: "최종본 고정",
        body: [
          "모든 조항이 승인된 뒤에만 서명할 수 있으며, 서명 시점의 계약 본문과 조항 상태를 기준으로 계약 해시를 생성합니다.",
          "서명 이후에는 기존 서명본을 직접 수정하지 않고 새 계약 버전 또는 별도 합의 문서로 변경해야 합니다.",
        ],
      },
      {
        heading: "감사 증빙",
        body: [
          "서비스는 서명 시각, 서명자명, 서명자 이메일, IP 주소, 사용자 에이전트, 동의 문구, 계약 해시, 서명 이미지 해시, PDF 해시를 기록합니다.",
          "분쟁 또는 고객 지원 요청이 있는 경우 권한 확인 후 계약서, 서명 완료본, 감사 기록을 제공할 수 있습니다.",
        ],
      },
      {
        heading: "서명 전 확인 사항",
        body: [
          "계약 당사자명, 채널 URL, 지급 조건, 업로드 일정, 검수 절차, 경쟁사 배제, 광고 표시 문구가 실제 합의와 일치하는지 확인해야 합니다.",
          `전자서명에 동의하지 않거나 대면 서명이 필요한 계약이라면 ${PRODUCT_NAME} 전자서명 대신 별도 절차를 사용해야 합니다.`,
        ],
      },
    ],
  },
};

export function LegalDocumentPage({
  documentType,
}: {
  documentType: LegalDocumentType;
}) {
  const legalDocument = legalDocuments[documentType];

  useEffect(() => {
    window.document.title = `${legalDocument.title} - ${PRODUCT_NAME}`;
    const descriptionTag = window.document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    descriptionTag?.setAttribute("content", legalDocument.description);
  }, [legalDocument.description, legalDocument.title]);

  return (
    <main className="min-h-screen bg-[#fafafa] px-5 py-8 font-sans text-neutral-950 sm:py-12">
      <div className="mx-auto w-full max-w-[880px]">
        <Link
          to="/login"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-600 shadow-sm transition hover:border-neutral-950 hover:text-neutral-950"
        >
          <ArrowLeft className="h-4 w-4" />
          로그인으로 돌아가기
        </Link>

        <section className="mt-5 rounded-lg border border-neutral-200 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)] sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-white">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-neutral-500">
                {PRODUCT_NAME}
              </p>
              <p className="text-[12px] font-medium text-neutral-400">
                시행일 {legalDocument.effectiveDate}
              </p>
            </div>
          </div>

          <header className="mt-8 border-b border-neutral-100 pb-6">
            <h1 className="text-[30px] font-semibold leading-tight tracking-normal sm:text-[36px]">
              {legalDocument.title}
            </h1>
            <p className="mt-3 max-w-[720px] text-[15px] leading-7 text-neutral-600">
              {legalDocument.description}
            </p>
          </header>

          <div className="mt-7 space-y-8">
            {legalDocument.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-[18px] font-semibold tracking-normal text-neutral-950">
                  {section.heading}
                </h2>
                <ul className="mt-3 space-y-2 text-[14px] leading-7 text-neutral-600">
                  {section.body.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-[0.72em] h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <p className="mt-8 border-t border-neutral-100 pt-5 text-[12px] leading-6 text-neutral-400">
            이 문서는 서비스 내 고지 초안입니다. 실제 회사명, 대표자, 사업자 정보,
            문의처, 수탁사, 보유 기간, 지급·환불 책임 범위는 운영 실태와 법률 검토에
            맞게 배포 전 확정해야 합니다.
          </p>
        </section>
      </div>
    </main>
  );
}
