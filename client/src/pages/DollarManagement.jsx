import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { DollarSign, Save, Settings } from 'lucide-react';

export default function DollarManagement() {
    const [settings, setSettings] = useState({
        daily_completion_reward: 0.5,
        curriculum_completion_reward: 0.1,
        game_high_score_reward: 0.05,
        game_high_score_threshold: 80,
        game_daily_max_reward: 0.5
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [academyId, setAcademyId] = useState(null);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const id = localStorage.getItem('academyId') || 'academy_default';
                setAcademyId(id);

                const { data, error } = await supabase
                    .from('academies')
                    .select('settings')
                    .eq('id', id)
                    .single();

                if (error) throw error;

                if (data && data.settings && data.settings.rewards) {
                    setSettings(prev => ({ ...prev, ...data.settings.rewards }));
                }
            } catch (error) {
                console.error("Error fetching settings:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchSettings();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setSettings(prev => ({
            ...prev,
            [name]: parseFloat(value)
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Fetch current settings first to merge, or use jsonb merging
            // Supabase/Postgres allows generic jsonb update, but we want to patch `settings.rewards`
            // We can fetch, merge in JS, then update.

            const { data: currentData, error: fetchError } = await supabase
                .from('academies')
                .select('settings')
                .eq('id', academyId)
                .single();

            if (fetchError) throw fetchError;

            const newSettings = {
                ...(currentData.settings || {}),
                rewards: settings
            };

            const { error: updateError } = await supabase
                .from('academies')
                .update({ settings: newSettings })
                .eq('id', academyId);

            if (updateError) throw updateError;

            alert('설정이 저장되었습니다.');
        } catch (error) {
            console.error("Error saving settings:", error);
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-center">로딩 중...</div>;

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <div className="flex items-center space-x-3 mb-8">
                <div className="bg-green-100 p-3 rounded-full">
                    <DollarSign className="w-8 h-8 text-green-600" />
                </div>
                <h1 className="text-3xl font-bold text-gray-900">달러 보상 관리</h1>
            </div>

            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
                <div className="p-6 bg-gray-50 border-b border-gray-100">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center">
                        <Settings className="w-5 h-5 mr-2" />
                        보상 설정
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">학생들의 활동에 따른 달러 보상량을 설정합니다.</p>
                </div>

                <div className="p-8 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <label className="block text-sm font-bold text-gray-700">
                                매일 학습 전체 완료 보상 ($)
                            </label>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                <input
                                    type="number"
                                    step="0.01"
                                    name="daily_completion_reward"
                                    value={settings.daily_completion_reward}
                                    onChange={handleChange}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-lg font-medium"
                                />
                            </div>
                            <p className="text-xs text-gray-500">학생이 하루 할당량을 모두 마쳤을 때 지급됩니다.</p>
                        </div>

                        <div className="space-y-4">
                            <label className="block text-sm font-bold text-gray-700">
                                커리큘럼(단어장) 완료 보상 ($)
                            </label>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                <input
                                    type="number"
                                    step="0.01"
                                    name="curriculum_completion_reward"
                                    value={settings.curriculum_completion_reward}
                                    onChange={handleChange}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-lg font-medium"
                                />
                            </div>
                            <p className="text-xs text-gray-500">단어장 하나를 완전히 끝냈을 때 지급됩니다.</p>
                        </div>

                        <div className="space-y-4">
                            <label className="block text-sm font-bold text-gray-700">
                                게임 고득점 보상 ($)
                            </label>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                <input
                                    type="number"
                                    step="0.01"
                                    name="game_high_score_reward"
                                    value={settings.game_high_score_reward}
                                    onChange={handleChange}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-lg font-medium"
                                />
                            </div>
                            <p className="text-xs text-gray-500">게임에서 일정 점수 이상을 획득했을 때 지급됩니다.</p>
                        </div>

                        <div className="space-y-4">
                            <label className="block text-sm font-bold text-gray-700">
                                게임 고득점 기준 점수
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    name="game_high_score_threshold"
                                    value={settings.game_high_score_threshold}
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-lg font-medium"
                                />
                            </div>
                            <p className="text-xs text-gray-500">이 점수 이상일 때 보상이 지급됩니다.</p>
                        </div>

                        <div className="space-y-4">
                            <label className="block text-sm font-bold text-gray-700">
                                게임 일일 최대 보상 한도 ($)
                            </label>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                <input
                                    type="number"
                                    step="0.01"
                                    name="game_daily_max_reward"
                                    value={settings.game_daily_max_reward}
                                    onChange={handleChange}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-lg font-medium"
                                />
                            </div>
                            <p className="text-xs text-gray-500">하루에 게임으로 획득할 수 있는 최대 달러입니다.</p>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-gray-100 flex justify-end">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center px-8 py-4 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 transform hover:-translate-y-1"
                        >
                            <Save className="w-5 h-5 mr-2" />
                            {saving ? '저장 중...' : '설정 저장하기'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
