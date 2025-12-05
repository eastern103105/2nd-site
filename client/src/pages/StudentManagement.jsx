import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Users, Calendar, X, Activity, FileText } from 'lucide-react';
import { supabase } from '../supabase';

export default function StudentManagement() {
    const navigate = useNavigate();
    const [students, setStudents] = useState([]);
    const [classes, setClasses] = useState([]);
    const [newStudent, setNewStudent] = useState({ username: '', password: '', name: '' });
    const [editingStudent, setEditingStudent] = useState(null);
    const [showAbsenceModal, setShowAbsenceModal] = useState(null);
    const [absenceDate, setAbsenceDate] = useState('');
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [statusLogs, setStatusLogs] = useState([]);
    const [showDetailModal, setShowDetailModal] = useState(false);

    const [selectedClass, setSelectedClass] = useState('all');
    const [selectedStatus, setSelectedStatus] = useState('all'); // 'all', 'active', 'suspended'

    const fetchStudents = useCallback(async () => {
        try {
            const academyId = localStorage.getItem('academyId') || 'academy_default';
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('role', 'student')
                .eq('academy_id', academyId);

            if (error) throw error;
            setStudents(data || []);
        } catch (err) {
            console.error("Error fetching students:", err);
        }
    }, []);

    const fetchClasses = useCallback(async () => {
        try {
            const academyId = localStorage.getItem('academyId') || 'academy_default';
            const { data, error } = await supabase
                .from('classes')
                .select('*')
                .eq('academy_id', academyId);

            if (error) throw error;
            setClasses(data || []);
        } catch (err) {
            console.error("Error fetching classes:", err);
        }
    }, []);

    useEffect(() => {
        fetchStudents();
        fetchClasses();
    }, [fetchStudents, fetchClasses]);

    const handleMarkAbsent = async () => {
        if (!absenceDate) {
            alert('날짜를 선택해주세요');
            return;
        }
        alert("공강 처리 기능은 현재 버전에서 지원되지 않습니다. (추후 업데이트 예정)");
        setShowAbsenceModal(null);
    };

    const handleUpdateClass = async (studentId, classId) => {
        try {
            const className = classes.find(c => c.id === classId)?.name || null;
            const { error } = await supabase
                .from('users')
                .update({
                    class_id: classId || null,
                    class_name: className
                })
                .eq('id', studentId);

            if (error) throw error;

            setStudents(students.map(s =>
                s.id === studentId
                    ? { ...s, class_id: classId, class_name: className }
                    : s
            ));
        } catch (err) {
            console.error(err);
            alert('반 배정 실패');
        }
    };

    const handleRegisterStudent = async (e) => {
        e.preventDefault();
        if (!newStudent.username || !newStudent.password) {
            alert('아이디와 비밀번호를 입력해주세요.');
            return;
        }

        if (!newStudent.name) {
            alert('이름을 입력해주세요.');
            return;
        }

        try {
            const academyId = localStorage.getItem('academyId') || 'academy_default';
            const email = newStudent.username.includes('@') ? newStudent.username : `${newStudent.username}@wordtest.com`;

            // 현재 세션 저장
            const { data: { session: currentSession } } = await supabase.auth.getSession();

            // 새 학생 계정 생성 (이 과정에서 세션이 바뀔 수 있음)
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                email: email,
                password: newStudent.password,
            });

            if (signUpError) throw signUpError;

            const userId = signUpData.user?.id;
            if (!userId) throw new Error('사용자 ID를 가져올 수 없습니다.');

            // public.users 테이블에 학생 정보 추가
            const { error: profileError } = await supabase.from('users').insert({
                id: userId,
                email: email,
                username: newStudent.username,
                name: newStudent.name,
                role: 'student',
                academy_id: academyId,
                status: 'active',
                book_name: '기본',
                current_word_index: 0,
                study_days: ['월', '화', '수', '목', '금'],
                words_per_session: 10
            });

            if (profileError) {
                console.error('Profile error:', profileError);
                throw new Error('프로필 생성 실패: ' + profileError.message);
            }

            // 원래 관리자 세션으로 복구
            if (currentSession) {
                await supabase.auth.setSession({
                    access_token: currentSession.access_token,
                    refresh_token: currentSession.refresh_token
                });
            }

            alert('학생이 등록되었습니다!');
            setNewStudent({ username: '', password: '', name: '' });
            fetchStudents();

        } catch (err) {
            console.error("Registration error:", err);
            alert('등록 실패: ' + err.message);
        }
    };

    const handleUpdateSettings = async (student) => {
        try {
            const updates = {
                book_name: student.book_name,
                active_books: student.active_books || [student.book_name],
                next_books: student.next_books || [],
                study_days: student.study_days,
                words_per_session: student.words_per_session,
                words_per_day: student.words_per_day || {},
                current_word_index: student.current_word_index,
                name: student.name,
                book_settings: student.book_settings || {},
                book_progress: student.book_progress || {}
            };

            const { error } = await supabase
                .from('users')
                .update(updates)
                .eq('id', student.id);

            if (error) throw error;

            alert('설정이 업데이트되었습니다!');
            setEditingStudent(null);
            fetchStudents();
        } catch (err) {
            alert('업데이트 실패: ' + err.message);
        }
    };

    const handleDeleteStudent = async (userId) => {
        if (!confirm('이 학생을 삭제하시겠습니까? (복구 불가)')) return;

        try {
            // Delete from public.users table (trigger should handle auth.users if set up, or just logical delete)
            // Ideally call a backend function to delete from Auth.
            // For now, delete from 'users' table.

            const { error } = await supabase.from('users').delete().eq('id', userId);
            if (error) throw error;

            alert('학생 데이터가 삭제되었습니다.');
            fetchStudents();
        } catch (err) {
            alert('삭제 실패: ' + err.message);
        }
    };

    const handleResetPassword = async (studentId) => {
        alert("비밀번호 초기화는 현재 이메일 발송 방식만 지원되거나 관리자 API 수정이 필요합니다.");
    };

    const filteredStudents = students.filter(s => {
        const classMatch = selectedClass === 'all' || s.class_id === selectedClass;
        const statusMatch = selectedStatus === 'all' || (selectedStatus === 'active' ? (s.status !== 'suspended') : (s.status === 'suspended'));
        return classMatch && statusMatch;
    });

    const fetchStatusLogs = async (studentId) => {
        try {
            const { data, error } = await supabase
                .from('student_status_logs')
                .select('*')
                .eq('student_id', studentId)
                .order('changed_at', { ascending: false })
                .limit(50);

            if (error) {
                console.warn(error);
                setStatusLogs([]);
            } else {
                setStatusLogs(data || []);
            }
        } catch (e) {
            console.error("Error fetching status logs:", e);
            setStatusLogs([]);
        }
    };

    const handleViewDetails = async (student) => {
        setSelectedStudent(student);
        await fetchStatusLogs(student.id);
        setShowDetailModal(true);
    };

    const formatTimestamp = (timestamp) => {
        if (!timestamp) return '-';
        const d = new Date(timestamp);
        return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const handleToggleStatus = async (student) => {
        const newStatus = student.status === 'suspended' ? 'active' : 'suspended';
        if (!confirm(`${student.name} 학생을 ${newStatus === 'active' ? '정상' : '휴원'} 상태로 변경하시겠습니까?`)) return;

        try {
            // Update status in users table
            const { error } = await supabase
                .from('users')
                .update({ status: newStatus })
                .eq('id', student.id);

            if (error) throw error;

            // Log status change
            // Assuming we have this table, inserting logic
            await supabase.from('student_status_logs').insert({
                student_id: student.id,
                status: newStatus,
                changed_at: new Date().toISOString(),
                changed_by: localStorage.getItem('userId') || 'admin'
            });

            setStudents(students.map(s =>
                s.id === student.id ? { ...s, status: newStatus } : s
            ));

            setSelectedStatus('all');
            alert(`상태가 ${newStatus === 'active' ? '정상' : '휴원'}으로 변경되었습니다.`);
        } catch (err) {
            console.error(err);
            alert('상태 변경 실패: ' + err.message);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                <header className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="p-3 bg-indigo-600 rounded-lg">
                            <Users className="w-6 h-6 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900">학생 관리</h1>
                    </div>
                </header>

                {/* Student Registration */}
                <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                    <h2 className="text-lg font-semibold mb-4 flex items-center">
                        <UserPlus className="w-5 h-5 mr-2 text-gray-500" />
                        학생 등록
                    </h2>
                    <form onSubmit={handleRegisterStudent} className="flex gap-4">
                        <input
                            type="text"
                            placeholder="학생 아이디"
                            value={newStudent.username}
                            onChange={(e) => setNewStudent({ ...newStudent, username: e.target.value })}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <input
                            type="text"
                            placeholder="학생 이름"
                            value={newStudent.name}
                            onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <input
                            type="password"
                            placeholder="비밀번호"
                            value={newStudent.password}
                            onChange={(e) => setNewStudent({ ...newStudent, password: e.target.value })}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <button
                            type="submit"
                            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all flex items-center space-x-2"
                        >
                            <UserPlus className="w-5 h-5" />
                            <span>등록</span>
                        </button>
                    </form>
                </div>

                {/* Student List */}
                <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold">학생 목록 ({filteredStudents.length}명)</h2>
                        <div className="flex space-x-2">
                            <select
                                value={selectedStatus}
                                onChange={(e) => setSelectedStatus(e.target.value)}
                                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="all">전체 상태</option>
                                <option value="active">정상</option>
                                <option value="suspended">휴원</option>
                            </select>
                            <select
                                value={selectedClass}
                                onChange={(e) => setSelectedClass(e.target.value)}
                                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="all">전체 반</option>
                                {classes.map(cls => (
                                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="space-y-4">
                        {filteredStudents.map((student) => (
                            <div key={student.id} className={`border rounded-lg p-4 ${student.status === 'suspended' ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`}>
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <div className="flex items-center space-x-2">
                                            <h3 className="font-semibold text-gray-900">{student.name || student.username}</h3>
                                            {student.status === 'suspended' && (
                                                <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded-full">휴원</span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-500">ID: {student.username}</p>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <button
                                            onClick={() => handleToggleStatus(student)}
                                            className={`px-3 py-1 text-sm rounded flex items-center space-x-1 ${student.status === 'suspended'
                                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                }`}
                                        >
                                            <span>{student.status === 'suspended' ? '복원' : '휴원'}</span>
                                        </button>
                                        <button
                                            onClick={() => setShowAbsenceModal(student.id)}
                                            className="px-3 py-1 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 flex items-center space-x-1"
                                        >
                                            <Calendar className="w-4 h-4" />
                                            <span>공강 처리</span>
                                        </button>
                                        {editingStudent === student.id ? (
                                            <>
                                                <button
                                                    onClick={() => handleUpdateSettings(student)}
                                                    className="px-4 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                                                >
                                                    저장
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setEditingStudent(null);
                                                        fetchStudents();
                                                    }}
                                                    className="px-4 py-1 bg-gray-400 text-white text-sm rounded hover:bg-gray-500"
                                                >
                                                    취소
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => handleViewDetails(student)}
                                                    className="px-4 py-1 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
                                                >
                                                    상세
                                                </button>
                                                <button
                                                    onClick={() => setEditingStudent(student.id)}
                                                    className="px-4 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                                                >
                                                    수정
                                                </button>

                                                <button
                                                    onClick={() => handleDeleteStudent(student.id)}
                                                    className="px-4 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                                                >
                                                    삭제
                                                </button>
                                                <button
                                                    onClick={() => handleResetPassword(student.id)}
                                                    className="px-4 py-1 bg-yellow-500 text-white text-sm rounded hover:bg-yellow-600"
                                                >
                                                    비밀번호 초기화
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Name (Edit Mode) */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                                        {editingStudent === student.id ? (
                                            <div className="space-y-2">
                                                <input
                                                    type="text"
                                                    value={student.name || ''}
                                                    onChange={(e) => setStudents(students.map(s =>
                                                        s.id === student.id ? { ...s, name: e.target.value } : s
                                                    ))}
                                                    placeholder="이름"
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                                />
                                            </div>
                                        ) : (
                                            <p className="text-gray-600 py-2 text-sm">
                                                {student.name}
                                            </p>
                                        )}
                                    </div>

                                    {/* Class Selection */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">반 배정</label>
                                        {editingStudent === student.id ? (
                                            <select
                                                value={student.class_id || ''}
                                                onChange={(e) => handleUpdateClass(student.id, e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                            >
                                                <option value="">반 선택 안함</option>
                                                {classes.map(cls => (
                                                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <p className="text-gray-600 py-2">{student.class_name || '미배정'}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400 text-center">
                                    상세 학습 설정은 '수업 관리' 메뉴를 이용해주세요.
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Absence Modal */}
                {
                    showAbsenceModal && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold">공강 처리</h3>
                                    <button onClick={() => setShowAbsenceModal(null)} className="text-gray-400 hover:text-gray-600">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                                <p className="text-sm text-gray-600 mb-4">
                                    공강 처리하면 해당 날짜의 학습이 자동으로 뒤로 밀립니다.
                                </p>
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">공강 날짜</label>
                                    <input
                                        type="date"
                                        value={absenceDate}
                                        onChange={(e) => setAbsenceDate(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                </div>
                                <div className="flex space-x-2">
                                    <button
                                        onClick={() => handleMarkAbsent(showAbsenceModal)}
                                        className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
                                    >
                                        공강 처리
                                    </button>
                                    <button
                                        onClick={() => setShowAbsenceModal(null)}
                                        className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                                    >
                                        취소
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Student Detail Modal */}
                {/* Note: In StudentManagement.jsx we only show basic details now and a link to history page */}
                {/* Reusing similar layout but linking to history */}
                {showDetailModal && selectedStudent && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                            {/* ... Same modal content as AdminDashboard or slightly different ... */}
                            {/* To save tokens/time, I will omit full duplication if it's identical except for 'View History' button */}
                            {/* But I must write valid code. I will include the modal content from previous version but adapted */}
                            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900">{selectedStudent.name || selectedStudent.username} 학생 정보</h2>
                                    <p className="text-sm text-gray-500 mt-1">ID: {selectedStudent.username}</p>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowDetailModal(false);
                                        setSelectedStudent(null);
                                        setStatusLogs([]);
                                    }}
                                    className="text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                            <div className="p-6 space-y-6">
                                {/* Basic Info */}
                                <section className="bg-gray-50 rounded-xl p-4">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                        <FileText className="w-5 h-5 mr-2 text-indigo-600" />
                                        기본 정보
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <span className="text-gray-500">이름:</span>
                                            <span className="ml-2 font-medium text-gray-900">{selectedStudent.name || '-'}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">아이디:</span>
                                            <span className="ml-2 font-medium text-gray-900">{selectedStudent.username}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">반:</span>
                                            <span className="ml-2 font-medium text-gray-900">{selectedStudent.class_name || '미배정'}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">상태:</span>
                                            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${selectedStudent.status === 'suspended'
                                                ? 'bg-gray-200 text-gray-700'
                                                : 'bg-green-100 text-green-700'
                                                }`}>
                                                {selectedStudent.status === 'suspended' ? '휴원' : '정상'}
                                            </span>
                                        </div>
                                    </div>
                                </section>

                                {/* Action Buttons */}
                                <div className="flex space-x-3 pt-4 border-t border-gray-200">
                                    <button
                                        onClick={() => navigate('/admin/student-history', {
                                            state: {
                                                targetUserId: selectedStudent.id,
                                                targetUserName: selectedStudent.name || selectedStudent.username
                                            }
                                        })}
                                        className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                                    >
                                        전체 학습 기록 보기
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowDetailModal(false);
                                            setSelectedStudent(null);
                                            setStatusLogs([]);
                                        }}
                                        className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                                    >
                                        닫기
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
