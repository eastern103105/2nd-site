import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfWeek, addDays, isSameDay, getDay, addWeeks, subWeeks, getWeekOfMonth } from 'date-fns';
import { LogOut, Calendar as CalendarIcon, ChevronLeft, ChevronRight, DollarSign, Swords, Skull, Megaphone } from 'lucide-react';
import { supabase } from '../supabase';

export default function StudentDashboard() {
    const [history, setHistory] = useState([]);
    const [settings, setSettings] = useState(null);
    const [announcements, setAnnouncements] = useState([]);
    const [bookCounts, setBookCounts] = useState({}); // { bookName: totalCount }
    const [footerInfo, setFooterInfo] = useState('');

    useEffect(() => {
        const fetchAcademySettings = async () => {
            const academyId = localStorage.getItem('academyId');
            if (academyId) {
                try {
                    const { data, error } = await supabase
                        .from('academies')
                        .select('settings')
                        .eq('id', academyId)
                        .single();

                    if (data && data.settings?.footerInfo) {
                        setFooterInfo(data.settings.footerInfo);
                    }
                } catch (error) {
                    console.error("Error fetching settings:", error);
                }
            }
        };
        fetchAcademySettings();
    }, []);

    const getInitialWeekStart = () => {
        const today = new Date();
        const dayOfWeek = getDay(today);
        if (dayOfWeek === 6) {
            return startOfWeek(addWeeks(today, 1), { weekStartsOn: 0 });
        }
        return startOfWeek(today, { weekStartsOn: 0 });
    };

    const [currentWeekStart, setCurrentWeekStart] = useState(getInitialWeekStart());
    const navigate = useNavigate();
    const username = localStorage.getItem('username');
    const userId = localStorage.getItem('userId');
    const academyId = localStorage.getItem('academyId') || 'academy_default';

    // Fetch Dashboard Data
    useEffect(() => {
        const fetchDashboard = async () => {
            if (!userId) return;

            try {
                // 1. Fetch User Settings (Profile)
                let { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (userError) throw userError;

                // Check active books
                const hasNoBooks = !userData.active_books || userData.active_books.length === 0;
                const hasNoBookName = !userData.book_name;

                if (hasNoBooks && hasNoBookName) {
                    // Find default book
                    const { data: firstWord } = await supabase
                        .from('words')
                        .select('book_name')
                        .neq('book_name', '')
                        .limit(1)
                        .maybeSingle();

                    if (firstWord && firstWord.book_name) {
                        const defaultBook = firstWord.book_name;
                        const updates = {
                            active_books: [defaultBook],
                            book_name: defaultBook,
                            book_settings: {
                                [defaultBook]: {
                                    test_mode: 'word_typing',
                                    words_per_session: 10
                                }
                            }
                        };
                        await supabase.from('users').update(updates).eq('id', userId);
                        userData = { ...userData, ...updates };
                    }
                }

                setSettings(userData);

                // 2. Fetch Announcements
                // Filter by academyId AND (targetClassId == 'all' OR targetClassId == userData.class_id)
                // Supabase doesn't support convenient "OR" across different fields easily in one query without raw SQL or 'or()' syntax carefully.
                // Simpler to fetch 'all' and user's class separately or use .or()
                // .or(`and(academy_id.eq.${academyId},target_class_id.eq.all),and(academy_id.eq.${academyId},target_class_id.eq.${userData.class_id})`)

                let orCondition = `and(academy_id.eq.${academyId},target_class_id.eq.all)`;
                if (userData.class_id) {
                    orCondition += `,and(academy_id.eq.${academyId},target_class_id.eq.${userData.class_id})`;
                }

                const { data: announceData } = await supabase
                    .from('announcements')
                    .select('*')
                    .or(orCondition)
                    .order('created_at', { ascending: false })
                    .limit(5);

                setAnnouncements(announceData || []);

                // 3. Fetch History
                const { getRecentSummaries, summariesToHistory } = await import('../utils/dailySummary');
                const summaries = await getRecentSummaries(userId, 30);
                const historyData = summariesToHistory(summaries);
                setHistory(historyData);

                // 4. Fetch Book Counts
                const { data: booksData } = await supabase
                    .from('books')
                    .select('name, total_words')
                    .eq('academy_id', academyId);

                const counts = {};
                if (booksData) {
                    booksData.forEach(b => {
                        counts[b.name] = b.total_words;
                    });
                }
                setBookCounts(counts);

            } catch (err) {
                console.error("Error fetching dashboard data:", err);
            }
        };

        fetchDashboard();
    }, [userId]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        localStorage.clear();
        navigate('/login');
    };

    const isStudyDay = (date) => {
        if (!settings || !settings.study_days) return false;
        const dayOfWeek = getDay(date);
        const studyDays = settings.study_days.split(',').map(d => parseInt(d));
        return studyDays.includes(dayOfWeek);
    };

    const getWordRangeForDate = (date, initialBookName) => {
        if (!settings || !initialBookName) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const targetDate = new Date(date);
        targetDate.setHours(0, 0, 0, 0);

        // 1. Check History first (for past/completed)
        const historyRecord = history.find(h => {
            const recordDate = h.scheduled_date ? new Date(h.scheduled_date) : new Date(h.date);
            const isSameDate = isSameDay(recordDate, targetDate);
            // Check if history book matches the CURRENT active book chain
            // Simplified: just match date for now, as history preserves what was actually done
            return isSameDate;
        });

        if (historyRecord && historyRecord.range_start && historyRecord.range_end) {
            // Only return if it matches the requested book OR if we want to show history regardless
            // For simplicity in this view, if the history book is different, we might want to show it
            if (historyRecord.book_name === initialBookName) {
                return {
                    start: historyRecord.range_start,
                    end: historyRecord.range_end,
                    bookName: historyRecord.book_name
                };
            }
        }

        // 2. Future/Simulation Logic
        // We need to simulate from TODAY onwards to find out what book/range will be on targetDate

        // Initial State for Simulation
        let currentBook = initialBookName;

        // Determine initial currentIndex
        let currentIndex = 0;
        if (settings.book_progress && settings.book_progress[currentBook] !== undefined) {
            currentIndex = settings.book_progress[currentBook];
        } else if (currentBook === settings.book_name) {
            currentIndex = settings.current_word_index || 0;
        }

        // Queue Management
        // Convert curriculum_queues object to array
        let queue = [];
        const activeBooks = settings.active_books || [];
        const bookIndex = activeBooks.indexOf(initialBookName);

        if (bookIndex !== -1 && settings.curriculum_queues) {
            const qObj = settings.curriculum_queues;
            // Handle both array and object formats
            if (Array.isArray(qObj)) {
                queue = qObj[bookIndex] || [];
            } else {
                queue = qObj[bookIndex] || [];
            }
        }

        // Simulation Loop
        // Start from Today (or Tomorrow if Today is done)
        let d = new Date(today);

        // Check if today is already completed for THIS book chain
        const isTodayDone = history.some(h => isSameDay(new Date(h.date), today));
        if (isTodayDone) {
            d.setDate(d.getDate() + 1);
        }

        // If targetDate is in the past (and not in history), we can't easily predict
        // But the user asked for "Future" logic mainly.
        // For past uncompleted days, we show "Missed" based on current state? 
        // Let's stick to the requested logic: calculate forward.

        if (targetDate < today) {
            // Fallback for past uncompleted: just show based on current index (simplified)
            // This might not be 100% accurate for "what it SHOULD have been", but it's consistent
            return null;
        }

        while (d <= targetDate) {
            if (isStudyDay(d)) {
                // Get settings for current book
                const bookSettings = settings.book_settings?.[currentBook] || {};
                const wordsPerSession = bookSettings.words_per_session ? parseInt(bookSettings.words_per_session) : (settings.words_per_session || 10);
                const totalWords = bookCounts[currentBook] || 9999; // Default to high if unknown

                // Calculate range for this day
                let start = currentIndex + 1;
                let end = start + wordsPerSession;

                // Check if we exceed total words
                if (start > totalWords) {
                    // Current book finished! Move to next book
                    if (queue.length > 0) {
                        const nextItem = queue[0];
                        currentBook = typeof nextItem === 'string' ? nextItem : nextItem.title;
                        queue = queue.slice(1); // Remove from local queue
                        currentIndex = 0;

                        // Recalculate for new book
                        // Note: settings might not exist yet for new book
                        // Use queue item settings if available
                        const newWordsPerSession = (typeof nextItem === 'object' && nextItem.words_per_session)
                            ? parseInt(nextItem.words_per_session)
                            : (settings.words_per_session || 10);

                        start = 1;
                        end = start + newWordsPerSession;

                        // Update total words for new book
                        // totalWords = bookCounts[currentBook] || 9999; 
                    } else {
                        // No more books
                        return null;
                    }
                } else if (end > totalWords + 1) {
                    // Partial session at end of book? 
                    // Current logic usually transitions only when ALL words done.
                    // If we are at 140/144 and need 10 words -> 141~150. 
                    // System allows this and then transitions.
                    // So we just cap at end? Or allow overflow?
                    // User complained about overflow (143~152 for 144 book).
                    // So we should cap it OR transition if it exceeds significantly?

                    // The user's issue: 143~152 shown for 144-word book.
                    // This means start(143) < total(144), but end(152) > total(144).
                    // In this case, we should show 143~144 AND potentially next book?
                    // But UI can't handle split.
                    // Let's just show up to totalWords.
                    end = totalWords + 1;
                }

                // If this is the target date, return the result
                if (isSameDay(d, targetDate)) {
                    return { start, end, bookName: currentBook, totalWords: bookCounts[currentBook] };
                }

                // Advance progress
                currentIndex = end - 1; // e.g. 1~10 -> index 10
            }
            d.setDate(d.getDate() + 1);
        }

        return null;
    };

    const handleStartStudy = (date, bookName, range) => {
        if (range) {
            navigate('/student/study', {
                state: {
                    studyStartIndex: range.start,
                    studyEndIndex: range.end,
                    scheduledDate: date.toISOString(),
                    bookName: bookName
                }
            });
        } else {
            navigate('/student/study', {
                state: {
                    scheduledDate: date.toISOString(),
                    bookName: bookName
                }
            });
        }
    };

    const handlePrevWeek = () => {
        setCurrentWeekStart(prev => subWeeks(prev, 1));
    };

    const handleNextWeek = () => {
        setCurrentWeekStart(prev => addWeeks(prev, 1));
    };

    const handleToday = () => {
        setCurrentWeekStart(getInitialWeekStart());
    };

    // Generate days for the table
    const weekDays = [];
    let d = new Date(currentWeekStart);
    for (let i = 0; i < 7; i++) {
        weekDays.push(new Date(d));
        d.setDate(d.getDate() + 1);
    }

    const studyDays = weekDays.filter(day => isStudyDay(day));
    const activeBooks = (settings?.active_books || (settings?.book_name ? [settings.book_name] : []))
        .filter(book => book !== '기본');

    // Calculate reference date (Thursday) for correct Month/Week display
    const referenceDate = addDays(currentWeekStart, 4);

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white shadow-sm">
                <div className="max-w-4xl px-4 py-4 mx-auto flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                        <CalendarIcon className="w-6 h-6 text-indigo-600" />
                        <h1 className="text-xl font-bold text-gray-800">나의 학습 계획</h1>
                    </div>
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center bg-green-100 px-4 py-2 rounded-full border border-green-200 shadow-sm animate-fade-in">
                            <DollarSign className="w-5 h-5 text-green-600 mr-2" />
                            <span className="font-bold text-green-800 text-lg">{settings?.dollar_balance ? settings.dollar_balance.toFixed(2) : '0.00'}</span>
                        </div>
                        <span className="text-gray-600">안녕하세요, <b>{localStorage.getItem('name') || username}</b>님</span>
                        <button onClick={handleLogout} className="p-2 text-gray-500 hover:text-red-600 transition-colors">
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>
            <div className="flex justify-center mb-6 space-x-4">
                <button
                    onClick={() => navigate('/student/history')}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                    내 학습 기록 보기
                </button>
                <button
                    onClick={() => navigate('/student/battle')}
                    className="px-4 py-2 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-lg hover:from-red-600 hover:to-orange-600 transition-all shadow-md flex items-center"
                >
                    <Swords className="w-4 h-4 mr-2" />
                    배틀 아레나 입장
                </button>
                <button
                    onClick={() => navigate('/student/survival')}
                    className="px-4 py-2 bg-gradient-to-r from-gray-800 to-black text-white rounded-lg hover:from-gray-700 hover:to-gray-900 transition-all shadow-md flex items-center"
                >
                    <Skull className="w-4 h-4 mr-2" />
                    단어 서바이벌 입장
                </button>
            </div>

            <main className="max-w-7xl px-4 py-8 mx-auto space-y-8">
                {/* Announcement Section */}
                {announcements.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 overflow-hidden">
                        <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100 flex items-center">
                            <Megaphone className="w-5 h-5 text-indigo-600 mr-2" />
                            <h2 className="text-lg font-bold text-indigo-900">공지사항</h2>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {announcements.map(announcement => (
                                <div key={announcement.id} className="p-4 hover:bg-gray-50 transition-colors">
                                    <div className="flex justify-between items-start mb-1">
                                        <h3 className="font-bold text-gray-800">{announcement.title}</h3>
                                        <span className="text-xs text-gray-400">{new Date(announcement.createdAt).toLocaleDateString()}</span>
                                    </div>
                                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{announcement.content}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center space-x-2 sm:space-x-4 w-full sm:w-auto justify-between sm:justify-start">
                            <button onClick={handlePrevWeek} className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-full transition-colors">
                                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                            </button>
                            <h2 className="text-lg sm:text-xl font-bold text-gray-800">
                                {format(referenceDate, 'yyyy년 M월')} {getWeekOfMonth(referenceDate, { weekStartsOn: 0 })}주차
                            </h2>
                            <button onClick={handleNextWeek} className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-full transition-colors">
                                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                            </button>
                            <button
                                onClick={handleToday}
                                className="px-2 py-1 sm:px-3 sm:py-1 text-xs sm:text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors whitespace-nowrap"
                            >
                                오늘
                            </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-gray-500 w-full sm:w-auto justify-end">
                            <span className="flex items-center"><div className="w-2 h-2 sm:w-3 sm:h-3 bg-green-500 rounded-full mr-1"></div>완료</span>
                            <span className="flex items-center"><div className="w-2 h-2 sm:w-3 sm:h-3 bg-red-500 rounded-full mr-1"></div>학습 예정</span>
                            <span className="flex items-center"><div className="w-2 h-2 sm:w-3 sm:h-3 bg-blue-200 rounded-full mr-1"></div>이전 범위</span>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[600px] sm:min-w-[800px]">
                            <thead>
                                <tr className="bg-gray-50">
                                    <th className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-semibold text-gray-600 w-24 sm:w-48 sticky left-0 bg-gray-50 z-10">교재명</th>
                                    {studyDays.map((date, i) => (
                                        <th key={i} className="px-2 py-3 sm:px-6 sm:py-4 text-center text-xs sm:text-sm font-semibold text-gray-600 border-l border-gray-200">
                                            <div className="flex flex-col items-center">
                                                <span>{format(date, 'M/d')} <span className="hidden sm:inline">({['일', '월', '화', '수', '목', '금', '토'][getDay(date)]})</span><span className="sm:hidden">({['일', '월', '화', '수', '목', '금', '토'][getDay(date)]})</span></span>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {activeBooks.map((book) => (
                                    <tr key={book} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-3 py-4 sm:px-6 sm:py-6 text-xs sm:text-sm font-bold text-gray-800 sticky left-0 bg-white z-10 border-r border-gray-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                            <div className="truncate max-w-[80px] sm:max-w-none" title={book}>{book}</div>
                                            <span className="block text-[10px] sm:text-xs font-normal text-gray-500 mt-1">
                                                (총 {bookCounts[book] || 0}개)
                                            </span>
                                        </td>
                                        {studyDays.map((date, i) => {
                                            const isDone = history.some(h => {
                                                const recordDate = h.scheduled_date ? new Date(h.scheduled_date) : new Date(h.date);
                                                const isSameDate = isSameDay(recordDate, date);
                                                const historyBook = h.book_name || settings.book_name;
                                                return isSameDate && historyBook === book;
                                            });

                                            const range = getWordRangeForDate(date, book);

                                            // Determine current progress for this book
                                            let currentProgress = 0;
                                            if (settings.book_progress && settings.book_progress[book] !== undefined) {
                                                currentProgress = settings.book_progress[book];
                                            } else if (book === settings.book_name) {
                                                currentProgress = settings.current_word_index || 0;
                                            }

                                            // Check if this range is before or after current progress
                                            // 1. If date is Today or Future -> Red (User request: "Future things should be red")
                                            // 2. If range book is different from current book (Next book) -> Red
                                            // 3. If range start is greater than current progress -> Red
                                            const isToday = isSameDay(date, new Date());
                                            const isFuture = date > new Date().setHours(0, 0, 0, 0);
                                            const isFutureDate = isToday || isFuture;

                                            const isFutureLearning = isFutureDate || (range && range.bookName && range.bookName !== book) || (range && range.start > currentProgress);

                                            return (
                                                <td key={i} className="px-2 py-2 sm:px-4 sm:py-4 border-l border-gray-100 align-top">
                                                    <div className="flex flex-col items-center space-y-1 sm:space-y-3">
                                                        {range && (
                                                            <div className="flex flex-col items-center">
                                                                {range.bookName !== book && (
                                                                    <span className="text-[10px] sm:text-xs font-bold text-purple-600 mb-0.5 sm:mb-1">
                                                                        {range.bookName}
                                                                    </span>
                                                                )}
                                                                <span className="text-[10px] sm:text-xs font-medium text-indigo-600 bg-indigo-50 px-1 py-0.5 sm:px-2 sm:py-1 rounded whitespace-nowrap">
                                                                    범위 {range.start} ~ {range.end - 1}
                                                                </span>
                                                            </div>
                                                        )}

                                                        <button
                                                            onClick={() => handleStartStudy(date, book, range)}
                                                            disabled={!range}
                                                            className={`
                                                                w-full px-2 py-1.5 sm:px-4 sm:py-2 rounded-lg text-[10px] sm:text-sm font-bold transition-all shadow-sm
                                                                ${!range
                                                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                                    : isDone
                                                                        ? 'bg-green-500 text-white hover:bg-green-600 shadow-green-200'
                                                                        : isFutureLearning
                                                                            ? 'bg-red-500 text-white hover:bg-red-600 shadow-red-200'
                                                                            : 'bg-blue-200 text-blue-800 hover:bg-blue-300 shadow-blue-100'
                                                                }
                                                            `}
                                                        >
                                                            {isDone ? '완료' : isFutureLearning ? '학습하기' : '이전 범위'}
                                                        </button>
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                                {activeBooks.length === 0 && (
                                    <tr>
                                        <td colSpan={studyDays.length + 1} className="px-6 py-12 text-center text-gray-500">
                                            등록된 학습 교재가 없습니다.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <p className="text-sm text-blue-800">
                        <span className="font-semibold">학습 안내:</span> 각 교재별로 지정된 요일에 학습을 진행하세요. 지난 학습도 언제든지 다시 할 수 있습니다.
                    </p>
                </div>

                {footerInfo && (
                    <footer className="mt-12 pt-8 border-t border-gray-200 text-center text-gray-500 text-sm whitespace-pre-line">
                        {footerInfo}
                    </footer>
                )}
            </main>
        </div>
    );
}
