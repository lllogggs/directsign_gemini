import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore, ContractType, Clause } from "../../store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Check, Plus, Copy, CheckCircle2 } from "lucide-react";

export function ContractBuilder() {
  const navigate = useNavigate();
  const addContract = useAppStore((state) => state.addContract);

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    title: "",
    type: "협찬" as ContractType,
    influencerName: "",
    influencerUrl: "",
    influencerContact: "",
    channels: [] as string[],
    channelDetails: {} as Record<string, { postCount: string; duration: string }>,
    hasOtherChannel: false,
    otherChannel: "",
    otherChannelDetails: {
      postCount: "",
      duration: ""
    },
    duration: "",
    exclusivity: "",
    postCount: "",
    payment: "",
    customClauses: [] as { id: string; category: string; content: string }[],
    newClauseCategory: "",
    newClauseContent: "",
  });

  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);

  const handleChannelToggle = (channel: string) => {
    setFormData((prev) => {
      if (prev.channels.includes(channel)) {
        const newChannels = prev.channels.filter((c) => c !== channel);
        const newDetails = { ...prev.channelDetails };
        delete newDetails[channel];
        return { ...prev, channels: newChannels, channelDetails: newDetails };
      } else {
        return { ...prev, channels: [...prev.channels, channel] };
      }
    });
  };

  const handleChannelDetailChange = (channel: string, field: 'postCount' | 'duration', value: string) => {
    setFormData((prev) => ({
      ...prev,
      channelDetails: {
        ...prev.channelDetails,
        [channel]: {
          ...prev.channelDetails[channel],
          [field]: value
        }
      }
    }));
  };

  const generateClauses = (): Clause[] => {
    const clauses: Clause[] = [];

    // 채널 및 노출 건수
    if (formData.channels.length > 0 || formData.hasOtherChannel) {
      const detailsContent = formData.channels.map(ch => {
        const details = formData.channelDetails[ch];
        const count = details?.postCount ? `${details.postCount}` : '1회';
        const duration = details?.duration ? `${details.duration}` : '무기한 유지';
        return `- ${ch}: 업로드 ${count}, 유지기간: ${duration}`;
      });
      
      if (formData.hasOtherChannel && formData.otherChannel) {
        const count = formData.otherChannelDetails.postCount ? `${formData.otherChannelDetails.postCount}` : '1회';
        const duration = formData.otherChannelDetails.duration ? `${formData.otherChannelDetails.duration}` : '무기한 유지';
        detailsContent.push(`- 기타 매체(${formData.otherChannel}): 업로드 ${count}, 유지기간: ${duration}`);
      }

      const contentString = detailsContent.join('\n');

      clauses.push({
        clause_id: "c_" + Date.now() + "_1",
        category: "제공 매체 및 업로드 조건",
        content: `본 계약에 따라 인플루언서는 다음 매체에 정해진 건수의 콘텐츠를 업로드하고 지정된 기간 동안 유지해야 한다:\n${contentString}`,
        status: "APPROVED",
        history: [],
      });
    }

    // 유지 및 배제
    if (formData.exclusivity || formData.duration) {
      // Compatibility with old global duration
      const durationText = formData.duration ? `콘텐츠는 업로드 후 최소 ${formData.duration} 동안 유지되어야 하며, ` : '';
      const exclusivityText = formData.exclusivity ? `업로드 후 해당 기간 동안 동종 업계의 타 브랜드 광고를 진행하지 아니한다(${formData.exclusivity}).` : '동종 업계의 광고 진행에 대한 제한은 없다.';
      
      clauses.push({
        clause_id: "c_" + Date.now() + "_2",
        category: "유지 및 경쟁사 배제",
        content: `${durationText}${exclusivityText}`,
        status: "APPROVED",
        history: [],
      });
    }

    // 지급 조건
    if (formData.payment) {
      clauses.push({
        clause_id: "c_" + Date.now() + "_3",
        category: "대가 지급",
        content: `본 계약의 대가로 마케팅사는 인플루언서에게 다음과 같이 지급한다: ${formData.payment}`,
        status: "APPROVED",
        history: [],
      });
    }

    // 사용자 추가 특약
    formData.customClauses.forEach((cc) => {
      clauses.push({
        clause_id: cc.id,
        category: cc.category || "기타 특약",
        content: cc.content,
        status: "APPROVED",
        history: [],
      });
    });

    return clauses;
  };

  const handleSaveAndShare = () => {
    const contract = addContract({
      advertiser_id: "adv_1",
      title:
        formData.title || `${formData.influencerName}님 ${formData.type} 계약`,
      type: formData.type,
      status: "REVIEWING",
      influencer_info: {
        name: formData.influencerName,
        channel_url: formData.influencerUrl,
        contact: formData.influencerContact,
      },
      clauses: generateClauses(),
    });

    const link = `${window.location.origin}/contract/${contract.id}`;
    setGeneratedLink(link);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const addCustomClause = () => {
    if (!formData.newClauseContent) return;
    setFormData((prev) => ({
      ...prev,
      customClauses: [
        ...prev.customClauses,
        {
          id: "c_" + Date.now() + "_" + Math.random(),
          category: prev.newClauseCategory,
          content: prev.newClauseContent,
        },
      ],
      newClauseCategory: "",
      newClauseContent: "",
    }));
  };

  const addTemplateClause = (type: "delivery" | "cs") => {
    const category =
      type === "delivery" ? "배송 및 파손 책임" : "고객 CS 및 교환/환불";
    const content =
      type === "delivery"
        ? "제품의 배송, 설치 및 회수 과정에서 발생하는 파손의 책임은 전적으로 공급사(본사)에 있다."
        : "제품의 AS 및 불량 문제로 인한 교환/환불 응대는 공급사(본사)에서 전담하여 처리한다.";
    setFormData((prev) => ({
      ...prev,
      customClauses: [
        ...prev.customClauses,
        { id: "c_" + Date.now() + "_" + Math.random(), category, content },
      ],
    }));
  };

  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA] font-sans text-neutral-900 overflow-hidden">
      <header className="h-[80px] px-12 bg-white flex items-center justify-between z-10 shrink-0 border-b border-neutral-100">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/marketing/dashboard")}
            className="p-2 hover:bg-neutral-50 rounded-full transition-colors -ml-2 text-neutral-400 hover:text-neutral-900"
          >
            <ArrowLeft strokeWidth={1.5} className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 border-l border-neutral-100 pl-4">
            <div className="w-8 h-8 bg-neutral-900 rounded-sm flex items-center justify-center text-white">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <span className="text-lg font-heading tracking-widest uppercase text-neutral-900">
              DirectSign
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar: Steps Wizard */}
        <aside className="w-[300px] bg-white p-12 pr-8 flex flex-col gap-12 shrink-0 hidden md:flex border-r border-neutral-100 shadow-[24px_0_40px_rgba(0,0,0,0.01)] relative z-10">
          <div>
            <h3 className="text-[10px] font-medium text-neutral-400 uppercase tracking-[0.2em] mb-10">
              Contract Builder
            </h3>
            <nav className="space-y-8 relative">
              <div className="absolute left-[11px] top-6 bottom-6 w-px bg-neutral-100 z-0"></div>
              {[
                { s: 1, label: "기본 정보 입력" },
                { s: 2, label: "채널 & 노출 조건" },
                { s: 3, label: "의무 및 대가 지급" },
                { s: 4, label: "맞춤형 특약 사항" },
              ].map((item) => (
                <div
                  key={item.s}
                  className={`flex items-center gap-6 relative z-10 transition-all duration-500 ${step === item.s ? "text-neutral-900 translate-x-2" : step > item.s ? "text-neutral-900" : "text-neutral-400"}`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] transition-all duration-500 ease-out ${step === item.s ? "border border-neutral-900 bg-white text-neutral-900 ring-4 ring-neutral-100" : step > item.s ? "bg-neutral-900 text-white" : "border border-neutral-200 bg-white text-neutral-300"}`}
                  >
                    {step > item.s ? <Check strokeWidth={3} className="w-3 h-3" /> : item.s}
                  </div>
                  <span
                    className={`font-medium text-[13px] tracking-wide ${step === item.s ? "font-semibold" : ""}`}
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* Left Pane - Form */}
        <section className="w-full md:w-[600px] bg-[#FAFAFA] overflow-y-auto shrink-0 custom-scrollbar relative z-0">
          <div className="p-16 max-w-[500px]">
            <p className="text-[10px] font-medium text-neutral-400 uppercase tracking-[0.2em] mb-4">Step {step} of 4</p>
            <h1 className="text-3xl font-heading font-light mb-4 text-neutral-900 tracking-tight">
              새 전자계약서 작성
            </h1>
            <p className="text-neutral-500 text-[13px] leading-relaxed mb-12">
              필수 항목들을 채워주시면 스마트 컨트랙트가 자동 생성됩니다.
            </p>

            <div className="space-y-6">
              {step === 1 && (
                <div className="animate-in fade-in slide-in-from-right-4 space-y-6">
                  <div>
                    <Label>계약 유형</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(val: any) =>
                        setFormData({ ...formData, type: val })
                      }
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="협찬">
                          제품 협찬 (단순 리뷰)
                        </SelectItem>
                        <SelectItem value="PPL">유료 광고 (PPL)</SelectItem>
                        <SelectItem value="공동구매">
                          공동구매 (수익 분배형)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>계약 건명 (내부 관리용)</Label>
                    <Input
                      className="mt-1.5"
                      placeholder="ex) 봄맞이 립 틴트 인스타그램 협찬"
                      value={formData.title}
                      onChange={(e) =>
                        setFormData({ ...formData, title: e.target.value })
                      }
                    />
                  </div>
                  <div className="pt-4 border-t border-gray-100">
                    <h3 className="font-medium text-sm mb-4">
                      인플루언서 정보
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <Label>성명 또는 채널명</Label>
                        <Input
                          className="mt-1.5"
                          placeholder="홍길동"
                          value={formData.influencerName}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              influencerName: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label>메인 채널 URL</Label>
                        <Input
                          className="mt-1.5"
                          placeholder="https://instagram.com/..."
                          value={formData.influencerUrl}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              influencerUrl: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label>연락처 (이메일/번호)</Label>
                        <Input
                          className="mt-1.5"
                          placeholder="test@example.com"
                          value={formData.influencerContact}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              influencerContact: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="animate-in fade-in slide-in-from-right-4 space-y-6">
                  <div>
                    <Label className="mb-3 block">
                      대상 플랫폼 및 콘텐츠 포맷
                    </Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        "인스타그램 피드",
                        "인스타그램 릴스",
                        "인스타그램 스토리",
                        "유튜브 숏츠",
                        "유튜브 일반영상",
                        "블라인드",
                        "틱톡",
                        "블로그",
                      ].map((ch) => (
                        <div key={ch} className={`border rounded-lg transition-colors ${formData.channels.includes(ch) ? "border-black bg-gray-50" : "border-gray-200"}`}>
                          <label className="flex items-start p-3 cursor-pointer">
                            <div className="flex items-center h-5">
                              <input
                                type="checkbox"
                                className="form-checkbox h-4 w-4 text-black rounded border-gray-300"
                                checked={formData.channels.includes(ch)}
                                onChange={() => handleChannelToggle(ch)}
                              />
                            </div>
                            <div className="ml-3 text-sm">{ch}</div>
                          </label>
                          {formData.channels.includes(ch) && (
                            <div className="px-3 pb-3 ml-7 grid grid-cols-1 gap-2 animate-in fade-in zoom-in-95 duration-200">
                              <div>
                                <Label className="text-xs text-slate-500">업로드 건수</Label>
                                <Input className="mt-1 h-8 text-xs bg-white" placeholder="ex) 1회" value={formData.channelDetails[ch]?.postCount || ''} onChange={(e) => handleChannelDetailChange(ch, 'postCount', e.target.value)} />
                              </div>
                              <div>
                                <Label className="text-xs text-slate-500">게시물 유지 기간</Label>
                                <Input className="mt-1 h-8 text-xs bg-white" placeholder="ex) 6개월, 무기한" value={formData.channelDetails[ch]?.duration || ''} onChange={(e) => handleChannelDetailChange(ch, 'duration', e.target.value)} />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3">
                      <div className={`border rounded-lg transition-colors ${formData.hasOtherChannel ? "border-black bg-gray-50" : "border-gray-200"}`}>
                        <label className="flex items-start p-3 cursor-pointer">
                          <div className="flex items-center h-5">
                            <input
                              type="checkbox"
                              className="form-checkbox h-4 w-4 text-black rounded border-gray-300"
                              checked={formData.hasOtherChannel}
                              onChange={(e) => setFormData({ ...formData, hasOtherChannel: e.target.checked })}
                            />
                          </div>
                          <div className="ml-3 text-sm">기타 매체 (직접 입력)</div>
                        </label>
                        {formData.hasOtherChannel && (
                          <div className="px-3 pb-3 ml-7 grid grid-cols-1 gap-3 animate-in fade-in zoom-in-95 duration-200">
                            <div>
                              <Label className="text-xs text-slate-500">매체명</Label>
                              <Input
                                className="mt-1 h-8 text-xs bg-white"
                                placeholder="기타 플랫폼 명"
                                value={formData.otherChannel}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    otherChannel: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs text-slate-500">업로드 건수</Label>
                                <Input 
                                  className="mt-1 h-8 text-xs bg-white" 
                                  placeholder="ex) 1회" 
                                  value={formData.otherChannelDetails.postCount} 
                                  onChange={(e) => setFormData(prev => ({ ...prev, otherChannelDetails: { ...prev.otherChannelDetails, postCount: e.target.value } }))}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-slate-500">게시물 유지 기간</Label>
                                <Input 
                                  className="mt-1 h-8 text-xs bg-white" 
                                  placeholder="ex) 6개월, 무기한" 
                                  value={formData.otherChannelDetails.duration} 
                                  onChange={(e) => setFormData(prev => ({ ...prev, otherChannelDetails: { ...prev.otherChannelDetails, duration: e.target.value } }))}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="animate-in fade-in slide-in-from-right-4 space-y-6">
                  <div>
                    <Label>경쟁사 배제 (Exclusivity) 조건</Label>
                    <Input
                      className="mt-1.5"
                      placeholder="업로드 후 3개월간 동종업계 진행 불가"
                      value={formData.exclusivity}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          exclusivity: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>고정비 또는 수수료율</Label>
                    <Textarea
                      className="mt-1.5"
                      placeholder="건당 100만원 지급 (세금 포함) / 판매 수익의 15% 지급"
                      value={formData.payment}
                      onChange={(e) =>
                        setFormData({ ...formData, payment: e.target.value })
                      }
                    />
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="animate-in fade-in slide-in-from-right-4 space-y-6">
                  <div>
                    <Label className="mb-2 block">
                      즐겨찾는 기본 특약 추가
                    </Label>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addTemplateClause("delivery")}
                        className="text-xs"
                      >
                        + 파손 책임 (공급사)
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addTemplateClause("cs")}
                        className="text-xs"
                      >
                        + 고객 CS 전담 (공급사)
                      </Button>
                    </div>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl">
                    <h3 className="text-sm font-semibold mb-3">
                      직접 특약 추가
                    </h3>
                    <div className="space-y-3">
                      <Input
                        placeholder="조항 카테고리 (ex: 비밀유지)"
                        value={formData.newClauseCategory}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            newClauseCategory: e.target.value,
                          })
                        }
                      />
                      <Textarea
                        placeholder="세부 내용을 입력하세요"
                        value={formData.newClauseContent}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            newClauseContent: e.target.value,
                          })
                        }
                      />
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={addCustomClause}
                        disabled={!formData.newClauseContent}
                      >
                        조항 추가하기
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-4 mt-16 pt-8 border-t border-neutral-200">
              {step > 1 && (
                <Button variant="outline" className="h-[52px] px-8 rounded-none font-medium text-neutral-600 border-neutral-200 hover:bg-neutral-100 hover:text-neutral-900 transition-colors uppercase tracking-wider text-[12px]" onClick={() => setStep(step - 1)}>
                  Back
                </Button>
              )}

              {step < 4 ? (
                <Button className="flex-1 h-[52px] rounded-none bg-neutral-900 hover:bg-neutral-800 text-white text-[12px] font-medium uppercase tracking-wider transition-colors" onClick={() => setStep(step + 1)}>Continue</Button>
              ) : generatedLink ? (
                <div />
              ) : (
                <Button
                  className="flex-1 h-[52px] rounded-none bg-neutral-900 hover:bg-neutral-800 text-white text-[12px] font-medium uppercase tracking-wider transition-colors"
                  onClick={handleSaveAndShare}
                >
                  Generate Contract
                </Button>
              )}
            </div>

            {generatedLink && (
              <div className="mt-12 p-8 bg-white border border-neutral-200 flex flex-col items-center text-center shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
                <div className="w-12 h-12 bg-neutral-50 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 strokeWidth={1.5} className="w-6 h-6 text-neutral-900" />
                </div>
                <h3 className="text-xl font-heading text-neutral-900 mb-3 tracking-tight">
                  Contract Generated
                </h3>
                <p className="text-[13px] text-neutral-500 mb-8 max-w-[280px]">
                  Your contract is ready. Copy the link below to share with the counterparty.
                </p>
                <div className="flex w-full items-center gap-3">
                  <Input
                    readOnly
                    value={generatedLink}
                    className="flex-1 h-[44px] border-neutral-200 bg-neutral-50 text-neutral-600 font-mono text-[12px] focus-visible:ring-0 rounded-none px-4"
                  />
                  <Button
                    onClick={copyToClipboard}
                    className={`shrink-0 h-[44px] px-6 rounded-none font-medium text-[12px] uppercase tracking-wider transition-colors ${copied ? "bg-neutral-100 text-neutral-900" : "bg-neutral-900 text-white hover:bg-neutral-800"}`}
                  >
                    {copied ? (
                      "Copied"
                    ) : (
                      "Copy Link"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right Pane - Preview */}
        <section className="flex-1 bg-[#FAFAFA] flex flex-col overflow-hidden hidden lg:flex p-12 pl-0">
          <div className="flex-1 bg-white border border-neutral-100 shadow-[0_8px_40px_rgba(0,0,0,0.04)] flex flex-col relative">
            <div className="h-[80px] bg-white border-b border-neutral-100 flex items-center px-12 text-neutral-400 text-[10px] uppercase font-medium tracking-[0.2em] shrink-0 justify-between">
              <span>Preview</span>
              <span className="font-mono">{new Date().toISOString().split('T')[0]}</span>
            </div>

            <div className="flex-1 p-16 text-neutral-800 leading-relaxed overflow-y-auto space-y-12 custom-scrollbar">
              <div className="text-4xl font-heading font-light text-neutral-900 mb-16 tracking-tight text-center">
                {formData.title || `${formData.type} 계약서`}
              </div>

              <div className="text-[14px] space-y-12">
                <div>
                  <h4 className="font-medium text-neutral-900 mb-4 text-[13px] uppercase tracking-[0.1em]">
                    Contracting Parties
                  </h4>
                  <div className="pl-6 border-l border-neutral-200 space-y-2 text-neutral-600">
                    <p><span className="text-neutral-400 mr-2">甲方</span> (Advertiser) 당근 마케팅랩</p>
                    <p><span className="text-neutral-400 mr-2">乙方</span> (Influencer) {formData.influencerName || "[Name]"}</p>
                    <p className="text-[12px] text-neutral-400 font-mono mt-2">
                      {formData.influencerUrl}
                    </p>
                  </div>
                </div>

                {generateClauses().map((clause, i) => (
                  <div
                    key={clause.clause_id}
                    className="pt-10 border-t border-neutral-100"
                  >
                    <h4 className="font-medium text-neutral-900 mb-4 text-[13px] uppercase tracking-[0.1em] flex gap-4">
                      <span className="text-neutral-400 font-mono">{(i + 1).toString().padStart(2, '0')}</span> 
                      {clause.category}
                    </h4>
                    <p className="text-neutral-600 leading-[1.8] whitespace-pre-wrap pl-8">
                      {clause.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
