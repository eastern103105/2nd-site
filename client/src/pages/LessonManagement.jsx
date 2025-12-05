import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowLeft, Trash2, Plus, Save, X, ChevronRight, BookOpen } from 'lucide-react';
import { supabase } from '../supabase';

export default function LessonManagement() {
    const [students, setStudents] = useState([]);
    const [filteredStudents, setFilteredStudents] = useState([]);
    const [classes, setClasses] = useState([]);
    const [books, setBooks] = useState([]);
    const [bookWordCounts, setBookWordCounts] = useState({}); // { bookName: wordCount }
    const [selectedClass, setSelectedClass] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStudents, setSelectedStudents] = useState([]);
    const [loading, setLoading] = useState(true);

    // Detail View State
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'detail'
    const [editedStudent, setEditedStudent] = useState(null);

    // Curriculum Copy State
    const [showCopyModal, setShowCopyModal] = useState(false);
    const [copySourceStudent, setCopySourceStudent] = useState(null);

    const navigate = useNavigate();

    const weekDays = [
        { value: '1', label: '월' },
        { value: '2', label: '화' },
        { value: '3', label: '수' },
        { value: '4', label: '목' },
        { value: '5', label: '금' },
        { value: '6', label: '토' },
        { value: '0', label: '일' }
    ];

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const academyId = localStorage.getItem('academyId') || 'academy_default';

            // Fetch Students
            const { data: studentData, error: studentError } = await supabase
                .from('users')
                .select('*')
                .eq('role', 'student')
                .eq('academy_id', academyId);

            if (studentError) throw studentError;
            setStudents(studentData);
            setFilteredStudents(studentData);

            // Fetch Classes
            const { data: classData, error: classError } = await supabase
                .from('classes')
                .select('*')
                .eq('academy_id', academyId);

            if (classError) throw classError;
            setClasses(classData);

            // Fetch Books using 'books' table instead of scanning 'words'
            const { data: bookData, error: bookError } = await supabase
                .from('books')
                .select('name, total_words')
                .eq('academy_id', academyId);

            if (bookError) throw bookError;

            // Handle books
            const uniqueBooks = bookData.map(b => b.name);
            setBooks(uniqueBooks);

            const wordCounts = {};
            bookData.forEach(b => {
                wordCounts[b.name] = b.total_words || 0;
            });
            setBookWordCounts(wordCounts);

        } catch (err) {
            console.error("Error fetching data:", err);
            alert('데이터를 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        let result = students;
        if (selectedClass !== 'all') {
            result = result.filter(s => s.class_id === selectedClass);
        }
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            result = result.filter(s =>
                (s.name && s.name.toLowerCase().includes(lowerQuery)) ||
                (s.username && s.username.toLowerCase().includes(lowerQuery))
            );
        }
        setFilteredStudents(result);
    }, [selectedClass, searchQuery, students]);

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedStudents(filteredStudents.map(s => s.id));
        } else {
            setSelectedStudents([]);
        }
    };

    const handleSelectStudent = (id) => {
        if (selectedStudents.includes(id)) {
            setSelectedStudents(selectedStudents.filter(sId => sId !== id));
        } else {
            setSelectedStudents([...selectedStudents, id]);
        }
    };

    const openStudentDetail = (student) => {
        const studentCopy = JSON.parse(JSON.stringify(student)); // Deep copy based on structure

        // Normalize curriculum_queues to Array if it is an Object (Legacy Support)
        if (studentCopy.curriculum_queues && typeof studentCopy.curriculum_queues === 'object' && !Array.isArray(studentCopy.curriculum_queues)) {
            const queuesArray = [];
            Object.keys(studentCopy.curriculum_queues).forEach(key => {
                queuesArray[parseInt(key)] = studentCopy.curriculum_queues[key] || [];
            });
            studentCopy.curriculum_queues = queuesArray;
        }
        // Ensure it is initialized if null
        if (!studentCopy.curriculum_queues) {
            studentCopy.curriculum_queues = [];
        }

        setEditedStudent(studentCopy);
        setViewMode('detail');
    };

    const handleSaveStudent = async () => {
        if (!editedStudent) return;
        try {
            // Save curriculum_queues as ARRAY (JSONB) directly.
            // No need to convert back to object map like in Firestore.
            const queuesArray = editedStudent.curriculum_queues || [];

            const updates = {
                active_books: editedStudent.active_books || [],
                curriculum_queues: queuesArray,
                book_settings: editedStudent.book_settings || {},
                book_progress: editedStudent.book_progress || {},
                study_days: editedStudent.study_days || '1,2,3,4,5',
                // Legacy support
                book_name: (editedStudent.active_books && editedStudent.active_books.length > 0) ? editedStudent.active_books[0] : '',
                current_word_index: editedStudent.book_progress?.[editedStudent.active_books?.[0]] || 0,
            };

            const { error } = await supabase
                .from('users')
                .update(updates)
                .eq('id', editedStudent.id);

            if (error) throw error;

            alert('저장되었습니다.');
            fetchData(); // Refresh data
            setViewMode('list');
        } catch (err) {
            console.error("Error saving student:", err);
            alert('저장 중 오류가 발생했습니다.');
        }
    };

    const updateBookSetting = (bookName, field, value) => {
        setEditedStudent(prev => {
            const newSettings = { ...(prev.book_settings || {}) };
            if (!newSettings[bookName]) newSettings[bookName] = {};
            newSettings[bookName][field] = value;
            return { ...prev, book_settings: newSettings };
        });
    };

    const toggleStudyDay = (dayVal) => {
        setEditedStudent(prev => {
            const currentDays = (prev.study_days || '').split(',').filter(Boolean);
            let newDays;
            if (currentDays.includes(dayVal)) {
                newDays = currentDays.filter(d => d !== dayVal);
            } else {
                newDays = [...currentDays, dayVal].sort();
            }
            return { ...prev, study_days: newDays.join(',') };
        });
    };

    const removeActiveBook = (index) => {
        if (!confirm('정말 이 커리큘럼을 삭제하시겠습니까?')) return;
        setEditedStudent(prev => {
            const newActive = [...(prev.active_books || [])];
            newActive.splice(index, 1);

            const newQueues = [...(prev.curriculum_queues || [])];
            if (index < newQueues.length) {
                newQueues.splice(index, 1);
            }

            return { ...prev, active_books: newActive, curriculum_queues: newQueues };
        });
    };

    const addActiveBook = (bookName) => {
        if (!bookName) return;
        setEditedStudent(prev => {
            const currentActive = prev.active_books || [];
            if (currentActive.includes(bookName)) {
                alert('이미 학습 중인 단어장입니다.');
                return prev;
            }
            return { ...prev, active_books: [...currentActive, bookName] };
        });
    };

    const addNextBook = (curriculumIndex, nextBookName) => {
        if (!nextBookName) return;
        setEditedStudent(prev => {
            const currentQueues = [...(prev.curriculum_queues || [])];
            while (currentQueues.length <= curriculumIndex) {
                currentQueues.push([]);
            }

            const targetQueue = currentQueues[curriculumIndex] || [];

            // Should be consistent with object structure
            const newQueueItem = {
                title: nextBookName,
                test_mode: 'word_typing',
                words_per_session: 10
            };

            currentQueues[curriculumIndex] = [...targetQueue, newQueueItem];
            return { ...prev, curriculum_queues: currentQueues };
        });
    };

    const removeNextBook = (curriculumIndex, queueIndex) => {
        setEditedStudent(prev => {
            const currentQueues = [...(prev.curriculum_queues || [])];
            if (!currentQueues[curriculumIndex]) return prev;

            const targetQueue = [...currentQueues[curriculumIndex]];
            targetQueue.splice(queueIndex, 1);
            currentQueues[curriculumIndex] = targetQueue;

            return { ...prev, curriculum_queues: currentQueues };
        });
    };

    const updateQueueItemSetting = (curriculumIndex, queueIndex, field, value) => {
        setEditedStudent(prev => {
            const currentQueues = JSON.parse(JSON.stringify(prev.curriculum_queues || []));
            if (!currentQueues[curriculumIndex] || !currentQueues[curriculumIndex][queueIndex]) return prev;

            // Handle string legacy item if necessary, convert to object
            let item = currentQueues[curriculumIndex][queueIndex];
            if (typeof item === 'string') {
                item = {
                    title: item,
                    test_mode: 'word_typing',
                    words_per_session: 10
                };
            }

            item[field] = value;
            currentQueues[curriculumIndex][queueIndex] = item;

            return { ...prev, curriculum_queues: currentQueues };
        });
    };

    const handleDeleteCurriculum = async () => {
        if (selectedStudents.length === 0) {
            alert('선택된 학생이 없습니다.');
            return;
        }

        if (!confirm(`${selectedStudents.length}명의 학생의 커리큘럼을 삭제하시겠습니까?`)) return;

        const bookToDelete = prompt("삭제할 교재명을 정확히 입력해주세요:");
        if (!bookToDelete) return;

        try {
            await Promise.all(selectedStudents.map(async (studentId) => {
                const student = students.find(s => s.id === studentId);
                const currentActiveBooks = student.active_books || (student.book_name ? [student.book_name] : []);

                if (currentActiveBooks.includes(bookToDelete)) {
                    const newActiveBooks = currentActiveBooks.filter(b => b !== bookToDelete);
                    await supabase.from('users').update({
                        active_books: newActiveBooks,
                        book_name: newActiveBooks.length > 0 ? newActiveBooks[0] : ''
                    }).eq('id', studentId);
                }
            }));

            alert('커리큘럼 삭제가 완료되었습니다.');
            fetchData();
            setSelectedStudents([]);
        } catch (err) {
            console.error("Error deleting curriculum:", err);
            alert('커리큘럼 삭제 중 오류가 발생했습니다.');
        }
    };

    const handleCopyCurriculum = async () => {
        if (!copySourceStudent || selectedStudents.length === 0) {
            alert('원본 학생과 대상 학생을 선택해주세요.');
            return;
        }

        const targetStudents = selectedStudents.filter(id => id !== copySourceStudent.id);
        if (targetStudents.length === 0) {
            alert('자기 자신에게는 복제할 수 없습니다. 다른 학생을 선택해주세요.');
            return;
        }

        if (!confirm(`${copySourceStudent.name}의 커리큘럼을 ${targetStudents.length}명의 학생에게 복제하시겠습니까?`)) return;

        try {
            const curriculumData = {
                active_books: JSON.parse(JSON.stringify(copySourceStudent.active_books || [])),
                // Normalize queue to array if it isn't
                curriculum_queues: (copySourceStudent.curriculum_queues && !Array.isArray(copySourceStudent.curriculum_queues))
                    ? Object.values(copySourceStudent.curriculum_queues) // simple conversion if object
                    : (copySourceStudent.curriculum_queues || []),
                book_settings: JSON.parse(JSON.stringify(copySourceStudent.book_settings || {})),
                book_progress: {},
                study_days: copySourceStudent.study_days || '1,2,3,4,5',
                words_per_session: copySourceStudent.words_per_session || 10,
                book_name: (copySourceStudent.active_books && copySourceStudent.active_books.length > 0)
                    ? copySourceStudent.active_books[0] : '',
                current_word_index: 0
            };

            // But wait, if source has Object-based queue (legacy), we must convert keys->index properly
            if (copySourceStudent.curriculum_queues && typeof copySourceStudent.curriculum_queues === 'object' && !Array.isArray(copySourceStudent.curriculum_queues)) {
                const queuesArray = [];
                Object.keys(copySourceStudent.curriculum_queues).forEach(key => {
                    queuesArray[parseInt(key)] = copySourceStudent.curriculum_queues[key] || [];
                });
                curriculumData.curriculum_queues = queuesArray;
            }

            await Promise.all(targetStudents.map(studentId =>
                supabase.from('users').update(curriculumData).eq('id', studentId)
            ));

            alert('커리큘럼 복제가 완료되었습니다.');
            fetchData();
            setShowCopyModal(false);
            setCopySourceStudent(null);
            setSelectedStudents([]);
        } catch (err) {
            console.error("Error copying curriculum:", err);
            alert('커리큘럼 복제 중 오류가 발생했습니다.');
        }
    };

    if (viewMode === 'detail' && editedStudent) {
        return (
            <div className="min-h-screen bg-gray-50 p-8">
                <div className="max-w-7xl mx-auto space-y-6">
                    <header className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <button onClick={() => setViewMode('list')} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                                <ArrowLeft className="w-6 h-6 text-gray-600" />
                            </button>
                            <h1 className="text-2xl font-bold text-gray-900">수업 관리 - 학생 상세 설정</h1>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleSaveStudent}
                                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-bold flex items-center gap-2"
                            >
                                <Save className="w-4 h-4" />
                                저장하기
                            </button>
                        </div>
                    </header>

                    {/* Student Info */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <div className="flex items-center gap-4 text-lg">
                            <span className="font-bold text-gray-900">{editedStudent.name}</span>
                            <span className="text-gray-500">({editedStudent.username})</span>
                            <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium">
                                {classes.find(c => c.id === editedStudent.class_id)?.name || '미배정'}
                            </span>
                        </div>
                    </div>

                    {/* Active Curriculums */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-bold text-gray-800">진행 중인 커리큘럼</h2>
                            <div className="flex gap-2">
                                <select
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            addActiveBook(e.target.value);
                                            e.target.value = '';
                                        }
                                    }}
                                >
                                    <option value="">+ 커리큘럼 추가</option>
                                    {books.map(b => (
                                        <option key={b} value={b}>
                                            {b} (총 {bookWordCounts[b] || 0}개)
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {(editedStudent.active_books || []).map((book, index) => {
                            const settings = editedStudent.book_settings?.[book] || {};
                            return (
                                <div key={`${book}-${index}`} className="bg-gray-100 rounded-xl border border-gray-200 overflow-hidden">
                                    <div className="bg-gray-200 px-6 py-3 flex justify-between items-center border-b border-gray-300">
                                        <span className="font-bold text-gray-700">커리큘럼 {index + 1}</span>
                                        <button
                                            onClick={() => removeActiveBook(index)}
                                            className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                        >
                                            커리큘럼 삭제
                                        </button>
                                    </div>
                                    <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        {/* Current Book Settings */}
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-1">학습 중인 단어장</label>
                                                <div className="text-lg font-medium text-gray-900 p-2 bg-white rounded border border-gray-300 flex items-center justify-between">
                                                    <span>{book}</span>
                                                    <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                                        총 {bookWordCounts[book] || 0}개
                                                    </span>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">학습 요일</label>
                                                <div className="flex gap-1">
                                                    {weekDays.map(day => (
                                                        <button
                                                            key={day.value}
                                                            onClick={() => toggleStudyDay(day.value)}
                                                            className={`w-8 h-8 rounded flex items-center justify-center text-sm font-medium transition-colors ${(editedStudent.study_days || '').split(',').includes(day.value)
                                                                ? 'bg-indigo-600 text-white'
                                                                : 'bg-white border border-gray-300 text-gray-500 hover:bg-gray-50'
                                                                }`}
                                                        >
                                                            {day.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 mb-1">시험 방식</label>
                                                    <select
                                                        value={settings.test_mode || 'word_typing'}
                                                        onChange={(e) => updateBookSetting(book, 'test_mode', e.target.value)}
                                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded outline-none text-sm"
                                                    >
                                                        <option value="word_typing">단어 시험 (타이핑)</option>
                                                        <option value="sentence_click">문장 시험 (클릭 배열)</option>
                                                        <option value="sentence_type">문장 시험 (타이핑 배열)</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 mb-1">세션당 단어 수</label>
                                                    <input
                                                        type="number"
                                                        value={settings.words_per_session || 10}
                                                        onChange={(e) => updateBookSetting(book, 'words_per_session', e.target.value)}
                                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded outline-none text-sm"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 mb-1">다음 학습할 단어 번호 (시작 번호)</label>
                                                <input
                                                    type="number"
                                                    value={(editedStudent.book_progress?.[book] || 0) + 1}
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value);
                                                        const newProgress = { ...(editedStudent.book_progress || {}) };
                                                        newProgress[book] = val > 0 ? val - 1 : 0;
                                                        setEditedStudent({ ...editedStudent, book_progress: newProgress });
                                                    }}
                                                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded outline-none text-sm"
                                                />
                                            </div>
                                        </div>

                                        {/* Next Book Settings (Queue Management) */}
                                        <div className="space-y-4 border-l border-gray-200 pl-8">
                                            <div className="flex justify-between items-center">
                                                <label className="block text-sm font-bold text-gray-700">다음 학습할 단어장 (대기열)</label>
                                                <select
                                                    className="px-2 py-1 border border-gray-300 rounded text-xs outline-none"
                                                    onChange={(e) => {
                                                        if (e.target.value) {
                                                            addNextBook(index, e.target.value);
                                                            e.target.value = '';
                                                        }
                                                    }}
                                                >
                                                    <option value="">+ 대기열 추가</option>
                                                    {books.map(b => (
                                                        <option key={b} value={b}>
                                                            {b} (총 {bookWordCounts[b] || 0}개)
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="space-y-3">
                                                {((editedStudent.curriculum_queues?.[index]) || []).length === 0 ? (
                                                    <div className="p-4 bg-gray-50 rounded border border-gray-200 text-center text-gray-400 text-sm">
                                                        대기 중인 단어장이 없습니다.
                                                    </div>
                                                ) : (
                                                    ((editedStudent.curriculum_queues?.[index]) || []).map((queueItem, nIdx) => {
                                                        const isObject = typeof queueItem === 'object' && queueItem.title;
                                                        const bookTitle = isObject ? queueItem.title : queueItem;
                                                        const testMode = isObject ? queueItem.test_mode : 'word_typing';
                                                        const wordsPerSession = isObject ? queueItem.words_per_session : 10;

                                                        return (
                                                            <div key={`${bookTitle}-${nIdx}`} className="bg-white p-3 rounded border border-gray-200 relative group">
                                                                <button
                                                                    onClick={() => removeNextBook(index, nIdx)}
                                                                    className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                                <div className="font-medium text-gray-800 mb-2 pr-6 flex items-center justify-between">
                                                                    <span>{nIdx + 1}. {bookTitle}</span>
                                                                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                                                        총 {bookWordCounts[bookTitle] || 0}개
                                                                    </span>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <div>
                                                                        <label className="block text-xs text-gray-500 mb-1">시험 방식</label>
                                                                        <select
                                                                            value={testMode}
                                                                            onChange={(e) => updateQueueItemSetting(index, nIdx, 'test_mode', e.target.value)}
                                                                            className="w-full px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs outline-none"
                                                                        >
                                                                            <option value="word_typing">단어 시험 (타이핑)</option>
                                                                            <option value="sentence_click">문장 시험 (클릭 배열)</option>
                                                                            <option value="sentence_type">문장 시험 (타이핑 배열)</option>
                                                                        </select>
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs text-gray-500 mb-1">단어 수</label>
                                                                        <input
                                                                            type="number"
                                                                            value={wordsPerSession}
                                                                            onChange={(e) => updateQueueItemSetting(index, nIdx, 'words_per_session', parseInt(e.target.value))}
                                                                            className="w-full px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs outline-none"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {(editedStudent.active_books || []).length === 0 && (
                            <div className="p-12 text-center text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
                                진행 중인 커리큘럼이 없습니다. 상단의 '커리큘럼 추가'를 통해 학습을 시작하세요.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                <header className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <button onClick={() => navigate('/admin')} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                            <ArrowLeft className="w-6 h-6 text-gray-600" />
                        </button>
                        <h1 className="text-2xl font-bold text-gray-900">수업 관리</h1>
                    </div>
                </header>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    <div className="flex flex-wrap gap-4 items-center justify-between">
                        <div className="flex gap-4 flex-1">
                            <select
                                value={selectedClass}
                                onChange={(e) => setSelectedClass(e.target.value)}
                                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white min-w-[150px]"
                            >
                                <option value="all">전체 반</option>
                                {classes.map(cls => (
                                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                                ))}
                            </select>
                            <div className="relative flex-1 max-w-md">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                <input
                                    type="text"
                                    placeholder="이름 또는 아이디로 검색"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                        </div>
                        <div className="text-sm text-gray-500">
                            총 회원수: <span className="font-bold text-indigo-600">{filteredStudents.length}</span> 명
                        </div>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => alert('개별 학생의 "수업관리 버튼"을 눌러 커리큘럼을 등록해주세요.')}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm flex items-center gap-2"
                    >
                        <BookOpen className="w-4 h-4" />
                        커리큘럼 등록
                    </button>
                    <button
                        onClick={handleDeleteCurriculum}
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm flex items-center gap-2"
                    >
                        <Trash2 className="w-4 h-4" />
                        커리큘럼 삭제
                    </button>
                    <button
                        onClick={() => setShowCopyModal(true)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        커리큘럼 복제
                    </button>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-4 w-12">
                                        <input
                                            type="checkbox"
                                            checked={filteredStudents.length > 0 && selectedStudents.length === filteredStudents.length}
                                            onChange={handleSelectAll}
                                            className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                        />
                                    </th>
                                    <th className="px-6 py-4 font-medium text-gray-500">번호</th>
                                    <th className="px-6 py-4 font-medium text-gray-500">아이디(이름)</th>
                                    <th className="px-6 py-4 font-medium text-gray-500 min-w-[300px]">커리큘럼 등록 현황</th>
                                    <th className="px-6 py-4 font-medium text-gray-500 text-center">진행률</th>
                                    <th className="px-6 py-4 font-medium text-gray-500 text-center">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-12 text-center text-gray-500">로딩 중...</td>
                                    </tr>
                                ) : filteredStudents.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-12 text-center text-gray-500">검색된 학생이 없습니다.</td>
                                    </tr>
                                ) : (
                                    filteredStudents.map((student, index) => (
                                        <tr key={student.id} className={`hover:bg-gray-50 transition-colors ${selectedStudents.includes(student.id) ? 'bg-indigo-50/50' : ''}`}>
                                            <td className="px-6 py-4">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedStudents.includes(student.id)}
                                                    onChange={() => handleSelectStudent(student.id)}
                                                    className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                                />
                                            </td>
                                            <td className="px-6 py-4 text-gray-500">{index + 1}</td>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-gray-900">{student.username}</div>
                                                <div className="text-gray-500 text-xs">({student.name})</div>
                                                <div className="text-indigo-500 text-xs mt-1">
                                                    {classes.find(c => c.id === student.class_id)?.name || '미배정'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="space-y-1">
                                                    {(student.active_books || (student.book_name ? [student.book_name] : [])).map((book, idx) => (
                                                        <div key={idx} className="flex items-center text-gray-700 whitespace-nowrap">
                                                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full mr-2 flex-shrink-0"></span>
                                                            {book}
                                                        </div>
                                                    ))}
                                                    {(!student.active_books && !student.book_name) && (
                                                        <span className="text-gray-400 text-xs">-</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="text-gray-600 font-medium text-xs">
                                                    {student.current_word_index > 0 ? '학습 중' : '대기'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button
                                                    onClick={() => openStudentDetail(student)}
                                                    className="px-3 py-1.5 bg-white border border-red-200 text-red-500 rounded hover:bg-red-50 text-xs font-medium transition-colors"
                                                >
                                                    수업관리 버튼
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Curriculum Copy Modal */}
            {showCopyModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-200">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold text-gray-900">커리큘럼 복제</h2>
                                <button
                                    onClick={() => {
                                        setShowCopyModal(false);
                                        setCopySourceStudent(null);
                                    }}
                                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                                >
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Step 1: Select Source Student */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-700 mb-3">1단계: 복제할 커리큘럼의 원본 학생 선택</h3>
                                <select
                                    value={copySourceStudent?.id || ''}
                                    onChange={(e) => {
                                        const student = students.find(s => s.id === e.target.value);
                                        setCopySourceStudent(student);
                                    }}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                                >
                                    <option value="">원본 학생 선택...</option>
                                    {students
                                        .filter(s => s.active_books && s.active_books.length > 0)
                                        .map(student => (
                                            <option key={student.id} value={student.id}>
                                                {student.name} ({student.username}) - {student.active_books?.join(', ')}
                                            </option>
                                        ))}
                                </select>
                            </div>

                            {/* Display Source Curriculum */}
                            {copySourceStudent && (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                    <h4 className="text-sm font-semibold text-green-800 mb-2">선택된 커리큘럼</h4>
                                    <div className="space-y-2 text-sm text-gray-700">
                                        <div><span className="font-medium">학생:</span> {copySourceStudent.name}</div>
                                        <div><span className="font-medium">활성 교재:</span> {copySourceStudent.active_books?.join(', ') || '없음'}</div>
                                        <div><span className="font-medium">학습 요일:</span> {
                                            (copySourceStudent.study_days || '').split(',').map(d =>
                                                ['일', '월', '화', '수', '목', '금', '토'][parseInt(d)]
                                            ).join(', ')
                                        }</div>
                                    </div>
                                </div>
                            )}

                            {/* Step 2: Confirm Target Students */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-700 mb-3">2단계: 복제 대상 학생 확인</h3>
                                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                    <p className="text-sm text-gray-600 mb-2">
                                        현재 선택된 학생: <span className="font-bold text-indigo-600">{selectedStudents.filter(id => id !== copySourceStudent?.id).length}명</span>
                                    </p>
                                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                                        {selectedStudents
                                            .filter(id => id !== copySourceStudent?.id)
                                            .map(id => {
                                                const s = students.find(st => st.id === id);
                                                return (
                                                    <span key={id} className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-700">
                                                        {s?.name}
                                                    </span>
                                                );
                                            })}
                                    </div>
                                    {selectedStudents.length === 0 && (
                                        <p className="text-red-500 text-xs mt-2">* 목록에서 학생을 먼저 선택해주세요.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
                            <button
                                onClick={() => {
                                    setShowCopyModal(false);
                                    setCopySourceStudent(null);
                                }}
                                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleCopyCurriculum}
                                disabled={!copySourceStudent || selectedStudents.length === 0}
                                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                복제하기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
