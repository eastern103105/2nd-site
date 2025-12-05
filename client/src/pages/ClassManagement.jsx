import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Users } from 'lucide-react';
import { supabase } from '../supabase';

export default function ClassManagement() {
    const [classes, setClasses] = useState([]);
    const [newClassName, setNewClassName] = useState('');
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetchClasses();
    }, []);

    const fetchClasses = async () => {
        try {
            const academyId = localStorage.getItem('academyId') || 'academy_default';
            const { data, error } = await supabase
                .from('classes')
                .select('*')
                .eq('academy_id', academyId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setClasses(data || []);
        } catch (err) {
            console.error(err);
            alert('반 목록을 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleAddClass = async (e) => {
        e.preventDefault();
        if (!newClassName.trim()) return;

        try {
            const academyId = localStorage.getItem('academyId') || 'academy_default';

            const { data, error } = await supabase
                .from('classes')
                .insert({
                    name: newClassName,
                    academy_id: academyId
                })
                .select();

            if (error) throw error;

            if (data) {
                setClasses([...classes, ...data]);
            }
            setNewClassName('');
        } catch (err) {
            console.error(err);
            alert('반 추가 실패');
        }
    };

    const handleDeleteClass = async (id) => {
        if (!window.confirm('정말 이 반을 삭제하시겠습니까? 소속된 학생들의 반 정보가 초기화됩니다.')) return;

        try {
            // First update users to remove class_id (simulate SET NULL or let DB constraint handle if set)
            // Supabase/Postgres foreign key "ON DELETE SET NULL" should handle this if configured.
            // If not, we should manually update.
            // Let's assume manual update for safety.
            await supabase.from('users').update({ class_id: null }).eq('class_id', id);

            const { error } = await supabase.from('classes').delete().eq('id', id);

            if (error) throw error;

            setClasses(classes.filter((c) => c.id !== id));
        } catch (err) {
            console.error(err);
            alert('반 삭제 실패');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-4xl mx-auto">
                <header className="flex items-center justify-between mb-8">
                    <div className="flex items-center space-x-4">
                        <button onClick={() => navigate('/admin')} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                            <ArrowLeft className="w-6 h-6 text-gray-600" />
                        </button>
                        <h1 className="text-3xl font-bold text-gray-800">반 관리</h1>
                    </div>
                </header>

                <div className="bg-white rounded-2xl shadow-sm p-6 mb-8">
                    <h2 className="text-xl font-semibold mb-4 text-gray-800">새 반 추가</h2>
                    <form onSubmit={handleAddClass} className="flex gap-4">
                        <input
                            type="text"
                            value={newClassName}
                            onChange={(e) => setNewClassName(e.target.value)}
                            placeholder="반 이름을 입력하세요 (예: 1학년 1반)"
                            className="flex-1 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <button
                            type="submit"
                            className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2"
                        >
                            <Plus className="w-5 h-5" />
                            추가
                        </button>
                    </form>
                </div>

                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100">
                        <h2 className="text-xl font-semibold text-gray-800">반 목록</h2>
                    </div>

                    {loading ? (
                        <div className="p-8 text-center text-gray-500">로딩 중...</div>
                    ) : classes.length === 0 ? (
                        <div className="p-12 text-center text-gray-400">
                            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p>등록된 반이 없습니다.</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {classes.map((cls) => (
                                <li key={cls.id} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                    <div>
                                        <h3 className="text-lg font-medium text-gray-900">{cls.name}</h3>
                                        {/* <p className="text-sm text-gray-500">ID: {cls.id}</p> */}
                                    </div>
                                    <button
                                        onClick={() => handleDeleteClass(cls.id)}
                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                        title="삭제"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
