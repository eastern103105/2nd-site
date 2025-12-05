import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { Plus, Trash2, Megaphone } from 'lucide-react';

export default function AnnouncementManagement() {
    const [announcements, setAnnouncements] = useState([]);
    const [classes, setClasses] = useState([]);
    const [newAnnouncement, setNewAnnouncement] = useState({ title: '', content: '', targetClassId: 'all' });
    const [loading, setLoading] = useState(true);
    const [academyId, setAcademyId] = useState(null);

    const fetchClasses = useCallback(async () => {
        if (!academyId) return;
        try {
            const { data, error } = await supabase
                .from('classes')
                .select('*')
                .eq('academy_id', academyId);

            if (error) throw error;
            setClasses(data);
        } catch (error) {
            console.error("Error fetching classes:", error);
        }
    }, [academyId]);

    const fetchAnnouncements = useCallback(async () => {
        if (!academyId) return;
        try {
            const { data, error } = await supabase
                .from('announcements')
                .select('*')
                .eq('academy_id', academyId)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;
            setAnnouncements(data);
            setLoading(false);
        } catch (error) {
            console.error("Error fetching announcements:", error);
            setLoading(false);
        }
    }, [academyId]);

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                // Get current session user
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                // Get user details for academy_id
                const { data: userData, error } = await supabase
                    .from('users')
                    .select('academy_id')
                    .eq('id', user.id)
                    .single();

                if (userData) {
                    const userAcademyId = userData.academy_id || 'academy_default';
                    setAcademyId(userAcademyId);
                    localStorage.setItem('academyId', userAcademyId);
                }
            } catch (error) {
                console.error("Error fetching user data:", error);
            }
        };
        fetchUserData();
    }, []);

    useEffect(() => {
        if (academyId) {
            fetchClasses();
            fetchAnnouncements();
        }
    }, [academyId, fetchClasses, fetchAnnouncements]);

    const handleAddAnnouncement = async (e) => {
        e.preventDefault();
        if (!newAnnouncement.title.trim() || !newAnnouncement.content.trim()) return;
        if (!academyId) {
            alert('학원 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
            return;
        }

        try {
            const targetClassName = newAnnouncement.targetClassId === 'all'
                ? '전체'
                : classes.find(c => c.id === newAnnouncement.targetClassId)?.name || 'Unknown';

            const { error } = await supabase.from('announcements').insert({
                title: newAnnouncement.title,
                content: newAnnouncement.content,
                target_class_id: newAnnouncement.targetClassId,
                target_class_name: targetClassName,
                // author_name: '선생님', // Can be fetched from user profile if needed
                academy_id: academyId
            });

            if (error) throw error;

            setNewAnnouncement({ title: '', content: '', targetClassId: 'all' });
            fetchAnnouncements();
            alert('공지사항이 등록되었습니다.');
        } catch (error) {
            console.error("Error adding announcement:", error);
            alert('공지사항 등록 실패');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('정말 삭제하시겠습니까?')) return;
        try {
            const { error } = await supabase.from('announcements').delete().eq('id', id);
            if (error) throw error;

            setAnnouncements(prev => prev.filter(a => a.id !== id));
        } catch (error) {
            console.error("Error deleting announcement:", error);
        }
    };

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 mb-8 flex items-center">
                <Megaphone className="w-8 h-8 mr-3 text-indigo-600" />
                공지사항 관리
            </h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Form */}
                <div className="lg:col-span-1">
                    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 sticky top-8">
                        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                            <Plus className="w-5 h-5 mr-2" />
                            새 공지 작성
                        </h2>
                        <form onSubmit={handleAddAnnouncement} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">제목</label>
                                <input
                                    type="text"
                                    value={newAnnouncement.title}
                                    onChange={e => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="공지 제목을 입력하세요"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">대상 학급</label>
                                <select
                                    value={newAnnouncement.targetClassId}
                                    onChange={e => setNewAnnouncement({ ...newAnnouncement, targetClassId: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    <option value="all">전체 학생</option>
                                    {classes.map(cls => (
                                        <option key={cls.id} value={cls.id}>{cls.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">내용</label>
                                <textarea
                                    value={newAnnouncement.content}
                                    onChange={e => setNewAnnouncement({ ...newAnnouncement, content: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none h-40 resize-none"
                                    placeholder="공지 내용을 입력하세요"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-md"
                            >
                                등록하기
                            </button>
                        </form>
                    </div>
                </div>

                {/* List */}
                <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">등록된 공지사항</h2>
                    {loading ? (
                        <div className="text-center py-12 text-gray-500">로딩 중...</div>
                    ) : announcements.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-300 text-gray-500">
                            등록된 공지사항이 없습니다.
                        </div>
                    ) : (
                        announcements.map(announcement => (
                            <div key={announcement.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative group">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <span className={`inline-block px-2 py-1 rounded text-xs font-bold mb-2 ${announcement.target_class_id === 'all' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'}`}>
                                            {announcement.target_class_name}
                                        </span>
                                        <h3 className="text-lg font-bold text-gray-800">{announcement.title}</h3>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(announcement.id)}
                                        className="p-2 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                                <p className="text-gray-600 whitespace-pre-wrap text-sm">{announcement.content}</p>
                                <div className="mt-4 text-xs text-gray-400 flex justify-between items-center">
                                    <span>작성자: {announcement.author_name || '선생님'}</span>
                                    <span>{new Date(announcement.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
