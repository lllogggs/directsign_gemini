import React, { useState } from 'react';
import { Users, Briefcase, FileText, CircleDollarSign, TrendingUp, Building2, UserCircle2, Lock } from 'lucide-react';
import { useAppStore } from '../../store';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useNavigate } from 'react-router-dom';

const mockChartData = [
  { name: '10월', contracts: 120, volume: 4.2 },
  { name: '11월', contracts: 180, volume: 6.8 },
  { name: '12월', contracts: 250, volume: 9.5 },
  { name: '1월', contracts: 310, volume: 12.1 },
  { name: '2월', contracts: 450, volume: 18.5 },
  { name: '3월', contracts: 580, volume: 24.2 },
  { name: '4월', contracts: 720, volume: 31.8 },
];

export function SystemAdminDashboard() {
  const { contracts } = useAppStore();
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'admin123') { // In a real app, this would be a proper backend auth call
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('비밀번호가 일치하지 않습니다.');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen bg-slate-50 items-center justify-center font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-slate-950 rounded-2xl flex items-center justify-center text-white font-bold mb-6 shadow-md">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">운영자 로그인</h1>
            <p className="text-sm font-medium text-slate-500 mt-2 uppercase tracking-widest text-center">System Administration</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <input 
                type="password" 
                placeholder="관리자 인증 코드" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full flex h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-mono tracking-widest focus-visible:outline-none focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:border-slate-950 transition-all placeholder:text-slate-400 placeholder:normal-case placeholder:tracking-normal"
              />
              {error && <p className="text-xs font-semibold text-rose-500 mt-2 text-center">{error}</p>}
            </div>
            <button type="submit" className="w-full inline-flex items-center justify-center rounded-xl text-sm font-bold transition-all h-12 px-4 shadow-sm bg-slate-950 text-white hover:bg-slate-800 hover:shadow-md">
              보안 콘솔 접속
            </button>
          </form>
          <div className="mt-6 text-center">
            <button onClick={() => navigate('/marketing/dashboard')} className="text-xs text-slate-400 hover:text-slate-600">
              돌아가기
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      <header className="h-16 px-8 border-b border-slate-200 bg-white text-slate-950 flex items-center justify-between z-10 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-950 rounded-lg flex items-center justify-center text-white font-bold shadow-md"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
          <span className="text-xl font-bold tracking-tight">DirectSign <span className="text-slate-400 font-medium ml-1">ADMIN</span></span>
        </div>
        <div className="flex items-center gap-4 text-sm font-semibold">
          <span 
            className="text-[11px] uppercase tracking-wider text-slate-500 px-4 py-2 bg-slate-100 rounded-full cursor-pointer hover:bg-slate-200 transition-colors mr-2 font-bold"
            onClick={() => navigate('/marketing/dashboard')}
          >
            마케팅사 대시보드
          </span>
          <div className="w-8 h-8 rounded-full bg-slate-950 text-white flex items-center justify-center shadow-md">
            S
          </div>
          <span className="hidden sm:inline-block">System Admin</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="mb-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">System Metrics</p>
            <h1 className="text-3xl font-bold text-slate-950 tracking-tight">플랫폼 운영 대시보드</h1>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard 
              title="누적 광고주 (기업)" 
              value="1,248" 
              trend="+12% 이번 달"
              icon={<Building2 className="w-6 h-6 text-indigo-600" />} 
            />
            <MetricCard 
              title="누적 인플루언서" 
              value="8,592" 
              trend="+24% 이번 달"
              icon={<UserCircle2 className="w-6 h-6 text-emerald-600" />} 
            />
            <MetricCard 
              title="누적 계약 체결 수" 
              value={(2540 + contracts.length).toLocaleString()} 
              trend="+18% 이번 달"
              icon={<FileText className="w-6 h-6 text-amber-600" />} 
            />
            <MetricCard 
              title="누적 거래 규모" 
              value="152억 4,000만" 
              trend="+31% 이번 달"
              suffix="원"
              icon={<CircleDollarSign className="w-6 h-6 text-rose-600" />} 
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Chart */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">월별 계약 체결 추이</h2>
                  <p className="text-sm text-slate-500">최근 7개월 계약 건수</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-indigo-600 font-semibold bg-indigo-50 px-3 py-1.5 rounded-lg">
                  <TrendingUp className="w-4 h-4" /> 우상향 중
                </div>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mockChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748B'}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748B'}} />
                    <Tooltip 
                      cursor={{fill: '#F1F5F9'}}
                      contentStyle={{borderRadius: '0.5rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'}}
                    />
                    <Bar dataKey="contracts" fill="#4F46E5" radius={[4, 4, 0, 0]} barSize={40} name="계약 건수" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Agencies */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm overflow-hidden flex flex-col">
              <h2 className="text-lg font-bold text-slate-900 mb-6">신규 가입 광고주</h2>
              <div className="space-y-4 overflow-y-auto flex-1 pr-2">
                {[
                  { name: '당근 마케팅랩', type: '종합대행사', time: '10분 전' },
                  { name: '로컬 에이전시', type: '실행사', time: '1시간 전' },
                  { name: '(주)뷰티코스메틱', type: '브랜드사 (직접)', time: '3시간 전' },
                  { name: '넥스트커머스', type: '에이전시', time: '어제' },
                  { name: '스타트업 그로스', type: '실행사', time: '어제' },
                ].map((agency, i) => (
                  <div key={i} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-colors border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm">
                        {agency.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{agency.name}</p>
                        <p className="text-xs text-slate-500">{agency.type}</p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 font-medium">{agency.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ title, value, suffix = '', trend, icon }: { title: string, value: string | number, suffix?: string, trend: string, icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{title}</h3>
        <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-100 shadow-sm">
          {icon}
        </div>
      </div>
      <div className="flex items-baseline gap-1 mt-auto">
        <span className="text-4xl font-bold text-slate-950 tracking-tighter">{value}</span>
        {suffix && <span className="text-sm font-bold text-slate-400 ml-1">{suffix}</span>}
      </div>
      <div className="mt-4 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 w-fit rounded-md">
        {trend}
      </div>
    </div>
  );
}
