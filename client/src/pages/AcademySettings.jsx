import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Save, ArrowLeft, Building, Type, Layout, Info } from 'lucide-react';
import { supabase } from '../supabase';

export default function AcademySettings() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [academyId] = useState(localStorage.getItem('academyId') || 'academy_default');

    const [settings, setSettings] = useState({
        name: '',
        logoText: '',
        loginTitle: '',
        loginSubtitle: '',
        footerInfo: '',
    });

    useEffect(() => {
        const fetchSettings = async () => {
            if (!academyId) {
                alert('학원 정보가 없습니다.');
                navigate('/admin');
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('academies')
                    .select('*')
                    .eq('id', academyId)
                    .single();

                if (error) throw error;

                if (data) {
                    setSettings({
                        name: data.name || '',
                        logoText: data.settings?.logoText || data.name || 'Eastern WordTest',
                        loginTitle: data.settings?.loginTitle || 'Eastern WordTest',
                        loginSubtitle: data.settings?.loginSubtitle || '이스턴 영어 공부방',
                        footerInfo: data.settings?.footerInfo || '',
                    });
                } else {
                    console.log("Academy not found");
                }
            } catch (error) {
                console.error("Error fetching settings:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchSettings();
    }, [academyId, navigate]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);

        try {
            const { error } = await supabase
                .from('academies')
                .update({
                    name: settings.name,
                    settings: { // Jsonb column
                        logoText: settings.logoText,
                        loginTitle: settings.loginTitle,
                        loginSubtitle: settings.loginSubtitle,
                        footerInfo: settings.footerInfo
                    }
                })
                .eq('id', academyId);

            if (error) throw error;

            alert('설정이 저장되었습니다.');
            if (confirm('변경 사항을 적용하기 위해 페이지를 새로고침 하시겠습니까?')) {
                window.location.reload();
            }
        } catch (error) {
            console.error("Error saving settings:", error);
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-center">로딩 중...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center mb-8">
                    <button
                        onClick={() => navigate('/admin')}
                        className="mr-4 p-2 hover:bg-gray-200 rounded-full transition-colors"
                    >
                        <ArrowLeft className="w-6 h-6 text-gray-600" />
                    </button>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                        <Settings className="w-6 h-6 mr-2" />
                        학원 설정
                    </h1>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <form onSubmit={handleSubmit} className="p-6 space-y-6">

                        {/* Basic Info */}
                        <div className="space-y-4">
                            <h2 className="text-lg font-semibold flex items-center text-gray-800 border-b pb-2">
                                <Building className="w-5 h-5 mr-2 text-indigo-500" />
                                기본 정보
                            </h2>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">학원 이름</label>
                                <input
                                    type="text"
                                    name="name"
                                    value={settings.name}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                    placeholder="예: 이스턴 영어 학원"
                                />
                                <p className="text-xs text-gray-500 mt-1">시스템 내부에서 사용되는 학원 이름입니다.</p>
                            </div>
                        </div>

                        {/* Branding */}
                        <div className="space-y-4">
                            <h2 className="text-lg font-semibold flex items-center text-gray-800 border-b pb-2">
                                <Type className="w-5 h-5 mr-2 text-purple-500" />
                                브랜딩 설정
                            </h2>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">메인 로고 텍스트</label>
                                <input
                                    type="text"
                                    name="logoText"
                                    value={settings.logoText}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                    placeholder="예: Eastern WordTest"
                                />
                                <p className="text-xs text-gray-500 mt-1">상단 메뉴바에 표시되는 텍스트입니다.</p>
                            </div>
                        </div>

                        {/* Login Page */}
                        <div className="space-y-4">
                            <h2 className="text-lg font-semibold flex items-center text-gray-800 border-b pb-2">
                                <Layout className="w-5 h-5 mr-2 text-blue-500" />
                                로그인 페이지 설정
                            </h2>

                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <label className="block text-sm font-medium text-blue-800 mb-1">전용 로그인 링크</label>
                                <div className="flex items-center space-x-2">
                                    <code className="flex-1 bg-white px-3 py-2 rounded border border-blue-200 text-sm text-gray-600 break-all">
                                        {window.location.origin}/login?academy={academyId}
                                    </code>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(`${window.location.origin}/login?academy=${academyId}`);
                                            alert('링크가 복사되었습니다.');
                                        }}
                                        className="px-3 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm font-bold whitespace-nowrap"
                                    >
                                        복사
                                    </button>
                                </div>
                                <p className="text-xs text-blue-600 mt-2">
                                    * 이 링크로 접속하면 설정한 로그인 제목과 부제목이 표시됩니다.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">로그인 제목 (큰 글씨)</label>
                                    <input
                                        type="text"
                                        name="loginTitle"
                                        value={settings.loginTitle}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                        placeholder="예: Eastern WordTest"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">로그인 부제목 (작은 글씨)</label>
                                    <input
                                        type="text"
                                        name="loginSubtitle"
                                        value={settings.loginSubtitle}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                        placeholder="예: 이스턴 영어 공부방"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Footer Info */}
                        <div className="space-y-4">
                            <h2 className="text-lg font-semibold flex items-center text-gray-800 border-b pb-2">
                                <Info className="w-5 h-5 mr-2 text-green-500" />
                                하단 정보 (Footer)
                            </h2>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">학원 정보</label>
                                <textarea
                                    name="footerInfo"
                                    value={settings.footerInfo}
                                    onChange={handleChange}
                                    rows="3"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none"
                                    placeholder="예: 서울시 강남구 ... | 전화: 02-1234-5678"
                                />
                                <p className="text-xs text-gray-500 mt-1">학생 대시보드 하단에 표시될 정보입니다.</p>
                            </div>
                        </div>

                        <div className="pt-4 flex justify-end">
                            <button
                                type="submit"
                                disabled={saving}
                                className="flex items-center px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-bold shadow-lg shadow-indigo-200 disabled:opacity-50"
                            >
                                <Save className="w-5 h-5 mr-2" />
                                {saving ? '저장 중...' : '설정 저장'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
